import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class SkyNovels implements Plugin.PluginBase {
  id = 'skynovels';
  name = 'SkyNovels';
  site = 'https://www.skynovels.net/';
  apiSite = 'https://api.skynovels.net/api/';
  version = '1.0.1';
  icon = 'src/es/skynovels/icon.png';

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const url = this.apiSite + 'novels?&q';

    const result = await fetchApi(url);
    const body = (await result.json()) as response;

    const novels: Plugin.NovelItem[] = [];

    body.novels?.forEach(res => {
      const name = res.nvl_title;
      const cover = this.apiSite + 'get-image/' + res.image + '/novels/false';
      const path = 'novelas/' + res.id + '/' + res.nvl_name + '/';

      novels.push({ name, cover, path });
    });

    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelId = novelPath.split('/')[1];
    const url = this.apiSite + 'novel/' + novelId + '/reading?&q';

    const result = await fetchApi(url);
    const body = (await result.json()) as responseBook;

    const item = body?.novel?.[0];

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: item?.nvl_title || 'Untitled',
    };

    novel.cover = this.apiSite + 'get-image/' + item?.image + '/novels/false';

    const genres: string[] = [];
    item?.genres?.forEach(genre => genres.push(genre.genre_name));
    novel.genres = genres.join(',');
    novel.author = item?.nvl_writer;
    novel.summary = item?.nvl_content;
    novel.status = item?.nvl_status;

    const novelChapters: Plugin.ChapterItem[] = [];

    item?.volumes?.forEach(volume => {
      volume?.chapters?.forEach(chapter => {
        const chapterName = chapter.chp_index_title;
        const releaseDate = new Date(chapter.createdAt).toDateString();
        const chapterPath = novelPath + chapter.id + '/' + chapter.chp_name;

        novelChapters.push({
          name: chapterName,
          releaseTime: releaseDate,
          path: chapterPath,
        });
      });
    });

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId: string = chapterPath.split('/')[3];
    const url = `${this.apiSite}novel-chapter/${chapterId}`;

    const result = await fetchApi(url);
    const body = (await result.json()) as responseChapter;

    const item = body?.chapter?.[0];

    const chapterText = item?.chp_content || '';

    return chapterText.replace(/\n/g, '<br>');
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    searchTerm = searchTerm.toLowerCase();
    const url = this.apiSite + 'novels?&q';

    const result = await fetchApi(url);
    const body = (await result.json()) as response;

    const results = body?.novels?.filter(novel =>
      novel.nvl_title.toLowerCase().includes(searchTerm),
    );

    const novels: Plugin.NovelItem[] = [];

    results?.forEach(res => {
      const name = res.nvl_title;
      const cover = this.apiSite + 'get-image/' + res.image + '/novels/false';
      const path = 'novelas/' + res.id + '/' + res.nvl_name + '/';

      novels.push({ name, cover, path });
    });

    return novels;
  }
}

export default new SkyNovels();

type response = {
  novels?: NovelsEntity[] | null;
};
type NovelsEntity = {
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
};
type GenresEntity = {
  id: number;
  genre_name: string;
};

type responseBook = {
  novel?: NovelEntity[] | null;
};
type NovelEntity = {
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
};
type BookmarksEntity = {
  id: number;
  user_id: number;
  chp_id: number;
  chp_name: string;
};
type VolumesEntity = {
  vlm_title: string;
  id: number;
  nvl_id: number;
  user_id?: number | null;
  chapters?: ChaptersEntity[] | null;
};
type ChaptersEntity = {
  id: number;
  chp_index_title: string;
  chp_name: string;
  chp_number: number;
  chp_status: string;
  createdAt: string;
};
type NovelRatingsEntity = {
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
};
type LikesEntity = {
  id: number;
  user_id: number;
  user_login: string;
};
type CollaboratorsEntity = {
  user_id: number;
  user_login: string;
};

type responseChapter = {
  chapter?: ChapterEntity[] | null;
};
type ChapterEntity = {
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
};
type TotalReactionsEntity = {
  reaction_id: number;
  reaction_name: string;
  reaction_count: number;
};
