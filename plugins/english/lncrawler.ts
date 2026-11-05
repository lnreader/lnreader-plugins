import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

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
/**
 * Pick the source the plugin reads through. When the catalog was
 * filtered to languages, those are carried in the novel path
 * (`slug?lang=a,b`) and a source in one of them wins — first listed
 * language first. Without them this is: the English source with the
 * most available chapters (the site's preferred source wins ties when
 * it is English), falling back to the largest source overall when the
 * novel has no English source, so the novel still opens.
 */
function chooseSource(
  detail: NovelSources,
  preferLangs: string[] = [],
): SourceOption {
  let bestEn: SourceOption | undefined;
  let bestAny: SourceOption | undefined;
  for (const lang of preferLangs) {
    let bestInLang: SourceOption | undefined;
    for (const s of detail.sources) {
      if (s.available <= 0 || s.language !== lang) continue;
      if (
        !bestInLang ||
        s.available > bestInLang.available ||
        (s.available === bestInLang.available &&
          s.slug === detail.preferredSlug)
      ) {
        bestInLang = s;
      }
    }
    if (bestInLang) return bestInLang;
  }
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
 * chapter title — which includes the chapter number on LNCrawler.
 * Keeping it gives in-page headings showing title and number, so it
 * is left in place (only executable content is stripped below).
 */
function parseChapterBody(data: unknown): string {
  const res = data as { body?: string };
  if (typeof res.body !== 'string') {
    throw new Error('Chapter response had an unexpected shape');
  }
  return sanitizeChapterHtml(res.body.trim());
}

/**
 * Languages the LNCrawler search API understands (from the site's own
 * frontend), used for the Languages filter. Responses repeat the
 * `languages` param, which the API aliases to `language`.
 */
const LANGUAGES: { label: string; value: string }[] = [
  { label: 'English', value: 'en' },
  { label: 'French', value: 'fr' },
  { label: 'Spanish', value: 'es' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Russian', value: 'ru' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Thai', value: 'th' },
  { label: 'Vietnamese', value: 'vi' },
  { label: 'Indonesian', value: 'id' },
  { label: 'Turkish', value: 'tr' },
  { label: 'Polish', value: 'pl' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Swedish', value: 'sv' },
  { label: 'Danish', value: 'da' },
];

const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Title', value: 'title' },
  { label: 'Rating', value: 'rating' },
  { label: 'Date added', value: 'date_added' },
  { label: 'All-time views', value: 'popularity' },
  { label: 'Trending', value: 'trending' },
  { label: 'Last updated', value: 'last_updated' },
];

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Ongoing', value: 'Ongoing' },
  { label: 'Completed', value: 'Completed' },
  { label: 'On Hiatus', value: 'On Hiatus' },
  { label: 'Cancelled', value: 'Cancelled' },
  { label: 'Unknown', value: 'Unknown' },
];

const ADULT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Hide adult content', value: 'hide' },
  { label: 'Show everything', value: 'show' },
  { label: 'Adult content only', value: 'only' },
];

class LNCrawler implements Plugin.PluginBase {
  id = 'lncrawler';
  name = 'LNCrawler';
  icon = 'src/en/lncrawler/icon.png';
  site = 'https://lncrawler.monster';
  version = '1.1.1';

  filters = {
    languages: {
      type: FilterTypes.CheckboxGroup,
      label: 'Languages',
      value: ['en'],
      options: LANGUAGES,
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: STATUS_OPTIONS,
    },
    sort_by: {
      type: FilterTypes.Picker,
      label: 'Sort by',
      value: '',
      options: SORT_OPTIONS,
    },
    sort_order: {
      type: FilterTypes.Picker,
      label: 'Order',
      value: '',
      options: [
        { label: 'Default', value: '' },
        { label: 'Ascending', value: 'asc' },
        { label: 'Descending', value: 'desc' },
      ],
    },
    adult: {
      type: FilterTypes.Picker,
      label: 'Adult content',
      value: '',
      options: ADULT_OPTIONS,
    },
  } satisfies Filters;

  /**
   * Build the /novels/search/ query from filters. Catalog defaults:
   * popular = all-time views descending; the Latest toggle switches to
   * last-updated descending. An empty filter value means "server
   * default" and is simply omitted.
   */
  private buildSearchQuery(
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
    pageNo: number,
    query?: string,
  ): URLSearchParams {
    const params = new URLSearchParams({
      page: String(pageNo),
      page_size: String(PAGE_SIZE),
    });
    if (query) params.set('query', query);
    const opts: Plugin.PopularNovelsOptions<typeof this.filters> = options || {
      showLatestNovels: false,
      filters: undefined,
    };
    const filters = opts.filters;
    if (!filters && !options) {
      // Interface callers pass no options: catalog default = English.
      params.append('languages', 'en');
    } else {
      for (const language of filters?.languages?.value || []) {
        if (language) params.append('languages', language);
      }
    }
    if (filters?.status?.value) params.set('status', filters.status.value);
    if (filters?.sort_by?.value) {
      params.set('sort_by', filters.sort_by.value);
    } else {
      params.set(
        'sort_by',
        opts.showLatestNovels ? 'last_updated' : 'popularity',
      );
    }
    if (filters?.sort_order?.value) {
      params.set('sort_order', filters.sort_order.value);
    } else {
      params.set('sort_order', 'desc');
    }
    if (filters?.adult?.value) params.set('adult', filters.adult.value);
    return params;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The search endpoint is the only listing with a language filter;
    // with no query it serves as the catalog. Popular = all-time views
    // descending, the Latest toggle = last-updated descending.
    const data = await fetchJson(
      `${API}/novels/search/?${this.buildSearchQuery(options, pageNo)}`,
      'Failed to load popular novels',
    );
    const page = parseNovelListPage(data);
    return this.tagWithLanguages(page, pageNo, options);
  }

  /** Selected languages carried in the novel path, if any (`slug?lang=a,b`). */
  private langsFromPath(novelPath: string): string[] {
    const url = new URL(novelPath, this.site);
    const raw = url.searchParams.get('lang') || '';
    return raw.split(',').filter(Boolean);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // The path may be a bare slug (`shadow-slave?lang=en`) or a resolved
    // site URL (`.../novels/shadow-slave?lang=en`); the last path
    // segment is the novel slug either way.
    const slug =
      new URL(novelPath, this.site).pathname.split('/').filter(Boolean).pop() ||
      '';
    const detail = parseNovelSources(
      await fetchJson(
        `${API}/novels/${encodeURIComponent(slug)}/`,
        'Failed to load novel',
      ),
    );
    if (!detail.name) {
      throw new Error('Could not load the novel ' + novelPath);
    }
    const source = chooseSource(detail, this.langsFromPath(novelPath));
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
    options?: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const data = await fetchJson(
      `${API}/novels/search/?${this.buildSearchQuery(options, pageNo, searchTerm)}`,
      'Failed to search novels',
    );
    const page = parseNovelListPage(data);
    return this.tagWithLanguages(page, pageNo, options);
  }

  /**
   * Catalog cards carry the chosen languages in their path
   * (`slug?lang=a,b`) so parseNovel can pick a chapter source that
   * matches them; used only when a language filter is actually set.
   */
  private tagWithLanguages(
    page: ListPage,
    pageNo: number,
    options?: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Plugin.NovelItem[] {
    if (pageNo > page.totalPages) return [];
    const langs = (options?.filters?.languages?.value || [])
      .filter(Boolean)
      .join(',');
    if (!langs) return page.cards;
    const suffix = `?lang=${encodeURIComponent(langs)}`;
    return page.cards.map(card => ({ ...card, path: card.path + suffix }));
  }

  resolveUrl = (path: string) => {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return `${this.site}/novels/${path}`;
  };
}

export default new LNCrawler();
