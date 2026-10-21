import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

// LNCrawler — https://lncrawler.monster
// The web frontend is a React SPA; all data comes from its public JSON
// API at https://api.lncrawler.monster:
//   GET /novels/search/?query=&language=en&page=N&page_size=20
//   GET /novels/<slug>/                  novel + all of its sources
//   GET /novels/<slug>/<source>/         per-source details
//   GET /novels/<slug>/<source>/chapters/?page=N   paginated, 100/page
//   GET /novels/<slug>/<source>/chapter/<id>/       chapter body HTML
// A novel aggregates several source sites and languages (5,993 novels,
// ~4,907 with English sources). This plugin reads each novel through the
// English source with the most available chapters.

const API = 'https://api.lncrawler.monster';
const PAGE_SIZE = 20;
// Safety bound for the chapter-list page loop (100 chapters per page).
const MAX_CHAPTER_PAGES = 500;

/**
 * Upper bound on a response this plugin will parse. API responses are
 * orders of magnitude smaller; anything bigger is a broken or hostile
 * payload, and parsing it would bill the reader's phone, not the site.
 */
const MAX_RESPONSE_CHARS = 2000000;

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

/** Strip tags and collapse whitespace (for the HTML synopsis). */
function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Strip executable content from chapter HTML. The chapter body is
 * HTML the API assembled from upstream source sites, i.e. untrusted
 * markup: scripts, frames, form elements, inline event handlers and
 * javascript:/vbscript: URLs must not reach the reader. Everything
 * else (paragraphs, images, links, tables) is kept as-is.
 */
function sanitizeChapterHtml(html: string): string {
  return html
    .replace(
      /<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi,
      '',
    )
    .replace(
      /<(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi,
      '',
    )
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(?:href|src)\s*=\s*"\s*(?:javascript|vbscript)\s*:[^"]*"/gi, '')
    .replace(/\s(?:href|src)\s*=\s*'\s*(?:javascript|vbscript)\s*:[^']*'/gi, '')
    .replace(/\s(?:href|src)\s*=\s*"\s*data\s*:\s*text\/html[^"]*"/gi, '')
    .replace(/\s(?:href|src)\s*=\s*'\s*data\s*:\s*text\/html[^']*'/gi, '');
}

type ListEntry = {
  slug?: string;
  title?: string;
  prefered_source?: { cover_min_url?: string };
};

type SearchResponse = {
  results?: ListEntry[];
  total_pages?: number;
  current_page?: number;
};

type NovelCard = {
  name: string;
  /** The novel slug — parseNovel resolves the best English source. */
  path: string;
  cover?: string;
};

type ListPage = {
  cards: NovelCard[];
  totalPages: number;
};

/**
 * One page of /novels/search/. The API CLAMPS an out-of-range page to
 * the last page instead of returning an empty one, so callers compare
 * the requested page against totalPages — otherwise the app would
 * re-show the last page forever.
 */
function parseNovelListPage(data: unknown): ListPage {
  const res = data as SearchResponse;
  if (!Array.isArray(res.results)) {
    // An error payload or a changed shape must surface as a failure,
    // not as an empty catalog page.
    throw new Error('Novel list response had an unexpected shape');
  }
  const cards: NovelCard[] = [];
  for (const entry of res.results) {
    if (!entry || typeof entry.slug !== 'string' || !entry.slug) continue;
    const cover = entry.prefered_source?.cover_min_url;
    cards.push({
      name: String(entry.title || entry.slug),
      path: entry.slug,
      cover: typeof cover === 'string' && cover ? cover : undefined,
    });
  }
  return {
    cards,
    totalPages: typeof res.total_pages === 'number' ? res.total_pages : 1,
  };
}

type SourceOption = {
  slug: string;
  language: string;
  available: number;
};

type NovelResponse = {
  title?: string;
  sources?: {
    source_slug?: string;
    language?: string;
    available_chapters_count?: number;
  }[];
  prefered_source?: { source_slug?: string };
};

type NovelSources = {
  name: string;
  sources: SourceOption[];
  preferredSlug?: string;
};

function parseNovelSources(data: unknown): NovelSources {
  const res = data as NovelResponse;
  if (!Array.isArray(res.sources)) {
    throw new Error('Novel response had an unexpected shape');
  }
  const sources: SourceOption[] = [];
  for (const s of res.sources) {
    if (!s || typeof s.source_slug !== 'string' || !s.source_slug) continue;
    sources.push({
      slug: s.source_slug,
      language: typeof s.language === 'string' ? s.language : '',
      available:
        typeof s.available_chapters_count === 'number'
          ? s.available_chapters_count
          : 0,
    });
  }
  return {
    name: String(res.title || ''),
    sources,
    preferredSlug: res.prefered_source?.source_slug,
  };
}

/**
 * Pick the source the plugin reads through: the English source with the
 * most available chapters (the site's preferred source wins ties when it
 * is English). Falls back to the largest source overall when the novel
 * has no English source, so the novel still opens.
 */
function chooseSource(detail: NovelSources): SourceOption {
  let bestEn: SourceOption | undefined;
  let bestAny: SourceOption | undefined;
  for (const s of detail.sources) {
    if (s.available <= 0) continue;
    if (!bestAny || s.available > bestAny.available) bestAny = s;
    if (
      s.language === 'en' &&
      (!bestEn ||
        s.available > bestEn.available ||
        (s.available === bestEn.available && s.slug === detail.preferredSlug))
    ) {
      bestEn = s;
    }
  }
  const chosen = bestEn || bestAny;
  if (!chosen) {
    throw new Error('This novel has no readable source on LNCrawler');
  }
  return chosen;
}

type SourceDetails = {
  summary?: string;
  author?: string;
  genres?: string;
  /** Raw site status: Ongoing | Completed | On Hiatus | Cancelled | Unknown. */
  statusRaw: string;
  cover?: string;
};

type SourceDetailResponse = {
  synopsis?: string;
  authors?: string[];
  tags?: string[];
  status?: string;
  cover_url?: string;
};

function parseSourceDetails(data: unknown): SourceDetails {
  const res = data as SourceDetailResponse;
  const summary = res.synopsis ? stripHtml(String(res.synopsis)) : '';
  const authors = Array.isArray(res.authors)
    ? res.authors.filter(a => typeof a === 'string' && a)
    : [];
  const tags = Array.isArray(res.tags)
    ? res.tags.filter(t => typeof t === 'string' && t)
    : [];
  return {
    summary: summary || undefined,
    author: authors.length ? authors.join(', ') : undefined,
    genres: tags.length ? tags.join(', ') : undefined,
    statusRaw: typeof res.status === 'string' ? res.status : '',
    cover:
      typeof res.cover_url === 'string' && res.cover_url
        ? res.cover_url
        : undefined,
  };
}

type ChapterEntry = {
  id: number;
  title: string;
};

type ChaptersPage = {
  totalPages: number;
  entries: ChapterEntry[];
};

type ChaptersResponse = {
  chapters?: { chapter_id?: number; title?: string; has_content?: boolean }[];
  total_pages?: number;
};

/** One page of the chapters endpoint — only chapters carrying content. */
function parseChaptersPage(data: unknown): ChaptersPage {
  const res = data as ChaptersResponse;
  if (!Array.isArray(res.chapters)) {
    throw new Error('Chapter list response had an unexpected shape');
  }
  const entries: ChapterEntry[] = [];
  for (const c of res.chapters) {
    if (!c || c.has_content !== true) continue;
    if (typeof c.chapter_id !== 'number') continue;
    entries.push({
      id: c.chapter_id,
      title: String(c.title || 'Chapter ' + c.chapter_id),
    });
  }
  return {
    totalPages: typeof res.total_pages === 'number' ? res.total_pages : 1,
    entries,
  };
}

/**
 * Chapter body HTML. The API prefixes the body with an <h1> of the
 * chapter title — the app already shows the title, so it is dropped.
 */
function parseChapterBody(data: unknown): string {
  const res = data as { body?: string };
  if (typeof res.body !== 'string') {
    throw new Error('Chapter response had an unexpected shape');
  }
  const withoutTitle = res.body
    .replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '')
    .trim();
  return sanitizeChapterHtml(withoutTitle);
}

class LNCrawler implements Plugin.PluginBase {
  id = 'lncrawler';
  name = 'LNCrawler';
  icon = 'src/en/lncrawler/icon.png';
  site = 'https://lncrawler.monster';
  version = '1.0.0';

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The search endpoint is the only listing with a language filter;
    // with no query it serves as the catalog. The API exposes no sort
    // options, so the Latest toggle lands here too.
    const data = await fetchJson(
      `${API}/novels/search/?language=en&page=${pageNo}&page_size=${PAGE_SIZE}`,
      'Failed to load popular novels',
    );
    const page = parseNovelListPage(data);
    return pageNo > page.totalPages ? [] : page.cards;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/novels\//, '').replace(/\/+$/, '');
    const detail = parseNovelSources(
      await fetchJson(
        `${API}/novels/${encodeURIComponent(slug)}/`,
        'Failed to load novel',
      ),
    );
    if (!detail.name) {
      throw new Error('Could not load the novel ' + novelPath);
    }
    const source = chooseSource(detail);
    const base =
      `${API}/novels/${encodeURIComponent(slug)}` +
      `/${encodeURIComponent(source.slug)}`;
    const details = parseSourceDetails(
      await fetchJson(base + '/', 'Failed to load novel details'),
    );
    // Chapter list is paginated at 100/page; fetch every page in order.
    const first = parseChaptersPage(
      await fetchJson(base + '/chapters/', 'Failed to load chapter list'),
    );
    const entries = first.entries.slice();
    const pages = Math.min(first.totalPages, MAX_CHAPTER_PAGES);
    for (let page = 2; page <= pages; page++) {
      const next = parseChaptersPage(
        await fetchJson(
          `${base}/chapters/?page=${page}`,
          'Failed to load chapter list',
        ),
      );
      for (const e of next.entries) entries.push(e);
    }
    entries.sort((a, b) => a.id - b.id);
    const chapters: Plugin.ChapterItem[] = entries.map(e => ({
      name: e.title,
      path: `${slug}/${source.slug}/${e.id}`,
      chapterNumber: e.id,
    }));
    const status =
      details.statusRaw === 'Completed'
        ? NovelStatus.Completed
        : details.statusRaw === 'Ongoing'
          ? NovelStatus.Ongoing
          : details.statusRaw === 'On Hiatus'
            ? NovelStatus.OnHiatus
            : details.statusRaw === 'Cancelled'
              ? NovelStatus.Cancelled
              : NovelStatus.Unknown;
    return {
      path: novelPath,
      name: detail.name,
      cover: details.cover,
      summary: details.summary,
      author: details.author,
      genres: details.genres,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const parts = chapterPath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length !== 3) {
      throw new Error('Unexpected chapter path: ' + chapterPath);
    }
    const url =
      `${API}/novels/${encodeURIComponent(parts[0])}` +
      `/${encodeURIComponent(parts[1])}/chapter/${encodeURIComponent(parts[2])}/`;
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
      `${API}/novels/search/?query=${encodeURIComponent(searchTerm)}&language=en&page=${pageNo}&page_size=${PAGE_SIZE}`,
      'Failed to search novels',
    );
    const page = parseNovelListPage(data);
    return pageNo > page.totalPages ? [] : page.cards;
  }

  resolveUrl = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${this.site}/novels/${path}`;
}

export default new LNCrawler();
