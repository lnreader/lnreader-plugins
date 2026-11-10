import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type WpPage = {
  id: number;
  slug: string;
  link: string;
  date: string;
  parent: number;
  title: { rendered: string };
  content?: { rendered: string };
};

/** Pages per REST request; WordPress caps `per_page` at 100. */
const PER_PAGE = 100;

/**
 * procrastranslation (procrastranslation.wordpress.com) is a small WordPress.com
 * translation blog. It keeps no posts for chapters; instead every novel is a
 * top-level page and each chapter is a child page of its novel. This plugin
 * reads the public WordPress.com REST API the site advertises in its `Link`
 * header (`public-api.wordpress.com/wp/v2/sites/<site>`):
 *
 * - Novels are the top-level pages that have child pages. Pages such as
 *   "About", "Projects" and "Dropped" have no children and are skipped.
 * - Chapters are the novel's child pages, in publication order.
 * - The site has no novel covers, so `defaultCover` is used.
 * - The whole site is a few dozen pages, so there is one listing page and
 *   search filters the novel titles locally.
 */
class ProcrastranslationPlugin implements Plugin.PluginBase {
  id = 'procrastranslation';
  name = 'procrastranslation';
  icon = 'src/en/procrastranslation/icon.png';
  site = 'https://procrastranslation.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/procrastranslation.wordpress.com';

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    return this.listNovels(pageNo, '');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.listNovels(pageNo, searchTerm);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const pages = await this.fetchAllPages();
    const slug = this.lastSegment(novelPath);
    const novelPage = pages.find(
      page => page.parent === 0 && page.slug === slug,
    );
    if (!novelPage) {
      throw new Error(`procrastranslation: novel not found at ${novelPath}`);
    }

    const chapters: Plugin.ChapterItem[] = pages
      .filter(page => page.parent === novelPage.id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((page, index) => ({
        name: this.decode(page.title.rendered),
        path: this.toPath(page.link),
        releaseTime: page.date,
        chapterNumber: index + 1,
      }));

    const [withContent] = await this.fetchList<WpPage>(
      `/pages?include=${novelPage.id}&_fields=id,content`,
    );

    const novel: Plugin.SourceNovel = {
      path: this.toPath(novelPage.link),
      name: this.decode(novelPage.title.rendered),
      cover: defaultCover,
      chapters,
    };

    // The novel page opens with author and raw links, then a "Summary:" label,
    // then the synopsis paragraphs.
    const $ = loadCheerio(
      `<div id="novel">${withContent?.content?.rendered || ''}</div>`,
    );
    const author = $('p')
      .toArray()
      .map(el => this.normalizeText($(el).text()))
      .find(text => /^Author\s*:/i.test(text));
    if (author) {
      novel.author = author.replace(/^Author\s*:\s*/i, '');
    }
    const summary: string[] = [];
    let inSummary = false;
    $('p').each((_, el) => {
      const text = this.normalizeText($(el).text());
      if (!text) {
        return;
      }
      if (/^Summary\b/i.test(text)) {
        inSummary = true;
        const rest = text.replace(/^Summary[^:]*:\s*/i, '');
        if (rest && rest !== text) {
          summary.push(rest);
        }
        return;
      }
      // The synopsis ends where the page's own chapter index begins.
      if (inSummary && !/^(Chapter\s*\d|Prologue\b)/i.test(text)) {
        summary.push(text);
      } else if (inSummary) {
        inSummary = false;
      }
    });
    if (summary.length > 0) {
      novel.summary = summary.join('\n\n');
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = this.toPath(chapterPath);
    const slug = this.lastSegment(path);
    // Chapter slugs repeat across novels (`chapter-1`), so match on full link.
    const candidates = await this.fetchList<WpPage>(
      `/pages?slug=${slug}&_fields=id,slug,link,title,date,parent,content`,
    );
    const page = candidates.find(item => this.toPath(item.link) === path);
    const html = page?.content?.rendered || '';
    if (!page || !html.trim()) {
      throw new Error(`procrastranslation: no chapter text at ${chapterPath}`);
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root.find('script, style, .sharedaddy, .jp-relatedposts').remove();
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /** Novels are the top-level pages that have chapter child pages. */
  private async listNovels(
    pageNo: number,
    searchTerm: string,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    const pages = await this.fetchAllPages();
    const parents: Record<number, boolean> = {};
    pages.forEach(page => {
      parents[page.parent] = true;
    });
    const needle = this.searchKey(searchTerm);
    return pages
      .filter(page => page.parent === 0 && parents[page.id])
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(page => ({
        name: this.decode(page.title.rendered),
        path: this.toPath(page.link),
        cover: defaultCover,
      }))
      .filter(novel => this.searchKey(novel.name).indexOf(needle) !== -1);
  }

  /** Every page of the site, without bodies. */
  private async fetchAllPages(): Promise<WpPage[]> {
    const pages: WpPage[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.fetchList<WpPage>(
        `/pages?per_page=${PER_PAGE}&page=${page}` +
          '&_fields=id,slug,link,title,date,parent',
      );
      batch.forEach(item => pages.push(item));
      if (batch.length < PER_PAGE) {
        return pages;
      }
    }
  }

  /** Lowercase with typographic quotes flattened so "Parent's" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"');
  }

  /** Fetch a REST collection; WordPress answers 400 for a page past the end. */
  private async fetchList<T>(route: string): Promise<T[]> {
    const url = this.api + route;
    const res = await fetchApi(url);
    if (res.status === 400 || res.status === 404) {
      return [];
    }
    if (!res.ok) {
      // Carry the status so tooling can tell a refused/blocked request
      // (403/503) apart from a genuine parsing failure.
      throw Object.assign(
        new Error(`HTTP ${res.status} while fetching ${url}`),
        { status: res.status },
      );
    }
    return res.json();
  }

  /** Site-relative path with a trailing slash, e.g. `/urbandungeon/1-1/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/procrastranslation\.wordpress\.com(\/.*)?$/i,
    );
    const clean = (sameSite ? sameSite[1] || '/' : raw).split(/[?#]/)[0];
    const path = clean.charAt(0) === '/' ? clean : '/' + clean;
    return path.charAt(path.length - 1) === '/' ? path : path + '/';
  }

  /** Last path segment, still percent-encoded as WordPress stores slugs. */
  private lastSegment(path: string): string {
    const parts = this.toPath(path).split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  private decode(html: string): string {
    return this.normalizeText(loadCheerio(`<p>${html}</p>`)('p').text());
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}

export default new ProcrastranslationPlugin();
