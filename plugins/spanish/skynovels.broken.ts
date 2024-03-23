import { fetchApi, fetchFile } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class SkyNovels implements Plugin.PluginBase {
  id = 'skynovels.net';
  name = 'SkyNovels';
  site = 'https://www.skynovels.net/';
  version = '1.0.0';
  icon = 'src/es/skynovels/icon.png';
  baseUrl = this.site;

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = 'https://api.skynovels.net/api/novels?&q';

    const result = await fetchApi(url);
    const body = (await result.json()) as response;

    const novels: Plugin.NovelItem[] = [];

    body.novels?.forEach(res => {
      const novelName = res.nvl_title;
      const novelCover =
        'https://api.skynovels.net/api/get-image/' +
        res.image +
        '/novels/false';
      const novelUrl =
        this.baseUrl + 'novelas/' + res.id + '/' + res.nvl_name + '/';

      const novel = { name: novelName, url: novelUrl, cover: novelCover };

      novels.push(novel);
    });

    return novels;
  }
  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const novelId = novelUrl.split('/')[4];
    const url =
      'https://api.skynovels.net/api/novel/' + novelId + '/reading?&q';

    const result = await fetchApi(url);
    const body = (await result.json()) as responseBook;

    const item = body?.novel?.[0];

    let novel: Plugin.SourceNovel = { url: novelUrl };

    novel.name = item?.nvl_title;

    novel.cover =
      'https://api.skynovels.net/api/get-image/' +
      item?.image +
      '/novels/false';

    let genres: string[] = [];
    item?.genres?.forEach(genre => genres.push(genre.genre_name));
    novel.genres = genres.join(',');
    novel.author = item?.nvl_writer;
    novel.summary = item?.nvl_content;
    novel.status = item?.nvl_status;

    let novelChapters: Plugin.ChapterItem[] = [];

    item?.volumes?.forEach(volume => {
      volume?.chapters?.forEach(chapter => {
        const chapterName = chapter.chp_index_title;
        const releaseDate = new Date(chapter.createdAt).toDateString();
        const chapterUrl = novelUrl + chapter.id + '/' + chapter.chp_name;

        const chap = {
          name: chapterName,
          releaseTime: releaseDate,
          url: chapterUrl,
        };

        novelChapters.push(chap);
      });
    });

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    let chapterId: string = chapterUrl.split('/')[6];
    const url = `https://api.skynovels.net/api/novel-chapter/${chapterId}`;

    const result = await fetchApi(url);
    const body = (await result.json()) as responseChapter;

    const item = body?.chapter?.[0];

    let chapterText = item?.chp_content || '404';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    searchTerm = searchTerm.toLowerCase();
    const url = 'https://api.skynovels.net/api/novels?&q';

    const result = await fetchApi(url);
    const body = (await result.json()) as response;

    let results = body?.novels?.filter(novel =>
      novel.nvl_title.toLowerCase().includes(searchTerm),
    );

    const novels: Plugin.NovelItem[] = [];

    results?.forEach(res => {
      const novelName = res.nvl_title;
      const novelCover =
        'https://api.skynovels.net/api/get-image/' +
        res.image +
        '/novels/false';
      const novelUrl =
        this.baseUrl + 'novelas/' + res.id + '/' + res.nvl_name + '/';

      const novel = { name: novelName, url: novelUrl, cover: novelCover };

      novels.push(novel);
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new SkyNovels();

interface response {
  novels?: NovelsEntity[] | null;
}
interface NovelsEntity {
  id: number;
  nvl_author?: number | null;
  nvl_content: string;
  nvl_title: string;
  nvl_acronym?: string | null;
  nvl_status: string;
  nvl_publication_date?: string | null;
  nvl_name: string;
  nvl_recommended: number;
  nvl_writer: string;
  nvl_translator?: string | null;
  nvl_translator_eng?: string | null;
  image: string;
  createdAt: string;
  updatedAt: string;
  nvl_chapters: number;
  nvl_last_update: string;
  nvl_rating?: number | null;
  nvl_ratings_count: number;
  genres?: GenresEntity[] | null;
}
interface GenresEntity {
  id: number;
  genre_name: string;
}

interface responseBook {
  novel?: NovelEntity[] | null;
}
interface NovelEntity {
  id: number;
  nvl_author: number;
  nvl_content: string;
  nvl_title: string;
  nvl_acronym: string;
  nvl_status: string;
  nvl_publication_date: string;
  nvl_name: string;
  nvl_recommended: number;
  nvl_writer: string;
  nvl_translator: string;
  nvl_translator_eng: string;
  image: string;
  createdAt: string;
  updatedAt: string;
  nvl_chapters: number;
  nvl_last_update: string;
  nvl_rating: number;
  bookmarks?: BookmarksEntity[] | null;
  volumes?: VolumesEntity[] | null;
  novel_ratings?: NovelRatingsEntity[] | null;
  collaborators?: CollaboratorsEntity[] | null;
  genres?: GenresEntity[] | null;
}
interface BookmarksEntity {
  id: number;
  user_id: number;
  chp_id: number;
  chp_name: string;
}
interface VolumesEntity {
  vlm_title: string;
  id: number;
  nvl_id: number;
  user_id?: number | null;
  chapters?: ChaptersEntity[] | null;
}
interface ChaptersEntity {
  id: number;
  chp_index_title: string;
  chp_name: string;
  chp_number: number;
  chp_status: string;
  createdAt: string;
}
interface NovelRatingsEntity {
  user_id: number;
  rate_value: number;
  rate_comment: string;
  replys_count: string;
  createdAt: string;
  updatedAt: string;
  id: number;
  user_login: string;
  image?: string | null;
  likes?: (LikesEntity | null)[] | null;
}
interface LikesEntity {
  id: number;
  user_id: number;
  user_login: string;
}
interface CollaboratorsEntity {
  user_id: number;
  user_login: string;
}

interface responseChapter {
  chapter?: ChapterEntity[] | null;
}
interface ChapterEntity {
  id: number;
  chp_author: number;
  chp_translator?: null;
  nvl_id: number;
  vlm_id: number;
  chp_number: number;
  chp_content: string;
  chp_review?: null;
  chp_title?: null;
  chp_index_title: string;
  chp_status: string;
  chp_name: string;
  createdAt: string;
  updatedAt: string;
  nvl_title: string;
  nvl_name: string;
  user_login: string;
  reactions_count: number;
  comments?: null[] | null;
  reactions?: null[] | null;
  total_reactions?: TotalReactionsEntity[] | null;
}
interface TotalReactionsEntity {
  reaction_id: number;
  reaction_name: string;
  reaction_count: number;
}
