import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

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

/** Category that holds one introduction post per novel. */
const INTRO_CATEGORY = 'romcom';

/**
 * NephologyTL (nephologytl.wordpress.com) is a WordPress.com fan translation
 * blog. Its pages are theme blocks without a stable structure, so this plugin
 * reads the public WordPress.com REST API the site advertises in its `Link`
 * header (`public-api.wordpress.com/wp/v2/sites/<site>`):
 *
 * - Every novel has an introduction post (synopsis and external links) in the
 *   `Romcom` category. The post's slug equals the slug of a category that
 *   collects that novel's chapter posts.
 * - Chapters are dated posts in the novel's category.
 * - Search filters the (few) introduction posts by title, because the API's
 *   own `search` parameter misses titles with typographic apostrophes.
 */
class NephologyTLPlugin implements Plugin.PluginBase {
  id = 'nephologytl';
  name = 'NephologyTL';
  icon = 'src/en/nephologytl/icon.png';
  site = 'https://nephologytl.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/nephologytl.wordpress.com';

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
    const intro = await this.findPost(
      `slug=${slug}&categories=${await this.introCategoryId()}`,
    );
    const category = await this.findCategory(slug);
    if (!intro || !category) {
      throw new Error(`NephologyTL: novel not found at ${novelPath}`);
    }

    const novel: Plugin.SourceNovel = {
      path: this.toPath(intro.link),
      name: this.decode(intro.title.rendered),
      cover: defaultCover,
      chapters: await this.fetchChapters(category.id),
    };

    // The introduction opens with a "Links:" block (NovelUpdates, author,
    // raw source); the synopsis is the paragraphs after it.
    const $ = loadCheerio(intro.content?.rendered || '');
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const p = $(el);
      const text = this.normalizeText(p.text());
      if (text && !/^Links:/i.test(text) && !/^Chapters:/i.test(text)) {
        paragraphs.push(text);
      }
    });
    // Stop at the site's own chapter index, which is not part of the synopsis.
    const synopsis: string[] = [];
    for (const text of paragraphs) {
      if (/^Chapter\s*\d/i.test(text)) {
        break;
      }
      synopsis.push(text);
    }
    if (synopsis.length > 0) {
      novel.summary = synopsis.join('\n\n');
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = this.lastSegment(chapterPath);
    const post = await this.findPost(`slug=${slug}`);
    const html = post?.content?.rendered || '';
    if (!post || !html.trim()) {
      throw new Error(`NephologyTL: no chapter text at ${chapterPath}`);
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root.find('script, style, .sharedaddy, .jp-relatedposts').remove();
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /** Novels are the introduction posts, newest first. */
  private async listNovels(
    pageNo: number,
    searchTerm: string,
  ): Promise<Plugin.NovelItem[]> {
    const posts = await this.fetchList<WpPost>(
      `/posts?categories=${await this.introCategoryId()}&per_page=${PER_PAGE}` +
        `&page=${pageNo}&orderby=date&order=desc&_fields=id,slug,link,title`,
    );
    const needle = this.searchKey(searchTerm);
    return posts
      .map(post => ({
        name: this.decode(post.title.rendered),
        path: this.toPath(post.link),
        cover: defaultCover,
      }))
      .filter(novel => this.searchKey(novel.name).indexOf(needle) !== -1);
  }

  /** Lowercase with typographic quotes flattened so "Parent's" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"');
  }

  private async fetchChapters(
    categoryId: number,
  ): Promise<Plugin.ChapterItem[]> {
    const chapters: Plugin.ChapterItem[] = [];
    for (let page = 1; ; page++) {
      const posts = await this.fetchList<WpPost>(
        `/posts?categories=${categoryId}&per_page=${PER_PAGE}&page=${page}` +
          '&orderby=date&order=asc&_fields=id,slug,link,title,date',
      );
      for (const post of posts) {
        const name = this.decode(post.title.rendered);
        const numbered = name.match(/\bChapter\s*(\d+(?:\.\d+)?)/i);
        chapters.push({
          name,
          path: this.toPath(post.link),
          releaseTime: post.date,
          chapterNumber: numbered ? Number(numbered[1]) : chapters.length + 1,
        });
      }
      if (posts.length < PER_PAGE) {
        return chapters;
      }
    }
  }

  private introCategoryIdCache: number | undefined;

  private async introCategoryId(): Promise<number> {
    if (this.introCategoryIdCache === undefined) {
      const category = await this.findCategory(INTRO_CATEGORY);
      if (!category) {
        throw new Error('NephologyTL: novel index category not found');
      }
      this.introCategoryIdCache = category.id;
    }
    return this.introCategoryIdCache;
  }

  private async findCategory(slug: string): Promise<WpCategory | undefined> {
    const found = await this.fetchList<WpCategory>(
      `/categories?slug=${slug}&_fields=id,slug`,
    );
    return found[0];
  }

  private async findPost(query: string): Promise<WpPost | undefined> {
    const found = await this.fetchList<WpPost>(
      `/posts?${query}&_fields=id,slug,link,title,date,content`,
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
      /^https?:\/\/nephologytl\.wordpress\.com(\/.*)?$/i,
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

export default new NephologyTLPlugin();
