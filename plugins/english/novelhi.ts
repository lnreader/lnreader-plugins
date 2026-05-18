import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { Filters, FilterTypes } from '@/types/filters';

class NovelHi implements Plugin.PluginBase {
  id = 'novelhi';
  name = 'NovelHi';
  icon = 'src/en/novelhi/icon.png';
  site = 'https://novelhi.com/';
  version = '1.1.0';

  // flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  // Cache for storing extended metadata from the list API | ie: copypasta from readfrom.ts
  loadedNovelCache: CachedNovel[] = [];

  private async getNovels(
    pageNo: number,
    keyword = '',
    filters?: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
  ): Promise<CachedNovel[]> {
    const params = new URLSearchParams({
      curr: pageNo.toString(),
      limit: '10',
      keyword,
      ...(filters?.genres.value && { 'bookGenres[]': filters.genres.value }),
      ...(filters?.order.value && { bookStatus: filters.order.value }),
      ...(filters?.time.value && { updatePeriod: filters.time.value }),
    });

    const url = `${this.site}book/searchByPageInShelf?${params}`;
    const response = await fetchApi(url);
    const json: ApiResponse = await response.json();

    const novels: CachedNovel[] = json.data.list.map(item => ({
      name: item.bookName,
      path: `s/${item.simpleName}`,
      cover: item.picUrl || defaultCover,
      summary: item.bookDesc,
      author: item.authorName,
      status: item.bookStatus,
      genres: item.genres.map(g => g.genreName).join(', '),
    }));

    this.loadedNovelCache.push(...novels);
    if (this.loadedNovelCache.length > 100) {
      this.loadedNovelCache = this.loadedNovelCache.slice(-100);
    }

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<CachedNovel[]> {
    return this.getNovels(pageNo, '', filters);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const data = await fetchApi(this.site + novelPath);
    const text = await data.text();
    const loadedCheerio = parseHTML(text);

    const translate = loadedCheerio('#translate <').html();
    if (translate) {
      console.error('This Novel has been removed and is no longer available');
      throw Error('This Novel has been removed and is no longer available');
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('meta[name=keywords]').attr('content') || 'Untitled',
      cover: loadedCheerio('.cover,.decorate-img').attr('src') || defaultCover,
    };

    let moreNovelInfo = this.loadedNovelCache.find(n => n.path === novelPath);

    if (!moreNovelInfo) {
      moreNovelInfo = (await this.searchNovels(novel.name, 1)).find(
        novel => novel.path === novelPath,
      );
    }
    if (moreNovelInfo) {
      novel.genres = moreNovelInfo.genres;
      novel.author = moreNovelInfo.author;
      novel.status =
        moreNovelInfo.status === '1'
          ? NovelStatus.Completed
          : NovelStatus.Ongoing;
      const summary = moreNovelInfo.summary.replace(/<br\s*\/?>/gi, '\n');
      novel.summary = parseHTML(summary).text().trim();
    }

    const chapters: Plugin.ChapterItem[] = [];
    const bookId = loadedCheerio('#bookId').attr('value');
    if (bookId && !translate) {
      const params = new URLSearchParams();
      params.append('bookId', bookId);
      params.append('curr', '1');
      params.append('limit', '42121');

      const url = `${this.site}book/queryIndexList?` + params.toString();
      const res = await fetchApi(url);
      const resJson: ApiChapter = await res.json();

      resJson?.data?.list?.forEach(chapter =>
        chapters.push({
          name: chapter.indexName,
          path: novelPath + '/' + chapter.indexNum,
          releaseTime: chapter.createTime,
        }),
      );
    }

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const result = await fetchApi(url).then(res => res.text());

    const loadedCheerio = parseHTML(result);
    loadedCheerio('#showReading script,ins').remove();
    const chapterText = loadedCheerio('#showReading').html();
    if (!chapterText) {
      return loadedCheerio('#translate <').html() || '';
    }
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<CachedNovel[]> {
    return this.getNovels(pageNo, searchTerm);
  }

  filters = {
    genres: {
      label: 'Genres',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: '0' },
        { label: 'Completed', value: '1' },
      ],
      type: FilterTypes.Picker,
    },
    time: {
      label: 'Update Period',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: '3 Days', value: '3' },
        { label: '7 Days', value: '7' },
        { label: '15 Days', value: '15' },
        { label: '30 Days', value: '30' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelHi();

type CachedNovel = Plugin.NovelItem & {
  summary: string;
  genres: string;
  author: string;
  status: string;
};

type NovelData = {
  id: string;
  bookName: string;
  picUrl: string;
  simpleName: string;
  authorName: string;
  bookDesc: string;
  bookStatus: string;
  lastIndexName: string;
  genres: {
    genreId: string;
    genreName: string;
  }[];
};

type ChapterData = {
  id: string;
  bookId: string;
  indexNum: string;
  indexName: string;
  createTime: string;
};

type ApiResponse = {
  code: string;
  msg: string;
  data: {
    pageNum: string;
    pageSize: string;
    total: string;
    list: NovelData[];
  };
};

type ApiChapter = {
  code: string;
  msg: string;
  data: {
    pageNum: string;
    pageSize: string;
    total: string;
    list: ChapterData[];
  };
};
