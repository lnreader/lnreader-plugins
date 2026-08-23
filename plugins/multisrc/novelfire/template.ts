import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';
import { defaultCover } from '@/types/constants';
import { storage } from '@libs/storage';

type NovelFireOptions = {
  lang?: string;
  majorVer?: number;
  minorVer?: number;
  versionIncrement?: number;
};

export type NovelFireMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: NovelFireOptions;
  filters?: Filters;
};

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

  constructor(metadata: NovelFireMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/novelfire/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const majorVer = metadata.options?.majorVer || 1;
    const minorVer = metadata.options?.minorVer || 0;
    const versionIncrement = metadata.options?.versionIncrement || 0;
    this.version = `${majorVer}.${minorVer}.${versionIncrement}`;
    this.options = metadata.options;
    this.filters = metadata.filters satisfies Filters;
  }

  async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok && search != true)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const $ = load(await r.text());

    if ($('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare is blocking requests. Try again later.');
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
      const novelCover = rawSrc
        ? new URL(rawSrc, this.site).href
        : defaultCover;

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

    const url = this.site + 'search-adv';
    const params = new URLSearchParams();

    for (const language of filters?.language?.value || []) {
      params.append('country_id[]', language);
    }
    params.append('ctgcon', filters?.genre_operator?.value || 'and');
    for (const genre of filters?.genres?.value || []) {
      params.append('categories[]', genre);
    }
    params.append('totalchapter', filters?.chapters?.value || '0');
    params.append('ratcon', filters?.rating_operator?.value || 'min');
    params.append('rating', filters?.rating?.value || '0');
    params.append('status', filters?.status?.value || '-1');
    params.append(
      'sort',
      showLatestNovels ? 'date' : filters?.sort?.value || 'rank-top',
    );
    params.append('tagcon', filters?.tagcon?.value || 'and');
    for (const tag of filters?.tags?.value || []) {
      params.append('tags[]', tag);
    }
    for (const tag of filters?.tags_excluded?.value || []) {
      params.append('tags_excluded[]', tag);
    }
    if (filters?.author?.value) {
      params.append('author', filters.author.value);
    }
    params.append('page', pageNo.toString());

    const loadedCheerio = await this.getCheerio(
      `${url}?${params.toString()}`,
      false,
    );

    return this.parseNovels(loadedCheerio, '.novel-item', pageNo === 1);
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
    if (result.status === 429) throw new NovelFireThrottlingError();

    const body = await result.text();
    if (body.includes('You are being rate limited'))
      throw new NovelFireThrottlingError();
    if (body.includes('Page Not Found 404')) throw new NovelFireAjaxNotFound();

    return (JSON.parse(body).data || [])
      .flatMap(
        (idx: { title?: string; slug: string; n_sort: string | number }) => {
          const name = load(idx.title || idx.slug)
            .text()
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
          const num = Number(idx.n_sort);

          return name && !isNaN(num)
            ? [
                {
                  name,
                  path: `${novelPath}/chapter-${num}`,
                  chapterNumber: num,
                },
              ]
            : [];
        },
      )
      .sort(
        (a: Plugin.ChapterItem, b: Plugin.ChapterItem) =>
          (a.chapterNumber || 0) - (b.chapterNumber || 0),
      );
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
          if (err instanceof NovelFireThrottlingError) {
            attempt += 1;
            console.warn(
              `[pages=${firstPage}-${lastPage}] Novel Fire is rate limiting requests. Retry attempt ${attempt + 1} in ${sleepTime} seconds...`,
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
    } else {
      novel.cover = defaultCover;
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

    novel.author = $('.author .property-item > span').text();

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

    const totalChapters = $('.header-stats i.icon-book-open')
      .parent()
      .text()
      .trim();
    const length = this.pageLength ? 100 : -1;
    novel.totalPages =
      length === -1 ? 1 : Math.ceil(parseInt(totalChapters) / length) || 1;
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
      } catch (e) {
        // Fallback to scraping if AJAX fails
      }
    }

    // Fallback only works for multiples of 100
    const length = this.pageLength ? 100 : -1;
    if (length === 100) {
      const url = `${this.site}${novelPath}/chapters?page=${page}`;
      const result = await fetchApi(url);
      const body = await result.text();

      const loadedCheerio = load(body);

      const chapters = loadedCheerio('.chapter-list li')
        .map((_, ele) => {
          const chapterName =
            loadedCheerio(ele).find('a').attr('title') || 'No Title Found';
          const chapterPath = loadedCheerio(ele).find('a').attr('href');

          if (!chapterPath) return null;

          return {
            name: chapterName,
            path: new URL(chapterPath, this.site).pathname.substring(1),
          };
        })
        .get()
        .filter(chapter => chapter !== null) as Plugin.ChapterItem[];

      return {
        chapters,
      };
    }

    return {
      chapters: [],
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const loadedCheerio = await this.getCheerio(url, false);

    const chapterText = loadedCheerio('#content');

    if (chapterText.length === 0) {
      throw new Error(
        `Chapter content container (#content) not found for ${chapterPath} — possible transient fetch issue. Retry`,
      );
    }

    const odds = chapterText.find(
      ':not(p, h1, span, i, b, u, img, a, div, strong)',
    );
    for (const ele of odds.toArray()) {
      const tag = ele.name.toString();
      if (tag.length > 5 && tag.substring(0, 1) == 'nf') {
        loadedCheerio(ele).remove();
      }
    }

    const html = chapterText.html()?.replace(/&nbsp;/g, ' ');

    if (!html || html.trim().length === 0) {
      throw new Error(
        `Chapter content was empty after parsing for ${chapterPath}.`,
      );
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
    const body = await result.text();

    const loadedCheerio = load(body);

    return this.parseNovels(
      loadedCheerio,
      '.novel-list.chapters .novel-item',
      page === 1,
    );
  }
}

// Custom error for when Novel Fire is rate limiting requests
class NovelFireThrottlingError extends Error {
  constructor(message = 'Novel Fire is rate limiting requests') {
    super(message);
    this.name = 'NovelFireError';
  }
}

class NovelFireAjaxNotFound extends Error {
  constructor(message = 'Novel Fire says its Ajax interface is not found') {
    super(message);
    this.name = 'NovelFireAjaxError';
  }
}
