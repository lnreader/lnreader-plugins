import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
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

type WpPage = {
  id: number;
  slug: string;
  content?: { rendered: string };
};

type WpCategory = {
  id: number;
  slug: string;
  name: string;
  count: number;
};

/** Posts per REST page; WordPress caps `per_page` at 100. */
const PER_PAGE = 100;

/** The catch-all category the site files non-novel posts under. */
const UNCATEGORIZED = 'uncategorized';

/**
 * Where each novel category keeps its project page (cover, author and
 * synopsis). The page slugs do not follow the category slugs, so they are
 * listed here; a category that is not listed still shows up with its chapters.
 * `postSlug` is for the one project whose description is a post in its own
 * category rather than a page.
 */
const PROJECTS: Record<string, { pageSlug?: string; postSlug?: string }> = {
  'executed-necromancer': { pageSlug: 'executed-necromancer' },
  'forbidden-master': { pageSlug: 'forbidden-master' },
  'god-slaying-demon-king': { pageSlug: 'god-slaying-demon-king' },
  'healer-in-the-abyss': {
    postSlug:
      'the-healer-abandoned-by-her-comrades-and-thrown-into-the-abyss-meets-the-%e3%80%8eking-of-the-demons%e3%80%8f',
  },
  'maiden-game-hard-mode': { pageSlug: 'living-a-maiden-game-in-hard-mode' },
  'refrain-game': { pageSlug: 'refrain-game' },
  'so-ill-kill-you': { pageSlug: 'so-i-will-kill-you-here' },
  'super-dreadnought-villainess': {
    pageSlug: 'super-dreadnought-cheat-villainess',
  },
};

/**
 * Chapters the site filed under the wrong category (or none) are found again
 * by searching for the novel's title. Titles are matched by this pattern;
 * unlisted novels match titles that start with the novel's name.
 */
const MISFILED: Record<string, { search: string; pattern: RegExp }> = {
  shorts: { search: 'Short', pattern: /\d{4} Short$/i },
};

/**
 * Sads Translates (sadstranslates.page) is a WordPress.com blog, so this
 * plugin reads the public WordPress.com REST API
 * (`public-api.wordpress.com/wp/v2/sites/<site>`) instead of its theme markup:
 *
 * - Every novel is a post category, and its chapters are the dated posts in
 *   that category.
 * - Cover, author and synopsis come from the novel's project page.
 * - The Projects page lists which novels are still Active or Completed.
 * - The site's own search returns chapter posts, so search matches the (few)
 *   novel titles instead, like other translator-blog plugins here.
 */
class SadsTranslatesPlugin implements Plugin.PluginBase {
  id = 'sadstranslates';
  name = 'Sads Translates';
  icon = 'src/en/sadstranslates/icon.png';
  site = 'https://sadstranslates.page';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/sadstranslates.page';

  private coverCache: Record<string, string> | undefined;

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
    const categories = await this.fetchCategories();
    const category = categories.filter(item => item.slug === slug)[0];
    if (!category) {
      throw new Error(`Sads Translates: novel not found at ${novelPath}`);
    }

    const project = PROJECTS[category.slug];
    const [chapters, details, status] = await Promise.all([
      this.fetchChapters(category, categories, project?.postSlug),
      this.fetchProjectDetails(project),
      this.fetchStatus(project),
    ]);

    return {
      path: this.toCategoryPath(category.slug),
      name: this.decode(category.name),
      cover: details.cover || defaultCover,
      author: details.author,
      summary: details.summary,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = this.lastSegment(chapterPath);
    const posts = await this.fetchList<WpPost>(
      `/posts?slug=${slug}&_fields=id,slug,link,title,date,content`,
    );
    const html = posts[0]?.content?.rendered || '';
    if (!html.trim()) {
      throw new Error(`Sads Translates: no chapter text at ${chapterPath}`);
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root.find('script, style, iframe, .wp-block-embed, .sharedaddy').remove();
    root.find('p').each((_, el) => {
      const paragraph = $(el);
      const text = paragraph
        .text()
        .replace(/[\s\u3000]+/g, ' ')
        .trim();
      const hasImage = paragraph.find('img').length > 0;
      // Previous / TOC / Preview links above and below the text, and the
      // empty spacer paragraphs the translator uses between lines.
      const isNavigation =
        /^((previous|next|toc|preview|teaser)[\s|\u2013-]*)+$/i.test(text);
      if (!hasImage && (!text || isNavigation)) {
        paragraph.remove();
      }
    });
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /** Novels are the post categories, biggest first. */
  private async listNovels(
    pageNo: number,
    searchTerm: string,
  ): Promise<Plugin.NovelItem[]> {
    // The site has only a handful of novels, so they all fit on one page.
    if (pageNo > 1) {
      return [];
    }
    const [categories, covers] = await Promise.all([
      this.fetchCategories(),
      this.fetchCovers(),
    ]);
    const needle = this.searchKey(searchTerm);
    return categories
      .filter(category => category.slug !== UNCATEGORIZED && category.count > 0)
      .map(category => ({
        name: this.decode(category.name),
        path: this.toCategoryPath(category.slug),
        cover: covers[category.slug] || defaultCover,
      }))
      .filter(novel => this.searchKey(novel.name).indexOf(needle) !== -1);
  }

  /** Lowercase with typographic quotes flattened so "I'll" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"');
  }

  /** Every post category, biggest first (the site has only a handful). */
  private fetchCategories(): Promise<WpCategory[]> {
    return this.fetchList<WpCategory>(
      `/categories?per_page=${PER_PAGE}&orderby=count&order=desc` +
        '&_fields=id,slug,name,count',
    );
  }

  /** Whether a post title starts with a novel's name ("Name - Chapter 1"). */
  private startsWithName(title: string, name: string): boolean {
    const key = this.searchKey(name);
    const text = this.searchKey(title);
    return text.indexOf(key) === 0 && !/[a-z0-9]/.test(text.charAt(key.length));
  }

  /**
   * Chapters are the dated posts of the novel's category, oldest first. The
   * site sometimes files a chapter under another category (or none), so those
   * are searched for by title and merged in, and posts that carry another
   * novel's title are left out.
   */
  private async fetchChapters(
    category: WpCategory,
    categories: WpCategory[],
    introSlug?: string,
  ): Promise<Plugin.ChapterItem[]> {
    const novelName = this.decode(category.name);
    const otherNames = categories
      .filter(item => item.id !== category.id && item.slug !== UNCATEGORIZED)
      .map(item => this.decode(item.name));
    const misfiled = MISFILED[category.slug];
    const isOwnTitle = (title: string) =>
      misfiled
        ? misfiled.pattern.test(title)
        : this.startsWithName(title, novelName);

    const posts: WpPost[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.fetchList<WpPost>(
        `/posts?categories=${category.id}&per_page=${PER_PAGE}&page=${page}` +
          '&orderby=date&order=asc&_fields=id,slug,link,title,date',
      );
      posts.push(...batch);
      if (batch.length < PER_PAGE) {
        break;
      }
    }
    const strays = await this.fetchList<WpPost>(
      `/posts?search=${encodeURIComponent(misfiled?.search || novelName)}` +
        `&categories_exclude=${category.id}&per_page=${PER_PAGE}` +
        '&_fields=id,slug,link,title,date',
    );

    const chapters: Plugin.ChapterItem[] = [];
    const prefix = new RegExp(
      '^' + this.escapeRegExp(novelName) + '\\s*[\\u2013-]?\\s*',
      'i',
    );
    const seen: Record<number, boolean> = {};
    const candidates = posts
      .filter(post => {
        const title = this.decode(post.title.rendered);
        return (
          isOwnTitle(title) ||
          !otherNames.some(other => this.startsWithName(title, other))
        );
      })
      .concat(
        strays.filter(post => isOwnTitle(this.decode(post.title.rendered))),
      )
      .sort((a, b) =>
        a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1,
      );
    for (const post of candidates) {
      // The introduction post is the novel's description, not a chapter.
      if (
        seen[post.id] ||
        (introSlug && post.slug.toLowerCase() === introSlug.toLowerCase())
      ) {
        continue;
      }
      seen[post.id] = true;
      const title = this.decode(post.title.rendered);
      chapters.push({
        name: title.replace(prefix, '') || title,
        path: this.toPath(post.link),
        releaseTime: post.date,
        chapterNumber: chapters.length + 1,
      });
    }
    return chapters;
  }

  /** Cover, author and synopsis from the novel's project page or intro post. */
  private async fetchProjectDetails(
    project: { pageSlug?: string; postSlug?: string } | undefined,
  ): Promise<{ cover?: string; author?: string; summary?: string }> {
    let html = '';
    if (project?.pageSlug) {
      const pages = await this.fetchList<WpPage>(
        `/pages?slug=${project.pageSlug}&_fields=id,slug,content`,
      );
      html = pages[0]?.content?.rendered || '';
    } else if (project?.postSlug) {
      const posts = await this.fetchList<WpPost>(
        `/posts?slug=${project.postSlug}&_fields=id,slug,content`,
      );
      html = posts[0]?.content?.rendered || '';
    }
    if (!html) {
      return {};
    }

    const $ = loadCheerio(`<div id="project">${html}</div>`);
    $('#project br').replaceWith('\n');
    const lines: string[] = [];
    $('#project p').each((_, el) => {
      lines.push(
        $(el)
          .text()
          .replace(/[ \t\u00a0]+/g, ' ')
          .replace(/ ?\n ?/g, '\n')
          .trim(),
      );
    });

    // The header block ends at the last Author:/Source: line; the synopsis
    // runs from there to the Tags: line (or to the first chapter link).
    let start = 0;
    lines.slice(0, 8).forEach((line, index) => {
      if (/^(Author|Source)\b/i.test(line)) {
        start = index + 1;
      }
    });
    const summary: string[] = [];
    for (const line of lines.slice(start)) {
      if (/^Tags\b/i.test(line) || /^(Prologue|Chapter\s*\d)/i.test(line)) {
        break;
      }
      if (line && !/^(Synopsis|Old title)\b/i.test(line)) {
        summary.push(line);
      }
    }

    const authorLine = lines.find(line => /^Author\b/i.test(line));
    const image = $('#project img').first().attr('src');
    return {
      cover: image ? image.split('?')[0] : undefined,
      author: authorLine
        ? authorLine.replace(/^Author:?\s*/i, '').trim() || undefined
        : undefined,
      summary: summary.join('\n\n') || undefined,
    };
  }

  /** The Projects page groups novels under Active and Completed headings. */
  private async fetchStatus(
    project: { pageSlug?: string; postSlug?: string } | undefined,
  ): Promise<string> {
    const slug = (project?.pageSlug || project?.postSlug || '').toLowerCase();
    if (!slug) {
      return NovelStatus.Unknown;
    }
    const pages = await this.fetchList<WpPage>(
      '/pages?slug=projects&_fields=id,slug,content',
    );
    const $ = loadCheerio(
      `<div id="projects">${pages[0]?.content?.rendered || ''}</div>`,
    );
    let heading = '';
    let status: string = NovelStatus.Unknown;
    $('#projects')
      .find('h2, a')
      .each((_, el) => {
        const node = $(el);
        if (el.tagName === 'h2') {
          heading = this.normalizeText(node.text()).toLowerCase();
          return;
        }
        if (this.lastSegment(node.attr('href') || '').toLowerCase() !== slug) {
          return;
        }
        if (heading === 'active') status = NovelStatus.Ongoing;
        if (heading === 'completed') status = NovelStatus.Completed;
      });
    return status;
  }

  /** Cover of every novel from its project page, in a single request. */
  private async fetchCovers(): Promise<Record<string, string>> {
    if (this.coverCache) {
      return this.coverCache;
    }
    const pageSlugs = Object.keys(PROJECTS)
      .map(key => PROJECTS[key].pageSlug)
      .filter(Boolean);
    const pages = await this.fetchList<WpPage>(
      `/pages?slug=${pageSlugs.join(',')}&per_page=${PER_PAGE}` +
        '&_fields=id,slug,content',
    );
    const covers: Record<string, string> = {};
    for (const key of Object.keys(PROJECTS)) {
      const page = pages.filter(
        item => item.slug === PROJECTS[key].pageSlug,
      )[0];
      const image = page?.content?.rendered.match(
        /<img[^>]*?\ssrc="([^"]+)"/i,
      )?.[1];
      if (image) {
        covers[key] = image.split('?')[0];
      }
    }
    this.coverCache = covers;
    return covers;
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

  private toCategoryPath(slug: string): string {
    return `/category/${slug}/`;
  }

  /** Site-relative path with a trailing slash, e.g. `/2019/10/28/prologue/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/(?:sadstranslates\.page|sads07\.wordpress\.com)(\/.*)?$/i,
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

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default new SadsTranslatesPlugin();
