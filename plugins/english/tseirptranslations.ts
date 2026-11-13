import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = { name: string; path: string; completed: boolean };

// Menu pages that are not novels (reviews, donations, the Dropped index, ...).
const NON_NOVEL_PATHS = new Set([
  '/tseirp-reviews',
  '/completed',
  '/teasers',
  '/donations',
  '/fan-art',
  '/about-me',
  '/invin',
]);
const NON_CHAPTER_PATH = /illustration/i;
const PAGE_SIZE = 20;

class TseirpTranslations implements Plugin.PluginBase {
  id = 'tseirptranslations';
  name = 'Tseirp Translations';
  icon = 'src/en/tseirptranslations/icon.png';
  site = 'https://www.tseirptranslations.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`Tseirp Translations: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (url.hostname.replace(/^www\./, '') !== 'tseirptranslations.com')
        return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** The site's novels are the pages linked from its top menu. */
  private async novelList(): Promise<NovelEntry[]> {
    const $ = await this.loadPage(this.site);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    $('ul.main-menu a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      // Novel pages live at a single-segment address, e.g. /water-magician.
      if (!path || path.split('/').length !== 2) return;
      if (NON_NOVEL_PATHS.has(path) || NON_CHAPTER_PATH.test(path)) return;
      if (seen.has(path)) return;
      seen.add(path);
      const name = anchor
        .text()
        .replace(/\s*~?\s*ToC\s*$/i, '')
        .trim();
      if (!name) return;
      const completed =
        anchor.parents('li').children('a').first().attr('href') ===
          `${this.site}/completed` ||
        anchor
          .parents('li')
          .children('a')
          .toArray()
          .some(a => this.pathOf($(a).attr('href') || '') === '/completed');
      novels.push({ name, path, completed });
    });
    return novels;
  }

  private coverOf($: ReturnType<typeof loadCheerio>): string {
    const img = $('.post-content img').first();
    const src = img.attr('data-src') || img.attr('src') || '';
    return src.startsWith('http') ? src : defaultCover;
  }

  private async toNovelItems(
    novels: NovelEntry[],
  ): Promise<Plugin.NovelItem[]> {
    return Promise.all(
      novels.map(async novel => {
        const $ = await this.loadPage(this.resolveUrl(novel.path)).catch(
          () => undefined,
        );
        return {
          name: novel.name,
          path: novel.path,
          cover: $ ? this.coverOf($) : defaultCover,
        };
      }),
    );
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const novels = (await this.novelList()).slice(
      (pageNo - 1) * PAGE_SIZE,
      pageNo * PAGE_SIZE,
    );
    return this.toNovelItems(novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, entries] = await Promise.all([
      this.loadPage(this.resolveUrl(novelPath)),
      this.novelList(),
    ]);
    const entry = entries.find(item => item.path === novelPath);
    const content = $('.post-content').first();
    content.find('script,style,noscript,.sharedaddy,.csmi').remove();

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    content.find('a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!path || !name || seen.has(path)) return;
      // Chapters are posts: /YYYY/MM/slug.html or a bare /slug address that is
      // not another table-of-contents page.
      const isPost =
        /^\/\d{4}\/\d{2}\/[^/]+$/.test(path) || /^\/[^/]+$/.test(path);
      if (!isPost || path === novelPath || NON_CHAPTER_PATH.test(path)) return;
      if (NON_NOVEL_PATHS.has(path)) return;
      if (entries.some(item => item.path === path)) return;
      seen.add(path);
      chapters.push({ name, path });
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        $('.post-title').first().text().replace(/\s+/g, ' ').trim(),
      cover: this.coverOf($),
      chapters,
      status: entry?.completed ? NovelStatus.Completed : NovelStatus.Ongoing,
    };

    const summary: string[] = [];
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      const linksChapter = paragraph
        .find('a[href]')
        .toArray()
        .some(a => seen.has(this.pathOf($(a).attr('href') || '') || ''));
      if (linksChapter) return;
      const text = paragraph.text().replace(/\s+/g, ' ').trim();
      if (!text) return;
      const author = /^Author:\s*(.+)$/i.exec(text);
      if (author) {
        novel.author = author[1].trim();
        return;
      }
      if (
        /^(Raws?|Illustrator|Source|Translated|TLC|Japanese Title|Translated Title|\*|\(Links|Description:?$|Synopsis:?$)/i.test(
          text,
        )
      )
        return;
      if (/^This is a work of fiction/i.test(text)) return;
      summary.push(text.replace(/^(Synopsis|Description):\s*/i, ''));
    });
    novel.summary = summary.join('\n\n') || undefined;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('.post-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,.sharedaddy,.csmi,.post-navigation,[id^="more-"]',
      )
      .remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.text().trim() && !paragraph.find('img').length)
        paragraph.remove();
    });
    // Lazy-loaded images keep their real address in data-src.
    content.find('img[data-src]').each((_, el) => {
      $(el).attr('src', $(el).attr('data-src') || '');
    });
    const chapter = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('Tseirp Translations: no readable chapter text found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site's own search returns chapter posts, so match novel titles
    // against the menu instead.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toNovelItems(
      novels.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE),
    );
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.hostname.replace(/^www\./, '') !== 'tseirptranslations.com')
      throw new Error('Tseirp Translations: invalid page address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new TseirpTranslations();
