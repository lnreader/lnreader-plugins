import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

// BoonNovel — https://reader.boondollars.com
// A self-hosted English library of AI-translated novels (occasionally
// human-edited), served over a clean public JSON API with no login:
//   GET /api/public/books                     full catalog (105 books)
//   GET /api/public/books/<id>                book detail
//   GET /api/public/books/<id>/chapters       chapter list
//   GET /api/public/books/<id>/chapters/<n>   chapter paragraphs
// The catalog call returns everything and ignores paging parameters,
// so popular/latest/search all work off that one list. Chapter bodies
// arrive as plain-text paragraphs, wrapped into <p> HTML (escaped —
// the paragraphs are raw text, not HTML).

const SITE = 'https://reader.boondollars.com';

/**
 * Upper bound on a response this plugin will parse. The biggest
 * payload is a ~1,900-chapter list (a few hundred KB); anything far
 * above legitimate responses is a broken or hostile payload, and
 * parsing it would bill the reader's phone.
 */
const MAX_RESPONSE_CHARS = 8000000;

/**
 * Error with the HTTP status attached. Tooling (e.g. the repo's live
 * check) reads `error.status` to tell a site block or outage (403/503)
 * apart from a plugin bug, so always throw fetch failures this way.
 */
function httpError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

async function fetchJson(url: string, what: string): Promise<unknown> {
  const res = await fetchApi(url);
  if (!res.ok) {
    throw httpError(`${what}: HTTP ${res.status}`, res.status);
  }
  const text = await res.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new Error(`${what}: response too large (${text.length} chars)`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${what}: response was not valid JSON`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error(`${what}: response had an unexpected shape`);
  }
  return data;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) {
    throw new Error('Boonnovels response is missing a valid ' + what);
  }
  return v;
}

function asString(v: unknown, what: string): string {
  if (typeof v !== 'string') {
    throw new Error('Boonnovels response is missing a valid ' + what);
  }
  return v;
}

function asStringArray(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) {
    throw new Error('Boonnovels response is missing a valid ' + what);
  }
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
}

type BookSummary = {
  id: number;
  title: string;
  author: string;
  cover?: string;
  status: string;
  tags: string[];
  recentViews: number;
  lastChapterDate: string;
};

type BookDetail = {
  id: number;
  title: string;
  author: string;
  description: string;
  cover?: string;
  status: string;
  tags: string[];
};

type ChapterRef = {
  number: number;
  title: string;
};

// Prefer the medium cover (the grid shows covers at about that size),
// then the full cover, then the thumbnail. All three are null for a
// few books, in which case there is no cover to return.
function pickCover(rec: Record<string, unknown>): string | undefined {
  const medium = rec['cover_medium_url'];
  if (typeof medium === 'string' && medium) return medium;
  const full = rec['cover_url'];
  if (typeof full === 'string' && full) return full;
  const thumb = rec['cover_thumb_url'];
  if (typeof thumb === 'string' && thumb) return thumb;
  return undefined;
}

function parseBookSummary(rec: unknown): BookSummary {
  if (!isRecord(rec)) {
    throw new Error('Boonnovels book entry is not an object');
  }
  return {
    id: asNumber(rec['id'], 'book id'),
    title: asString(rec['title'], 'book title'),
    author: typeof rec['author'] === 'string' ? rec['author'] : '',
    cover: pickCover(rec),
    status: asString(rec['status'], 'book status'),
    tags: asStringArray(rec['tags'], 'book tags'),
    recentViews:
      typeof rec['recent_views'] === 'number' ? rec['recent_views'] : 0,
    lastChapterDate:
      typeof rec['last_chapter_date'] === 'string'
        ? rec['last_chapter_date']
        : '',
  };
}

function parseBooksList(data: unknown): BookSummary[] {
  const res = data as { books?: unknown };
  if (!Array.isArray(res.books)) {
    throw new Error('Boonnovels book list is missing its books array');
  }
  const books: BookSummary[] = [];
  for (const entry of res.books) {
    books.push(parseBookSummary(entry));
  }
  return books;
}

function parseBookDetail(data: unknown): BookDetail {
  if (!isRecord(data)) {
    throw new Error('Boonnovels book detail is not an object');
  }
  return {
    id: asNumber(data['id'], 'book id'),
    title: asString(data['title'], 'book title'),
    author: typeof data['author'] === 'string' ? data['author'] : '',
    description:
      typeof data['description'] === 'string' ? data['description'] : '',
    cover: pickCover(data),
    status: asString(data['status'], 'book status'),
    tags: asStringArray(data['tags'], 'book tags'),
  };
}

function parseChaptersList(data: unknown): ChapterRef[] {
  const res = data as { chapters?: unknown };
  if (!Array.isArray(res.chapters)) {
    throw new Error('Boonnovels chapter list is missing its chapters array');
  }
  const chapters: ChapterRef[] = [];
  for (const item of res.chapters) {
    if (!isRecord(item)) {
      throw new Error('Boonnovels chapter entry is not an object');
    }
    // The number is load-bearing (dedupe, ordering, chapter paths),
    // so a bad one throws. A missing title only falls back to the
    // plain "Chapter N" name.
    chapters.push({
      number: asNumber(item['chapter'], 'chapter number'),
      title: typeof item['title'] === 'string' ? item['title'] : '',
    });
  }
  return chapters;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Chapter bodies arrive as an array of paragraphs (empty strings mark
// paragraph breaks). Empty paragraphs are skipped; if nothing readable
// remains, the chapter is a stub, not an empty chapter.
function parseChapterBody(data: unknown): string {
  const res = data as { content?: unknown };
  if (!Array.isArray(res.content)) {
    throw new Error('Boonnovels chapter is missing its content array');
  }
  const parts: string[] = [];
  for (const para of res.content) {
    if (typeof para !== 'string') {
      throw new Error('Boonnovels chapter paragraph is not a string');
    }
    if (para.replace(/^\s+|\s+$/g, '') !== '') {
      parts.push('<p>' + escapeHtml(para) + '</p>');
    }
  }
  if (parts.length === 0) {
    throw new Error('Boonnovels chapter has no readable content');
  }
  return parts.join('\n');
}

// Site statuses: ongoing, ongoing-trial, completed, dropped, hiatus.
// Anything else maps to Unknown, never to a guessed status.
function mapStatus(siteStatus: string): string {
  if (siteStatus === 'ongoing' || siteStatus === 'ongoing-trial') {
    return NovelStatus.Ongoing;
  }
  if (siteStatus === 'completed') return NovelStatus.Completed;
  if (siteStatus === 'dropped') return NovelStatus.Cancelled;
  if (siteStatus === 'hiatus') return NovelStatus.OnHiatus;
  return NovelStatus.Unknown;
}

// The catalog endpoint returns the whole catalog in one call and
// ignores paging parameters, so popular/latest are sorts over that
// list and every page past 1 is empty.
function sortPopular(books: BookSummary[]): BookSummary[] {
  const sorted = books.slice();
  sorted.sort((a, b) => b.recentViews - a.recentViews);
  return sorted;
}

function sortLatest(books: BookSummary[]): BookSummary[] {
  const sorted = books.slice();
  sorted.sort((a, b) => {
    const da = Date.parse(a.lastChapterDate);
    const db = Date.parse(b.lastChapterDate);
    const ta = isNaN(da) ? 0 : da;
    const tb = isNaN(db) ? 0 : db;
    return tb - ta;
  });
  return sorted;
}

function searchBooks(books: BookSummary[], term: string): BookSummary[] {
  const needle = term.replace(/^\s+|\s+$/g, '').toLowerCase();
  if (needle === '') return [];
  const out: BookSummary[] = [];
  for (const b of books) {
    if (
      b.title.toLowerCase().indexOf(needle) !== -1 ||
      b.author.toLowerCase().indexOf(needle) !== -1
    ) {
      out.push(b);
    }
  }
  return out;
}

// Paths are virtual (the site's reader URLs are /read/<id>/<chapter>,
// but the plugin's own paths keep the book id and chapter number
// unambiguous): novel /book/<id>, chapter /book/<id>/chapter/<n>.
function buildNovelPath(bookId: number): string {
  return '/book/' + bookId;
}

function buildChapterPath(bookId: number, chapter: number): string {
  return '/book/' + bookId + '/chapter/' + chapter;
}

function stripQuery(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

function parseIdSegment(seg: string, what: string): number {
  if (!/^\d+$/.test(seg)) {
    throw new Error('Invalid Boonnovels ' + what + ' in path');
  }
  const n = parseInt(seg, 10);
  if (isNaN(n) || !isFinite(n)) {
    throw new Error('Invalid Boonnovels ' + what + ' in path');
  }
  return n;
}

function parseNovelPath(novelPath: string): number {
  const parts = stripQuery(novelPath).split('/');
  if (parts.length !== 3 || parts[1] !== 'book') {
    throw new Error('Invalid Boonnovels novel path: ' + novelPath);
  }
  return parseIdSegment(parts[2], 'book id');
}

function parseChapterPath(chapterPath: string): {
  bookId: number;
  chapter: number;
} {
  const parts = stripQuery(chapterPath).split('/');
  if (parts.length !== 5 || parts[1] !== 'book' || parts[3] !== 'chapter') {
    throw new Error('Invalid Boonnovels chapter path: ' + chapterPath);
  }
  return {
    bookId: parseIdSegment(parts[2], 'book id'),
    chapter: parseIdSegment(parts[4], 'chapter number'),
  };
}

function chapterName(ref: ChapterRef): string {
  if (ref.title !== '') return 'Chapter ' + ref.number + ': ' + ref.title;
  return 'Chapter ' + ref.number;
}

function buildChapters(
  refs: ChapterRef[],
  bookId: number,
): Plugin.ChapterItem[] {
  const sorted = refs.slice();
  sorted.sort((a, b) => a.number - b.number);
  const seen: Record<number, boolean> = {};
  const chapters: Plugin.ChapterItem[] = [];
  for (const ref of sorted) {
    if (seen[ref.number]) continue;
    seen[ref.number] = true;
    chapters.push({
      name: chapterName(ref),
      path: buildChapterPath(bookId, ref.number),
      chapterNumber: ref.number,
    });
  }
  return chapters;
}

function toNovelItem(b: BookSummary): Plugin.NovelItem {
  const item: Plugin.NovelItem = {
    name: b.title,
    path: buildNovelPath(b.id),
  };
  if (b.cover !== undefined) item.cover = b.cover;
  return item;
}

class BoonNovel implements Plugin.PluginBase {
  id = 'boonnovel';
  name = 'BoonNovel';
  icon = 'src/en/boonnovel/icon.png';
  site = 'https://reader.boondollars.com';
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const data = await fetchJson(
      `${SITE}/api/public/books`,
      'Failed to load popular novels',
    );
    const books = parseBooksList(data);
    const sorted =
      options && options.showLatestNovels
        ? sortLatest(books)
        : sortPopular(books);
    return sorted.map(b => toNovelItem(b));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = parseNovelPath(novelPath);
    const detail = parseBookDetail(
      await fetchJson(
        `${SITE}/api/public/books/${bookId}`,
        'Failed to load novel',
      ),
    );
    const refs = parseChaptersList(
      await fetchJson(
        `${SITE}/api/public/books/${bookId}/chapters`,
        'Failed to load chapter list',
      ),
    );
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.title,
      author: detail.author ? detail.author : undefined,
      summary: detail.description ? detail.description : undefined,
      status: mapStatus(detail.status),
      genres: detail.tags.length ? detail.tags.join(', ') : undefined,
      chapters: buildChapters(refs, bookId),
    };
    if (detail.cover !== undefined) novel.cover = detail.cover;
    return novel;
  }

  // The app opens a novel already saved in its database but with no
  // stored chapters through parsePage, not parseNovel — and it throws
  // when the plugin has none. This plugin has no server-side chapter
  // paging (the app pages the full list itself), so every page is the
  // whole list.
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    void page;
    const novel = await this.parseNovel(novelPath);
    return { chapters: novel.chapters || [] };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const parsed = parseChapterPath(chapterPath);
    const content = parseChapterBody(
      await fetchJson(
        `${SITE}/api/public/books/${parsed.bookId}/chapters/${parsed.chapter}`,
        'Failed to load chapter',
      ),
    );
    if (!content) {
      throw new Error('Chapter content not found');
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const data = await fetchJson(
      `${SITE}/api/public/books`,
      'Failed to search novels',
    );
    const books = parseBooksList(data);
    return searchBooks(books, searchTerm).map(b => toNovelItem(b));
  }

  // resolveUrl MUST pass absolute URLs through unchanged: the app
  // also passes the novel's cover URL through here (EPUB export does
  // this), and prefixing the site onto an absolute cover breaks it.
  // Virtual plugin paths map onto the site's real routes: a novel
  // opens at /library/book/<id>, a chapter reads at /read/<id>/<n>.
  resolveUrl = (path: string) => {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    try {
      const parsed = parseChapterPath(path);
      return `${SITE}/read/${parsed.bookId}/${parsed.chapter}`;
    } catch {
      // not a chapter path, try the novel path below
    }
    try {
      const bookId = parseNovelPath(path);
      return `${SITE}/library/book/${bookId}`;
    } catch {
      // not a plugin path either, fall through to the plain prefix
    }
    return this.site + path;
  };
}

export default new BoonNovel();
