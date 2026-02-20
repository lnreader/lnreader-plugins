import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import dayjs from 'dayjs';

type NovelCoolOptions = {
  lang: string;
  langCode: string;
  app: Record<string, string>;
  down?: boolean;
  downSince?: string;
};

export type NovelCoolMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options: NovelCoolOptions;
};

class NovelCoolPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  mainUrl: string;
  version: string;
  options: NovelCoolOptions;
  filters: Filters;

  constructor(metadata: NovelCoolMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.site = metadata.sourceSite;
    this.icon = 'multisrc/novelcool/novelcool/icon.png';
    this.mainUrl = 'https://api.novelcool.com';
    this.version = '1.0.0';
    this.options = metadata.options ?? ({} as NovelCoolOptions);
    this.filters = {
      sortby: {
        label: 'Order by',
        value: 'hot',
        options: [
          { label: 'Hottest', value: 'hot' },
          { label: 'Latest', value: 'latest' },
          { label: 'New Books', value: 'new_book' },
        ],
        type: FilterTypes.Picker,
      },
    };
  }

  async popularNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sortby = showLatestNovels
      ? 'latest'
      : filters?.sortby?.value || 'hot';

    const { list }: { list: Novel[] } = await fetchApi(
      this.mainUrl + '/elite/' + sortby,
      {
        headers: {
          'User-Agent': this.options.app.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'post',
        body: new URLSearchParams({
          appId: this.options.app.appId,
          secret: this.options.app.secret,
          package_name: this.options.app.package_name,
          lc_type: 'novel',
          lang: this.options.langCode,
          page: page.toString(),
          page_size: '20',
        }).toString(),
      },
    ).then(res => res.json());
    const novels: Plugin.NovelItem[] = [];

    list.forEach(novel =>
      novels.push({
        name: novel.name,
        cover: novel.cover,
        path: novel.visit_path + '?id=' + novel.id,
      }),
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const book_id = novelPath.split('?id=')[1];
    const { info }: { info: Novel } = await fetchApi(
      this.mainUrl + '/book/info/',
      {
        headers: {
          'User-Agent': this.options.app.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'post',
        body: new URLSearchParams({
          book_id,
          appId: this.options.app.appId,
          secret: this.options.app.secret,
          package_name: this.options.app.package_name,
          lang: this.options.langCode,
        }).toString(),
      },
    ).then(res => res.json());

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: info.name,
      cover: info.cover,
      genres: info.category_list.join(','),
      summary: info.intro,
      author: info.author,
      artist: info.artist,
      status:
        info.completed === 'YES' ? NovelStatus.Completed : NovelStatus.Ongoing,
      rating: (info.rate_star && parseFloat(info.rate_star)) || undefined,
    };
    const chapters: Plugin.ChapterItem[] = [];

    const { list }: { list: ChapterNext[] } = await fetchApi(
      this.mainUrl + '/chapter/book_list/',
      {
        headers: {
          'User-Agent': this.options.app.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'post',
        body: new URLSearchParams({
          book_id,
          appId: this.options.app.appId,
          secret: this.options.app.secret,
          package_name: this.options.app.package_name,
          lang: this.options.langCode,
        }).toString(),
      },
    ).then(res => res.json());

    list.forEach(chapter => {
      if (!chapter.is_locked) {
        chapters.push({
          name: chapter.title,
          path: chapter.book_id + '/' + chapter.id,
          releaseTime: dayjs(parseInt(chapter.last_modify, 10) * 1000).format(
            'LLL',
          ),
          chapterNumber: parseInt(chapter.order_id, 10),
        });
      }
    });

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [, chapter_id] = chapterPath.split('/');
    const { info }: { info: Chapter } = await fetchApi(
      this.mainUrl + '/chapter/info/',
      {
        headers: {
          'User-Agent': this.options.app.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'post',
        body: new URLSearchParams({
          chapter_id,
          appId: this.options.app.appId,
          secret: this.options.app.secret,
          package_name: this.options.app.package_name,
          lang: this.options.langCode,
        }).toString(),
      },
    ).then(res => res.json());

    return info.content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const { list }: { list: Novel[] } = await fetchApi(
      this.mainUrl + '/book/search/',
      {
        headers: {
          'User-Agent': this.options.app.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'post',
        body: new URLSearchParams({
          appId: this.options.app.appId,
          secret: this.options.app.secret,
          package_name: this.options.app.package_name,
          keyword: searchTerm,
          lc_type: 'novel',
          lang: this.options.langCode,
          page: pageNo.toString(),
          page_size: '20',
        }).toString(),
      },
    ).then(res => res.json());
    const novels: Plugin.NovelItem[] = [];

    list.forEach(novel =>
      novels.push({
        name: novel.name,
        cover: novel.cover,
        path: novel.visit_path + '?id=' + novel.id,
      }),
    );

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/novel/' : '/chapter/') + path.split('?id=')[0];
}

type Novel = {
  id: string;
  lang: string;
  url: string;
  visit_path: string;
  name: string;
  alternative: string;
  publish_year: string;
  warning: string;
  char_index: string;
  author: string;
  artist: string;
  intro: string;
  tags?: string;
  category: string;
  completed: 'YES' | 'NO';
  last_chapter_id: string;
  last_chapter_title: string;
  all_views: string;
  rate_star: string;
  rate_mark: string;
  rate_num: string;
  follow_num: string;
  pic_num: string;
  make_time: Date;
  copy_limit: string;
  copyright: string;
  user_id: string;
  show_it: 'ALLOW';
  type: string;
  elite: string;
  book_id: string;
  is_novel: string;
  is_new: string;
  is_hot: string;
  cover: string;
  og_url?: string;
  no: string;
  last_url?: string;
  category_str: string;
  category_list: string[];
  star_list: any[];
  int_mark: string;
  time: string;
  show_ads: string;
  first_chapter_id?: string;
  first_chapter_type?: number;
  is_following: boolean;
  copyright_limit: boolean;
  share_title?: string;
};

type Chapter = {
  id: string;
  user_id: string;
  vol_id: string;
  lang: string;
  order_id: string;
  book_id: string;
  title: string;
  type: number;
  url: string;
  content: string;
  content_size: string;
  fixed: string;
  group_name: string;
  last_modify: string;
  add_time: Date;
  prev: ChapterNext;
  next: ChapterNext;
  blank: boolean;
  o_url: string;
  is_locked: boolean;
  show_url: boolean;
  is_following: boolean;
  share_title: string;
};

type ChapterNext = {
  id: string;
  book_id: string;
  type: number;
  lang: string;
  vol_id: string;
  order_id: string;
  title: string;
  last_modify: string;
  url: string;
  no: string;
  is_locked: boolean;
  is_new: boolean;
  tf_time: string;
  url_pre?: string;
};
