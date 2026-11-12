import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type WpPage = {
  id: number;
  slug: string;
  link: string;
  parent: number;
  title: { rendered: string };
  content?: { rendered: string };
};

type WpPost = {
  id: number;
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

/** Posts per REST page; WordPress caps `per_page` at 100. */
const PER_PAGE = 100;

type NovelSource = {
  /** Slug of the category that collects the novel's chapter posts. */
  category: string;
  /** Chapter posts the site filed only under the parent "Web Novel" category. */
  strayChapters?: string[];
};

/**
 * The site lists its translations as pages under "Current Projects" and
 * "Side Projects"; each page holds a synopsis and cover images. A novel's
 * chapters are the posts of a category whose slug differs from the page slug,
 * so the pairing is spelled out here (page slug -> chapter source).
 */
const NOVELS: Record<string, NovelSource> = {
  fiancee: {
    category: 'omiai-shitakunakattanode',
    strayChapters: ['fiancee-ep-17', 'fiancee-v5-ep-30'],
  },
  'preaching-classmate': {
    category: 'tanin-wo-yosetsukenai-buaisouna-joshi',
    strayChapters: ['preaching-v2-ep-24'],
  },
  'idol-girl-classmate': { category: 'idol-girl' },
  'mawaru-gakuen-to-senpai-to-boku-simple-life': {
    category: 'mawaru-gakuen-senpai-to-boku-simple-life',
    strayChapters: ['v4c1p2'],
  },
  'nekura-and-hiria': { category: 'nekura-and-hiria' },
  '500-yen-imouto': { category: '500-yen' },
};

/**
 * Impatient MTL Reader (impatientmtlreader533234643.wordpress.com) is a
 * WordPress.com blog of machine-assisted light novel translations. Its theme
 * markup is not stable, so this plugin reads the public WordPress.com REST API
 * the site advertises (`public-api.wordpress.com/wp/v2/sites/<site>`).
 */
class ImpatientMTLReaderPlugin implements Plugin.PluginBase {
  id = 'impatientmtlreader';
  name = 'Impatient MTL Reader';
  icon = 'src/en/impatientmtlreader/icon.png';
  site = 'https://impatientmtlreader533234643.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/impatientmtlreader533234643.wordpress.com';

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
    const slug = this.lastSegment(novelPath);
    const source = NOVELS[slug];
    const pages = await this.fetchList<WpPage>(
      `/pages?slug=${slug}&_fields=id,slug,link,parent,title,content`,
    );
    const page = pages[0];
    if (!page || !source) {
      throw new Error(`Impatient MTL Reader: novel not found at ${novelPath}`);
    }
    const categories = await this.fetchList<WpCategory>(
      `/categories?slug=${source.category}&_fields=id,slug`,
    );
    if (!categories[0]) {
      throw new Error(`Impatient MTL Reader: no chapters for ${novelPath}`);
    }

    const novel: Plugin.SourceNovel = {
      path: this.toPath(page.link),
      name: this.decode(page.title.rendered),
      cover: this.pageCover(page),
      chapters: await this.fetchChapters(
        categories[0].id,
        source.strayChapters || [],
      ),
    };
    const summary = this.pageSummary(page);
    if (summary) {
      novel.summary = summary;
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = this.lastSegment(chapterPath);
    const posts = await this.fetchList<WpPost>(
      `/posts?slug=${slug}&_fields=id,slug,link,title,content`,
    );
    const html = posts[0]?.content?.rendered || '';
    if (!html.trim()) {
      throw new Error(
        `Impatient MTL Reader: no chapter text at ${chapterPath}`,
      );
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root
      .find('script, style, .sharedaddy, .jp-relatedposts, .wp-block-spacer')
      .remove();

    // Every post ends with the site's own footer: separators, a Ko-fi button,
    // a Discord invitation and a "TOC | Next" navigation line.
    root.find('hr').remove();
    root.find('table:has(img[src*="ko-fi"])').remove();
    root.find('figure:has(img[src*="discord"])').remove();
    root.find('p').each((_, el) => {
      const text = this.normalizeText($(el).text());
      if (/^TOC\s*\|/i.test(text) || /^Join\s+us on Discord/i.test(text)) {
        $(el).remove();
      }
    });
    root.find('div').each((_, el) => {
      if (!$(el).text().trim() && !$(el).find('img').length) {
        $(el).remove();
      }
    });
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /** The few translated novels are all listed on a single page. */
  private async listNovels(
    pageNo: number,
    searchTerm: string,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    const pages = await this.fetchList<WpPage>(
      `/pages?per_page=${PER_PAGE}&_fields=id,slug,link,parent,title,content`,
    );
    const needle = this.searchKey(searchTerm);
    return pages
      .filter(page => NOVELS[page.slug] !== undefined)
      .map(page => ({
        name: this.decode(page.title.rendered),
        path: this.toPath(page.link),
        cover: this.pageCover(page),
      }))
      .filter(novel => this.searchKey(novel.name).indexOf(needle) !== -1);
  }

  private async fetchChapters(
    categoryId: number,
    strayChapters: string[],
  ): Promise<Plugin.ChapterItem[]> {
    const fields = '&_fields=id,slug,link,title,date';
    const posts: WpPost[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.fetchList<WpPost>(
        `/posts?categories=${categoryId}&per_page=${PER_PAGE}&page=${page}` +
          fields,
      );
      posts.push(...batch);
      if (batch.length < PER_PAGE) {
        break;
      }
    }
    if (strayChapters.length > 0) {
      const slugs = strayChapters.map(slug => `slug[]=${slug}`).join('&');
      posts.push(
        ...(await this.fetchList<WpPost>(
          `/posts?${slugs}&per_page=${PER_PAGE}${fields}`,
        )),
      );
    }
    posts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return posts.map((post, index) => ({
      name: this.decode(post.title.rendered),
      path: this.toPath(post.link),
      releaseTime: post.date,
      chapterNumber: index + 1,
    }));
  }

  /**
   * Cover art is the first real image of the page; later images are the
   * site's donation and Discord badges, and one page only has a placeholder.
   * When a page lists several covers, an image named like "cover" wins.
   */
  private pageCover(page: WpPage): string {
    const $ = loadCheerio(`<div>${page.content?.rendered || ''}</div>`);
    const urls: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src && !/kofi|discord|noimagefound/i.test(src)) {
        urls.push(src);
      }
    });
    const named = urls.filter(url => /\/cove/i.test(url));
    const cover = named[0] || urls[0];
    // Only site images carry a resize query; the placeholder must stay intact.
    return cover ? cover.split('?')[0] : defaultCover;
  }

  /** Paragraphs after "Description:" up to the source / links block. */
  private pageSummary(page: WpPage): string {
    const $ = loadCheerio(`<div>${page.content?.rendered || ''}</div>`);
    const paragraphs: string[] = [];
    let started = false;
    $('p').each((_, el) => {
      const text = this.normalizeText($(el).text());
      if (!started) {
        started = /^Description:?$/i.test(text);
        return;
      }
      if (/^(Source|Novel Updates|Support Author|Raw)\b/i.test(text)) {
        return false;
      }
      if (text) {
        paragraphs.push(text);
      }
      return;
    });
    return paragraphs.join('\n\n');
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

  /** Site-relative path with a trailing slash, e.g. `/2022/08/05/slug/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/impatientmtlreader533234643\.wordpress\.com(\/.*)?$/i,
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

export default new ImpatientMTLReaderPlugin();
