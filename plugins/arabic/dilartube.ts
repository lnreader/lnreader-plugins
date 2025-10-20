import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

class dilartube implements Plugin.PluginBase {
  id = 'dilartube';
  name = 'dilar tube';
  version = '1.0.1';
  icon = 'src/ar/dilartube/icon.png';
  site = 'https://golden.rest/';

  parseNovels(data: ApiResponse): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seenTitles = new Set<string>();
    if (data.data && data.data.length > 0) {
      data.data
        .filter(dataItem => dataItem.is_novel)
        .forEach(dataItem => {
          const manga = dataItem;
          if (!seenTitles.has(dataItem.title)) {
            seenTitles.add(manga.title);
            novels.push({
              name: dataItem.title || 'novel',
              path: `mangas/${manga.id}`,
              cover: manga.cover
                ? `${this.site}uploads/manga/cover/${manga.id}/${manga.cover}`
                : defaultCover,
            });
          }
        });
    }
    if (data.releases && data.releases.length > 0) {
      data.releases
        .filter(release => release.manga.is_novel)
        .forEach(release => {
          const manga = release.manga;
          if (!seenTitles.has(manga.title)) {
            seenTitles.add(manga.title);
            novels.push({
              name: manga.title || 'novel',
              path: `mangas/${manga.id}`,
              cover: manga.cover
                ? `${this.site}uploads/manga/cover/${manga.id}/${manga.cover}`
                : defaultCover,
            });
          }
        });
    }
    return novels;
  }

  async popularNovels(
    page: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}api/releases?page=${page}`;
    if (showLatestNovels) {
      link = `${this.site}api/releases?page=${page}`;
    }
    // if (filters) {
    //   if (
    //     Array.isArray(filters.categories.value) &&
    //     filters.categories.value.length > 0
    //   ) {
    //     filters.categories.value.forEach((genre: string) => {
    //       link += `&category=${genre}`;
    //     });
    //   }
    //   if (filters.status.value !== '') {
    //     link += `&status=${filters.status.value}`;
    //   }
    // }
    // link += `?page=${page}`;
    // const body = await fetchApi(link).then(r => r.text());
    const response = await fetchApi(link).then(r => r.json());
    return this.parseNovels(response);
  }

  async parseNovel(novelUrl: string): Promise<Plugin.SourceNovel> {
    const chapterItems: Plugin.ChapterItem[] = [];
    const fullUrl = this.site + 'api/' + novelUrl;
    const chapterUrl = this.site + 'api/' + novelUrl + '/releases';
    const manga = await fetchApi(fullUrl).then(r => r.json());
    const chapters = await fetchApi(chapterUrl).then(r => r.json());
    const mangaData = manga.mangaData;
    const chapterData = chapters.releases;

    const novel: Plugin.SourceNovel = {
      path: novelUrl,
      name: mangaData.arabic_title || 'Untitled',
      author:
        (mangaData.authors.length > 0 ? mangaData.authors[0].name : '') ||
        'Unknown',
      summary: mangaData.summary || '',
      cover: `${this.site}uploads/manga/cover/${mangaData.id}/${mangaData.cover}`,
      chapters: [],
    };
    const translationStatusId: string = mangaData.translation_status;
    const translationText =
      {
        '1': 'مستمره',
        '0': 'منتهية',
        '2': 'متوقفة',
        '3': 'غير مترجمه',
      }[translationStatusId] || 'غير معروف';
    const statusWords = new Set(['مكتمل', 'جديد', 'مستمر']);
    const mainGenres = mangaData.categories
      .map((category: { name: any }) => category.name)
      .join(',');
    novel.genres = `${translationText},${mainGenres}`;

    const statusId: string = mangaData.story_status;
    const statusText =
      {
        '2': 'Ongoing',
        '3': 'Completed',
      }[statusId] || 'Unknown';
    novel.status = statusText;
    chapterData.map((item: ChapterRelease) => {
      chapterItems.push({
        name: item.title,
        releaseTime: new Date(item.created_at).toISOString(),
        path: `${novelUrl}/${mangaData.title.replace(' ', '-')}/${item.chapter}`,
        chapterNumber: item.chapter,
      });
    });
    novel.chapters = chapterItems.reverse();
    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const result = await fetchApi(new URL(chapterUrl, this.site).toString());
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    const jsonData = loadedCheerio('script.js-react-on-rails-component').html();
    const parsedData = JSON.parse(jsonData as string);

    const chapterText = parsedData.readerDataAction.readerData.release.content;
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const formData = new FormData();
    formData.append('query', searchTerm);
    formData.append('includes', '["Manga","Team","Member"]');
    const response = await fetchApi('https://dilar.tube/api/quick_search', {
      method: 'POST',
      body: formData,
    }).then(r => r.json());
    const data: ApiResponse = response[0];
    return this.parseNovels(data);
  }

  // filters = {
  //   types: {
  //   value: [],
  //   label: 'الأنواع',
  //   options: [
  //     { label: 'يابانية', value: '1' }, // Japanese
  //     { label: 'كورية', value: '2' }, // Korean
  //     { label: 'صينية', value: '3' }, // Chinese
  //     { label: 'عربية', value: '4' }, // Arabic
  //     { label: 'كوميك', value: '5' }, // Comic
  //     { label: 'هواة', value: '6' }, // Amateur
  //     { label: 'إندونيسية', value: '7' }, // Indonesian
  //     { label: 'روسية', value: '8' }, // Russian
  //   ],
  //   type: FilterTypes.CheckboxGroup,
  // },

  // status: {
  //   value: '',
  //   label: 'الحالة',
  //   options: [
  //     { label: 'مستمرة', value: '2' }, // Ongoing
  //     { label: 'منتهية', value: '3' }, // Completed
  //   ],
  //   type: FilterTypes.CheckboxGroup,
  // },

  // translation: {
  //   value: [],
  //   label: 'الترجمة',
  //   options: [
  //     { label: 'منتهية', value: '0' }, // Completed
  //     { label: 'مستمرة', value: '1' }, // Ongoing
  //     { label: 'متوقفة', value: '2' }, // Paused
  //     { label: 'غير مترجمة', value: '3' }, // Not Translated
  //   ],
  //   type: FilterTypes.CheckboxGroup,
  // },
  // } satisfies Filters;
}

export default new dilartube();

type Category = {
  id: number;
  name: string;
  icon: string | null;
  manga_id: number;
};

type Type = {
  id: number;
  name: string;
  reading_direction: string;
  title: string;
};

type Manga = {
  id: number;
  title: string;
  summary: string;
  is_novel: boolean;
  is_oneshot: boolean;
  genre_id: number;
  cover: string;
  cover_pos: number;
  rectangle_cover_pos: number;
  banner: string;
  manga_type_id: number;
  reading_direction: string;
  story_status: number;
  translation_status: number;
  vols: number;
  chaps: number;
  reviewed: boolean;
  banned: boolean;
  rating: string;
  rates_count: number;
  commentable: boolean;
  show_comments: boolean;
  deleted_at: string | null;
  delete_reason: string;
  time_stamp: number;
  latest_chapterization_id: number;
  uniq_visitors_count: number;
  publisher_id: number | null;
  publisher_name: string | null;
  discord_url: string | null;
  mobile_exclusive: boolean;
  authors: any[];
  artists: any[];
  categories: Category[];
  type: Type;
};
type Release = {
  id: number;
  manga_id: number;
  created_at: string;
  time_stamp: number;
  views: number;
  encoded: boolean;
  showable: boolean;
  link_control: number;
  support_link: string;
  creator_id: number;
  chapterization_id: number;
  chapter: number;
  volume: number;
  title: string;
  team_id: number;
  team_name: string;
  team_rating: string;
  team_settings: string;
  team_paypal: string | null;
  has_rev_link: boolean;
  manga: Manga;
};
type ApiResponse = {
  releases: Release[];
  data: searchManga[];
};
type MangaCategory = {
  id: number;
  name: string;
  icon: string | null;
  manga_id: number;
};
type AuthorArtist = {
  id: number;
  name: string;
  manga_id: number;
  role: string;
};

type MangaType = {
  id: number;
  name: string;
  reading_direction: string;
  title: string;
};

type MangaData = {
  id: number;
  title: string;
  summary: string;
  is_novel: boolean;
  is_oneshot: boolean;
  genre_id: number;
  cover: string;
  cover_pos: number;
  rectangle_cover_pos: number;
  banner: string;
  manga_type_id: number;
  reading_direction: string;
  story_status: number;
  translation_status: number;
  vols: number;
  chaps: number;
  reviewed: boolean;
  banned: boolean;
  rating: string;
  rates_count: number;
  commentable: boolean;
  show_comments: boolean;
  deleted_at: string | null;
  delete_reason: string | null;
  time_stamp: number;
  latest_chapterization_id: number;
  uniq_visitors_count: number;
  publisher_id: number | null;
  publisher_name: string | null;
  arabic_title: string;
  english: string;
  synonyms: string;
  japanese: string;
  over17: boolean;
  s_date: string;
  e_date: string | null;
  mal: string;
  mangaupdates: string;
  mangadex: string | null;
  anilist: string;
  official_site: string | null;
  manga_fox: string | null;
  wikia: string | null;
  mangarock_oid: string | null;
  comicvine_id: string | null;
  external_source: string | null;
  discord_url: string | null;
  discord_id: string | null;
  anime_start_end: string | null;
  creator_id: number;
  creator_nick: string;
  editor_id: number;
  editor_nick: string;
  mobile_exclusive: boolean;
  authors: AuthorArtist[];
  artists: AuthorArtist[];
  categories: MangaCategory[];
  type: MangaType;
  memberRating: number;
};

type MangaResponse = {
  membersMentioning: any[];
  memberRates: any | null;
  mangaLogs: Record<string, any>;
  mangaData: MangaData;
};
type ChapterRelease = {
  id: number;
  manga_id: number;
  created_at: string; // ISO 8601 date string
  time_stamp: number;
  views: number;
  link_control: number;
  support_link: string;
  init_team: number;
  creator_id: number;
  chapterization_id: number;
  chapterization_time_stamp: number;
  chapter: number;
  volume: number;
  title: string;
  team_id: number;
  team_name: string;
  has_rev_link: boolean;
};
type searchManga = {
  filter: any;
  id: number;
  title: string;
  summary: string;
  is_novel: boolean;
  is_oneshot: boolean;
  genre_id: number;
  cover: string;
  cover_pos: number;
  rectangle_cover_pos: number;
  banner: string;
  manga_type_id: number;
  reading_direction: string;
  story_status: number;
  translation_status: number;
  vols: number;
  chaps: number;
  reviewed: boolean;
  banned: boolean;
  rating: string;
  rates_count: number;
  commentable: boolean;
  show_comments: boolean;
  deleted_at: string | null;
  delete_reason: string;
  time_stamp: number;
  latest_chapterization_id: number;
  uniq_visitors_count: number;
  publisher_id: number | null;
  publisher_name: string | null;
  discord_url: string | null;
  mobile_exclusive: boolean;
  authors: any[];
  artists: any[];
  categories: Category[];
  type: Type;
};
