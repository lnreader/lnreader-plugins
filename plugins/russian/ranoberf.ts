import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

const regex =
  /<script id="__NEXT_DATA__" type="application\/json">(\{.*?\})<\/script>/;

class RNRF implements Plugin.PluginBase {
  id = 'RNRF';
  name = 'РанобэРФ';
  site = 'https://ранобэ.рф';
  version = '1.0.1';
  icon = 'src/ru/ranoberf/icon.png';

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/books?order=';
    url += showLatestNovels
      ? 'lastPublishedChapter'
      : filters?.sort?.value || 'popular';
    url += '&page=' + pageNo;

    const body = await fetchApi(url).then(res => res.text());
    const novels: Plugin.NovelItem[] = [];

    const jsonRaw = body.match(regex);
    if (jsonRaw instanceof Array && jsonRaw[1]) {
      const json: response = JSON.parse(jsonRaw[1]);

      json.props.pageProps?.totalData?.items?.forEach(novel =>
        novels.push({
          name: novel.title,
          cover: novel?.verticalImage?.url
            ? this.site + novel.verticalImage.url
            : defaultCover,
          path: '/' + novel.slug,
        }),
      );
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    const jsonRaw = body.match(regex);
    if (jsonRaw instanceof Array && jsonRaw[1]) {
      const book: PagePropsBook = JSON.parse(jsonRaw[1]).props.pageProps.book;

      novel.name = book.title;
      novel.summary = book.description;

      novel.cover = book.verticalImage?.url
        ? this.site + book.verticalImage.url
        : defaultCover;
      novel.status = book?.additionalInfo.includes('Активен')
        ? NovelStatus.Ongoing
        : NovelStatus.Completed;

      if (book.author) novel.author = book.author;
      if (book.genres?.length)
        novel.genres = book?.genres.map(item => item.title).join(',');

      if (book.chapters?.length) {
        const chapters: Plugin.ChapterItem[] = [];
        book.chapters.forEach((chapter, chapterIndex) => {
          if (!chapter.isDonate || chapter.isUserPaid) {
            chapters.push({
              name: chapter.title,
              path: chapter.url,
              releaseTime: dayjs(chapter.publishedAt).format('LLL'),
              chapterNumber: book.chapters.length - chapterIndex,
            });
          }
        });

        novel.chapters = chapters.reverse();
      }
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );

    const jsonRaw = body.match(regex);
    if (jsonRaw instanceof Array && jsonRaw[1]) {
      const chapter: string =
        JSON.parse(jsonRaw[1])?.props?.pageProps?.chapter?.content?.text || '';

      return chapter;
    }

    return '';
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/v3/books?filter[or][0][title][like]=${searchTerm}&filter[or][1][titleEn][like]=${searchTerm}&filter[or][2][fullTitle][like]=${searchTerm}&filter[status][]=active&filter[status][]=abandoned&filter[status][]=completed&expand=verticalImage`;
    const { items }: { items: Item[] } = await fetchApi(url).then(res =>
      res.json(),
    );
    const novels: Plugin.NovelItem[] = [];

    items.forEach(novel =>
      novels.push({
        name: novel.title,
        cover: novel?.verticalImage?.url
          ? this.site + novel.verticalImage.url
          : defaultCover,
        path: '/' + novel.slug,
      }),
    );

    return novels;
  }

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'popular',
      options: [
        { label: 'Рейтинг', value: 'popular' },
        { label: 'Дате добавления', value: 'new' },
        { label: 'Дате обновления', value: 'lastPublishedChapter' },
        { label: 'Законченные', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new RNRF();

type response = {
  props: Props;
  page: string;
  query: Query;
  buildId: string;
  isFallback: boolean;
  gssp: boolean;
  appGip: boolean;
  dynamicIds?: string[];
};

type Props = {
  pageProps: PageProps;
  isMobile: boolean;
  theme: string;
  __N_SSP: boolean;
};

type PageProps = {
  initialReduxState: InitialReduxState;
  book?: PagePropsBook;
  totalData?: TotalData;
  layoutViewCookies?: string;
  displayBanner?: boolean;
  chapter?: PagePropsChapter;
};

type PagePropsBook = {
  id: number;
  countryId: number;
  creatorId: number;
  lastChapterId: number;
  sourceId: number;
  imgVerticalId: number;
  imgHorizontalId: number;
  imgSquareId: number;
  imageVerticalId: number;
  imageHorizontalId: number;
  title: string;
  titleEn: string;
  fullTitle: string;
  fullTitleEn: string;
  description: string;
  slug: string;
  author: string;
  additionalInfo: string;
  importantInfo: string;
  status: string;
  views: number;
  likes: number;
  dislikes: number;
  intervalSec: number;
  intervalForNextFreeChapterSec: number;
  chapterCost: number;
  chapterPrice: number;
  chapterPriceCollected: number;
  maxSubscriptionChapters: number;
  maxDonateChapters: number;
  isDisplayOnMainPage: boolean;
  withoutSchedule: boolean;
  nextFreeChapterPublishedAt: null;
  createdAt: Date;
  updatedAt: Date;
  userRating: null;
  userBookmark: null;
  country: Country;
  genres: Genre[];
  timer: Timer;
  chapters: ChapterElement[];
  verticalImage: Image;
  horizontalImage: Image;
  squareImage: Image;
};

type ChapterElement = {
  id: number;
  bookId: number;
  title: string;
  url: string;
  numberChapter: string;
  tom: number | null;
  chapterShortNumber: number | null;
  isDonate: boolean;
  isSponsored: boolean;
  isSubscription: boolean;
  isEdited: boolean;
  publishedAt: Date;
  price: number;
  views: number;
  isUserPaid?: boolean;
};

type Country = {
  id: number;
  title: string;
  code: string;
};

type Genre = {
  id: number;
  title: string;
  slug: string;
};

type Image = {
  id: number;
  alt: string;
  path: string;
  name: string;
  url: string;
};

type Timer = {
  value: null;
  for: null;
  message: string;
};

type PagePropsChapter = {
  id: number;
  bookId: number;
  editorId: null;
  translatorId: number;
  parserChapterId: null;
  title: string;
  slug: string;
  status: string;
  tom: null;
  views: number;
  isSponsored: boolean;
  isSubscription: boolean;
  isDonate: boolean;
  isIndexing: boolean;
  publishedAt: Date;
  changeAvailabilityAt: null;
  createdAt: Date;
  updatedAt: Date;
  numberChapter: string;
  price: number;
  content: Content;
  book: ChapterBook;
  userBookmark: null;
  isUserPaid: boolean;
  nextChapter: null;
  previousChapter: PreviousChapter;
  corrections: null;
};

type ChapterBook = {
  id: number;
  title: string;
  titleEn: string;
  url: string;
};

type Content = {
  id: number;
  text: string;
  symbolsCount: number;
};

type PreviousChapter = {
  id: number;
  title: string;
  views: number;
  publishedAt: Date;
  url: string;
  numberChapter: string;
};

type InitialReduxState = {
  data?: Data;
  auth: Auth;
  banners?: Banners;
  corrections?: Corrections;
  readerSettings?: ReaderSettings;
};

type Auth = {
  isAuth: boolean;
  user: null;
};

type Banners = {
  displaySale: boolean;
};

type Corrections = {
  items: null;
  data: null;
};

type Data = {
  bookPage: BookPage | null;
  chapterPage: ChapterPage | null;
};

type BookPage = {
  bookId: number;
  bookmark: null;
};

type ChapterPage = {
  chapterId: number;
  bookId: number;
  bookmark: null;
};

type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  textIndent: number;
  sidebarHide: number;
  textAlign: string;
};

type TotalData = {
  items: Item[];
  _links: Links;
  pagesData: PagesData;
};

type Links = {
  self: First;
  first: First;
  last: First;
  next: First;
};

type First = {
  href: string;
};

type Item = {
  id: number;
  title: string;
  description: string;
  slug: string;
  url: string;
  status: string;
  dislikes: number;
  likes: number;
  userRating: null;
  lastChapter: ChapterElement;
  verticalImage: Image;
  horizontalImage: Image;
  squareImage: Image;
};

type PagesData = {
  totalCount: number;
  pageCount: number;
  currentPage: number;
  perPage: number;
};

type Query = {
  book?: string;
  chapter?: string;
};
