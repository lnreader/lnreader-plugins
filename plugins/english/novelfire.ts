import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelFire implements Plugin.PluginBase {
  id = 'novelfire';
  name = 'Novel Fire';
  version = '1.0.4';
  icon = 'src/en/novelfire/icon.png';
  site = 'https://novelfire.net/';

  async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok && search != true)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const $ = load(await r.text());

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
          loadedCheerio(ele).find('.novel-title > a').attr('title') ||
          'No Title Found';
        const novelCover = loadedCheerio(ele)
          .find('.novel-cover > img')
          .attr('data-src');
        const novelPath = loadedCheerio(ele)
          .find('.novel-title > a')
          .attr('href');

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

  async parseChapters(
    novelPath: string,
    pages: number,
  ): Promise<Plugin.ChapterItem[]> {
    const pagesArray = Array.from({ length: pages }, (_, i) => i + 1);
    const allChapters: Plugin.ChapterItem[] = [];

    // Function to parse a single page
    const parsePage = async (page: number) => {
      const url = `${this.site}${novelPath}/chapters?page=${page}`;
      const result = await fetchApi(url);
      const body = await result.text();

      const loadedCheerio = load(body);

      if (loadedCheerio.text().includes('You are being rate limited')) {
        throw new NovelFireThrottlingError();
      }

      const chapters = loadedCheerio('.chapter-list li')
        .map((index, ele) => {
          const chapterName =
            loadedCheerio(ele).find('a').attr('title') || 'No Title Found';
          const chapterPath = loadedCheerio(ele).find('a').attr('href');

          if (!chapterPath) return null;

          return {
            name: chapterName,
            path: chapterPath.replace(this.site, ''),
          };
        })
        .get()
        .filter(chapter => chapter !== null) as Plugin.ChapterItem[];

      return chapters;
    };

    // When pages > ~30, we get rate limited. To mitigate, split into chunks and retry chunk on rate limit with delay.
    const chunkSize = 5; // 5 pages per chunk was tested to be a good balance between speed and rate limiting.
    const retryCount = 10;
    const sleepTime = 3.5; // Rate limit seems to be around ~10s, so usually 3 retries should be enough for another ~30 pages.

    const chaptersArray: Plugin.ChapterItem[][] = [];

    for (let i = 0; i < pagesArray.length; i += chunkSize) {
      const pagesArrayChunk = pagesArray.slice(i, i + chunkSize);

      const firstPage = pagesArrayChunk[0];
      const lastPage = pagesArrayChunk[pagesArrayChunk.length - 1];

      let attempt = 0;

      while (attempt < retryCount) {
        try {
          // Parse all pages in chunk in parallel
          const chaptersArrayChunk = await Promise.all(
            pagesArrayChunk.map(parsePage),
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
    for (const chapters of chaptersArray) {
      allChapters.push(...chapters);
    }

    return allChapters.length === 0 ? [] : allChapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath, false);
    const baseUrl = this.site;

    const novel: Partial<Plugin.SourceNovel> = {
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

    novel.author =
      $('.author .property-item > span').text() || 'No Author Found';

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

    const totalChapters = $('.header-stats .icon-book-open')
      .parent()
      .text()
      .trim();
    const pages = Math.ceil(parseInt(totalChapters) / 100);
    novel.chapters = await this.parseChapters(novelPath, pages);

    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = load(body);

    const bloatElements = [
      '.box-ads',
      '.box-notification',
      /^nf/, // Regular expression to match tags starting with 'nf'
    ];
    bloatElements.forEach(tag => {
      if (tag instanceof RegExp) {
        loadedCheerio('*')
          .filter((_, el) =>
            tag.test(loadedCheerio(el).prop('tagName')!.toLowerCase()),
          )
          .remove();
      } else {
        loadedCheerio(tag).remove();
      }
    });

    return loadedCheerio('#content').html()!;
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
        { label: 'Bookmark Count (Most)', value: 'bookmark' },
        { label: 'Review Count (Most)', value: 'review' },
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
      label: 'Genres (And/Or)',
      value: 'and',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
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
