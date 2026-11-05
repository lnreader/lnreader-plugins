import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

// Novelito -- https://noveli.to
// A public library front-end with a plain JSON API behind the SPA. No
// account, cookie or JS challenge is needed for the catalogue, the
// search, the novel detail, the chapter list or the chapter text:
//   GET /api/novels                      catalogue (paged + filtered)
//   GET /api/novels/<id>                 novel detail
//   GET /api/novels/<id>/chapters        full chapter list
//   GET /api/novels/<id>/chapters/<cid>  chapter paragraphs
// The chapter endpoint refuses requests without browser-like headers
// (403 "direct chapter extraction is not permitted"), so every request
// sends a browser User-Agent and a site Referer, as the site's own
// reader does.

const SITE = 'https://noveli.to';
const API = SITE + '/api';

/** Same page size the site itself uses for its browse grid. */
const PAGE_SIZE = 36;

/**
 * Upper bound on a response this plugin will parse. The largest
 * payload is a full chapter list (~800 KB for a 3,200-chapter novel);
 * anything far above legitimate responses is broken or hostile, and
 * parsing it would bill the reader's phone.
 */
const MAX_RESPONSE_CHARS = 8000000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': SITE + '/',
};

/**
 * Error with the HTTP status attached. Tooling (e.g. the repo's live
 * check) reads `error.status` to tell a site block or outage (403/429/503)
 * apart from a plugin bug, so always throw fetch failures this way.
 */
function httpError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string, what: string): Promise<unknown> {
  let res = await fetchApi(url, { headers: BROWSER_HEADERS });
  for (
    let attempt = 0;
    res.status === 429 && attempt < MAX_RETRIES;
    attempt++
  ) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '', 10);
    const waitMs = Math.min(
      isNaN(retryAfter) ? 1000 : retryAfter * 1000,
      MAX_RETRY_WAIT_MS,
    );
    await sleep(waitMs);
    res = await fetchApi(url, { headers: BROWSER_HEADERS });
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new Error('Novelito response is missing a valid ' + what);
  }
  return value;
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    throw new Error('Novelito response is missing a valid ' + what);
  }
  return value;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201A',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bdquo: '\u201E',
  hellip: '\u2026',
  ndash: '\u2013',
  mdash: '\u2014',
  middot: '\u00B7',
  bull: '\u2022',
  laquo: '\u00AB',
  raquo: '\u00BB',
  copy: '\u00A9',
  deg: '\u00B0',
  times: '\u00D7',
};

function fromCodePoint(code: number): string {
  if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
  if (code <= 0xffff) return String.fromCharCode(code);
  const offset = code - 0x10000;
  return String.fromCharCode(
    0xd800 + (offset >> 10),
    0xdc00 + (offset & 0x3ff),
  );
}

// Single pass, so an escaped entity such as "&amp;lt;" decodes only once.
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match: string, dec?: string, hex?: string, name?: string) => {
      if (dec) return fromCodePoint(parseInt(dec, 10)) || match;
      if (hex) return fromCodePoint(parseInt(hex, 16)) || match;
      const named = NAMED_ENTITIES[(name || '').toLowerCase()];
      return named === undefined ? match : named;
    },
  );
}

/** Novel descriptions are sometimes plain text, sometimes HTML. */
function plainText(raw: string): string {
  const withoutTags = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(withoutTags)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Covers come back either as an absolute URL or as a path below the
// site root, and are occasionally empty.
function coverUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.indexOf('//') === 0) return 'https:' + value;
  return SITE + (value.charAt(0) === '/' ? value : '/' + value);
}

function novelPath(novelId: number): string {
  return '/novel/' + novelId;
}

function chapterPath(novelId: number, chapterId: number): string {
  return '/novel/' + novelId + '/chapter/' + chapterId;
}

function stripQuery(path: string): string {
  const query = path.indexOf('?');
  return query === -1 ? path : path.slice(0, query);
}

function parseIdSegment(segment: string, what: string): number {
  if (!/^\d+$/.test(segment)) {
    throw new Error('Invalid Novelito ' + what + ' in path');
  }
  const value = parseInt(segment, 10);
  if (isNaN(value) || !isFinite(value)) {
    throw new Error('Invalid Novelito ' + what + ' in path');
  }
  return value;
}

function parseNovelPath(path: string): number {
  const parts = stripQuery(path).split('/');
  if (parts.length !== 3 || parts[0] !== '' || parts[1] !== 'novel') {
    throw new Error('Invalid Novelito novel path: ' + path);
  }
  return parseIdSegment(parts[2], 'novel id');
}

function parseChapterPath(path: string): {
  novelId: number;
  chapterId: number;
} {
  const parts = stripQuery(path).split('/');
  if (
    parts.length !== 5 ||
    parts[0] !== '' ||
    parts[1] !== 'novel' ||
    parts[3] !== 'chapter'
  ) {
    throw new Error('Invalid Novelito chapter path: ' + path);
  }
  return {
    novelId: parseIdSegment(parts[2], 'novel id'),
    chapterId: parseIdSegment(parts[4], 'chapter id'),
  };
}

// The list endpoint reports lowercase statuses ("ongoing",
// "completed"), the detail endpoint title-cases them. Anything else
// maps to Unknown, never to a guessed status.
function mapStatus(siteStatus: string): string {
  const value = siteStatus.toLowerCase();
  if (value === 'ongoing' || value === 'releasing') return NovelStatus.Ongoing;
  if (value === 'completed') return NovelStatus.Completed;
  if (value === 'hiatus' || value === 'on hiatus' || value === 'paused') {
    return NovelStatus.OnHiatus;
  }
  if (value === 'dropped' || value === 'cancelled' || value === 'canceled') {
    return NovelStatus.Cancelled;
  }
  return NovelStatus.Unknown;
}

function toNovelItem(record: unknown): Plugin.NovelItem {
  if (!isRecord(record)) {
    throw new Error('Novelito novel entry is not an object');
  }
  const id = asNumber(record['id'], 'novel id');
  return {
    name: asString(record['title'], 'novel title'),
    path: novelPath(id),
    cover: coverUrl(record['cover_image']) || defaultCover,
  };
}

async function fetchNovelList(
  params: Record<string, string>,
): Promise<unknown[]> {
  const query = Object.keys(params)
    .map(key => key + '=' + encodeURIComponent(params[key]))
    .join('&');
  const data = await fetchJson(
    `${API}/novels?${query}`,
    'Failed to load novels',
  );
  const res = data as { success?: unknown; data?: unknown };
  if (res.success !== true || !Array.isArray(res.data)) {
    throw new Error('Novelito novel list is missing its data array');
  }
  return res.data;
}

function parseChapters(data: unknown, novelId: number): Plugin.ChapterItem[] {
  const res = data as { chapters?: unknown };
  if (!Array.isArray(res.chapters)) {
    throw new Error('Novelito chapter list is missing its chapters array');
  }
  const chapters: Plugin.ChapterItem[] = [];
  const seen: Record<string, boolean> = {};
  for (const entry of res.chapters) {
    if (!isRecord(entry)) {
      throw new Error('Novelito chapter entry is not an object');
    }
    const id = asNumber(entry['id'], 'chapter id');
    if (seen[String(id)]) continue;
    seen[String(id)] = true;
    const number = entry['chapter_number'];
    const chapterNumber =
      typeof number === 'number' && isFinite(number) ? number : undefined;
    const rawTitle = typeof entry['title'] === 'string' ? entry['title'] : '';
    const title = rawTitle.replace(/^\s+|\s+$/g, '');
    const chapter: Plugin.ChapterItem = {
      name:
        title !== ''
          ? title
          : chapterNumber !== undefined
            ? 'Chapter ' + chapterNumber
            : 'Chapter',
      path: chapterPath(novelId, id),
    };
    if (chapterNumber !== undefined) chapter.chapterNumber = chapterNumber;
    const createdAt = entry['created_at'];
    if (typeof createdAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(createdAt)) {
      chapter.releaseTime = createdAt.slice(0, 10);
    }
    chapters.push(chapter);
  }
  // The API returns chapters in reading order already; sorting here
  // keeps the list correct even if a volume-based response interleaves
  // them.
  const order: Record<string, number> = {};
  for (let i = 0; i < chapters.length; i++) {
    const n = chapters[i].chapterNumber;
    order[chapters[i].path] = n === undefined ? i : n;
  }
  chapters.sort((a, b) => order[a.path] - order[b.path]);
  return chapters;
}

const READER_CHROME = [
  'Settings',
  'Font Size',
  'A',
  'A',
  '16px',
  'Font Family',
  'Background Color',
];

const SITE_NOTICE_TEXTS = [
  'Provided by Noveli.to',
  'If you want to support more free releases please read on Noveli.to',
];

function parseChapterBody(data: unknown): string {
  const res = data as { chapter?: unknown };
  if (!isRecord(res.chapter)) {
    throw new Error('Novelito chapter response is missing its chapter');
  }
  const paragraphs = res.chapter['paragraphs'];
  if (!Array.isArray(paragraphs)) {
    throw new Error('Novelito chapter is missing its paragraphs array');
  }
  const texts: string[] = [];
  for (const paragraph of paragraphs) {
    if (!isRecord(paragraph)) continue;
    const html = typeof paragraph['html'] === 'string' ? paragraph['html'] : '';
    // The site injects a "Provided by Noveli.to" notice at the start
    // and a support line at the end of every chapter; it also hides a
    // couple of site notices inside the payload. None of them are part
    // of the story.
    if (
      paragraph['isHoneypot'] === true ||
      paragraph['isMidWatermark'] === true ||
      html.indexOf('watermark-notice') !== -1 ||
      html.indexOf('noveli-canary') !== -1
    ) {
      continue;
    }
    const text =
      typeof paragraph['text'] === 'string'
        ? decodeEntities(paragraph['text'])
        : plainText(html);
    const trimmed = text.replace(/^\s+|\s+$/g, '');
    if (trimmed === '' || SITE_NOTICE_TEXTS.indexOf(trimmed) !== -1) {
      continue;
    }
    texts.push(trimmed);
  }
  let start = 0;
  if (texts.length >= READER_CHROME.length) {
    let matches = true;
    for (let i = 0; i < READER_CHROME.length; i++) {
      if (texts[i] !== READER_CHROME[i]) {
        matches = false;
        break;
      }
    }
    if (matches) start = READER_CHROME.length;
  }
  const parts: string[] = [];
  for (let i = start; i < texts.length; i++) {
    parts.push('<p>' + escapeHtml(texts[i]) + '</p>');
  }
  if (parts.length === 0) {
    throw new Error('Novelito chapter has no readable content');
  }
  return parts.join('\n');
}

class Novelito implements Plugin.PluginBase {
  id = 'novelito';
  name = 'Novelito';
  icon = 'src/en/novelito/icon.png';
  site = SITE;
  version = '1.0.0';

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Trending', value: 'trending' },
        { label: 'Top Rated', value: 'rating' },
        { label: 'Most Viewed', value: 'views' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: 'All',
      options: [
        { label: 'All', value: 'All' },
        { label: 'Ongoing', value: 'Ongoing' },
        { label: 'Completed', value: 'Completed' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'LitRPG', value: 'LitRPG' },
        { label: 'Progression', value: 'Progression' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Cultivation', value: 'Cultivation' },
        { label: 'Martial Arts', value: 'Martial Arts' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Time Loop', value: 'Time Loop' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Romance', value: 'Romance' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params: Record<string, string> = {
      page: String(pageNo),
      limit: String(PAGE_SIZE),
      sort: showLatestNovels ? 'newest' : filters.sort.value,
    };
    if (filters.status.value !== 'All') {
      params.status = filters.status.value;
    }
    const genres = filters.genres.value.filter(genre => genre !== '');
    if (genres.length > 0) {
      params.genres = genres.join(',');
    }
    const novels = await fetchNovelList(params);
    return novels.map(toNovelItem);
  }

  async parseNovel(novelPathParam: string): Promise<Plugin.SourceNovel> {
    const novelId = parseNovelPath(novelPathParam);
    const detail = await fetchJson(
      `${API}/novels/${novelId}`,
      'Failed to load novel',
    );
    const record = detail as { data?: unknown };
    if (!isRecord(record.data)) {
      throw new Error('Novelito novel detail is missing its data object');
    }
    const info = record.data;

    const chapterList = await fetchJson(
      `${API}/novels/${novelId}/chapters`,
      'Failed to load chapter list',
    );

    const novel: Plugin.SourceNovel = {
      path: novelPathParam,
      name: asString(info['title'], 'novel title'),
      chapters: parseChapters(chapterList, novelId),
    };
    if (typeof info['author'] === 'string' && info['author'] !== '') {
      novel.author = info['author'];
    }
    const cover = coverUrl(info['cover_image']);
    novel.cover = cover || defaultCover;
    if (typeof info['description'] === 'string') {
      const summary = plainText(info['description']);
      if (summary !== '') novel.summary = summary;
    }
    if (Array.isArray(info['genres'])) {
      const genres: string[] = [];
      for (const genre of info['genres']) {
        if (typeof genre === 'string' && genre !== '') genres.push(genre);
      }
      if (genres.length > 0) novel.genres = genres.join(', ');
    }
    if (typeof info['status'] === 'string') {
      novel.status = mapStatus(info['status']);
    }
    const rating = info['rating'];
    if (typeof rating === 'number' && isFinite(rating) && rating > 0) {
      novel.rating = rating;
    }
    return novel;
  }

  async parseChapter(path: string): Promise<string> {
    const parsed = parseChapterPath(path);
    const data = await fetchJson(
      `${API}/novels/${parsed.novelId}/chapters/${parsed.chapterId}`,
      'Failed to load chapter',
    );
    return parseChapterBody(data);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.replace(/^\s+|\s+$/g, '');
    if (term === '') return [];
    const novels = await fetchNovelList({
      search: term,
      page: String(pageNo),
      limit: String(PAGE_SIZE),
    });
    return novels.map(toNovelItem);
  }

  // resolveUrl MUST pass absolute URLs through unchanged: the app
  // passes novel cover URLs through here too (EPUB export), and
  // prefixing the site onto an absolute cover breaks it. Plugin paths
  // mirror the site's own routes, so they work unchanged.
  resolveUrl = (path: string) => {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return SITE + path;
  };
}

export default new Novelito();
