import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

type ChapterGroup = {
  label: string;
  chapters: {
    slug: string;
    chapter_no: string;
    subtitle?: string | null;
    locked?: boolean;
  }[];
};

/** `/api/reader/chapter/<slug>/` response. */
type ReaderChapter = {
  message?: string;
  read_limit?: boolean;
  read_limit_message?: string | null;
  content_html?: unknown;
};

/**
 * The site's Cloudflare firewall answers 403 ("Sorry, you have been blocked")
 * when a request carries fetchApi's default `Accept-Language: *` together with
 * its `Sec-Fetch-Mode: cors`, so every request sends a browser's language.
 */
const LANGUAGE = { 'Accept-Language': 'en-US,en;q=0.9' };

/** How long to reuse a reader session (the site's cookie lasts 15 min). */
const READER_SESSION_MS = 10 * 60 * 1000;

/**
 * KDT Novels replaced its LightNovelWP WordPress theme with its own Next.js
 * site, so it no longer fits the lightnovelwp multisrc template.
 *
 * - Listing/search: `/search/?page=<n>&genre=<slug>&q=<term>`, 24 cards
 *                   (`a.group`) per page, most recently updated first.
 * - Novel page:     `/series/<slug>/`. The HTML only lists the chapters of
 *                   the expanded volume; every volume's chapters are in the
 *                   embedded React Server Components payload.
 * - Chapter text:   the chapter page (`/<chapter-slug>/`) no longer holds
 *                   it. Its script opens a reader session
 *                   (`POST /api/reader/session/`) and then loads
 *                   `/api/reader/chapter/<chapter-slug>/`, JSON with
 *                   `content_html` (null for locked chapters) or
 *                   `read_limit`. The plugin makes the same two calls.
 *
 * parseChapter flow (every request sends `Accept-Language: en-US,en;q=0.9`,
 * because the default `*` plus `Sec-Fetch-Mode: cors` gets a Cloudflare 403):
 *
 *   parseChapter(path)
 *     |
 *     v
 *   session cached < 10 min? --yes--------------------+
 *     | no                                            |
 *     v                                               |
 *   POST /api/reader/session/  -> `kdt_reader` cookie |
 *     |                                               |
 *     +-----------------------------------------------+
 *     v
 *   GET /api/reader/chapter/<slug>/  (+ cookie)
 *     |-- HTTP error ---> drop session, throw
 *     |-- read_limit ---> throw the limit message
 *     |-- no content_html (locked) -> throw
 *     v
 *   content_html -> strip scripts/handlers -> chapter HTML
 */
class KDTNovels implements Plugin.PluginBase {
  id = 'kdtnovels';
  name = 'KDT Novels';
  version = '2.0.2';
  icon = 'src/en/kdtnovels/icon.png';
  site = 'https://kdtnovels.net/';

  /** The reader session cookie, and when to open a new session. */
  private readerSession?: { cookie: string; renewAt: number };

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url, { headers: LANGUAGE });
    // Throw (carrying the HTTP status) so a runner-side block is reported
    // INCONCLUSIVE per docs/testing.md instead of an empty-result FAIL.
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res.text();
  }

  private async fetchPage(url: string): Promise<CheerioAPI> {
    return parseHTML(await this.fetchHtml(url));
  }

  private absolute(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return url.startsWith('/') ? this.site + url.slice(1) : url;
  }

  private parseCards($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('a.group[href^="/series/"]').each((_, el) => {
      const card = $(el);
      const title = card.find('h3');
      novels.push({
        name: title.attr('title') || title.text().trim(),
        path: card.attr('href')!.slice(1),
        cover: this.absolute(card.find('img').attr('src')),
      });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + 'search/?page=' + pageNo;
    if (!showLatestNovels && filters.genre.value) {
      url += '&genre=' + filters.genre.value;
    }
    return this.parseCards(await this.fetchPage(url));
  }

  /**
   * Reads the volume groups from the Next.js flight payload, which the page
   * streams as `self.__next_f.push([1, "<chunk>"])` script calls.
   */
  private parseChapterGroups(html: string): ChapterGroup[] | undefined {
    const pushRegex = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    let flight = '';
    let match;
    while ((match = pushRegex.exec(html))) {
      flight += JSON.parse(match[1]);
    }
    for (const line of flight.split('\n')) {
      if (!line.includes('"groups":[')) continue;
      let row;
      try {
        row = JSON.parse(line.slice(line.indexOf(':') + 1));
      } catch {
        continue; // a text row, not a JSON one
      }
      const found = findGroups(row);
      if (found) return found;
    }
    return undefined;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(this.site + novelPath);
    const $ = parseHTML(html);
    const title = $('main h1').first();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title.text().trim() || 'Untitled',
      cover: this.absolute($('meta[property="og:image"]').attr('content')),
      genres: $('main a[href^="/search/?genre="]')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
    };

    const summary = $('main .reader-content').first();
    const paragraphs = summary
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    novel.summary = paragraphs.length
      ? paragraphs.join('\n\n')
      : summary.text().trim();

    // "<author> · Art: <artist>", right below the title; empty when the site
    // has no credits for the series.
    // The view counter that follows is a `.flex` paragraph.
    const credits = title
      .parent()
      .next('p:not(.flex)')
      .text()
      .split(' · Art: ');
    if (credits[0].trim()) novel.author = credits[0].trim();
    if (credits[1]?.trim()) novel.artist = credits[1].trim();

    // Only finished or paused series carry a badge next to the title; the
    // site's series index lists the rest as ongoing.
    const badge = title.siblings('span').first().text().trim().toLowerCase();
    switch (badge) {
      case '':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'completed':
        novel.status = NovelStatus.Completed;
        break;
      case 'hiatus':
        novel.status = NovelStatus.OnHiatus;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    const groups = this.parseChapterGroups(html);
    if (!groups) throw new Error('Could not find the chapter list.');
    const chapters: Plugin.ChapterItem[] = [];
    for (const group of groups) {
      for (const chapter of group.chapters) {
        let name = group.label + ' · Ch. ' + chapter.chapter_no;
        if (chapter.subtitle) name += ': ' + chapter.subtitle;
        chapters.push({
          name: chapter.locked ? '🔒 ' + name : name,
          path: chapter.slug + '/',
          chapterNumber: chapters.length + 1,
        });
      }
    }
    novel.chapters = chapters;

    return novel;
  }

  /** Headers the site's own script sends from the chapter page. */
  private readerHeaders(chapterUrl: string): Record<string, string> {
    return {
      ...LANGUAGE,
      'Referer': chapterUrl,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    };
  }

  /**
   * Opens a reader session, or reuses the current one, the way the chapter
   * page's script does before it loads a chapter.
   *
   * @returns the session cookie to send, or '' where the app's cookie jar
   * already sends it.
   */
  private async openReaderSession(chapterUrl: string): Promise<string> {
    const now = Date.now();
    if (this.readerSession && now < this.readerSession.renewAt) {
      return this.readerSession.cookie;
    }
    const res = await fetchApi(this.site + 'api/reader/session/', {
      method: 'POST',
      headers: {
        ...this.readerHeaders(chapterUrl),
        'Origin': this.site.slice(0, -1),
        'x-kdt-reader-bootstrap': '1',
      },
    });
    if (!res.ok) {
      const data: ReaderChapter = await res.json().catch(() => ({}));
      throw Object.assign(
        new Error(data.message || 'Request failed: ' + res.status),
        { status: res.status },
      );
    }
    // Android's cookie jar keeps the cookie on its own; the live check's
    // fetch has no jar, so the cookie is also sent by hand.
    const cookie =
      /kdt_reader=[^;]+/.exec(res.headers.get('set-cookie') || '')?.[0] || '';
    this.readerSession = { cookie, renewAt: now + READER_SESSION_MS };
    return cookie;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = chapterPath.replace(/^\/+|\/+$/g, '');
    const chapterUrl = this.site + slug + '/';
    const cookie = await this.openReaderSession(chapterUrl);
    const headers = {
      ...this.readerHeaders(chapterUrl),
      Accept: 'application/json',
    };
    const res = await fetchApi(
      this.site + 'api/reader/chapter/' + encodeURIComponent(slug) + '/',
      { headers: cookie ? { ...headers, Cookie: cookie } : headers },
    );
    const data: ReaderChapter = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.readerSession = undefined; // a fresh session for the next try
      throw Object.assign(
        new Error(
          data.message || 'The chapter could not be loaded. Please try again.',
        ),
        { status: res.status },
      );
    }
    if (data.read_limit) {
      throw new Error(
        data.read_limit_message ||
          'KDT Novels limits how many chapters you can read. Sign in on the site to read more.',
      );
    }
    if (typeof data.content_html !== 'string') {
      // The site sends no text for locked (🔒) chapters.
      throw new Error(
        'Chapter content is unavailable. If the chapter is locked, unlock it on KDT Novels to read it.',
      );
    }

    const $ = parseHTML(data.content_html, null, false);
    const content = $.root();
    content.find('script, style, noscript').remove();

    // The app renders this HTML as is, so drop event handlers and URLs that
    // would run script.
    content.find('*').each((_, el) => {
      const node = $(el);
      for (const name of Object.keys(el.attribs)) {
        if (/^on/i.test(name)) {
          node.removeAttr(name);
        } else if (name === 'href' || name === 'src') {
          const value = el.attribs[name]
            .split('')
            .filter(c => c.charCodeAt(0) > 32)
            .join('')
            .toLowerCase();
          if (
            /^(javascript|vbscript):/.test(value) ||
            (value.startsWith('data:') && !value.startsWith('data:image/'))
          ) {
            node.removeAttr(name);
          }
        }
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const $ = await this.fetchPage(
      this.site +
        'search/?q=' +
        encodeURIComponent(searchTerm.trim()) +
        '&page=' +
        pageNo,
    );
    return this.parseCards($);
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    genre: {
      label: 'Genre',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Battle Royale', value: 'battle-royale' },
        { label: 'Childhood Friends', value: 'childhood-friends' },
        { label: 'Cohabitation', value: 'cohabitation' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Genderswap', value: 'genderswap' },
        { label: 'Gore', value: 'gore' },
        { label: 'Harem', value: 'harem' },
        { label: 'Horror', value: 'horror' },
        { label: 'Idol', value: 'idol' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Isekai reincarnation', value: 'isekai-reincarnation' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Monster Girls', value: 'monster-girls' },
        { label: 'Monsters', value: 'monsters' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Parallel world', value: 'parallel-world' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Psychological drama', value: 'psychological-drama' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance school', value: 'romance-school' },
        { label: 'Romantic Comedy', value: 'romantic-comedy' },
        { label: 'School', value: 'school' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Sexual Violence', value: 'sexual-violence' },
        { label: 'Shonen', value: 'shonen' },
        { label: 'Shota', value: 'shota' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Survival', value: 'survival' },
        { label: 'Time Travel', value: 'time-travel' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Villainess Otome Game', value: 'villainess-otome-game' },
        { label: 'Yamikawa', value: 'yamikawa' },
        { label: 'Youth', value: 'youth' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

/** Finds the first `groups` array of chapter groups in a flight row. */
function findGroups(node: unknown): ChapterGroup[] | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  const groups = record.groups;
  if (
    Array.isArray(groups) &&
    groups.every(group => Array.isArray(group?.chapters))
  ) {
    return groups as ChapterGroup[];
  }
  for (const key in record) {
    const found = findGroups(record[key]);
    if (found) return found;
  }
  return undefined;
}

export default new KDTNovels();
