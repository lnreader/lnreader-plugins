import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

// Atsumaru — https://atsu.moe
// A manga/novel platform; this plugin covers its novel catalog
// (2,669 titles). The catalog/search runs on a public Typesense
// collection; series details, chapter lists and chapter text come
// from the site's JSON API:
//   GET /collections/manga/documents/search?...&filter_by=medium:=Novel
//   GET /api/manga/page?id=<id>              details + scanlation groups
//   GET /api/manga/allChapters?mangaId=<id>  chapters across all groups
//   GET /api/read/novelChapter?mangaId=<id>&chapterId=<id>  text
// A novel can be carried by several scanlation groups; parseNovel
// reads one group's set (the largest, so the book is most complete).

const SITE = 'https://atsu.moe';
const CDN = 'https://cdn.atsu.moe/static/';
const QUERY_BY = 'title,englishTitle,otherNames,authors,acronyms';
const FILTER = 'medium:=Novel && hidden:!=true';
const PER_PAGE = 24;

/**
 * Upper bound on a response this plugin will parse. The chapter-list
 * payload is the big one (a 6,400-chapter novel across two groups is
 * ~1.2 MB); anything far above legitimate responses is a broken or
 * hostile payload, and parsing it would bill the reader's phone.
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

function searchUrl(query: string, sortBy: string, pageNo: number): string {
  return (
    `${SITE}/collections/manga/documents/search` +
    `?q=${encodeURIComponent(query)}` +
    `&query_by=${encodeURIComponent(QUERY_BY)}` +
    `&page=${pageNo}&per_page=${PER_PAGE}` +
    `&filter_by=${encodeURIComponent(FILTER)}` +
    `&sort_by=${encodeURIComponent(sortBy)}`
  );
}

type SearchHit = {
  document?: {
    id?: string;
    title?: string;
    englishTitle?: string;
    poster?: string;
  };
};

type NovelCard = {
  name: string;
  /** The series id used by the /api endpoints (e.g. "8kL3"). */
  path: string;
  cover?: string;
};

/** One Typesense search response (catalog listing or search results). */
function parseNovelCards(data: unknown): NovelCard[] {
  const res = data as { hits?: SearchHit[] };
  if (!Array.isArray(res.hits)) {
    // An error payload or a changed shape must surface as a failure,
    // not as an empty catalog page.
    throw new Error('Novel list response had an unexpected shape');
  }
  const cards: NovelCard[] = [];
  for (const hit of res.hits) {
    const doc = (hit && hit.document) || {};
    if (typeof doc.id !== 'string' || !doc.id) continue;
    cards.push({
      name: String(doc.title || doc.englishTitle || doc.id),
      path: doc.id,
      cover:
        typeof doc.poster === 'string' && doc.poster
          ? 'https://cdn.atsu.moe' + doc.poster
          : undefined,
    });
  }
  return cards;
}

type NovelDetails = {
  name: string;
  cover?: string;
  summary?: string;
  genres: string[];
  /** Raw site status, e.g. "Ongoing" / "Completed". */
  statusRaw: string;
  /** Scanlation group ids, in the site's own preference order. */
  scanlatorIds: string[];
};

type PageResponse = {
  mangaPage?: {
    title?: string;
    englishTitle?: string;
    synopsis?: string;
    status?: string;
    genres?: { name?: string }[];
    scanlators?: { id?: string }[];
    poster?: { image?: string };
  };
};

/** GET /api/manga/page — series details. */
function parseNovelDetails(data: unknown): NovelDetails {
  const page = (data as PageResponse).mangaPage;
  if (!page || typeof page !== 'object') {
    throw new Error('Novel response had an unexpected shape');
  }
  const genres: string[] = [];
  if (Array.isArray(page.genres)) {
    for (const g of page.genres) {
      if (g && typeof g.name === 'string' && g.name) genres.push(g.name);
    }
  }
  const scanlatorIds: string[] = [];
  if (Array.isArray(page.scanlators)) {
    for (const s of page.scanlators) {
      if (s && typeof s.id === 'string' && s.id) scanlatorIds.push(s.id);
    }
  }
  const poster = page.poster || {};
  return {
    name: String(page.title || page.englishTitle || ''),
    cover:
      typeof poster.image === 'string' && poster.image
        ? CDN + poster.image
        : undefined,
    summary:
      typeof page.synopsis === 'string' && page.synopsis
        ? page.synopsis
        : undefined,
    genres,
    statusRaw: typeof page.status === 'string' ? page.status : '',
    scanlatorIds,
  };
}

type ChapterEntry = {
  id: string;
  scanId: string;
  number: number;
  title: string;
};

type ChaptersResponse = {
  chapters?: {
    id?: string;
    scanlationMangaId?: string;
    number?: number | string;
    title?: string;
  }[];
};

/** GET /api/manga/allChapters — raw entries across all groups. */
function parseAllChapters(data: unknown): ChapterEntry[] {
  const res = data as ChaptersResponse;
  if (!Array.isArray(res.chapters)) {
    throw new Error('Chapter list response had an unexpected shape');
  }
  const entries: ChapterEntry[] = [];
  for (const c of res.chapters) {
    if (!c || typeof c.id !== 'string' || !c.id) continue;
    const num =
      typeof c.number === 'number' ? c.number : parseFloat(String(c.number));
    if (!isFinite(num)) continue;
    entries.push({
      id: c.id,
      scanId:
        typeof c.scanlationMangaId === 'string' ? c.scanlationMangaId : '',
      number: num,
      title: String(c.title || 'Chapter ' + num),
    });
  }
  return entries;
}

/**
 * Reduce the all-groups chapter dump to ONE group's set: the group with
 * the most chapters (ties broken by the site's own group order), sorted
 * ascending by chapter number, duplicates by number dropped.
 */
function chooseChapterSet(
  entries: ChapterEntry[],
  preferredOrder: string[],
): ChapterEntry[] {
  const byGroup = new Map<string, ChapterEntry[]>();
  for (const e of entries) {
    const list = byGroup.get(e.scanId);
    if (list) list.push(e);
    else byGroup.set(e.scanId, [e]);
  }
  let best: ChapterEntry[] = [];
  let bestRank = Infinity;
  byGroup.forEach((list, scanId) => {
    const idx = preferredOrder.indexOf(scanId);
    const rank = idx < 0 ? preferredOrder.length : idx;
    if (
      list.length > best.length ||
      (list.length === best.length && rank < bestRank)
    ) {
      best = list;
      bestRank = rank;
    }
  });
  const sorted = best.slice().sort((a, b) => a.number - b.number);
  const seen = new Set<number>();
  const out: ChapterEntry[] = [];
  for (const e of sorted) {
    if (seen.has(e.number)) continue;
    seen.add(e.number);
    out.push(e);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Chapter body from GET /api/read/novelChapter: the text arrives as an
 * array of plain-text paragraphs, wrapped into <p> HTML (escaped — the
 * paragraphs are raw text, not HTML).
 */
function parseChapterBody(data: unknown): string {
  const res = data as { readNovelChapter?: { paragraphs?: string[] } };
  const rc = res.readNovelChapter;
  if (!rc || !Array.isArray(rc.paragraphs)) {
    throw new Error('Chapter response had an unexpected shape');
  }
  const parts: string[] = [];
  for (const p of rc.paragraphs) {
    if (typeof p !== 'string') continue;
    const trimmed = p.trim();
    if (trimmed) parts.push('<p>' + escapeHtml(trimmed) + '</p>');
  }
  return parts.join('\n');
}

class Atsumaru implements Plugin.PluginBase {
  id = 'atsumaru';
  name = 'Atsumaru';
  icon = 'src/en/atsumaru/icon.png';
  site = 'https://atsu.moe';
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const sortBy =
      options && options.showLatestNovels ? 'dateAdded:desc' : 'views:desc';
    const data = await fetchJson(
      searchUrl('*', sortBy, pageNo),
      'Failed to load popular novels',
    );
    return parseNovelCards(data);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = novelPath.replace(/^\/+|\/+$/g, '');
    const details = parseNovelDetails(
      await fetchJson(
        `${SITE}/api/manga/page?id=${encodeURIComponent(id)}`,
        'Failed to load novel',
      ),
    );
    if (!details.name) {
      throw new Error('Could not load the novel ' + novelPath);
    }
    const all = parseAllChapters(
      await fetchJson(
        `${SITE}/api/manga/allChapters?mangaId=${encodeURIComponent(id)}`,
        'Failed to load chapter list',
      ),
    );
    const set = chooseChapterSet(all, details.scanlatorIds);
    const chapters: Plugin.ChapterItem[] = set.map(e => ({
      name: e.title,
      path: `${id}/${e.id}`,
      chapterNumber: e.number,
    }));
    const raw = details.statusRaw.toLowerCase();
    const status =
      details.statusRaw === 'Completed'
        ? NovelStatus.Completed
        : details.statusRaw === 'Ongoing'
          ? NovelStatus.Ongoing
          : raw.indexOf('hiatus') >= 0
            ? NovelStatus.OnHiatus
            : raw.indexOf('cancel') >= 0
              ? NovelStatus.Cancelled
              : NovelStatus.Unknown;
    return {
      path: novelPath,
      name: details.name,
      cover: details.cover,
      summary: details.summary,
      genres: details.genres.length ? details.genres.join(', ') : undefined,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const parts = chapterPath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length !== 2) {
      throw new Error('Unexpected chapter path: ' + chapterPath);
    }
    const url =
      `${SITE}/api/read/novelChapter?mangaId=${encodeURIComponent(parts[0])}` +
      `&chapterId=${encodeURIComponent(parts[1])}`;
    const content = parseChapterBody(
      await fetchJson(url, 'Failed to load chapter'),
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
    const data = await fetchJson(
      searchUrl(searchTerm, 'views:desc', pageNo),
      'Failed to search novels',
    );
    return parseNovelCards(data);
  }

  resolveUrl = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${this.site}/title/${path}`;
}

export default new Atsumaru();
