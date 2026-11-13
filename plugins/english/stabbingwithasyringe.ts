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
  title: { rendered: string };
  content?: { rendered: string };
};

type ChapterSortKey = {
  volume: number;
  rank: number;
  numbers: number[];
};

/** Posts per REST page; WordPress caps `per_page` at 100. */
const PER_PAGE = 100;
/** Page that every novel page hangs under. */
const NOVELS_SLUG = 'stabbingwithasyringe-translated-works';

// Volumes created for "Extra Volume N" / "Extra Edition N" side collections
// sort after the numbered volumes; undated leftovers (a lone epilogue, LN/WN
// extras) after those; after-stories last.
const EXTRA_VOLUME_BASE = 1000;
const LOOSE_VOLUME = 1500;
const AFTER_STORIES_VOLUME = 2000;

// A volume's complete text is also posted as one "(Full Text)" page next to the
// per-chapter pages; those pages would only duplicate the chapters.
const FULL_TEXT = /\(\s*Full Text\s*\)/i;
// Where the chapter label starts in a page title, after the novel's name.
const LABEL_START =
  /(?:LN\s+|WN\s+)?Volume\s+\d+|Extra\s+Volume|Extra\s+Edition|Prologue|Epilogue|Introduction|After\s?stories|Extra\s+Stories|Webnovel\s+Extra|Idle\s+Talk|LN\s+Extra|WN\s+Extra/i;
// "Previous Chapter | Table of Contents | Next Chapter" style lines.
const NAV_LINE =
  /^[\s|‹›«»<>[\]()≪≫≣–—·-]*(?:(?:previous|prev|next|last|first)(?:\s+chapter)?|table of contents|toc|extra chapters|index)(?:[\s|‹›«»<>[\]()≪≫≣–—·-]+(?:(?:previous|prev|next|last|first)(?:\s+chapter)?|table of contents|toc|extra chapters|index))*[\s|‹›«»<>[\]()≪≫≣–—·-]*$/i;

const compareNumbers = (a: number[], b: number[]): number => {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = i < a.length ? a[i] : -1;
    const right = i < b.length ? b[i] : -1;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
};

const numbersIn = (text: string): number[] => {
  const cut = text.split(/\s[–—-]\s|\(/)[0];
  const found = cut.match(/\d+/g) || [];
  const numbers = found.map(Number);
  if (/\bfinal\b/i.test(cut) && numbers.length === 0) {
    numbers.push(9999);
  }
  return numbers;
};

/**
 * The site orders chapters by hand-made contents tables that are out of date
 * for the long-running novels, and the page tree itself has no usable order
 * (`menu_order` is 0 and many pages share one date). The titles are regular
 * enough ("Volume 2 Chapter 11", "Volume 3 Extra Story 1 (LN Exclusive)",
 * "Prologue 4", ...) to rebuild the reading order from them.
 */
const chapterSortKey = (title: string): ChapterSortKey => {
  let volume: number;
  let rest = title;

  const extraVolume = title.match(/\bExtra\s+Volume\s+(\d+)/i);
  const plainVolume = title.match(/\bVolume\s+(\d+)/i);
  const edition = title.match(/\bExtra\s+Edition\s+(\d+)/i);
  const afterStories = title.match(
    /After\s?stories|Extra\s+Stories|Webnovel\s+Extra\s+Story/i,
  );
  const prologue = title.match(/\b(?:Prologue|Introduction)\b/i);

  if (extraVolume) {
    volume = EXTRA_VOLUME_BASE + Number(extraVolume[1]);
    rest = title.slice((extraVolume.index || 0) + extraVolume[0].length);
  } else if (plainVolume) {
    volume = Number(plainVolume[1]);
    rest = title.slice((plainVolume.index || 0) + plainVolume[0].length);
  } else if (edition) {
    volume = EXTRA_VOLUME_BASE + Number(edition[1]);
    rest = title.slice((edition.index || 0) + edition[0].length);
  } else if (afterStories) {
    volume = AFTER_STORIES_VOLUME;
    rest = title.slice(afterStories.index || 0);
  } else if (prologue) {
    volume = 0;
    rest = title.slice(prologue.index || 0);
  } else {
    volume = LOOSE_VOLUME;
  }

  let rank: number;
  if (/\b(?:Extra|Side\s+Story|Idle\s+Talk|Exclusive)\b/i.test(rest)) {
    rank = 3;
  } else if (/\bChapter\s+\d+/i.test(rest)) {
    rank = 1;
  } else if (/\b(?:Prologue|Introduction)\b/i.test(rest)) {
    rank = 0;
  } else if (/\bInterlude\b/i.test(rest)) {
    rank = 2;
  } else if (/\bEpilogue\b/i.test(rest)) {
    rank = 4;
  } else if (/\bAfterword\b/i.test(rest)) {
    rank = 5;
  } else {
    rank = 6;
  }

  return { volume, rank, numbers: numbersIn(rest) };
};

/**
 * Stabbing with a Syringe (stabbingwithasyringe.home.blog) is a WordPress.com
 * translation blog. Its pages are theme blocks, so this plugin reads the public
 * WordPress.com REST API the site advertises in its `Link` header
 * (`public-api.wordpress.com/wp/v2/sites/<site>`):
 *
 * - Novels are the child pages of "Stabbingwithasyringe Translated Works".
 * - Chapters are the child pages of a novel page.
 * - A novel page holds the author line, synopsis and a contents table; the
 *   contents table is incomplete for ongoing novels, so the chapter list comes
 *   from the child pages instead.
 */
class StabbingWithASyringePlugin implements Plugin.PluginBase {
  id = 'stabbingwithasyringe';
  name = 'Stabbing with a Syringe';
  icon = 'src/en/stabbingwithasyringe/icon.png';
  site = 'https://stabbingwithasyringe.home.blog';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/stabbingwithasyringe.home.blog';

  private novelsPageIdCache: number | undefined;

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    return this.listNovels(pageNo, '', !!showLatestNovels);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.listNovels(pageNo, searchTerm, false);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = this.lastSegment(novelPath);
    const found = await this.fetchList<WpPage>(
      `/pages?slug=${slug}&parent=${await this.novelsPageId()}` +
        '&_fields=id,slug,link,title,content',
    );
    const page = found[0];
    if (!page) {
      throw new Error(
        `Stabbing with a Syringe: novel not found at ${novelPath}`,
      );
    }

    const novel: Plugin.SourceNovel = {
      path: this.toPath(page.link),
      name: this.decode(page.title.rendered),
      cover: defaultCover,
      chapters: await this.fetchChapters(page.id),
    };

    // The page starts with a heading, an author line and the synopsis, and
    // continues with the contents table, which is not part of the synopsis.
    const $ = loadCheerio(
      `<div id="novel">${page.content?.rendered || ''}</div>`,
    );
    const cover = $('img').first().attr('src');
    if (cover) {
      novel.cover = cover;
    }

    const paragraphs: string[] = [];
    const blocks = $('#novel').children().toArray();
    for (const block of blocks) {
      const element = $(block);
      const text = this.normalizeText(element.text());
      if (/table of contents/i.test(text) && /^h\d$/i.test(block.tagName)) {
        break;
      }
      if (block.tagName.toLowerCase() !== 'p' || !text) {
        continue;
      }
      if (element.find('a[href*="stabbingwithasyringe"]').length > 0) {
        break;
      }
      const author = text.match(/^Author\s*[:：]\s*(.+)$/i);
      if (author) {
        novel.author = author[1].trim();
      } else if (
        !/^original\s+web\s?novel\s+link/i.test(text) &&
        !/^[\s\-–—_~]+$/.test(text)
      ) {
        paragraphs.push(text);
      }
    }
    if (paragraphs.length > 0) {
      novel.summary = paragraphs.join('\n\n');
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const wanted = this.toPath(chapterPath);
    const found = await this.fetchList<WpPage>(
      `/pages?slug=${this.lastSegment(chapterPath)}&_fields=id,slug,link,title,content`,
    );
    const page =
      found.filter(item => this.toPath(item.link) === wanted)[0] || found[0];
    const html = page?.content?.rendered || '';
    if (!page || !html.trim()) {
      throw new Error(
        `Stabbing with a Syringe: no chapter text at ${chapterPath}`,
      );
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root
      .find(
        'script, style, .sharedaddy, .jp-relatedposts, .wp-block-buttons, .wp-block-spacer',
      )
      .remove();
    root.find('p').each((_, el) => {
      const paragraph = $(el);
      const text = this.normalizeText(paragraph.text());
      if (
        (!text && paragraph.find('img').length === 0) ||
        NAV_LINE.test(text)
      ) {
        paragraph.remove();
      }
    });
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /** Novels, in the site's own order or most recently edited first. */
  private async listNovels(
    pageNo: number,
    searchTerm: string,
    latest: boolean,
  ): Promise<Plugin.NovelItem[]> {
    // Fifteen novels fit in one REST page.
    if (pageNo > 1) {
      return [];
    }
    const order = latest
      ? 'orderby=modified&order=desc'
      : 'orderby=menu_order&order=asc';
    const [pages, covers] = await Promise.all([
      this.fetchList<WpPage>(
        `/pages?parent=${await this.novelsPageId()}&per_page=${PER_PAGE}` +
          `&${order}&_fields=id,slug,link,title`,
      ),
      this.indexCovers(),
    ]);
    const needle = this.searchKey(searchTerm);
    return pages
      .map(page => ({
        name: this.decode(page.title.rendered),
        path: this.toPath(page.link),
        cover: covers[page.slug] || defaultCover,
      }))
      .filter(novel => this.searchKey(novel.name).indexOf(needle) !== -1);
  }

  /**
   * Cover images shown on the site's novel index page, keyed by novel slug.
   * Novels added after the index was last updated have none listed.
   */
  private async indexCovers(): Promise<Record<string, string>> {
    const covers: Record<string, string> = {};
    const found = await this.fetchList<WpPage>(
      `/pages?slug=${NOVELS_SLUG}&_fields=id,content`,
    );
    const $ = loadCheerio(
      `<div id="index">${found[0]?.content?.rendered || ''}</div>`,
    );
    $('figure').each((_, el) => {
      const figure = $(el);
      const href = figure.find('a').first().attr('href');
      const src = figure.find('img').first().attr('src');
      if (href && src) {
        covers[this.lastSegment(href)] = src;
      }
    });
    return covers;
  }

  private async fetchChapters(novelId: number): Promise<Plugin.ChapterItem[]> {
    const pages: WpPage[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.fetchList<WpPage>(
        `/pages?parent=${novelId}&per_page=${PER_PAGE}&page=${page}` +
          '&_fields=id,slug,link,title,date',
      );
      pages.push(...batch);
      if (batch.length < PER_PAGE) {
        break;
      }
    }

    const entries = pages.map(page => {
      const title = this.decode(page.title.rendered);
      const start = title.search(LABEL_START);
      return {
        page,
        title,
        name: start > 0 ? title.slice(start) : title,
        key: chapterSortKey(title),
        fullText: FULL_TEXT.test(title),
      };
    });

    // Keep a "(Full Text)" page only for a volume that has nothing else.
    const volumesWithChapters: Record<number, boolean> = {};
    for (const entry of entries) {
      if (!entry.fullText) {
        volumesWithChapters[entry.key.volume] = true;
      }
    }

    return entries
      .filter(
        entry => !entry.fullText || !volumesWithChapters[entry.key.volume],
      )
      .sort(
        (a, b) =>
          a.key.volume - b.key.volume ||
          a.key.rank - b.key.rank ||
          compareNumbers(a.key.numbers, b.key.numbers) ||
          a.page.id - b.page.id,
      )
      .map((entry, index) => ({
        name: entry.name,
        path: this.toPath(entry.page.link),
        releaseTime: entry.page.date,
        chapterNumber: index + 1,
      }));
  }

  private async novelsPageId(): Promise<number> {
    if (this.novelsPageIdCache === undefined) {
      const found = await this.fetchList<WpPage>(
        `/pages?slug=${NOVELS_SLUG}&_fields=id,slug`,
      );
      if (!found[0]) {
        throw new Error('Stabbing with a Syringe: novel index page not found');
      }
      this.novelsPageIdCache = found[0].id;
    }
    return this.novelsPageIdCache;
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

  /** Lowercase with typographic quotes flattened so "Women's" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[‘’‘]/g, "'")
      .replace(/[“”]/g, '"');
  }

  /** Site-relative path with a trailing slash, e.g. `/parent/slug/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/stabbingwithasyringe(?:\.home\.blog|home\.wordpress\.com)(\/.*)?$/i,
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

export default new StabbingWithASyringePlugin();
