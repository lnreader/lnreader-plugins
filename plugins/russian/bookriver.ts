import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

class Bookriver implements Plugin.PluginBase {
  id = 'bookriver';
  name = 'Bookriver';
  site = 'https://bookriver.ru';
  version = '1.0.0';
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
    const loadedCheerio = parseHTML(result);
    const novels: Plugin.NovelItem[] = [];

    const jsonRaw = loadedCheerio('#__NEXT_DATA__').html();
    if (jsonRaw) {
      const json: response = JSON.parse(jsonRaw);
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
    const loadedCheerio = parseHTML(result);

    const jsonRaw = loadedCheerio('#__NEXT_DATA__').html();
    const json: response = JSON.parse(jsonRaw || '{}');
    const book = json.props.pageProps.state.book?.bookPage;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: book?.name || '',
      cover: book?.coverImages[0].url,
      summary: book?.annotation,
      author: book?.author?.name,
      genres: book?.tags?.map(tag => tag.name).join(', '),
      status:
        book?.statusComplete === 'writing'
          ? NovelStatus.Ongoing
          : NovelStatus.Completed,
    };

    const chapters: Plugin.ChapterItem[] = [];
    book?.ebook?.chapters?.forEach((chapter, chapterIndex) => {
      if (chapter.available) {
        chapters.push({
          name: chapter.name,
          path: book?.slug + '/' + chapter.chapterId,
          releaseTime: dayjs(
            chapter.firstPublishedAt || chapter.createdAt || undefined,
          ).format('LLL'),
          chapterNumber: chapterIndex + 1,
        });
      }
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = 'https://api.bookriver.ru/api/v1/books/chapter/text/';
    const result = await fetchApi(url + chapterPath.split('/').pop());
    const json = (await result.json()) as responseChapter;

    let chapterText = json.data.content || 'Конец произведения';
    if (json.data?.audio?.available) {
      chapterText += '\n' + json.data.audio.url;
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      'https://api.bookriver.ru/api/v1/search/autocomplete?keyword=' +
      searchTerm +
      '&page=' +
      pageNo +
      '&perPage=10';
    const result = await fetchApi(url);
    const json = (await result.json()) as responseSearch;

    const novels: Plugin.NovelItem[] = [];
    json.data?.books?.forEach(novel =>
      novels.push({
        name: novel.name,
        cover: novel.coverImages[0].url,
        path: novel.slug,
      }),
    );

    return novels;
  }

  fetchImage = fetchFile;
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

interface response {
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
}

interface BooksEntity {
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
}

interface Chapter {
  name: string;
  available: boolean;
  firstPublishedAt?: Date | null;
  createdAt?: Date | null;
  chapterId: number | string;
}

interface responseChapter {
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
}

interface responseSearch {
  data: Data;
  total: number;
}
interface Data {
  books?: BooksEntity[] | null;
}
