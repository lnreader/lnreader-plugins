import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SITE = 'https://www.rechapters.com';
const PAGE_SIZE = 20;
// Chapter-list buckets fetched concurrently per round.
const BUCKET_BATCH = 5;

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

type SearchItem = {
  nanoId: string;
  slug: string;
  title: string;
  coverUrl?: string;
  hasCover?: boolean;
};

type SearchData = {
  items: SearchItem[];
  hasMore: boolean;
};

type BucketsData = {
  buckets: { index: number }[];
};

type ChapterListItem = {
  chapterNanoId: string;
  title: string;
  orderNum: string;
  createdAt: string;
};

type ChapterContentData = {
  pageBlocks: { block: { type: string; content?: string } }[];
  pageMetas: unknown[];
};

type LdBook = {
  name?: string;
  description?: string;
  image?: string;
  author?: unknown;
};

/** JSON-LD `author` may be an array, a single Person object, or a string. */
function ldAuthorNames(author: unknown): string[] {
  const list = Array.isArray(author) ? author : author ? [author] : [];
  return list
    .map(a => {
      if (typeof a === 'string') return a.trim();
      if (a && typeof a === 'object' && typeof a.name === 'string') {
        return a.name.trim();
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * The search API pages with an opaque cursor that is base64 of
 * `{"offset":N}`; building it directly lets any page be requested without
 * walking the previous ones. The payload is ASCII, so this minimal encoder
 * is enough (btoa is not guaranteed in the app runtime).
 */
function offsetCursor(offset: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const input = '{"offset":' + offset + '}';
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += isNaN(b) ? '=' : chars[(n >> 6) & 63];
    out += isNaN(c) ? '=' : chars[n & 63];
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Book paths end in `-<12-char nanoId>`, e.g. `book/shadow-slave-r2k2ivbd6ez4`. */
function bookNanoId(novelPath: string): string {
  const m = /-([23456789a-z]{12})\/?$/.exec(novelPath);
  if (!m) throw new Error('Invalid ReChapters novel path: ' + novelPath);
  return m[1];
}

async function getApi<T>(path: string): Promise<T> {
  const res = await fetchApi(SITE + path);
  if (!res.ok) throw new Error('ReChapters API error ' + res.status);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json || !json.success) {
    throw new Error((json && json.message) || 'ReChapters API error');
  }
  return json.data;
}

class ReChapters implements Plugin.PluginBase {
  id = 'rechapters';
  name = 'ReChapters';
  icon = 'src/en/rechapters/icon.png';
  site = SITE;
  version = '1.0.0';

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort by',
      value: 'popularity_score',
      options: [
        { label: 'Popularity', value: 'popularity_score' },
        { label: 'Latest update', value: 'last_chapter_at_ts' },
        { label: 'Rating', value: 'rating_average' },
        { label: 'Rating count', value: 'rating_count' },
        { label: 'Chapter count', value: 'chapter_count' },
        { label: 'Word count', value: 'word_count' },
      ],
    },
    writing: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: '1' },
        { label: 'Completed', value: '2' },
      ],
    },
  } satisfies Filters;

  private async search(
    params: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let query = params + '&pageSize=' + PAGE_SIZE;
    if (pageNo > 1) {
      query += '&cursor=' + offsetCursor((pageNo - 1) * PAGE_SIZE);
    }
    const data = await getApi<SearchData>('/api/search?' + query);
    return data.items.map(item => ({
      name: item.title,
      path: 'book/' + item.slug + '-' + item.nanoId,
      cover: item.hasCover && item.coverUrl ? item.coverUrl : defaultCover,
    }));
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels
      ? 'last_chapter_at_ts'
      : filters?.sort?.value || 'popularity_score';
    let params = 'sort=' + encodeURIComponent(sort);
    const writing = filters?.writing?.value;
    if (writing) params += '&writing=' + encodeURIComponent(writing);
    return this.search(params, pageNo);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.search(
      'q=' + encodeURIComponent(searchTerm) + '&sort=relevance',
      pageNo,
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const nanoId = bookNanoId(novelPath);
    const res = await fetchApi(this.resolveUrl(novelPath));
    if (!res.ok) throw new Error('Could not load novel: HTTP ' + res.status);
    const $ = loadCheerio(await res.text());

    let ld: LdBook = {};
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const parsed = JSON.parse($(el).html() || '');
        if (parsed && parsed['@type'] === 'Book') ld = parsed;
      } catch {
        // ignore unrelated or malformed JSON-LD
      }
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || ld.name || 'Untitled',
      cover: ld.image || defaultCover,
    };
    const authors = ldAuthorNames(ld.author);
    if (authors.length) novel.author = authors.join(', ');
    if (ld.description) novel.summary = ld.description.trim();

    const genres = $('ul[aria-label="Book tags"] li[data-tag-item] a')
      .map((_i, el) => $(el).attr('aria-label') || $(el).text().trim())
      .get()
      .filter(Boolean);
    if (genres.length) novel.genres = genres.join(', ');

    // The status is one of the metric pills, e.g. <span>Completed</span>.
    const metrics = $('[aria-label="Book metrics"] span')
      .map((_i, el) => $(el).text().trim().toLowerCase())
      .get();
    if (metrics.includes('completed')) novel.status = NovelStatus.Completed;
    else if (metrics.includes('ongoing')) novel.status = NovelStatus.Ongoing;
    else if (metrics.includes('hiatus')) novel.status = NovelStatus.OnHiatus;
    else novel.status = NovelStatus.Unknown;

    // The chapter list is split into buckets of ~100 chapters (the last
    // bucket absorbs the remainder); each bucket is one request.
    const { buckets } = await getApi<BucketsData>(
      '/api/book/' + nanoId + '/chapters/buckets',
    );
    const lists: ChapterListItem[][] = [];
    for (let i = 0; i < buckets.length; i += BUCKET_BATCH) {
      const batch = await Promise.all(
        buckets
          .slice(i, i + BUCKET_BATCH)
          .map(b =>
            getApi<{ items: ChapterListItem[] }>(
              '/api/book/' +
                nanoId +
                '/chapters?bucket=' +
                b.index +
                '&order=asc',
            ).then(d => d.items),
          ),
      );
      lists.push(...batch);
    }

    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    for (const list of lists) {
      for (const c of list) {
        if (seen[c.chapterNanoId]) continue;
        seen[c.chapterNanoId] = true;
        const num = parseFloat(c.orderNum);
        chapters.push({
          name: c.title,
          path: novelPath + '/' + c.chapterNanoId,
          releaseTime: c.createdAt,
          chapterNumber: isNaN(num) ? undefined : num,
        });
      }
    }
    chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const parts = chapterPath.split('/');
    const chapterId = parts.pop() || '';
    const nanoId = bookNanoId(parts.join('/'));
    const base =
      '/api/account/chapter/' +
      nanoId +
      '/' +
      encodeURIComponent(chapterId) +
      '/content';

    // Long chapters are split into several "weight pages" (1-based).
    const first = await getApi<ChapterContentData>(base);
    const pages = [first];
    for (let p = 2; p <= first.pageMetas.length; p++) {
      pages.push(await getApi<ChapterContentData>(base + '?weightPage=' + p));
    }

    // Blocks are plain text, so escaping them is enough to keep markup,
    // event handlers and javascript: URLs out of the reader.
    const html: string[] = [];
    for (const page of pages) {
      for (const { block } of page.pageBlocks) {
        if (block.type === 'text' && block.content) {
          html.push('<p>' + escapeHtml(block.content) + '</p>');
        }
      }
    }
    return html.join('\n');
  }

  resolveUrl = (path: string): string => SITE + '/' + path;
}

export default new ReChapters();
