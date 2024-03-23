import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';

const statusKey: { [key: string]: string } = {
  '0': NovelStatus.Unknown,
  '1': NovelStatus.Ongoing,
  '2': NovelStatus.Completed,
  '3': NovelStatus.OnHiatus,
  '4': NovelStatus.Cancelled,
};

class Neobook implements Plugin.PluginBase {
  id = 'neobook';
  name = 'Neobook';
  site = 'https://neobook.org';
  version = '1.0.0';
  icon = 'src/ru/neobook/icon.png';

  async fetchNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
    searchTerm?: string,
  ): Promise<Plugin.NovelItem[]> {
    const formData = new FormData();
    formData.append('version', '4.0');
    formData.append('uid', '0');
    formData.append('utoken', '');
    formData.append('resource', 'general');
    formData.append('action', 'get_bundle');
    formData.append('bundle', 'bundle_books');
    formData.append('target', 'feed');
    formData.append('page', page.toString());
    formData.append('filter_category_id', filters?.category?.value || '0');
    formData.append('filter_completed', '-1');
    formData.append('filter_search', searchTerm || '');
    formData.append('filter_tags', filters?.tags?.value || '');
    formData.append(
      'filter_sort',
      showLatestNovels ? 'new' : filters?.sort?.value || 'popular',
    );
    formData.append('filter_timeread', filters?.timeread?.value || '0-999999');

    const result = await fetchApi('https://api.neobook.org/', {
      method: 'post',
      body: formData,
    });
    const json = (await result.json()) as { bundle_books: BundleBooks };
    const novels: Plugin.NovelItem[] = [];

    if (json.bundle_books.feed?.length) {
      json.bundle_books.feed?.forEach(novel =>
        novels.push({
          name: novel.title,
          cover: novel?.attachment?.image?.m || defaultCover,
          path: novel.token + '/',
        }),
      );
    }

    return novels;
  }

  popularNovels = this.fetchNovels;

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const defaultOptions: any = {
      filters: undefined,
      showLatestNovels: false,
    };
    return this.fetchNovels(page, defaultOptions, searchTerm);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      cover: defaultCover,
    };

    const bookRaw = body.match(/var postData = ({.*?});/);
    if (bookRaw instanceof Array && bookRaw.length >= 2) {
      const book = JSON.parse(bookRaw[1]) as Novels;

      novel.name = book.title;
      novel.summary = book.text?.replace?.(/<br>/g, '\n') || book.text_fix;
      novel.author =
        book.user && book.user.firstname && book.user.lastname
          ? book.user.firstname + ' ' + book.user.lastname
          : book.user?.initials || '';
      novel.status = statusKey[book.status || '0'] || NovelStatus.Unknown;

      if (book.attachment?.image?.m) novel.cover = book.attachment.image.m;
      if (book.tags?.length) novel.genres = book.tags.join(',');

      const chapters: Plugin.ChapterItem[] = [];

      book.chapters?.forEach((chapter, chapterIndex) => {
        if (chapter.access == '1' && chapter.status == '1') {
          chapters.push({
            name: chapter.title || 'Глава ' + (chapterIndex + 1),
            path: `?book=${book.token}&chapter=${chapter.token}`,
            releaseTime: null,
            chapterNumber: Number(chapter.sort) || chapterIndex + 1,
          });
        }
      });

      novel.chapters = chapters;
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.resolveUrl(chapterPath)).then(res =>
      res.text(),
    );

    const bookRaw = body.match(/var data = ({.*?});/);
    let chapterText = '';

    if (bookRaw instanceof Array && bookRaw.length >= 2) {
      const book = JSON.parse(bookRaw[1]) as Novels;
      const token = chapterPath.split('=')[2];
      const chapter = book.chapters?.find?.(chapter => chapter.token == token);
      chapterText = (chapter?.data?.html || '').replace(/<br>/g, '');
    }

    return chapterText;
  }

  fetchImage = fetchFile;
  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/book/' : '/reader/') + path;

  filters = {
    sort: {
      label: 'Сортировка:',
      value: 'popular',
      options: [
        { label: 'Сначала популярные', value: 'popular' },
        { label: 'Сначала новые', value: 'new' },
        { label: 'В случайном порядке', value: 'rand' },
      ],
      type: FilterTypes.Picker,
    },
    timeread: {
      label: 'Время прочтения:',
      value: '0-999999',
      options: [
        { label: 'Все', value: '0-999999' },
        { label: 'Менее 15 минут', value: '0-900' },
        { label: '15-30 минут', value: '900-1800' },
        { label: '30-60 минут', value: '1800-3600' },
        { label: '1-2 часа', value: '3600-7200' },
        { label: 'Более 2 часов', value: '7200-999999' },
      ],
      type: FilterTypes.Picker,
    },
    category: {
      label: 'Жанр:',
      value: '',
      options: [
        { label: 'Все', value: '' },
        { label: 'Антиутопия', value: '10' },
        { label: 'Детектив', value: '13' },
        { label: 'Детские книги', value: '14' },
        { label: 'Драма', value: '15' },
        { label: 'Другое', value: '16' },
        { label: 'История', value: '18' },
        { label: 'Мелодрама', value: '21' },
        { label: 'Мистика', value: '22' },
        { label: 'Научная фантастика', value: '23' },
        { label: 'Нон-фикшн', value: '35' },
        { label: 'Подростки и молодежь', value: '26' },
        { label: 'Постапокалипсис', value: '27' },
        { label: 'Поэзия', value: '28' },
        { label: 'Приключения', value: '29' },
        { label: 'Рассказ', value: '34' },
        { label: 'Роман', value: '36' },
        { label: 'Творчество', value: '40' },
        { label: 'Триллер', value: '91' },
        { label: 'Ужасы', value: '90' },
        { label: 'Фантастика', value: '41' },
        { label: 'Фанфик', value: '42' },
        { label: 'Фэнтези', value: '44' },
        { label: 'Эротика', value: '46' },
        { label: 'Юмор', value: '47' },
      ],
      type: FilterTypes.Picker,
    },
    tags: {
      label: 'Тэги:',
      value: '',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;
}

export default new Neobook();

interface BundleBooks {
  categories: any[];
  topSection: any[];
  feed: Novels[];
}

interface BottomSection {
  id: string;
  boost: string;
  preferenceid: string;
  type_id: string;
  contentTypeid: string;
  name: string;
  title: string;
  more: string;
  part: string;
  items: Novels[];
}

interface Novels {
  status?: string;
  error?: string;
  login?: Login;
  requestid?: string;
  bundleBooks?: BundleBooks;
  available?: string;
  boosted?: string;
  id?: string;
  token: string;
  type?: string;
  typeid?: string;
  verified?: string;
  audio?: string;
  labelid?: string;
  labelTitle?: string;
  languageid?: string;
  languageTitle?: string;
  categoryid?: string;
  categoryTitle?: string;
  price?: Price;
  priceSpecial?: Price;
  priceDiscount?: string;
  title: string;
  text: string;
  text_fix: string;
  copyright?: string;
  align?: string;
  completed?: string;
  timereadS?: string;
  views?: string;
  likes?: string;
  comments?: string;
  bookmarks?: string;
  isLike?: string;
  isBookmark?: string;
  isPurchase?: string;
  isSelf?: string;
  dateEdit?: string;
  datePublish?: string;
  link_path?: string;
  user?: NovelsUser;
  attachment?: Attachment;
  adult?: string;
  adultPlaceholder?: string;
  nft?: string;
  feed?: Feed;
  counters?: NovelsCounters;
  rating?: Rating;
  readTime?: ReadTime;
  readProgress?: ReadProgress;
  tags?: string[];
  chapters?: Chapter[];
  lastComments?: any[];
  bottomSection?: BottomSection;
  carouselItems?: Novels[];
  book?: Novels;
  activeChapterIndex?: number;
}

interface Attachment {
  has: string;
  id: string;
  typeid: string;
  userid: string;
  width: string;
  height: string;
  duration: string;
  image: Image;
  video: string;
  origin: string;
  ext: string;
}

interface Image {
  s: string;
  m: string;
  l: string;
  has?: string;
}

interface Chapter {
  id: string;
  token: string;
  status: string;
  sort: string;
  free: string;
  title: string;
  words: string;
  access: string;
  loaded: string;
  data?: Data;
}

interface Data {
  available: string;
  access: string;
  id: string;
  token: string;
  postid: string;
  free: string;
  title: string;
  html: string;
  dateEdit: string;
  datePublish: string;
  attachment: Attachment;
  lastComments: any[];
}

interface NovelsCounters {
  impressions: Bookmarks;
  views: Bookmarks;
  likes: Bookmarks;
  comments: Bookmarks;
  bookmarks: Bookmarks;
}

interface Bookmarks {
  value: string;
  formatted: string;
}

interface Feed {
  name: string;
  canRemoved: string;
}

interface Login {
  uid: string;
  utoken: string;
  has: string;
  banned: string;
  verified: string;
  acc: string;
  arm: string;
  grm: string;
  counters: LoginCounters;
  user: LoginUser;
  pro: any[];
  earn: any[];
  boost: any[];
  deposit: any[];
  affiliate: any[];
  preferences: any[];
}

interface LoginCounters {
  notifications: string;
  messages: string;
}

interface LoginUser {
  id: string;
  username: string;
  firstname: string;
  lastname: string;
  photo: string;
  status: string;
  balance: Balance;
  connectedService: string;
}

interface Balance {
  neo: Price;
}

interface Price {
  has: string;
  value: string;
  currency: Currency;
  formatted: string;
  deadline: string;
}

type Currency = 'NEO';

interface Rating {
  value: string;
  count: string;
  my: string;
}

interface ReadProgress {
  chapter: string;
  progress: string;
}

interface ReadTime {
  hours: string;
  minutes: string;
}

interface NovelsUser {
  available: string;
  boosted: string;
  id: string;
  status: string;
  verified: string;
  metrica: string;
  cover: Image;
  photo: Image;
  username: string;
  firstname: string;
  lastname: string;
  initials: string;
  link: string;
  about: string;
  subscriptions: string;
  subscribers: string;
  publications: string;
  books: string;
  poems: string;
  posts: string;
  drafts: string;
  isPro: string;
  isAdult: string;
  isBanned: string;
  isSubscription: string;
  isBlock: string;
  gr: string;
}
