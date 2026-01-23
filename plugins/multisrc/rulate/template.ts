import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

export type RulateMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
  versionIncrements: number;
  key: string;
};

const headers = {
  'User-Agent': 'RuLateApp Android',
  'accept-encoding': 'gzip',
};

class RulatePlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  filters?: Filters | undefined;
  key: string;

  constructor(metadata: RulateMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName + ' (API)';
    this.icon = `multisrc/rulate/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    this.version = '1.0.' + (0 + metadata.versionIncrements);
    this.filters = metadata.filters;
    this.key = metadata.key;
  }

  parseNovels(url: string) {
    return fetchApi(url, { headers })
      .then(res => res.json() as Promise<SearchResponse>)
      .then((data: SearchResponse) => {
        const novels: Plugin.NovelItem[] = [];

        if (data.status === 'success' && data.response?.length) {
          data.response.forEach(novel =>
            novels.push({
              name: novel.t_title || novel.s_title,
              path: novel.id.toString(),
              cover: novel.img,
            }),
          );
        }

        return novels;
      });
  }

  async popularNovels(
    page: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/api3/searchBooks?limit=40&page=' + page;
    url += '&sort=' + (showLatestNovels ? '4' : filters?.sort?.value || '6');

    Object.entries(filters || {}).forEach(([type, { value }]) => {
      if (value instanceof Array && value.length) {
        url += '&' + value.map(val => type + '[]=' + val).join('&');
      }
    });

    url += '&key=' + this.key;
    return this.parseNovels(url);
  }

  async searchNovels(
    searchTerm: string,
    page: number = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api3/searchBooks?t=${encodeURIComponent(
      searchTerm,
    )}&limit=40&page=${page}&key=${this.key}`;
    return this.parseNovels(url);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const book = await fetchApi(
      this.site + '/api3/book?book_id=' + novelPath + '&key=' + this.key,
      { headers },
    ).then(res => res.json() as Promise<BookResponse>);

    const novel: Plugin.SourceNovel = {
      name: book.response.t_title || book.response.s_title,
      path: novelPath,
      cover: book.response.img,
      genres: [book.response.genres, book.response.tags]
        .flatMap(c => c?.map?.((g: any) => g.title || g.name))
        .join(','),
      summary: book.response.description,
      author: book.response.author,
      status:
        book.response.status === 'Завершён'
          ? NovelStatus.Completed
          : NovelStatus.Ongoing,
      rating:
        book.response.rate && book.response.rate.count > 0
          ? Number(
              (book.response.rate.sum / book.response.rate.count).toFixed(2),
            )
          : undefined,
    };

    const chaptersData = await fetchApi(
      this.site +
        '/api3/bookChapters?book_id=' +
        novelPath +
        '&key=' +
        this.key,
      { headers },
    ).then(res => res.json() as Promise<ChaptersResponse>);

    const chapters: Plugin.ChapterItem[] = [];

    if (chaptersData.response && Array.isArray(chaptersData.response)) {
      chaptersData.response.forEach(chapter => {
        if (chapter.can_read && chapter.subscription === 0) {
          chapters.push({
            name: chapter.title + (chapter.illustrated ? ' 🖼️' : ''),
            path: novelPath + '/' + chapter.id,
            releaseTime: dayjs(chapter.cdate * 1000).format('LLL'),
            chapterNumber: chapter.ord,
          });
        }
      });
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [book, chapter] = chapterPath.split('/');
    const body = await fetchApi(
      this.site +
        '/api3/chapter?book_id=' +
        book +
        '&chapter_id=' +
        chapter +
        '&key=' +
        this.key,
      { headers },
    ).then(res => res.json() as Promise<ChapterTextResponse>);

    return body.response.text;
  }
  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/book/' + path + (isNovel ? '/' : '/ready_new');
}

interface SearchResponse {
  status: string;
  response: {
    t_title?: string;
    s_title: string;
    id: number;
    img: string;
  }[];
}

interface BookResponse {
  response: {
    t_title?: string;
    s_title: string;
    img: string;
    cat?: { title: string }[];
    genres?: { title: string }[];
    tags?: { name: string }[];
    description: string;
    author: string;
    status: string;
    rate?: { sum: number; count: number };
  };
}

interface ChaptersResponse {
  response: {
    title: string;
    id: number;
    ord: number;
    cdate: number;
    subscription: number;
    can_read: boolean;
    illustrated?: boolean;
  }[];
}

interface ChapterTextResponse {
  response: {
    text: string;
  };
}
