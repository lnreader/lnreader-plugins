import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

class NovelHi implements Plugin.PluginBase {
  id = 'novelhi';
  name = 'NovelHi';
  icon = 'src/en/novelhi/icon.png';
  site = 'https://novelhi.com/';
  version = '1.0.0';

  // flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  // Cache for storing extended metadata from the list API | ie: copypasta from readfrom.ts
  loadedNovelCache: CachedNovel[] = [];

  parseNovels(novels: NovelData[]): CachedNovel[] {
    const ret: CachedNovel[] = novels.map(item => ({
      name: item.bookName,
      path: `s/${item.simpleName}`,
      cover: item.picUrl || defaultCover,
      summary: item.bookDesc,
      author: item.authorName,
      status: item.bookStatus,
      genres: item.genres.map(g => g.genreName).join(', '),
    }));

    // Manage cache size
    this.loadedNovelCache.push(...ret);
    if (this.loadedNovelCache.length > 100) {
      this.loadedNovelCache = this.loadedNovelCache.slice(-100);
    }

    return ret;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();

    params.append('curr', `${pageNo}`);
    params.append('limit', '10');
    params.append('keyword', '');

    const jsonUrl = `${this.site}book/searchByPageInShelf?` + params.toString();
    const response = await fetchApi(jsonUrl);
    const json: ApiResponse = await response.json();

    return this.parseNovels(json.data.list);
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
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();

    params.append('curr', `${pageNo}`);
    params.append('limit', '10');
    params.append('keyword', `${searchTerm}`);

    const jsonUrl = `${this.site}book/searchByPageInShelf?` + params.toString();
    const response = await fetchApi(jsonUrl);
    const json: ApiResponse = await response.json();

    return this.parseNovels(json.data.list);
  }
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
