import { fetchFile, fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

export interface HotNovelPubMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
  options?: HotNovelPubOptions;
}

interface HotNovelPubOptions {
  lang?: string;
}

class HotNovelPubPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  apiSite: string;
  version: string;
  filters?: Filters;
  lang: string;

  constructor(metadata: HotNovelPubMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/hotnovelpub/icons/${metadata.id}.png`;
    this.site = metadata.sourceSite;
    this.apiSite = metadata.sourceSite.replace('://', '://api.');
    this.version = '1.0.0';
    this.filters = metadata.filters;
    this.lang = metadata.options?.lang || 'en';
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.apiSite + '/books/';
    url += showLatestNovels ? 'new' : filters?.sort?.value || 'hot';
    if (filters?.category?.value) {
      url = this.apiSite + '/category/' + filters.category.value;
    }

    url += '/?page=' + (pageNo - 1) + '&limit=20';

    const result = await fetchApi(url, {
      headers: {
        lang: this.lang,
      },
    });
    const json = (await result.json()) as responseNovels;
    const novels: Plugin.NovelItem[] = [];

    if (json.status && json.data.books.data?.length) {
      json.data.books.data.forEach(novel =>
        novels.push({
          name: novel.name,
          cover: this.site + novel.image,
          path: '/' + novel.slug,
        }),
      );
    }
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.apiSite + '/book' + novelPath, {
      headers: {
        lang: this.lang,
      },
    });
    const json = (await result.json()) as responseNovel;

    const novel: Plugin.SourceNovel = {
      name: json.data.book.name,
      path: novelPath,
      cover: this.site + json.data.book.image,
      summary: json.data.book.authorize.description,
      author: json.data.book.authorize.name,
      status:
        json.data.book.status === 'updating'
          ? NovelStatus.Ongoing
          : NovelStatus.Completed,
    };

    if (json.data.tags.tags_name?.length) {
      novel.genres = json.data.tags.tags_name.join(',');
    }

    if (json.data.chapters?.length) {
      const chapters: Plugin.ChapterItem[] = [];
      json.data.chapters.forEach((chapter, chapterIndex) =>
        chapters.push({
          name: chapter.title,
          path: '/' + chapter.slug,
          releaseTime: undefined,
          chapterNumber: (chapter.index || chapterIndex) + 1,
        }),
      );

      novel.chapters = chapters;
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio('#content-item').html() || '';
    if (chapterText) {
      const result = await fetchApi(
        this.site + '/server/getContent?slug=' + chapterPath,
      );
      const json = (await result.json()) as ChapterType;

      if (json.data) {
        chapterText += json.data
          .map(item => '<p>' + item + '</p>')
          .join('')
          .replace(/\n/g, '</p><p>')
          .replace(/\s/g, ' ');
      }
    }
    return chapterText.replace(/\.copy right hot novel pub/g, '');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const result = await fetchApi(this.apiSite + '/search', {
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Referer: this.site,
        Origin: this.site,
        lang: this.lang,
      },
      method: 'POST',
      body: JSON.stringify({ key_search: searchTerm }),
    });
    const json = (await result.json()) as responseSearch;
    const novels: Plugin.NovelItem[] = [];

    if (json.status && json.data.books?.length) {
      json.data.books.forEach(novel =>
        novels.push({
          name: novel.name,
          cover: undefined,
          path: '/' + novel.slug,
        }),
      );
    }

    return novels;
  }

  fetchImage = fetchFile;
}

interface responseNovels {
  status: number;
  message: string;
  data: Data;
}
interface Data {
  category?: Category;
  books: Books;
}
interface Category {
  id: number;
  name: string;
  description: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  countryId: number;
}
interface Books {
  total: number;
  pages_count: number;
  data?: DataEntity[];
}
interface DataEntity {
  id: number;
  name: string;
  view: number;
  status: string;
  image: string;
  slug: string;
  categories?: CategoriesEntity[] | null;
  source?: null;
}
interface CategoriesEntity {
  id: number;
  name: string;
  slug?: string;
}

interface responseNovel {
  status: number;
  message: string;
  data: Data1;
}
interface Data1 {
  book: Book1;
  tags: Tags;
  chapters?: ChaptersEntity[];
}
interface Book1 {
  id: number;
  name: string;
  description: string;
  view: number;
  rate: number;
  status: string;
  image: string;
  createdAt: string;
  chapterCount: number;
  crawlStt: string;
  rateCount: number;
  slug: string;
  categories?: CategoriesEntity[] | null;
  authorize: Authorize;
  updated_at: string;
  source?: null;
  idSource?: null;
  prize?: null;
}
interface Authorize {
  id: number;
  name: string;
  description: string;
  avatar: string;
  slug: string;
}
interface Tags {
  tags_name?: string[] | null;
  tags?: CategoriesEntity[] | null;
}
interface ChaptersEntity {
  id: number;
  title: string;
  slug: string;
  index: number;
}

interface ChapterType {
  type: string;
  data?: string[];
}

interface responseSearch {
  status: number;
  message: string;
  data: Data2;
}
interface Data2 {
  books?: BooksEntity[] | null;
  authorizes?: AuthorizesEntityOrCategoriesEntity[] | null;
  categories?: AuthorizesEntityOrCategoriesEntity[] | null;
}
interface BooksEntity {
  id: number;
  name: string;
  slug: string;
}
interface AuthorizesEntityOrCategoriesEntity {
  id: number;
  name: string;
  slug: string;
}
