import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { CheerioAPI, load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

/**
 * Notes on the site (onlinereadfreenovel.com):
 * - Listing: `/allbooks/` and `/gr/<genre>/` list books as `article.box`
 *   items (`h2.title a` + preview image); further pages are `/p/<n>/`.
 * - Search: `/search_by_author_title_series/q/<term>` lists `ul.books li a`.
 *   Its links are cut to a fixed length, sometimes inside the slug, so
 *   `bookPath` rebuilds them.
 * - Book: `/<author>/<id>-<slug>_read.html` is page 1 of the text. The text
 *   is split across numbered pages, `/<author>/p,<n>,<id>-<slug>_read.html`.
 *   Each page is a plugin "chapter". The site has no chapter list, so the
 *   pages are walked until the last one (a page with text but no next link).
 * - Some pages are served as an empty 200 response, in runs of up to six seen
 *   so far, with text continuing after them. Those pages are skipped rather
 *   than listed as empty chapters, and do not end the walk.
 */

// Cloudflare on this site challenges requests from datacenter networks (seen
// from GitHub's runners) that send a browser User-Agent or a generic one such
// as node or curl, but lets a client that names itself through.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; LNReader)' };

// Upper bound on text pages walked per book, so a single book cannot issue an
// unbounded number of requests. Books longer than this are truncated, and
// parsePages logs a warning when it hits the cap.
const MAX_PAGES = 400;

// Pages fetched at once while walking a book. Fetching them one at a time
// took about 90 seconds for a 240-page book.
const PAGE_BATCH = 6;

// Retries of a chapter-list page after a rate limit, server error or network
// error, waiting 1s, 2s, 4s between them.
const PAGE_RETRIES = 3;

// Empty pages in a row after a page that links to a next one before the walk
// gives up. It only ends the walk when the book's real last page is empty.
const MAX_EMPTY_RUN = 12;

// A paragraph that opens a chapter, e.g. "Chapter 1 The Boy Who Lived",
// "Chapter One", "Prologue". Sentences (with end punctuation) are excluded.
const HEADING = /^(?:chapter\s+[\w-]+|prologue|epilogue)\b[^.!?]{0,60}$/i;

// Text pages hold at most a few chapter openings (two seen so far); a page
// with more is a table of contents (18 and 21 seen) and is not named after
// its first entry.
const MAX_HEADINGS = 4;

class OnlineReadFreeNovelPlugin implements Plugin.PluginBase {
  id = 'onlinereadfreenovel';
  name = 'Online Read Free Novel';
  icon = 'src/en/onlinereadfreenovel/icon.png';
  site = 'https://onlinereadfreenovel.com';
  version = '1.0.0';

  filters = {
    genre: {
      label: 'Genre',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Action & Adventure', value: 'actions_adventure' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'History & Fiction', value: 'historical_fiction' },
        { label: 'Horror', value: 'horror' },
        { label: 'Humor', value: 'humor' },
        { label: 'Mystery & Detective', value: 'mystery_detective' },
        { label: 'Romance & Love', value: 'romance_love' },
        { label: 'Science Fiction', value: 'science_fiction' },
        { label: 'Thrillers & Crime', value: 'thrillers_crime' },
        { label: 'Western', value: 'western' },
        { label: 'Young Adult', value: 'young_adult' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const genre = filters?.genre?.value || 'all';
    const base = genre === 'all' ? '/allbooks/' : '/gr/' + genre + '/';
    const path = pageNo > 1 ? base + 'p/' + pageNo + '/' : base;
    const $ = await this.fetchDom(path);
    return this.parseBookList($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.fetchDom(novelPath);

    // A book page that failed on the site comes back as an empty 200
    // response; throw rather than overwrite the library entry with a blank
    // title and no chapters.
    const name = $('h1').first().text().trim();
    if (!name) throw new Error(`No book found at ${novelPath}`);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name,
      author: $('.box_in > b > a').first().text().trim(),
    };

    const cover = $('#textToRead img').first().attr('src');
    novel.cover = cover ? this.toAbsolute(cover) : defaultCover;

    novel.chapters = await this.parsePages(novelPath, $);
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const paragraphs = this.paragraphs(await this.fetchDom(chapterPath));
    if (paragraphs.length === 0) {
      throw new Error(`The site returned no text for ${chapterPath}`);
    }
    return paragraphs.map(part => '<p>' + part + '</p>').join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const base =
      '/search_by_author_title_series/q/' + encodeURIComponent(searchTerm);
    const path = pageNo > 1 ? base + '/p/' + pageNo : base;
    const $ = await this.fetchDom(path);

    return $('ul.books li a')
      .toArray()
      .flatMap(el => {
        const item = $(el);
        const href = item.attr('href');
        if (!href) return [];
        const style = item.find('.i1').attr('style') || '';
        const cover = style.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        const path = this.bookPath(href, cover);
        if (!path) return [];
        return [
          {
            name: item.find('.h2').attr('title') || item.text().trim(),
            path,
            cover: cover ? this.toAbsolute(cover) : defaultCover,
          },
        ];
      });
  }

  resolveUrl = (path: string) => this.site + path;

  parseBookList($: CheerioAPI): Plugin.NovelItem[] {
    return $('article.box')
      .toArray()
      .flatMap(el => {
        const link = $(el).find('h2.title a').first();
        const href = link.attr('href');
        if (!href) return [];
        const src = $(el).find('div.text img').first().attr('src');
        return [
          {
            name: link.text().trim(),
            path: this.toPath(href),
            cover: src ? this.toAbsolute(src) : defaultCover,
          },
        ];
      });
  }

  /**
   * Returns the book's `_read.html` path for a search link. Search links
   * point at `/<author>/<id>-<slug>.html` but are cut to a fixed length, e.g.
   * `.../1301-harry_potter_and_the_philosophers_stone.ht` or
   * `.../458266-the_sociology_of_harry_potter_22_enchanting_`. Book pages need
   * the exact slug, so when the cut falls inside it, the slug is taken from
   * the cover file name (`[<id>_]<slug>_preview.jpg`). Returns undefined when
   * the slug cannot be recovered.
   */
  bookPath(href: string, cover?: string): string | undefined {
    const path = this.toPath(href);
    if (/\/\d+-[^/]+_read\.html$/.test(path)) return path;
    const match = path.match(/^(\/[^/]+\/\d+-)([^/]*)$/);
    if (!match) return undefined;
    const [, prefix, tail] = match;

    const dot = tail.indexOf('.');
    if (dot > 0) return prefix + tail.slice(0, dot) + '_read.html';

    const file = cover?.match(/\/([^/]+)_preview\.\w+$/)?.[1];
    if (!file) return undefined;
    const slug = [file, file.replace(/^\d+_/, '')].find(name =>
      name.startsWith(tail),
    );
    return slug ? prefix + slug + '_read.html' : undefined;
  }

  /**
   * Walks the text pages of a book. Page 1 is the novel path itself; page `n`
   * is `p,<n>,` inserted before the id. Pages are fetched PAGE_BATCH at a time
   * and handled in order. The walk ends at the first page with text and no
   * next link, or after MAX_EMPTY_RUN empty pages in a row. A page answered
   * with no text or a 404 counts as empty and is skipped. Any other failure
   * throws after retries, so a rate limit never shortens the list silently.
   */
  async parsePages(
    novelPath: string,
    firstPage: CheerioAPI,
  ): Promise<Plugin.ChapterItem[]> {
    const chapters: Plugin.ChapterItem[] = [];
    // A path not in the `_read.html` form cannot be paged; list page 1 only.
    const lastPage = this.pagePath(novelPath, 2) === novelPath ? 1 : MAX_PAGES;
    let emptyRun = 0;
    let hasNext = false;

    for (let start = 1; start <= lastPage; start += PAGE_BATCH) {
      const pages: number[] = [];
      for (let page = start; page < start + PAGE_BATCH; page++) {
        if (page <= lastPage) pages.push(page);
      }
      const doms = await Promise.all(
        pages.map(page =>
          page === 1
            ? firstPage
            : this.fetchPageDom(this.pagePath(novelPath, page)).catch(
                (error: Error) => error,
              ),
        ),
      );

      for (let i = 0; i < pages.length; i++) {
        const $ = doms[i];
        if ($ instanceof Error) throw $;
        const paragraphs = $ ? this.paragraphs($) : [];
        if (!$ || paragraphs.length === 0) {
          hasNext = false;
          if (++emptyRun >= MAX_EMPTY_RUN) return chapters;
          continue;
        }
        emptyRun = 0;
        const headings = paragraphs
          .map(part => part.replace(/<[^>]*>/g, '').trim())
          .filter(text => HEADING.test(text));
        // Many headings on one page is a table of contents, not chapters.
        const heading =
          headings.length <= MAX_HEADINGS ? headings[0] : undefined;
        chapters.push({
          name: 'Page ' + pages[i] + (heading ? ': ' + heading : ''),
          path: this.pagePath(novelPath, pages[i]),
          chapterNumber: chapters.length + 1,
        });
        hasNext = $('.page_next a').length > 0;
        if (!hasNext) return chapters;
      }
    }

    if (lastPage === MAX_PAGES && hasNext) {
      console.warn(
        `onlinereadfreenovel: stopped at MAX_PAGES (${MAX_PAGES}) for ${novelPath}; remaining pages were not listed`,
      );
    }
    return chapters;
  }

  /**
   * The text of a page as paragraph HTML. The text is one block of
   * `<br>`-separated lines; a run of two or more line breaks marks a
   * paragraph boundary. Images, scripts, comments, empty paragraphs and a
   * stray `-->` paragraph left by the site's markup are dropped.
   */
  paragraphs($: CheerioAPI): string[] {
    const text = $('#textToRead');
    text.find('img, a.highslide, script, style').remove();
    const html = (text.html() || '').replace(/<\/?p[^>]*>/gi, '');
    return html
      .split(/(?:<br\s*\/*>\s*){2,}/i)
      .map(part =>
        part
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/^(?:<br\s*\/*>|&nbsp;|\u00a0|\s)+/i, '')
          .replace(/(?:<br\s*\/*>|&nbsp;|\u00a0|\s)+$/i, ''),
      )
      .filter(part => part.length > 0 && part !== '--&gt;');
  }

  pagePath(novelPath: string, page: number): string {
    if (page <= 1) return novelPath;
    return novelPath.replace(/\/(\d+-[^/]+_read\.html)$/, '/p,' + page + ',$1');
  }

  async fetchDom(path: string): Promise<CheerioAPI> {
    const res = await fetchApi(this.site + path, { headers: HEADERS });
    if (!res.ok) {
      throw Object.assign(new Error(`HTTP error for ${path}`), {
        status: res.status,
      });
    }
    return loadCheerio(await res.text());
  }

  async fetchPageDom(path: string): Promise<CheerioAPI | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchApi(this.site + path, { headers: HEADERS });
        if (res.status === 404) return null;
        if (!res.ok) {
          throw Object.assign(new Error(`HTTP error for ${path}`), {
            status: res.status,
          });
        }
        return loadCheerio(await res.text());
      } catch (error) {
        if (attempt >= PAGE_RETRIES) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
  }

  toPath(href: string): string {
    return new URL(href, this.site).pathname;
  }

  toAbsolute(src: string): string {
    return new URL(src, this.site).href;
  }
}

export default new OnlineReadFreeNovelPlugin();
