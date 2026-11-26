import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';
import type { FilterOption } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import {
  checkResponse,
  createPluginError,
  PluginError,
  type PluginErrorCode,
} from '@libs/pluginError';

// Live contract for the sites this template serves (verified 2026-11-27):
//   listing  <site>search-adv?country_id|country_id[]=…&categories[]=…
//            &chapter_min/chapter_max|totalchapter=…&sort=…&page=…
//   novel    <site><novelPath>              .novel-title, #novel-report[report-post_id]
//   chapters <site>ajax/listChapterDataAjax  { recordsTotal, data: { n_sort, slug, title } }
//   chapter  <site><novelPath>/chapter-<n>   #content
// Chapter paths are user data: reading progress is keyed by them, so the
// `<novelPath>/chapter-<n>` shape must not change without a migration plan.
const CHAPTER_NOTICE_REGEX =
  /Some novel pages moved|Page Not Found 404|Chapter not found/i;

// Novel Phoenix only accepts numeric tag ids, so tag names have to be resolved
// through its own tag list. The list rarely changes; cache it for a week.
const TAGS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TagIndex = {
  tags: { id: string; name: string }[];
  byName: Record<string, string>;
};

type NovelFireOptions = {
  lang?: string;
  majorVer?: number;
  minorVer?: number;
  versionIncrement?: number;
  // Novel Phoenix moved its advanced search to single-value `country_id` and a
  // `chapter_min` / `chapter_max` range. Novel Fire still expects `country_id[]`
  // and `totalchapter`, so the parameter shape is chosen per source.
  advSearchV2?: boolean;
};

export type NovelFireMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: NovelFireOptions;
  filters?: Filters;
};

const CHAPTER_PREFIX_REGEX = /^(chapter|ch\.?)[\s-]*\d+/i;
const LEADING_PUNCT_REGEX = /^[–—\-\s:]+/;
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g;

function formatChapterTitle(
  rawTitle: string,
  chapterPrefixOrNum: number | string,
): string {
  const cleanTitle = rawTitle.replace(LEADING_PUNCT_REGEX, '').trim();
  const prefixStr = String(chapterPrefixOrNum).trim();
  const numMatch = prefixStr.match(/\d+/);
  const num = numMatch ? numMatch[0] : '';

  const hasChapterPrefix =
    CHAPTER_PREFIX_REGEX.test(cleanTitle) ||
    (num.length > 0 &&
      cleanTitle.startsWith(num) &&
      (cleanTitle.length === num.length || !/\d/.test(cleanTitle[num.length])));

  if (hasChapterPrefix) {
    return cleanTitle;
  }

  const prefix =
    typeof chapterPrefixOrNum === 'number'
      ? `Chapter ${chapterPrefixOrNum}`
      : prefixStr.startsWith('Ch') || prefixStr.startsWith('Chapter')
        ? prefixStr
        : `Chapter ${prefixStr}`;

  return cleanTitle ? `${prefix} ${cleanTitle}` : prefix;
}

export class NovelFirePlugin implements Plugin.PagePlugin {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options?: NovelFireOptions;
  filters?: Filters;
  webStorageUtilized = true;
  novelList = new Set<string>();
  draw = 0;

  pluginSettings = {
    pageLength: {
      value: '',
      label: 'Page Mode (Change if Broken)',
      type: 'Switch',
    },
    singlePage: {
      value: '',
      label:
        'Force load all chapters on a single page (Slower & use more data)',
      type: 'Switch',
    },
  };
  singlePage = storage.get('singlePage');
  pageLength = storage.get('pageLength');
  private tagIndexPromise?: Promise<TagIndex>;

  constructor(metadata: NovelFireMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/novelfire/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const majorVer = metadata.options?.majorVer || 1;
    const minorVer = metadata.options?.minorVer || 0;
    const versionIncrement = (metadata.options?.versionIncrement || 0) + 1;
    this.version = `${majorVer}.${minorVer}.${versionIncrement}`;
    this.options = metadata.options;
    this.filters = metadata.filters satisfies Filters;
  }

  async getCheerio(
    url: string,
    search: boolean,
    notFoundCode: PluginErrorCode = PluginError.NovelNotFound,
  ): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    checkResponse(r, { search, notFoundCode });

    const $ = load(await r.text());

    // The source answers dead pages with HTTP 200 and its own 404 template.
    if (/Page Not Found\s*404/i.test($('title').text())) {
      throw createPluginError(notFoundCode, { url });
    }

    if ($('title').text().includes('Cloudflare')) {
      throw createPluginError(PluginError.Cloudflare, { url });
    }

    return $;
  }

  parseNovels(
    loadedCheerio: CheerioAPI,
    selector = '.novel-item',
    isFirstPage = false,
  ): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    const elements = loadedCheerio(selector).toArray();
    for (const el of elements) {
      const $el = loadedCheerio(el);

      const novelName =
        $el.find('a').attr('title') ?? $el.find('h4').text().trim();
      const novelPath =
        $el.children('a').attr('href') ?? $el.find('h4 a').attr('href');

      if (!novelPath) continue;

      const path = new URL(novelPath, this.site).pathname.substring(1);

      if (!isFirstPage) {
        if (this.novelList.has(path)) continue;
        this.novelList.add(path);
      } else {
        this.novelList.add(path);
      }

      const imgElement = $el.find('.novel-cover > img');
      const rawSrc = imgElement.attr('data-src') ?? imgElement.attr('src');
      const novelCover = rawSrc ? new URL(rawSrc, this.site).href : undefined;

      novels.push({
        name: novelName,
        cover: novelCover,
        path,
      });
    }

    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo === 1) {
      this.novelList.clear();
      this.draw = 0;
    }

    const params = await this.buildSearchParams(
      pageNo,
      showLatestNovels,
      filters,
    );
    const loadedCheerio = await this.getCheerio(
      `${this.site}search-adv?${params.toString()}`,
      false,
    );

    this.assertChapterFilterApplied(loadedCheerio, filters?.chapters?.value);

    return this.parseNovels(loadedCheerio, '.novel-item', pageNo === 1);
  }

  private async buildSearchParams(
    pageNo: number,
    showLatestNovels: boolean | undefined,
    filters: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
  ): Promise<URLSearchParams> {
    const params = new URLSearchParams();

    if (this.options?.advSearchV2) {
      // Novel Phoenix ignores the repeated `country_id[]` array and expects a
      // single `country_id`, plus `chapter_min` / `chapter_max` instead of the
      // combined `totalchapter` range. Novel Fire still uses the old shape.
      const language = filters?.language?.value;
      if (typeof language === 'string' && language !== '-1') {
        params.append('country_id', language);
      }

      const chapterRange = filters?.chapters?.value;
      if (chapterRange && chapterRange !== '0') {
        const [min, max] = String(chapterRange).split(',');
        if (min) params.append('chapter_min', min);
        if (max) params.append('chapter_max', max);
      }

      params.append('content_rating', filters?.content_rating?.value || '-1');
      params.append(
        'latest_release_date',
        filters?.latest_release_date?.value || '-1',
      );

      const tagValue = filters?.tags?.value;
      const tagText = Array.isArray(tagValue) ? tagValue.join(',') : tagValue;
      if (tagText && String(tagText).trim()) {
        for (const tagId of await this.resolveTagIds(String(tagText))) {
          params.append('tags[]', tagId);
        }
      }
    } else {
      for (const language of filters?.language?.value || []) {
        params.append('country_id[]', language);
      }
      params.append('totalchapter', filters?.chapters?.value || '0');
      for (const tag of filters?.tags?.value || []) {
        params.append('tags[]', tag);
      }
      for (const tag of filters?.tags_excluded?.value || []) {
        params.append('tags_excluded[]', tag);
      }
    }

    params.append('ctgcon', filters?.genre_operator?.value || 'and');
    for (const genre of filters?.genres?.value || []) {
      params.append('categories[]', genre);
    }
    params.append('ratcon', filters?.rating_operator?.value || 'min');
    params.append('rating', filters?.rating?.value || '0');
    params.append('status', filters?.status?.value || '-1');
    params.append(
      'sort',
      showLatestNovels ? 'date' : filters?.sort?.value || 'rank-top',
    );
    params.append('tagcon', filters?.tagcon?.value || 'and');
    params.append('page', pageNo.toString());

    return params;
  }

  // Novel Phoenix ignores search parameters it does not recognise, so a renamed
  // filter silently returns an unfiltered list. Every result card reports its
  // chapter count, which lets us verify the range filter actually applied
  // without a second request. Only throw when every card disagrees.
  private assertChapterFilterApplied(
    $: CheerioAPI,
    chapterRange?: string,
  ): void {
    if (!this.options?.advSearchV2 || !chapterRange || chapterRange === '0') {
      return;
    }

    const [min, max] = String(chapterRange).split(',').map(Number);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;

    const counts: number[] = [];
    $('.novel-item .icon-book-open').each((_, el) => {
      const match = $(el)
        .parent()
        .text()
        .match(/([\d,]+)\s*Chapters/i);
      if (!match) return;
      const count = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(count)) counts.push(count);
    });

    if (counts.length < 3) return;
    if (counts.some(count => count >= min && count <= max)) return;

    throw createPluginError(PluginError.InvalidResponse, {
      message:
        'Chapter filter was not applied by the source — the site may have changed.',
    });
  }

  // Novel Phoenix only accepts numeric tag ids, so the tag names a user types
  // are resolved through the site's own tag list. It changes rarely, so it is
  // cached (see TAGS_CACHE_TTL_MS) and fetched at most once per session.
  private async getTagIndex(): Promise<TagIndex> {
    if (this.tagIndexPromise) return this.tagIndexPromise;

    this.tagIndexPromise = (async () => {
      const cacheKey = `${this.id}_tagIndex`;
      const unexpected = () =>
        createPluginError(PluginError.InvalidResponse, {
          message: 'Source returned an unexpected tag list.',
        });

      try {
        const cached = JSON.parse(String(storage.get(cacheKey) || 'null'));
        if (
          cached &&
          Date.now() - Number(cached.at) < TAGS_CACHE_TTL_MS &&
          Array.isArray(cached.tags) &&
          cached.tags.length > 0
        ) {
          return this.buildTagIndex(cached.tags);
        }
      } catch {
        // Stale or unreadable cache: refetch below.
      }

      const response = await fetchApi(`${this.site}ajax/getTags`);
      checkResponse(response);

      let payload: { data?: unknown };
      try {
        payload = JSON.parse(await response.text());
      } catch {
        throw unexpected();
      }

      // An error body is still valid JSON, and caching one would leave every
      // tag name unresolvable until the cache expires.
      const rows = payload?.data;
      if (!Array.isArray(rows)) throw unexpected();

      const tags = rows.flatMap(row => {
        const tag = row as { id?: unknown; name?: unknown } | null;
        const id = tag?.id;
        const name = typeof tag?.name === 'string' ? tag.name.trim() : '';
        const idText =
          typeof id === 'number' || typeof id === 'string' ? String(id) : '';
        return idText && name ? [{ id: idText, name }] : [];
      });

      if (tags.length === 0) throw unexpected();

      storage.set(cacheKey, JSON.stringify({ at: Date.now(), tags }));
      return this.buildTagIndex(tags);
    })();

    try {
      return await this.tagIndexPromise;
    } catch (error) {
      this.tagIndexPromise = undefined;
      throw error;
    }
  }

  private buildTagIndex(tags: { id: string; name: string }[]): TagIndex {
    const byName: Record<string, string> = {};
    for (const tag of tags) {
      const key = tag.name.toLowerCase();
      if (key && !byName[key]) byName[key] = tag.id;
    }
    return { tags, byName };
  }

  private async resolveTagIds(rawValue: string): Promise<string[]> {
    const tokens = rawValue
      .split(',')
      .map(token => token.trim())
      .filter(Boolean);
    if (tokens.length === 0) return [];

    const index = await this.getTagIndex();
    const ids: string[] = [];
    const unknown: string[] = [];

    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        ids.push(token);
        continue;
      }
      const id = index.byName[token.toLowerCase()];
      if (id) ids.push(id);
      else unknown.push(token);
    }

    if (unknown.length > 0) {
      throw createPluginError(PluginError.InvalidResponse, {
        message: `Unknown tag(s): ${unknown.join(
          ', ',
        )}. Pick one from the suggestions.`,
      });
    }

    return ids;
  }

  async getFilterSuggestions(
    filterKey: string,
    query: string,
  ): Promise<FilterOption[]> {
    if (filterKey !== 'tags') return [];

    const index = await this.getTagIndex();
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? index.tags.filter(tag => tag.name.toLowerCase().includes(needle))
      : index.tags;

    // The name is the value so a picked tag reads as "Isekai" rather than its
    // id; resolveTagIds turns names back into ids when searching.
    return matches
      .slice(0, 20)
      .map(tag => ({ label: tag.name, value: tag.name }));
  }

  // Both chapter sources (AJAX rows and the HTML fallback) end up here, so
  // naming, numbering, ordering and duplicate handling stay identical.
  private finalizeChapters(
    chapters: Plugin.ChapterItem[],
  ): Plugin.ChapterItem[] {
    const seen = new Set<string>();
    return chapters
      .filter(chapter => {
        if (seen.has(chapter.path)) return false;
        seen.add(chapter.path);
        return true;
      })
      .sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  }

  private buildChapterItems(
    novelPath: string,
    rows: {
      title?: string;
      slug?: string;
      n_sort: string | number;
      path?: string;
    }[],
  ): Plugin.ChapterItem[] {
    const chapters = rows.flatMap(row => {
      const num = Number(row.n_sort);
      if (isNaN(num)) return [];

      // Some chapters have an empty `title`; the slug is then just
      // "chapter-<n>", which would render as "Chapter 1 chapter-0".
      const title = (row.title || '').trim();
      const slugTitle = String(row.slug || '')
        .replace(/^chapter-[\d.]+-?/i, '')
        .trim();
      const raw = title || slugTitle;

      const decoded =
        raw.includes('<') || raw.includes('&') ? load(raw).text() : raw;
      const cleanRaw = decoded.replace(INVISIBLE_CHARS_REGEX, '').trim();

      return [
        {
          name: cleanRaw ? formatChapterTitle(cleanRaw, num) : `Chapter ${num}`,
          path: row.path ?? `${novelPath}/chapter-${num}`,
          chapterNumber: num,
        },
      ];
    });

    return this.finalizeChapters(chapters);
  }

  async getAllChapters(
    novelPath: string,
    post_id: string,
    page: string,
  ): Promise<Plugin.ChapterItem[]> {
    const length = this.pageLength ? 100 : -1;
    const url = `${this.site}ajax/listChapterDataAjax`;
    const start = length === -1 ? 0 : (parseInt(page) - 1) * length;
    this.draw++;
    const params = new URLSearchParams({
      draw: this.draw.toString(),
      'columns[0][data]': 'n_sort',
      'columns[0][name]': 'cmm_posts_detail.n_sort',
      'columns[0][searchable]': 'true',
      'columns[0][orderable]': 'true',
      'columns[0][search][value]': '',
      'columns[0][search][regex]': 'false',

      'columns[1][data]': 'bookmark_created_at',
      'columns[1][name]': 'bookmark_chapters.created_at',
      'columns[1][searchable]': 'false',
      'columns[1][orderable]': 'true',
      'columns[1][search][value]': '',
      'columns[1][search][regex]': 'false',

      'order[0][column]': '0',
      'order[0][dir]': 'asc',
      'order[0][name]': 'cmm_posts_detail.n_sort',

      start: start.toString(),
      length: length.toString(),
      'search[value]': '',
      'search[regex]': 'false',
      post_id: post_id,
      only_bookmark: 'false',
      _: Date.now().toString(),
    });

    const result = await fetchApi(`${url}?${params.toString()}`);
    if (result.status === 429) throw new ThrottlingError();

    const body = await result.text();
    if (body.includes('You are being rate limited'))
      throw new ThrottlingError();
    if (body.includes('Page Not Found 404')) {
      throw createPluginError(PluginError.NovelNotFound, {
        message: 'Chapter list not found; the novel may have been removed.',
        url,
      });
    }

    let payload: {
      data?: { title?: string; slug: string; n_sort: string | number }[];
      recordsTotal?: number | string;
    };
    try {
      payload = JSON.parse(body);
    } catch {
      throw createPluginError(PluginError.InvalidResponse, {
        message: 'Source returned an unexpected response.',
        url,
      });
    }

    // Any other shape would surface as a novel with no chapters, or as a raw
    // TypeError from the row mapper.
    if (!Array.isArray(payload?.data)) {
      throw createPluginError(PluginError.InvalidResponse, {
        message: 'Source returned an unexpected chapter list.',
        url,
      });
    }

    const chapters = this.buildChapterItems(novelPath, payload.data);

    // Rows the mapper could not read leave a list that looks empty.
    if (chapters.length === 0 && Number(payload.recordsTotal) > 0) {
      throw createPluginError(PluginError.InvalidResponse, {
        message: `Source reported ${payload.recordsTotal} chapters but returned none.`,
        url,
      });
    }

    return chapters;
  }

  async getAllChaptersForce(
    novelPath: string,
    pages: number,
  ): Promise<Plugin.ChapterItem[]> {
    const pagesArray = Array.from({ length: pages }, (_, i) => i + 1);
    const allChapters: Plugin.ChapterItem[] = [];

    // When pages > ~30, we get rate limited. To mitigate, split into chunks and retry chunk on rate limit with delay.
    const chunkSize = 5; // 5 pages per chunk was tested to be a good balance between speed and rate limiting.
    const retryCount = 10;
    const sleepTime = 3.5; // Rate limit seems to be around ~10s, so usually 3 retries should be enough for another ~30 pages.

    const chaptersArray: Plugin.SourcePage[] = [];

    for (let i = 0; i < pagesArray.length; i += chunkSize) {
      const pagesArrayChunk = pagesArray.slice(i, i + chunkSize);

      const firstPage = pagesArrayChunk[0];
      const lastPage = pagesArrayChunk[pagesArrayChunk.length - 1];

      let attempt = 0;

      while (attempt < retryCount) {
        try {
          // Parse all pages in chunk in parallel
          const chaptersArrayChunk = await Promise.all(
            pagesArrayChunk.map(page =>
              this.parsePage(novelPath, page.toString()),
            ),
          );

          chaptersArray.push(...chaptersArrayChunk);
          break;
        } catch (err) {
          if (err instanceof ThrottlingError) {
            attempt += 1;
            console.warn(
              `[pages=${firstPage}-${lastPage}] Source is rate limiting requests. Retry attempt ${attempt + 1} in ${sleepTime} seconds...`,
            );
            if (attempt === retryCount) {
              throw err;
            }

            // Sleep for X second before retrying
            await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
          } else {
            throw err;
          }
        }
      }
    }

    // Merge all chapters into a single array
    for (const page of chaptersArray) {
      if (page.chapters) {
        for (const chapter of page.chapters) {
          allChapters.push(chapter);
        }
      }
    }
    return allChapters;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    this.draw = 0;
    const $ = await this.getCheerio(this.site + novelPath, false);
    const baseUrl = this.site;

    const post_id = $('#novel-report').attr('report-post_id');
    if (post_id) {
      storage.set(`${this.id}_${novelPath.split('/').pop()}`, post_id);
    }

    const novel: Partial<Plugin.SourceNovel & { totalPages: number }> = {
      path: novelPath,
      totalPages: 1,
    };

    novel.name =
      $('.novel-title').text().trim() ??
      $('.cover > img').attr('alt') ??
      'No Titled Found';
    const coverUrl =
      $('.cover > img').attr('data-src') ?? $('.cover > img').attr('src');

    if (coverUrl) {
      novel.cover = new URL(coverUrl, baseUrl).href;
    }

    novel.genres = $('.categories .property-item')
      .map((_, el) => $(el).text())
      .toArray()
      .join(',');

    const summary = $('.summary .content');
    summary.find('.expand').remove();
    summary.find('br').replaceWith('\n');
    summary.find('p').before('\n').after('\n\n');

    novel.summary =
      summary
        .text()
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        ?.replace(/\n{3,}/g, '\n\n')
        .trim() || 'Summary Not Found';

    novel.author = $('.author .property-item > span').text().trim();

    const rawStatus =
      $('.header-stats .ongoing').text() ||
      $('.header-stats .completed').text() ||
      'Unknown';
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
      unknown: NovelStatus.Unknown,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    novel.rating = parseFloat($('.nub').text().trim());

    // The novel page shows these stats but the plugin never mapped them.
    const statValue = (icon: string) =>
      $(`.header-stats i.icon-${icon}`).parent().text().trim();

    const reviewCount = $('.reviews-latest-container .latest')
      .text()
      .match(/([\d,]+)\s*readers?/i)?.[1];
    if (reviewCount) {
      novel.ratingCount = Number(reviewCount.replace(/,/g, ''));
    }

    const updated = $('.chapter-latest-container .update')
      .text()
      .replace(/^updated\s*/i, '')
      .trim();

    novel.info = [
      { label: 'Views', value: statValue('eye') },
      { label: 'Bookmarks', value: statValue('bookmark') },
      {
        label: 'Rank',
        value: $('.rating .rank strong').text().replace(/rank/i, '').trim(),
      },
      { label: 'Updated', value: updated },
    ].filter(entry => entry.value);

    const totalChapters = $('.header-stats i.icon-book-open')
      .parent()
      .text()
      .trim();
    const length = this.pageLength ? 100 : -1;
    novel.totalPages =
      length === -1 ? 1 : Math.ceil(parseInt(totalChapters) / length) || 1;
    if (novel.totalPages === 1 && !post_id) {
      throw createPluginError(PluginError.InvalidResponse, {
        message:
          'Source novel page no longer exposes a chapter id; the site may have changed.',
        url: this.site + novelPath,
      });
    }
    if (novel.totalPages === 1 && post_id) {
      novel.chapters = await this.getAllChapters(novelPath, post_id, '1');
    }
    if (length === 100 && this.singlePage) {
      novel.chapters = await this.getAllChaptersForce(
        novel.path as string,
        novel.totalPages,
      );
      novel.totalPages = 1;
    }

    return novel as Plugin.SourceNovel & { totalPages: number };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const post_id = storage.get(`${this.id}_${novelPath.split('/').pop()}`);

    if (post_id && !isNaN(Number(post_id))) {
      try {
        const chapters = await this.getAllChapters(
          novelPath,
          String(post_id),
          page,
        );
        return { chapters };
      } catch {
        // Fall back to scraping when the AJAX endpoint fails.
      }
    }

    // Fallback only works for multiples of 100
    const length = this.pageLength ? 100 : -1;
    if (length === 100) {
      const $ = await this.getCheerio(
        `${this.site}${novelPath}/chapters?page=${page}`,
        false,
        PluginError.NovelNotFound,
      );

      const rows: { title?: string; n_sort: number; path: string }[] = [];

      $('.chapter-list li').each((_, el) => {
        const $el = $(el);
        const href = $el.find('a').attr('href');
        const numberMatch = $el
          .find('.chapter-no')
          .text()
          .match(/(\d+(?:\.\d+)?)/);
        if (!href || !numberMatch) return;

        rows.push({
          title: $el.find('.chapter-title').text().trim() || undefined,
          n_sort: Number(numberMatch[1]),
          path: new URL(href, this.site).pathname.substring(1),
        });
      });

      return { chapters: this.buildChapterItems(novelPath, rows) };
    }

    return {
      chapters: [],
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    let loadedCheerio = await this.getCheerio(
      url,
      false,
      PluginError.ChapterNotFound,
    );

    // Chapters may redirect to a mirror (e.g. readnovel.site) that serves a
    // "Loading..." page and forwards via JavaScript. Follow that redirect.
    if (loadedCheerio('#content').length === 0) {
      const redirect = loadedCheerio('script')
        .text()
        .match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
      if (redirect) {
        const target = redirect[1].replace(/\\\//g, '/');
        loadedCheerio = await this.getCheerio(
          target,
          false,
          PluginError.ChapterNotFound,
        );
      }
    }

    const chapterText = loadedCheerio('#content');

    if (chapterText.length === 0) {
      throw createPluginError(PluginError.ChapterNotFound, { url });
    }

    // Some dead chapter URLs answer 200 with a notice inside the content box.
    if (CHAPTER_NOTICE_REGEX.test(chapterText.text())) {
      throw createPluginError(PluginError.ChapterNotFound, { url });
    }

    const odds = chapterText.find(
      ':not(p, h1, span, i, b, u, img, a, div, strong)',
    );
    for (const ele of odds.toArray()) {
      const tag = ele.name.toString();
      if (tag.length > 5 && tag.startsWith('nf')) {
        loadedCheerio(ele).remove();
      }
    }

    // The site injects an a-ads iframe, pubfuture placeholder paragraphs and
    // site-UI links into the body; none of it belongs in the reader.
    chapterText
      .find(
        'script, iframe, object, embed, ins, form, button, .free-support-top, .nf-ads, [id^="pf-"]',
      )
      .remove();
    chapterText.find('a[href^="javascript:"]').each((_, el) => {
      const link = loadedCheerio(el);
      // A string is parsed as HTML, so escaped text such as `&lt;skill&gt;`
      // would come back as an element. Its own text nodes are already text.
      link.replaceWith(link.contents());
    });

    const html = chapterText
      .html()
      ?.replace(/&nbsp;/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/<p>\s*<\/p>/gi, '');

    if (!html || html.trim().length === 0) {
      throw createPluginError(PluginError.EmptyContent, { url });
    }

    return html;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    if (page === 1) {
      this.novelList.clear();
      this.draw = 0;
    }
    const params = new URLSearchParams();
    params.append('keyword', searchTerm);
    params.append('page', page.toString());
    const url = `${this.site}search?${params.toString()}`;
    const result = await fetchApi(url);
    checkResponse(result, { search: true });
    const body = await result.text();

    const loadedCheerio = load(body);

    return this.parseNovels(
      loadedCheerio,
      '.novel-list.chapters .novel-item',
      page === 1,
    );
  }
}

// Raised when the source throttles chapter enumeration; the retry loop in
// getAllChaptersForce only retries this error.
class ThrottlingError extends Error {
  constructor(message = 'Source is rate limiting requests') {
    super(message);
    this.name = 'ThrottlingError';
  }
}
