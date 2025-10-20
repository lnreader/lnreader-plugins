import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

const regex =
  /<script id="__NEXT_DATA__" type="application\/json">(\{.*?\})<\/script>/;

class Bookriver implements Plugin.PluginBase {
  id = 'bookriver';
  name = 'Bookriver';
  site = 'https://bookriver.ru';
  apiSite = 'https://api.bookriver.ru/api/v1/';
  version = '1.0.1';
  icon = 'src/ru/bookriver/icon.png';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/genre?page=' + pageNo + '&perPage=24&sortingType=';
    url += showLatestNovels
      ? 'last-update'
      : filters?.sort?.value || 'bestseller';

    if (filters?.genres?.value?.length) {
      url += '&g=' + filters.genres.value.join(',');
    }

    const result = await fetchApi(url).then(res => res.text());
    const novels: Plugin.NovelItem[] = [];

    const jsonRaw = result.match(regex);
    if (jsonRaw instanceof Array && jsonRaw[1]) {
      const json: response = JSON.parse(jsonRaw[1]);

      json.props.pageProps.state.pagesFilter?.genre?.books?.forEach(novel =>
        novels.push({
          name: novel.name,
          cover: novel.coverImages[0].url,
          path: novel.slug,
        }),
      );
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    const jsonRaw = result.match(regex);
    if (jsonRaw instanceof Array && jsonRaw[1]) {
      const book: BooksEntity = JSON.parse(jsonRaw[1]).props.pageProps.state
        .book.bookPage;

      novel.name = book.name || '';
      novel.cover = book.coverImages[0].url;
      novel.summary = book.annotation;
      novel.author = book.author?.name;

      novel.status =
        book?.statusComplete === 'writing'
          ? NovelStatus.Ongoing
          : NovelStatus.Completed;

      if (book.tags?.length)
        novel.genres = book.tags?.map(tag => tag.name).join(',');

      if (book?.ebook?.chapters?.length) {
        const chapters: Plugin.ChapterItem[] = [];

        book.ebook.chapters.forEach((chapter, chapterIndex) => {
          if (chapter.available) {
            chapters.push({
              name: chapter.name,
              path: novelPath + '/' + chapter.chapterId,
              releaseTime: dayjs(
                chapter.firstPublishedAt || chapter.createdAt || undefined,
              ).format('LLL'),
              chapterNumber: chapterIndex + 1,
            });
          }
        });

        novel.chapters = chapters;
      }
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.apiSite + 'books/chapter/text/';
    const { data }: responseChapter = await fetchApi(
      url + chapterPath.split('/').pop(),
    ).then(res => res.json());

    let chapterText = data.content || 'Конец произведения';
    if (data?.audio?.available) {
      chapterText += '\n' + data.audio.url;
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.apiSite +
      'search/autocomplete?keyword=' +
      searchTerm +
      '&page=' +
      pageNo +
      '&perPage=10';
    const { data }: responseSearch = await fetchApi(url).then(res =>
      res.json(),
    );

    const novels: Plugin.NovelItem[] = [];
    data?.books?.forEach(novel =>
      novels.push({
        name: novel.name,
        cover: novel.coverImages[0].url,
        path: novel.slug,
      }),
    );

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/book/' : '/reader/') + path;

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'bestseller',
      options: [
        { label: 'Бестселлеры', value: 'bestseller' },
        { label: 'Дате добавления', value: 'newest' },
        { label: 'Дате обновления', value: 'last-update' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'жанры',
      value: [],
      options: [
        { label: 'Альтернативная история', value: 'alternativnaya-istoriya' },
        { label: 'Боевая фантастика', value: 'boevaya-fantastika' },
        { label: 'Боевое фэнтези', value: 'boevoe-fentezi' },
        { label: 'Бытовое фэнтези', value: 'bytovoe-fentezi' },
        { label: 'Героическая фантастика', value: 'geroicheskaya-fantastika' },
        { label: 'Героическое фэнтези', value: 'geroicheskoe-fentezi' },
        { label: 'Городское фэнтези', value: 'gorodskoe-fentezi' },
        { label: 'Детектив', value: 'detektiv' },
        { label: 'Детективная фантастика', value: 'detektivnaya-fantastika' },
        { label: 'Жёсткая эротика', value: 'zhyostkaya-erotika' },
        { label: 'Исторический детектив', value: 'istoricheskii-detektiv' },
        {
          label: 'Исторический любовный роман',
          value: 'istoricheskii-lyubovnyi-roman',
        },
        { label: 'Историческое фэнтези', value: 'istoricheskoe-fentezi' },
        { label: 'Киберпанк', value: 'kiberpank' },
        { label: 'Классический детектив', value: 'klassicheskii-detektiv' },
        { label: 'Короткий любовный роман', value: 'korotkii-lyubovnyi-roman' },
        { label: 'Космическая фантастика', value: 'kosmicheskaya-fantastika' },
        { label: 'Криминальный детектив', value: 'kriminalnyi-detektiv' },
        { label: 'ЛитРПГ', value: 'litrpg' },
        { label: 'Любовная фантастика', value: 'lyubovnaya-fantastika' },
        { label: 'Любовное фэнтези', value: 'lyubovnoe-fentezi' },
        { label: 'Любовный роман', value: 'lyubovnyi-roman' },
        { label: 'Мистика', value: 'mistika' },
        { label: 'Молодежная проза', value: 'molodezhnaya-proza' },
        { label: 'Научная фантастика', value: 'nauchnaya-fantastika' },
        {
          label: 'Остросюжетный любовный роман',
          value: 'ostrosyuzhetnyi-lyubovnyi-roman',
        },
        { label: 'Политический детектив', value: 'politicheskii-detektiv' },
        { label: 'Попаданцы', value: 'popadantsy' },
        { label: 'Постапокалипсис', value: 'postapokalipsis' },
        {
          label: 'Приключенческое фэнтези',
          value: 'priklyuchencheskoe-fentezi',
        },
        { label: 'Романтическая эротика', value: 'romanticheskaya-erotika' },
        { label: 'С элементами эротики', value: 's-elementami-erotiki' },
        { label: 'Славянское фэнтези', value: 'slavyanskoe-fentezi' },
        {
          label: 'Современный любовный роман',
          value: 'sovremennyi-lyubovnyi-roman',
        },
        { label: 'Социальная фантастика', value: 'sotsialnaya-fantastika' },
        { label: 'Тёмное фэнтези', value: 'temnoe-fentezi' },
        { label: 'Фантастика', value: 'fantastika' },
        { label: 'Фэнтези', value: 'fentezi' },
        { label: 'Шпионский детектив', value: 'shpionskii-detektiv' },
        { label: 'Эпическое фэнтези', value: 'epicheskoe-fentezi' },
        { label: 'Эротика', value: 'erotika' },
        { label: 'Эротическая фантастика', value: 'eroticheskaya-fantastika' },
        { label: 'Эротический фанфик', value: 'eroticheskii-fanfik' },
        { label: 'Эротическое фэнтези', value: 'eroticheskoe-fentezi' },
        {
          label: 'Юмористический детектив',
          value: 'yumoristicheskii-detektiv',
        },
        { label: 'Юмористическое фэнтези', value: 'yumoristicheskoe-fentezi' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}
export default new Bookriver();

type response = {
  props: {
    pageProps: {
      state: {
        book?: {
          bookPage: BooksEntity;
        };
        pagesFilter?: {
          genre: {
            books: BooksEntity[];
          };
        };
      };
    };
  };
};

type BooksEntity = {
  name: string;
  coverImages: { url: string }[];
  slug: string;
  annotation?: string;
  author?: {
    name: string;
  };
  tags?: { name: string }[];
  ebook?: {
    chapters: Chapter[];
  };
  statusComplete: string;
};

type Chapter = {
  name: string;
  available: boolean;
  firstPublishedAt?: Date | null;
  createdAt?: Date | null;
  chapterId: number | string;
};

type responseChapter = {
  data: {
    id: number;
    bookId: number;
    name: string;
    content: string;
    symbols: number;
    number: number;
    authorPages: number;
    createdAt: string;
    updatedAt: string;
    firstPublishedAt: string;
    status: string;
    protected: boolean;
    free: boolean;
    audio?: {
      available: boolean;
      url: string;
      duration: number;
    };
    publicationScheduledFor?: null;
  };
};

type responseSearch = {
  data: Data;
  total: number;
};
type Data = {
  books?: BooksEntity[] | null;
};
