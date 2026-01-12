import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

class RV implements Plugin.PluginBase {
  id = 'RV';
  name = 'Ruvers';
  site = 'https://ruvers.ru/';
  version = '1.0.0';
  icon = 'src/ru/ruvers/icon.png';

  async fetchNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
    searchTerm?: string,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + 'api/books?page=' + page;
    url += '&sort=' + (filters?.sort?.value || '-rating');

    if (searchTerm) url += '&search=' + searchTerm;

    const { data }: { data: book[] } = await fetchApi(url).then(res =>
      res.json(),
    );
    const novels: Plugin.NovelItem[] = [];

    data.forEach(novel =>
      novels.push({
        name: novel.name,
        cover: novel.images[0] ? this.site + novel.images[0] : defaultCover,
        path: novel.slug,
      }),
    );

    return novels;
  }

  popularNovels = this.fetchNovels;

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const defaultOptions: any = { filters: {} };
    return this.fetchNovels(page, defaultOptions, searchTerm);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('div.name > h1').text().trim(),
      cover: loadedCheerio('.slider_prods_single > img').attr('src'),
      summary: loadedCheerio('.book_description').text().trim(),
      genres: loadedCheerio('.genres > a')
        .map((index, element) => loadedCheerio(element).text()?.trim())
        .get()
        .join(','),
      status: loadedCheerio('.status_row > div:nth-child(1) > a')
        .text()
        .includes('В работе')
        ? NovelStatus.Ongoing
        : NovelStatus.Completed,
    };

    const bookId = loadedCheerio('comments-list').attr('commentable-id');

    const chaptersJSON: { data: chapters[] } = await fetchApi(
      this.site + 'api/books/' + bookId + '/chapters/all',
    ).then(res => res.json());

    if (chaptersJSON.data.length) {
      const chapters: Plugin.ChapterItem[] = [];
      chaptersJSON.data.forEach((chapter, chapterIndex) => {
        if (
          chapter.is_published &&
          (chapter.is_free || chapter.purchased_by_user)
        ) {
          chapters.push({
            name: 'Глава ' + chapter.number + ' ' + (chapter.name || ''),
            path: novelPath + '/' + chapter.id,
            releaseTime: dayjs(chapter.created_at).format('LLL'),
            chapterNumber: chapterIndex + 1,
          });
        }
      });

      novel.chapters = chapters;
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const encrypted = body.match(
      /(mobile-books|books)-chapters-text-component.*:text='"(.*?)"'/s,
    )?.[2];
    if (!encrypted) throw new Error('No chapter found');

    return unicodeToUtf8(encrypted);
  }

  filters = {
    sort: {
      label: 'Сортировка',
      value: '-rating',
      options: [
        { label: 'По названию', value: 'name' },
        { label: 'По дате добавления', value: '-created_at' },
        { label: 'По рейтингу', value: '-rating' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new RV();

type book = {
  id: number;
  name: string;
  original_name: string;
  description: string;
  publishing_house?: string | null;
  country: string;
  original_author: string;
  images: string[];
  price?: number | null;
  is_verified: boolean;
  rating: number;
  type: string;
  release_year: number;
  tags?: string[] | null;
  isbn?: null;
  alternative_title?: string | null;
  count_chapters: number;
  chapter_open_days?: number | null;
  age_category_id: number;
  status_id: number;
  writer_id: number;
  created_at: string;
  updated_at: string;
  slug: string;
  chapters_count: number;
};

type chapters = {
  id: number;
  name: string;
  number: string;
  price?: string | null;
  open_by_timer: boolean;
  order: number;
  opened_at?: string | null;
  rating?: null;
  book_id: number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  first_published_at: string;
  full_name: string;
  is_free: boolean;
  is_new: boolean;
  purchased_by_user: boolean;
  book_slug: string;
};

function unicodeToUtf8(unicode: string) {
  return unicode.replace(/\\u([\d\w]{4})/gi, (match, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}
