import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { load as loadCheerio, CheerioAPI } from 'cheerio';

type WpPage = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
};

type WpPost = {
  id: number;
  slug: string;
  link: string;
  date: string;
  title: { rendered: string };
  content?: { rendered: string };
};

type CatalogueEntry = {
  slug: string;
  name: string;
  path: string;
  cover: string;
  status: string;
};

/** WordPress caps `per_page` at 100. */
const PER_PAGE = 100;
/** Slugs sent per request when resolving a table of contents to posts. */
const SLUG_CHUNK = 40;
/** Upper bound on search result pages read for one novel. */
const MAX_SEARCH_PAGES = 5;

/** Pages that collect something other than one translated novel. */
const NON_NOVEL_SLUGS = ['manga', 'drama-cds', 'teasers', 'short-stories'];

/** Status pages: each lists the novels that currently belong to it. */
const STATUS_PAGES: Record<string, string> = {
  current: NovelStatus.Ongoing,
  complete: NovelStatus.Completed,
  dropped: NovelStatus.Cancelled,
};

/** A chapter link in a table of contents, e.g. `/2024/09/12/some-slug/`. */
const CHAPTER_HREF =
  /^https?:\/\/wwaraitai\.co(\/\d{4}\/\d{2}\/\d{2}\/[^?#]+)/i;

/**
 * 何も分からないけど (Nani Mo Wakaranai Kedo, wwaraitai.co) is a WordPress.com
 * blog of Japanese web-novel translations. The theme has no stable markup, so
 * this plugin uses the public WordPress REST API instead:
 *
 * - Every novel is a page (summary, author, a table of contents). The
 *   Current / Complete / Dropped pages tell which novels are in which state.
 * - Every chapter is a dated post. The tables of contents are maintained by
 *   hand and several are behind the posts, so a novel's chapters are the
 *   union of its table of contents and the posts whose title starts with the
 *   novel's title, in publication order.
 */
class WwaraitaiPlugin implements Plugin.PluginBase {
  id = 'wwaraitai';
  name = 'Nani Mo Wakaranai Kedo';
  icon = 'src/en/wwaraitai/icon.png';
  site = 'https://wwaraitai.co';
  version = '1.0.0';

  private api = this.site + '/wp-json/wp/v2';

  filters = {
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Current', value: NovelStatus.Ongoing },
        { label: 'Complete', value: NovelStatus.Completed },
        { label: 'Dropped', value: NovelStatus.Cancelled },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The catalogue is small and returned as a single page.
    if (pageNo > 1) return [];
    const wanted = filters?.status?.value;
    const novels = await this.catalogue();
    return novels
      .filter(novel => !wanted || wanted === 'all' || novel.status === wanted)
      .map(novel => this.toItem(novel));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const needle = this.searchKey(searchTerm);
    const novels = await this.catalogue();
    return novels
      .filter(novel => this.searchKey(novel.name).indexOf(needle) !== -1)
      .map(novel => this.toItem(novel));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = this.lastSegment(novelPath);
    const [page] = await this.fetchList<WpPage>(
      `/pages?slug=${slug}&_fields=id,slug,link,title,content`,
    );
    if (!page) {
      throw new Error(
        `Nani Mo Wakaranai Kedo: novel not found at ${novelPath}`,
      );
    }

    const name = this.decode(page.title.rendered);
    const $ = loadCheerio(`<div id="page">${page.content.rendered}</div>`);
    const novel: Plugin.SourceNovel = {
      path: this.toPath(page.link),
      name,
      cover: this.coverOf($) || defaultCover,
      chapters: [],
    };

    const author = this.field($, 'Author');
    if (author) novel.author = author;
    const summary = this.summaryOf($);
    if (summary) novel.summary = summary;

    const statuses = await this.statusMap();
    novel.status = statuses[novel.path] || NovelStatus.Unknown;
    novel.chapters = await this.fetchChapters($, name);
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = this.lastSegment(chapterPath);
    const [post] = await this.fetchList<WpPost>(
      `/posts?slug=${slug}&_fields=id,slug,content`,
    );
    const html = post?.content?.rendered || '';
    if (!post || !html.trim()) {
      throw new Error(
        `Nani Mo Wakaranai Kedo: no chapter text at ${chapterPath}`,
      );
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root.find('script, style, .sharedaddy, .jp-relatedposts').remove();

    // Every chapter ends with a "Previous | Table of Contents | Next" line,
    // sometimes followed by social-media promotion; none of it is story text.
    const nav = root
      .children('p')
      .filter((_, el) => /Table of Contents/i.test($(el).text()))
      .last();
    if (nav.length > 0) {
      nav.nextAll().remove();
      nav.remove();
    }
    // Donation and commission requests are the translator's footer notes.
    root.children('p').each((_, el) => {
      const p = $(el);
      const text = this.normalizeText(p.text());
      const hasLink = p.find('a[href*="ko-fi.com"], a[href*="fiverr.com"]');
      if (
        hasLink.length > 0 ||
        /^Please also consider donating to my ko-fi/i.test(text) ||
        /^Have a Japanese story/i.test(text)
      ) {
        p.remove();
      }
    });
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /** Every translated novel, newest page first, with its state when known. */
  private async catalogue(): Promise<CatalogueEntry[]> {
    const pages = await this.fetchList<WpPage>(
      `/pages?per_page=${PER_PAGE}&_fields=id,slug,link,title,content`,
    );
    const statuses = this.statusesFrom(pages);
    const novels: CatalogueEntry[] = [];
    for (const page of pages) {
      if (NON_NOVEL_SLUGS.indexOf(page.slug) !== -1) continue;
      const $ = loadCheerio(`<div id="page">${page.content.rendered}</div>`);
      if (this.chapterLinks($).length === 0) continue;
      const path = this.toPath(page.link);
      novels.push({
        slug: page.slug,
        name: this.decode(page.title.rendered),
        path,
        cover: this.coverOf($) || defaultCover,
        status: statuses[path] || NovelStatus.Unknown,
      });
    }
    return novels;
  }

  private async statusMap(): Promise<Record<string, string>> {
    const slugs = Object.keys(STATUS_PAGES)
      .map(slug => `slug[]=${slug}`)
      .join('&');
    const pages = await this.fetchList<WpPage>(
      `/pages?${slugs}&_fields=id,slug,link,title,content`,
    );
    return this.statusesFrom(pages);
  }

  /** Map novel path -> state from the Current / Complete / Dropped pages. */
  private statusesFrom(pages: WpPage[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const page of pages) {
      const status = STATUS_PAGES[page.slug];
      if (!status) continue;
      const $ = loadCheerio(`<div id="page">${page.content.rendered}</div>`);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (/^https?:\/\/wwaraitai\.co\/[^/?#]+\/?$/i.test(href)) {
          map[this.toPath(href)] = status;
        }
      });
    }
    return map;
  }

  private toItem(novel: CatalogueEntry): Plugin.NovelItem {
    return { name: novel.name, path: novel.path, cover: novel.cover };
  }

  /** Chapter links of a novel page, in table-of-contents order. */
  private chapterLinks($: CheerioAPI) {
    const links: { path: string; label: string }[] = [];
    const seen = new Set<string>();
    $('a[href]').each((_, el) => {
      const match = ($(el).attr('href') || '').match(CHAPTER_HREF);
      if (!match) return;
      const path = this.toPath(match[1]);
      if (seen.has(path)) return;
      seen.add(path);
      links.push({ path, label: this.normalizeText($(el).text()) });
    });
    return links;
  }

  private async fetchChapters(
    $: CheerioAPI,
    novelName: string,
  ): Promise<Plugin.ChapterItem[]> {
    const links = this.chapterLinks($);
    const labels = new Map(links.map(link => [link.path, link.label]));
    const posts = new Map<string, WpPost>();

    // 1. Resolve the table of contents to posts (for date and order).
    for (let i = 0; i < links.length; i += SLUG_CHUNK) {
      const slugs = links
        .slice(i, i + SLUG_CHUNK)
        .map(link => `slug[]=${this.lastSegment(link.path)}`)
        .join('&');
      const found = await this.fetchList<WpPost>(
        `/posts?${slugs}&per_page=${PER_PAGE}&_fields=id,slug,link,date,title`,
      );
      for (const post of found) posts.set(this.toPath(post.link), post);
    }

    // 2. Add posts the table of contents has not caught up with. Chapter
    // posts are titled "<novel title> [Chapter N]", some with further tags
    // after it ("... [Chapter 1] [R-18]"), so every trailing bracketed tag
    // is removed to leave the bare novel title.
    const first = links.length > 0 ? posts.get(links[0].path) : undefined;
    const stem = this.stripTags(
      first ? this.decode(first.title.rendered) : novelName,
    );
    const extras = new Map<string, WpPost>();
    for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
      const found = await this.fetchList<WpPost>(
        `/posts?search=${encodeURIComponent(stem)}&per_page=${PER_PAGE}` +
          `&page=${page}&_fields=id,slug,link,date,title`,
      );
      for (const post of found) {
        const path = this.toPath(post.link);
        const title = this.decode(post.title.rendered);
        if (
          !posts.has(path) &&
          title.indexOf(stem) === 0 &&
          /^(\s|$)/.test(title.slice(stem.length))
        ) {
          extras.set(path, post);
        }
      }
      if (found.length < PER_PAGE) break;
    }

    const all: { path: string; post: WpPost; label: string }[] = [];
    posts.forEach((post, path) => {
      all.push({ path, post, label: labels.get(path) || '' });
    });
    extras.forEach((post, path) => {
      all.push({ path, post, label: this.extraLabel(post, stem) });
    });
    all.sort((a, b) =>
      a.post.date === b.post.date
        ? a.post.id - b.post.id
        : a.post.date < b.post.date
          ? -1
          : 1,
    );
    return all.map((item, index) => ({
      name:
        item.label ||
        this.extraLabel(item.post, stem) ||
        `Chapter ${index + 1}`,
      path: item.path,
      releaseTime: item.post.date,
      chapterNumber: index + 1,
    }));
  }

  /** Remove every trailing "[...]" tag: "Title [Chapter 1] [R-18]" -> "Title". */
  private stripTags(title: string): string {
    return title.replace(/(?:\s*\[[^\]]*\])+\s*$/, '');
  }

  /** "Novel title [Chapter Seven]" -> "Chapter Seven". */
  private extraLabel(post: WpPost, stem: string): string {
    const title = this.decode(post.title.rendered);
    const rest = title.indexOf(stem) === 0 ? title.slice(stem.length) : title;
    return this.normalizeText(rest.replace(/[[\]]/g, ' '));
  }

  /** First illustration on the novel page, when there is one. */
  private coverOf($: CheerioAPI): string | undefined {
    const src = $('img').first().attr('src');
    return src ? src.replace(/&#038;/g, '&') : undefined;
  }

  /** Value of a "Label: value" paragraph at the top of a novel page. */
  private field($: CheerioAPI, label: string) {
    let value: string | undefined;
    $('p').each((_, el) => {
      if (value !== undefined) return;
      const text = this.normalizeText($(el).text());
      const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, 'i'));
      if (match) value = match[1];
    });
    return value;
  }

  /** Paragraphs after "Summary:" up to the next labelled field or heading. */
  private summaryOf($: CheerioAPI): string | undefined {
    const parts: string[] = [];
    let inSummary = false;
    $('#page')
      .children()
      .each((_, el) => {
        const node = $(el);
        if (node.is('h1, h2, h3, h4, h5, h6, ul, ol')) {
          inSummary = false;
          return;
        }
        if (!node.is('p')) return;
        const text = this.normalizeText(node.text());
        const start = text.match(/^Summary:\s*(.*)$/i);
        if (start) {
          inSummary = true;
          if (start[1]) parts.push(start[1]);
          return;
        }
        if (inSummary && /^[A-Z][A-Za-z ]{2,20}:/.test(text)) {
          inSummary = false;
          return;
        }
        if (inSummary && text) parts.push(text);
      });
    return parts.length > 0 ? parts.join('\n\n') : undefined;
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

  /** Lowercase with typographic quotes flattened so "Villainess'" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"');
  }

  /** Site-relative path with a trailing slash, e.g. `/2022/08/05/slug/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(/^https?:\/\/(?:www\.)?wwaraitai\.co(\/.*)?$/i);
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

export default new WwaraitaiPlugin();
