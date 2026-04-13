import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@/types/constants';
import { storage } from '@libs/storage';

class NovelFire implements Plugin.PluginBase {
  id = 'novelfire';
  name = 'Novel Fire';
  version = '1.3.0';
  icon = 'src/en/novelfire/icon.png';
  site = 'https://novelfire.net/';
  webStorageUtilized = true;
  novelList: string[] = [];
  draw = 0;

  pluginSettings = {
    pageLength: {
      value: '-1',
      label: 'Page Mode (Change if Broken)',
      type: 'Select',
      options: [
        { label: '100 (Fallback Mode)', value: '100' },
        { label: '200', value: '200' },
        { label: '500', value: '500' },
        { label: 'All', value: '-1' },
      ],
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
  ): Plugin.NovelItem[] {
    return loadedCheerio(selector)
      .map((_, el) => {
        const $el = loadedCheerio(el);
        const titleElement = $el.find('.novel-title > a');
        const fallbackElement = $el.find('a');

        const novelName =
          titleElement.text() ||
          fallbackElement.attr('title') ||
          'No Title Found';

        const imgElement = $el.find('.novel-cover > img');
        const rawSrc = imgElement.attr('data-src') ?? imgElement.attr('src');
        const novelCover = rawSrc
          ? new URL(rawSrc, this.site).href
          : defaultCover;

        const novelPath =
          titleElement.attr('href') || fallbackElement.attr('href');

        if (!novelPath) return null;

        return {
          name: novelName,
          cover: novelCover,
          path: new URL(novelPath, this.site).pathname.substring(1),
        };
      })
      .get()
      .filter(novel => novel !== null)
      .filter(novel => {
        if (this.novelList.includes(novel.path)) {
          return false;
        } else {
          this.novelList.push(novel.path);
          return true;
        }
      });
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo === 1) {
      this.novelList = [];
      this.draw = 0;
    }
    const url = this.site + 'search-adv';
    const params = new URLSearchParams();

    for (const language of filters.language.value) {
      params.append('country_id[]', language);
    }
    params.append('ctgcon', filters.genre_operator.value);
    for (const genre of filters.genres.value) {
      params.append('categories[]', genre);
    }
    params.append('totalchapter', filters.chapters.value);
    params.append('ratcon', filters.rating_operator.value);
    params.append('rating', filters.rating.value);
    params.append('status', filters.status.value);
    params.append('sort', showLatestNovels ? 'date' : filters.sort.value);
    params.append('tagcon', 'and');
    params.append('page', pageNo.toString());

    const loadedCheerio = await this.getCheerio(
      `${url}?${params.toString()}`,
      false,
    );

    return this.parseNovels(loadedCheerio);
  }

  async getAllChapters(
    novelPath: string,
    post_id: string,
    page: string,
  ): Promise<Plugin.ChapterItem[]> {
    const length = parseInt(this.pageLength) || -1;
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

    if (body.includes('You are being rate limited')) {
      throw new NovelFireThrottlingError();
    }

    if (body.includes('Page Not Found 404')) {
      throw new NovelFireAjaxNotFound();
    }

    const json = JSON.parse(body);
    const chapters = (json.data || [])
      .map((index: { title?: string; slug: string; n_sort: number }) => {
        const chapterName = load(index.title || index.slug).text();
        const chapterPath = `${novelPath}/chapter-${index.n_sort}`;
        const sortNumber = index.n_sort;

        if (!chapterPath) return null;

        return {
          name: chapterName,
          path: chapterPath,
          chapterNumber: Number(sortNumber),
        };
      })
      .filter(
        (chapter: Plugin.ChapterItem | null) => chapter !== null,
      ) as Plugin.ChapterItem[];
    const sortedChapters = chapters.sort(function (a, b) {
      return (a.chapterNumber || 0) - (b.chapterNumber || 0);
    });

    return sortedChapters;
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
      storage.set(`novelfire_postid_${novelPath}`, post_id);
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
      .map((i, el) => $(el).text())
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
    const length = parseInt(this.pageLength) || -1;
    novel.totalPages =
      length === -1 ? 1 : Math.ceil(parseInt(totalChapters) / length) || 1;
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
    const post_id = storage.get(`novelfire_postid_${novelPath}`);

    if (post_id && !isNaN(Number(post_id))) {
      try {
        const chapters = await this.getAllChapters(novelPath, post_id, page);
        return { chapters };
      } catch (e) {
        // Fallback to scraping if AJAX fails
      }
    }

    // Fallback only works for multiples of 100
    const length = parseInt(this.pageLength) || -1;
    if (length === 100) {
      const url = `${this.site}${novelPath}/chapters?page=${page}`;
      const result = await fetchApi(url);
      const body = await result.text();

      const loadedCheerio = load(body);

      const chapters = loadedCheerio('.chapter-list li')
        .map((index, ele) => {
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
    const odds = chapterText.find(
      ':not(p, h1, span, i, b, u, img, a, div, strong)',
    );
    for (const ele of odds.toArray()) {
      const tag = ele.name.toString();
      if (tag.length > 5 && ele.name.toString().substring(0, 1) == 'nf') {
        loadedCheerio(ele).remove();
      }
    }

    return chapterText.html()?.replace(/&nbsp;/g, ' ') || '';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    if (page === 1) {
      this.novelList = [];
      this.draw = 0;
    }
    const params = new URLSearchParams();
    params.append('keyword', searchTerm);
    params.append('page', page.toString());
    const url = `${this.site}search?${params.toString()}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = load(body);

    return this.parseNovels(loadedCheerio, '.novel-list.chapters .novel-item');
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'rank-top',
      options: [
        { label: 'Rank (Top)', value: 'rank-top' },
        { label: 'Rating Score (Top)', value: 'rating-score-top' },
        { label: 'Review Count (Most)', value: 'review' },
        { label: 'Comment Count (Most)', value: 'comment' },
        { label: 'Bookmark Count (Most)', value: 'bookmark' },
        { label: 'Today Views (Most)', value: 'today-view' },
        { label: 'Monthly Views (Most)', value: 'monthly-view' },
        { label: 'Total Views (Most)', value: 'total-view' },
        { label: 'Title (A>Z)', value: 'abc' },
        { label: 'Title (Z>A)', value: 'cba' },
        { label: 'Last Updated (Newest)', value: 'date' },
        { label: 'Chapter Count (Most)', value: 'chapter-count-most' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Translation Status',
      value: '-1',
      options: [
        { label: 'All', value: '-1' },
        { label: 'Completed', value: '1' },
        { label: 'Ongoing', value: '0' },
      ],
      type: FilterTypes.Picker,
    },
    genre_operator: {
      label: 'Genres (And/Or/Exclude)',
      value: 'and',
      options: [
        { label: 'AND', value: 'and' },
        { label: 'OR', value: 'or' },
        { label: 'EXCLUDE', value: 'exclude' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'Action', value: '3' },
        { label: 'Adult', value: '28' },
        { label: 'Adventure', value: '4' },
        { label: 'Anime', value: '46' },
        { label: 'Arts', value: '47' },
        { label: 'Comedy', value: '5' },
        { label: 'Drama', value: '24' },
        { label: 'Eastern', value: '44' },
        { label: 'Ecchi', value: '26' },
        { label: 'Fan-fiction', value: '48' },
        { label: 'Fantasy', value: '6' },
        { label: 'Game', value: '19' },
        { label: 'Gender Bender', value: '25' },
        { label: 'Harem', value: '7' },
        { label: 'Historical', value: '12' },
        { label: 'Horror', value: '37' },
        { label: 'Isekai', value: '49' },
        { label: 'Josei', value: '2' },
        { label: 'Lgbt+', value: '45' },
        { label: 'Magic', value: '50' },
        { label: 'Magical Realism', value: '51' },
        { label: 'Manhua', value: '52' },
        { label: 'Martial Arts', value: '15' },
        { label: 'Mature', value: '8' },
        { label: 'Mecha', value: '34' },
        { label: 'Military', value: '53' },
        { label: 'Modern Life', value: '54' },
        { label: 'Movies', value: '55' },
        { label: 'Mystery', value: '16' },
        { label: 'Other', value: '64' },
        { label: 'Psychological', value: '9' },
        { label: 'Realistic Fiction', value: '56' },
        { label: 'Reincarnation', value: '43' },
        { label: 'Romance', value: '1' },
        { label: 'School Life', value: '21' },
        { label: 'Sci-fi', value: '20' },
        { label: 'Seinen', value: '10' },
        { label: 'Shoujo', value: '38' },
        { label: 'Shoujo Ai', value: '57' },
        { label: 'Shounen', value: '17' },
        { label: 'Shounen Ai', value: '39' },
        { label: 'Slice of Life', value: '13' },
        { label: 'Smut', value: '29' },
        { label: 'Sports', value: '42' },
        { label: 'Supernatural', value: '18' },
        { label: 'System', value: '58' },
        { label: 'Tragedy', value: '32' },
        { label: 'Urban', value: '63' },
        { label: 'Urban Life', value: '59' },
        { label: 'Video Games', value: '60' },
        { label: 'War', value: '61' },
        { label: 'Wuxia', value: '31' },
        { label: 'Xianxia', value: '23' },
        { label: 'Xuanhuan', value: '22' },
        { label: 'Yaoi', value: '14' },
        { label: 'Yuri', value: '62' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    language: {
      label: 'Language',
      value: [],
      options: [
        { label: 'Chinese', value: '1' },
        { label: 'Korean', value: '2' },
        { label: 'Japanese', value: '3' },
        { label: 'English', value: '4' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    rating_operator: {
      label: 'Rating (Min/Max)',
      value: 'min',
      options: [
        { label: 'Min', value: 'min' },
        { label: 'Max', value: 'max' },
      ],
      type: FilterTypes.Picker,
    },
    rating: {
      label: 'Rating',
      value: '0',
      options: [
        { label: 'All', value: '0' },
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
        { label: '5', value: '5' },
      ],
      type: FilterTypes.Picker,
    },
    chapters: {
      label: 'Chapters',
      value: '0',
      options: [
        { label: 'All', value: '0' },
        { label: '<50', value: '1,49' },
        { label: '50-100', value: '50,100' },
        { label: '100-200', value: '100,200' },
        { label: '200-500', value: '200,500' },
        { label: '500-1000', value: '500,1000' },
        { label: '>1000', value: '1001,1000000' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelFire();

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
