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
  version = '1.1.3';
  icon = 'src/en/novelfire/icon.png';
  site = 'https://novelfire.net/';

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

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + 'search-adv';
    if (showLatestNovels) {
      url += `?ctgcon=and&totalchapter=0&ratcon=min&rating=0&status=-1&sort=date&tagcon=and&page=${pageNo}`;
    } else if (filters) {
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
      params.append('sort', filters.sort.value);
      params.append('page', pageNo.toString());
      url += `?${params.toString()}`;
    } else {
      url += `?ctgcon=and&totalchapter=0&ratcon=min&rating=0&status=-1&sort=rank-top&page=${pageNo}`;
    }

    const loadedCheerio = await this.getCheerio(url, false);

    return loadedCheerio('.novel-item')
      .map((index, ele) => {
        const novelName =
          loadedCheerio(ele).find('.novel-title > a').text() ||
          'No Title Found';
        const novelCover = loadedCheerio(ele)
          .find('.novel-cover > img')
          .attr('data-src');
        const novelPath = loadedCheerio(ele)
          .find('.novel-title > a')
          .attr('href');

        if (!novelPath) return;

        return {
          name: novelName,
          cover: novelCover,
          path: novelPath.replace(this.site, ''),
        };
      })
      .get()
      .filter(novel => novel !== null);
  }

  async getAllChapters(
    novelPath: string,
    post_id: string,
  ): Promise<Plugin.ChapterItem[]> {
    const allChapters: Plugin.ChapterItem[] = [];

    const url = `${this.site}listChapterDataAjax?post_id=${post_id}`;
    const result = await fetchApi(url);
    const body = await result.text();

    if (body.includes('You are being rate limited')) {
      throw new NovelFireThrottlingError();
    }

    if (body.includes('Page Not Found 404')) {
      throw new NovelFireAjaxNotFound();
    }

    const json = JSON.parse(body);
    const chapters = json.data
      .map(index => {
        const chapterName = index.title || index.slug;
        const chapterPath = `${novelPath}/chapter-${index.n_sort}`;

        if (!chapterPath) return null;

        return {
          name: chapterName,
          path: chapterPath,
        };
      })
      .filter(chapter => chapter !== null) as Plugin.ChapterItem[];

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath, false);
    const baseUrl = this.site;

    let post_id = '0';

    const novel: Partial<Plugin.SourceNovel & { totalPages: number }> = {
      path: novelPath,
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

    let summary = $('.summary .content').text().trim();

    if (summary) {
      summary = summary.replace('Show More', '');
      novel.summary = summary;
    } else {
      novel.summary = 'No Summary Found';
    }

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

    post_id = $('#novel-report').attr('report-post_id') || '0';

    novel.chapters = await this.getAllChapters(novelPath, post_id);

    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const loadedCheerio = await this.getCheerio(url, false);

    const chapterText = loadedCheerio('#content');

    loadedCheerio(chapterText).find('div').remove();

    return chapterText.html()?.replace(/&nbsp;/g, ' ') || '';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search?keyword=${encodeURIComponent(searchTerm)}&page=${page}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = load(body);

    return loadedCheerio('.novel-list.chapters .novel-item')
      .map((index, ele) => {
        const novelName =
          loadedCheerio(ele).find('a').attr('title') || 'No Title Found';
        const novelCover = loadedCheerio(ele)
          .find('.novel-cover > img')
          .attr('src');
        const novelPath = loadedCheerio(ele).find('a').attr('href');

        if (!novelPath) return null;

        return {
          name: novelName,
          cover: novelCover,
          path: novelPath.replace(this.site, ''),
        };
      })
      .get()
      .filter(novel => novel !== null);
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
