import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type WpPage = {
  slug: string;
  link: string;
  title: { rendered: string };
  content?: { rendered: string };
};

type WpPost = {
  slug: string;
  link: string;
  date: string;
  title: { rendered: string };
  content?: { rendered: string };
};

type WpCategory = {
  id: number;
  slug: string;
};

type Catalog = {
  novels: Plugin.NovelItem[];
  pages: Record<string, WpPage>;
  completed: string;
  dropped: string;
};

/** Posts per REST page; WordPress caps `per_page` at 100. */
const PER_PAGE = 100;

/** How long the novel catalogue is reused before it is fetched again. */
const CATALOG_TTL_MS = 10 * 60 * 1000;

/**
 * TaxingCorn117's Translations is a WordPress.com fan translation blog (the
 * old taxingcorn117stranslations.com address no longer resolves). Its theme
 * markup is a plain block layout, so this plugin reads the public WordPress.com
 * REST API the site advertises in its `Link` header
 * (`public-api.wordpress.com/wp/v2/sites/<site>`):
 *
 * - Every novel has a page (cover, release rate, synopsis) whose slug equals
 *   the slug of a category that collects the novel's chapter posts.
 * - Chapters are dated posts in that category.
 * - The "Completed Novels" and "Dropped Novels" pages say which novels are
 *   finished or abandoned; everything else is treated as ongoing.
 */
class TaxingCorn117sTranslationsPlugin implements Plugin.PluginBase {
  id = 'taxingcorn117stranslations';
  name = "TaxingCorn117's Translations";
  icon = 'src/en/taxingcorn117stranslations/icon.png';
  site = 'https://taxingcorn117stranslations.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/taxingcorn117stranslations.wordpress.com';

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is a handful of novels on a single page.
    if (pageNo > 1) {
      return [];
    }
    return (await this.loadCatalog()).novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    const needle = this.searchKey(searchTerm);
    return (await this.loadCatalog()).novels.filter(
      novel => this.searchKey(novel.name).indexOf(needle) !== -1,
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = this.lastSegment(novelPath);
    const catalog = await this.loadCatalog();
    const page = catalog.pages[slug];
    const category = await this.findCategory(slug);
    if (!page || !category) {
      throw new Error(`TaxingCorn117: novel not found at ${novelPath}`);
    }

    const html = page.content?.rendered || '';
    const novel: Plugin.SourceNovel = {
      path: this.toPath(page.link),
      name: this.decode(page.title.rendered),
      cover: this.pickCover(html),
      chapters: await this.fetchChapters(category.id),
    };

    const summary = this.pickSummary(html);
    if (summary) {
      novel.summary = summary;
    }
    novel.status = this.pickStatus(slug, html, catalog);
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = this.lastSegment(chapterPath);
    const found = await this.fetchList<WpPost>(
      `/posts?slug=${slug}&_fields=slug,link,title,date,content`,
    );
    const html = found[0]?.content?.rendered || '';
    if (!html.trim()) {
      throw new Error(`TaxingCorn117: no chapter text at ${chapterPath}`);
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root.find('script, style, .sharedaddy, .jp-relatedposts').remove();
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  private catalogCache: Promise<Catalog> | undefined;
  private catalogLoadedAt = 0;

  /**
   * Novels are the pages that share their slug with a non-empty category.
   * The category check drops the site's own information pages and the
   * duplicated draft of a novel that has no chapters of its own.
   */
  private loadCatalog(): Promise<Catalog> {
    // Reuse the catalogue for a few minutes so browsing, searching and opening
    // a novel share one fetch, but pick up new novels and edited pages later.
    if (
      !this.catalogCache ||
      Date.now() - this.catalogLoadedAt > CATALOG_TTL_MS
    ) {
      this.catalogLoadedAt = Date.now();
      const pending = this.buildCatalog().catch(error => {
        if (this.catalogCache === pending) {
          this.catalogCache = undefined;
        }
        throw error;
      });
      this.catalogCache = pending;
    }
    return this.catalogCache;
  }

  private async buildCatalog(): Promise<Catalog> {
    const [categories, pages] = await Promise.all([
      this.fetchList<WpCategory>(
        `/categories?per_page=${PER_PAGE}&hide_empty=true&_fields=id,slug`,
      ),
      this.fetchList<WpPage>(
        `/pages?per_page=${PER_PAGE}&parent=0&orderby=title&order=asc` +
          '&_fields=slug,link,title,content',
      ),
    ]);
    const categorySlugs: Record<string, boolean> = {};
    categories.forEach(category => {
      categorySlugs[category.slug] = true;
    });

    const catalog: Catalog = {
      novels: [],
      pages: {},
      completed: '',
      dropped: '',
    };
    pages.forEach(page => {
      if (page.slug === 'completed-novels') {
        catalog.completed = page.content?.rendered || '';
      } else if (page.slug === 'dropped-novels') {
        catalog.dropped = page.content?.rendered || '';
      } else if (categorySlugs[page.slug]) {
        catalog.pages[page.slug] = page;
        catalog.novels.push({
          name: this.decode(page.title.rendered),
          path: this.toPath(page.link),
          cover: this.pickCover(page.content?.rendered || ''),
        });
      }
    });
    return catalog;
  }

  private async fetchChapters(
    categoryId: number,
  ): Promise<Plugin.ChapterItem[]> {
    const chapters: Plugin.ChapterItem[] = [];
    for (let page = 1; ; page++) {
      const posts = await this.fetchList<WpPost>(
        `/posts?categories=${categoryId}&per_page=${PER_PAGE}&page=${page}` +
          '&orderby=date&order=asc&_fields=slug,link,title,date',
      );
      for (const post of posts) {
        const name = this.decode(post.title.rendered);
        const numbered = name.match(/\bChapter\s*(\d+(?:\.\d+)?)\s*$/i);
        chapters.push({
          name,
          path: this.toPath(post.link),
          releaseTime: post.date,
          chapterNumber: numbered
            ? Number(numbered[1])
            : /\bPrologue\s*$/i.test(name)
              ? 0
              : chapters.length + 1,
        });
      }
      if (posts.length < PER_PAGE) {
        break;
      }
    }
    // Several chapters are published at the same instant, so the date alone
    // does not order them reliably.
    return chapters
      .map((chapter, index) => ({ chapter, index }))
      .sort(
        (a, b) =>
          (a.chapter.chapterNumber || 0) - (b.chapter.chapterNumber || 0) ||
          a.index - b.index,
      )
      .map(entry => entry.chapter);
  }

  /** First image on the novel page is its cover. */
  private pickCover(html: string): string {
    const src = loadCheerio(`<div>${html}</div>`)('img').first().attr('src');
    return src ? src.split('?')[0] : defaultCover;
  }

  /** Synopsis: the paragraphs between "Description" and the chapter index. */
  private pickSummary(html: string): string {
    const $ = loadCheerio(`<div id="page">${html}</div>`);
    const lines: string[] = [];
    let inDescription = false;
    $('#page')
      .children()
      .each((_, el) => {
        const node = $(el);
        const text = this.normalizeText(node.text());
        if (!inDescription) {
          inDescription = /^Description$/i.test(text);
          return;
        }
        if (/^Table of Contents$/i.test(text) || node.find('a').length > 0) {
          inDescription = false;
          return false;
        }
        if (node.is('p, pre') && text) {
          // Keep the <br> / newline separated lines of the synopsis.
          node.find('br').replaceWith('\n');
          lines.push(
            node
              .text()
              .split('\n')
              .map(line => this.normalizeText(line))
              .filter(Boolean)
              .join('\n'),
          );
        }
      });
    return lines.join('\n\n');
  }

  private pickStatus(slug: string, html: string, catalog: Catalog): string {
    if (catalog.completed.indexOf(`/${slug}/`) !== -1) {
      return NovelStatus.Completed;
    }
    if (catalog.dropped.indexOf(`/${slug}/`) !== -1) {
      return /On Hiatus/i.test(this.normalizeText(loadCheerio(html).text()))
        ? NovelStatus.OnHiatus
        : NovelStatus.Cancelled;
    }
    return NovelStatus.Ongoing;
  }

  /** Lowercase with typographic quotes flattened so "Parent's" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"');
  }

  private async findCategory(slug: string): Promise<WpCategory | undefined> {
    const found = await this.fetchList<WpCategory>(
      `/categories?slug=${slug}&_fields=id,slug`,
    );
    return found[0];
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

  /** Site-relative path with a trailing slash, e.g. `/2022/08/05/slug/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/taxingcorn117stranslations\.wordpress\.com(\/.*)?$/i,
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

export default new TaxingCorn117sTranslationsPlugin();
