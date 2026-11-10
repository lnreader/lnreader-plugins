import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = { name: string; path: string };

const HOST = 'ynvermoon.wordpress.com';
// Menu entries that are not novels.
const NON_NOVEL_PATHS = new Set(['/fanart', '/contents', '/about', '/contact']);

class YnverMoonPlugin implements Plugin.PluginBase {
  id = 'ynvermoon';
  name = 'Ynver Moon';
  icon = 'src/en/ynvermoon/icon.png';
  site = `https://${HOST}`;
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`Ynver Moon: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  /** Returns the on-site path of a link, or undefined for external links. */
  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (url.hostname !== HOST) return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** The site's novels are the table-of-contents pages in its top menu. */
  private async novelList(): Promise<NovelEntry[]> {
    const $ = await this.loadPage(this.site);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    $('#primary-menu a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      // Novel pages live at a single-segment address, e.g. /sore-itadakimasu.
      if (!path || path.split('/').length !== 2) return;
      if (NON_NOVEL_PATHS.has(path) || seen.has(path)) return;
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!name) return;
      seen.add(path);
      novels.push({ name, path });
    });
    return novels;
  }

  private coverOf(content: ReturnType<ReturnType<typeof loadCheerio>>) {
    const src = content.find('img').first().attr('src') || '';
    return src.startsWith('http') ? src.replace(/\?.*$/, '') : defaultCover;
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
          cover: $ ? this.coverOf($('.entry-content').first()) : defaultCover,
        };
      }),
    );
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is a handful of pages, so there is only one page.
    if (pageNo > 1) return [];
    return this.toNovelItems(await this.novelList());
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, entries] = await Promise.all([
      this.loadPage(this.resolveUrl(novelPath)),
      this.novelList(),
    ]);
    const entry = entries.find(item => item.path === novelPath);
    const content = $('.entry-content').first();
    content.find('script,style,noscript,#jp-post-flair,.sharedaddy').remove();

    // Chapters are the links to posts on this site, in table-of-contents order.
    // Links to other blogs (earlier parts translated elsewhere) are skipped.
    const chapters: Plugin.ChapterItem[] = [];
    const chapterPaths = new Set<string>();
    content.find('a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      const label = anchor.text().replace(/\s+/g, ' ').trim();
      if (!path || !label || chapterPaths.has(path) || path === novelPath)
        return;
      const dated = /^\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+$/.exec(path);
      if (!dated) return;
      chapterPaths.add(path);
      chapters.push({
        name: /^\d+$/.test(label) ? `Chapter ${label}` : label,
        path,
        releaseTime: new Date(
          Date.UTC(Number(dated[1]), Number(dated[2]) - 1, Number(dated[3])),
        ).toISOString(),
      });
    });
    chapters.forEach((chapter, index) => {
      const numbered = /^Chapter\s*(\d+(?:\.\d+)?)\b/i.exec(chapter.name);
      chapter.chapterNumber = numbered ? Number(numbered[1]) : index + 1;
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        $('.entry-title').first().text().replace(/\s+/g, ' ').trim(),
      cover: this.coverOf(content),
      chapters,
    };

    // The summary is the text after the "Synopsis:" line, up to the next rule.
    const summary: string[] = [];
    let inSynopsis = false;
    content.children().each((_, el) => {
      const node = $(el);
      if (node.is('hr')) {
        if (inSynopsis && summary.length) inSynopsis = false;
        return;
      }
      const text = node.text().replace(/\s+/g, ' ').trim();
      const author = /^Author:\s*(.+)$/i.exec(text);
      if (author && !novel.author) {
        novel.author = author[1].trim();
        return;
      }
      if (/^Synopsis:?$/i.test(text)) {
        inSynopsis = true;
        return;
      }
      if (inSynopsis && text) summary.push(text.replace(/^Synopsis:\s*/i, ''));
    });
    novel.summary = summary.join('\n\n') || undefined;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('.entry-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,#jp-post-flair,.sharedaddy,.wpcnt,[id^="more-"]',
      )
      .remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.text().trim() && !paragraph.find('img').length)
        paragraph.remove();
    });
    const chapter = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('Ynver Moon: no readable chapter text found.');
    return chapter.trim();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site has only a few novels, so match their titles against the menu.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toNovelItems(novels);
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.hostname !== HOST) throw new Error('Ynver Moon: invalid address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new YnverMoonPlugin();
