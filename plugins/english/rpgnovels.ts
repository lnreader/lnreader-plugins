import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = { name: string; path: string; completed: boolean };

// The site moved from rpgnoob.wordpress.com; older table-of-contents entries
// still link to the previous address.
const SITE_HOSTS = /^(?:www\.)?(?:rpgnovels\.com|rpgnoob\.wordpress\.com)$/i;
const PROJECT_MENU_ITEMS = /^(active|completed) projects$/i;
// Navigation, support and separator blocks around the chapter text.
const CHAPTER_NAVIGATION =
  /^[\s|]*(?:(?:previous|prev|next)(?:\s+chapter)?|toc|table of contents)(?:[\s|]+(?:(?:previous|prev|next)(?:\s+chapter)?|toc|table of contents))*[\s|]*$/i;
const SUPPORT_NOTE = /^please consider supporting me/i;
const AUTHOR_LINE = /^author\s*:\s*(.+)$/i;
const SKIPPED_SUMMARY_LINE = /^(?:illustrators?\s*:|volume\s+\d+)/i;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

class RpgNovelsPlugin implements Plugin.PluginBase {
  id = 'rpgnovels';
  name = 'RPGNovels';
  icon = 'src/en/rpgnovels/icon.png';
  site = 'https://rpgnovels.com';
  version = '1.0.0';

  filters = {
    status: {
      label: 'Projects',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Active', value: 'active' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`RPGNovels: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (!SITE_HOSTS.test(url.hostname)) return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** The novels are the pages listed under the site's two project menus. */
  private async novelList(): Promise<NovelEntry[]> {
    const $ = await this.loadPage(this.site);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    $('nav li').each((_, item) => {
      const menu = $(item);
      const heading = clean(menu.children('a').first().text());
      const group = PROJECT_MENU_ITEMS.exec(heading);
      if (!group) return;
      menu.find('ul a').each((__, el) => {
        const anchor = $(el);
        const path = this.pathOf(anchor.attr('href') || '');
        const name = clean(anchor.text());
        if (!path || !name || seen.has(path)) return;
        seen.add(path);
        novels.push({
          name,
          path,
          completed: group[1].toLowerCase() === 'completed',
        });
      });
    });
    return novels;
  }

  private toNovelItems(novels: NovelEntry[]): Plugin.NovelItem[] {
    return novels.map(novel => ({
      name: novel.name,
      path: novel.path,
      cover: defaultCover,
    }));
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is a handful of novels on a single page.
    if (pageNo > 1) return [];
    const status = filters?.status?.value || 'all';
    const novels = (await this.novelList()).filter(
      novel => status === 'all' || (status === 'completed') === novel.completed,
    );
    return this.toNovelItems(novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, entries] = await Promise.all([
      this.loadPage(this.resolveUrl(novelPath)),
      this.novelList().catch(() => [] as NovelEntry[]),
    ]);
    const normalizedPath = novelPath.replace(/\/+$/, '');
    const entry = entries.find(item => item.path === normalizedPath);
    const content = $('.entry-content').first();
    // Reader comments live inside the entry content and may link elsewhere.
    content
      .find(
        'script,style,noscript,form,.wp-block-spacer,#comments,.wp-block-comments,#respond',
      )
      .remove();

    const novelPaths = new Set(entries.map(item => item.path));
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    content.find('li a').each((_, el) => {
      const anchor = $(el);
      const href = anchor.attr('href') || '';
      const path = this.pathOf(href);
      const name = clean(anchor.text());
      if (!path || !name || seen.has(path)) return;
      // Chapters are single-segment pages; skip comment and project links.
      if (path.split('/').length !== 2 || /[?#]/.test(href)) return;
      if (path === normalizedPath || novelPaths.has(path)) return;
      seen.add(path);
      chapters.push({ name, path });
    });

    const novel: Plugin.SourceNovel = {
      path: normalizedPath,
      name:
        clean($('.wp-block-post-title').first().text()) ||
        entry?.name ||
        'Untitled',
      cover: defaultCover,
      chapters,
    };
    if (entry) {
      novel.status = entry.completed
        ? NovelStatus.Completed
        : NovelStatus.Ongoing;
    }

    // The description sits between the title block and the chapter list.
    const firstList = content.find('ul').first().get(0);
    const summary: string[] = [];
    content.find('h1, h2, h3, h4, p, ul').each((_, el) => {
      if (el === firstList) return false;
      if (el.tagName === 'ul') return;
      const paragraph = $(el);
      paragraph.find('br').replaceWith(' ');
      const text = clean(paragraph.text());
      if (!text) return;
      const author = AUTHOR_LINE.exec(text);
      if (author) {
        novel.author = author[1].trim();
        return;
      }
      // Only paragraphs are description text; headings carry titles.
      if (el.tagName !== 'p' || SKIPPED_SUMMARY_LINE.test(text)) return;
      // Original-title lines consist of nothing but a link to the raw.
      const linkText = clean(paragraph.find('a').text());
      if (linkText && linkText === text) return;
      summary.push(text);
    });
    novel.summary = summary.join('\n\n') || undefined;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('.entry-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,hr,.wp-block-spacer,.sharedaddy,#jp-post-flair,#comments,.wp-block-comments,#wordads-inline-marker',
      )
      .remove();
    content.find('p, div').each((_, el) => {
      const block = $(el);
      const text = clean(block.text());
      if (block.find('img').length) return;
      if (
        !text ||
        CHAPTER_NAVIGATION.test(text) ||
        (SUPPORT_NOTE.test(text) && text.length < 400)
      ) {
        block.remove();
      }
    });
    const chapter = content.html()?.trim() || '';
    if (!content.find('img').length && clean(content.text()).length < 200)
      throw new Error('RPGNovels: no readable chapter text found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || pageNo > 1) return [];
    // The site's own search returns individual chapter posts, so match the
    // novel titles from the project menus instead.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toNovelItems(novels);
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (!SITE_HOSTS.test(url.hostname))
      throw new Error('RPGNovels: invalid page address.');
    const pathname = url.pathname.endsWith('/')
      ? url.pathname
      : `${url.pathname}/`;
    return `${this.site}${pathname}${url.search}`;
  }
}

export default new RpgNovelsPlugin();
