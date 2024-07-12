import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import { storage } from '@libs/storage';
import dayjs from 'dayjs';

class AuthorToday implements Plugin.PluginBase {
  id = 'AT';
  name = 'Автор Тудей';
  icon = 'src/ru/authortoday/icon.png';
  site = 'https://author.today';
  apiSite = 'https://api.author.today/v1/';
  imageSite = 'https://cm.author.today/content/';
  version = '1.1.0';

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.apiSite + 'catalog/search?page=' + pageNo;
    if (filters?.genre?.value) {
      url += '&genre=' + filters.genre.value;
    }

    url +=
      '&sorting=' +
      (showLatestNovels ? 'recent' : filters?.sort?.value || 'popular');

    url += '&form=' + (filters?.form?.value || 'any');
    url += '&state=' + (filters?.state?.value || 'any');
    url += '&series=' + (filters?.series?.value || 'any');
    url += '&access=' + (filters?.access?.value || 'any');
    url += '&promo=' + (filters?.promo?.value || 'hide');

    const result: response = await fetchApi(url, {
      headers: {
        Authorization: 'Bearer guest',
      },
    }).then(res => res.json());
    const novels: Plugin.NovelItem[] = [];

    if (result.code === 'NotFound') {
      return novels;
    }

    result?.searchResults?.forEach(novel =>
      novels.push({
        name: novel.title,
        cover: novel.coverUrl ? this.imageSite + novel.coverUrl : defaultCover,
        path: novel.id.toString(),
      }),
    );

    return novels;
  }

  async parseNovel(workID: string): Promise<Plugin.SourceNovel> {
    if (!this.user) this.user = await this.getUser();
    const book: responseBook = await fetchApi(
      this.apiSite + 'work/' + workID + '/details',
      {
        headers: {
          Authorization: 'Bearer ' + this.user?.token || 'guest',
        },
      },
    ).then(res => res.json());

    const novel: Plugin.SourceNovel = {
      path: workID,
      name: book.title,
      cover: book.coverUrl ? book.coverUrl.split('?')[0] : defaultCover,
      genres: book.tags?.join(', '),
      summary: '',
      author:
        book.originalAuthor ||
        book.authorFIO ||
        book.coAuthorFIO ||
        book.secondCoAuthorFIO ||
        book.translator ||
        '',
      status: book.isFinished ? NovelStatus.Completed : NovelStatus.Ongoing,
    };

    if (book.annotation) {
      novel.summary += book.annotation + '\n';
    }
    if (book.authorNotes) {
      novel.summary += 'Примечания автора:\n' + book.authorNotes;
    }

    const chaptersJSON: ChaptersEntity[] = await fetchApi(
      this.apiSite + 'work/' + workID + '/content',
      {
        headers: {
          Authorization: 'Bearer ' + this.user?.token || 'guest',
        },
      },
    ).then(res => res.json());

    const chapters: Plugin.ChapterItem[] = [];
    chaptersJSON.forEach((chapter, chapterIndex) => {
      if (chapter.isAvailable && !chapter.isDraft) {
        chapters.push({
          name: chapter.title || 'Глава ' + (chapterIndex + 1),
          path: workID + '/' + chapter.id,
          releaseTime: dayjs(
            chapter.publishTime || chapter.lastModificationTime,
          ).format('LLL'),
          chapterNumber: (chapter.sortOrder || chapterIndex) + 1,
        });
      }
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [workID, chapterID] = chapterPath.split('/');
    if (!this.user) this.user = await this.getUser();
    const result: encryptedСhapter = await fetchApi(
      this.apiSite + `work/${workID}/chapter/${chapterID}/text`,
      {
        headers: {
          Authorization: 'Bearer ' + this.user?.token || 'guest',
        },
      },
    ).then(res => res.json());

    if (result.code) {
      return result.code + '\n' + result?.message;
    }

    const chapterText = decrypt(result.text, result.key, this.user?.userId);
    if (chapterText.includes('<img')) {
      return chapterText.replace(/src="(.*?)"/g, (match, url) => {
        if (!url.startsWith('http')) {
          return `src="${this.site}${url}"`;
        }
        return `src="${url}"`;
      });
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/search?category=works&q=' + searchTerm + '&page=' + pageNo;
    const result = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(result);
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.work-row').each((index, element) => {
      const name = loadedCheerio(element)
        .find('h4[class="work-title"]')
        .text()
        .trim();
      let cover = loadedCheerio(element).find('img').attr('data-src');
      const path = loadedCheerio(element).attr('href');

      cover = cover ? cover.split('?')[0] : defaultCover;

      if (!path) return;
      novels.push({ name, cover, path: path.replace('/work/', '') });
    });

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/work/' : '/reader/') + path;

  user: authorization | undefined;
  getUser = async () => {
    let user = storage.get('user') || { userId: '', token: 'guest' };
    if (user && user.userId && user.token) {
      const currentUser: currentUser = await fetchApi(
        this.apiSite + 'account/current-user',
        {
          headers: {
            Authorization: 'Bearer ' + user.token || 'guest',
          },
        },
      ).then(res => res.json());
      if (currentUser?.id && !currentUser.isDisabled) return user;

      storage.delete('user');
      user = { userId: '', token: 'guest' };
    }

    const result = await fetchApi(this.site + '/account/bearer-token');
    if (result.url.includes('Login?ReturnUrl=')) {
      return user; //It looks like the user has lost the session
    }

    const loginUser: authorization = await result.json();
    user = { userId: loginUser.userId, token: loginUser.token };

    storage.set(
      'user',
      user, //for some reason they're ending an hour early.
      new Date(loginUser.expires).getTime() - 1 * 60 * 60 * 1000,
    );
    return user; //user authorized successfully
  };

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'popular',
      options: [
        { label: 'По популярности', value: 'popular' },
        { label: 'По количеству лайков', value: 'likes' },
        { label: 'По комментариям', value: 'comments' },
        { label: 'По новизне', value: 'recent' },
        { label: 'По просмотрам', value: 'views' },
        { label: 'Набирающие популярность', value: 'trending' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанры',
      value: '',
      options: [
        { label: 'Все', value: '' },
        { label: 'Альтернативная история', value: 'sf-history' },
        { label: 'Антиутопия', value: 'dystopia' },
        { label: 'Бизнес-литература', value: 'biznes-literatura' },
        { label: 'Боевая фантастика', value: 'sf-action' },
        { label: 'Боевик', value: 'action' },
        { label: 'Боевое фэнтези', value: 'fantasy-action' },
        { label: 'Бояръ-Аниме', value: 'boyar-anime' },
        { label: 'Героическая фантастика', value: 'sf-heroic' },
        { label: 'Героическое фэнтези', value: 'heroic-fantasy' },
        { label: 'Городское фэнтези', value: 'urban-fantasy' },
        { label: 'Детектив', value: 'detective' },
        { label: 'Детская литература', value: 'detskaya-literatura' },
        { label: 'Документальная проза', value: 'non-fiction' },
        { label: 'Историческая проза', value: 'historical-fiction' },
        { label: 'Исторические приключения', value: 'historical-adventure' },
        { label: 'Исторический детектив', value: 'historical-mystery' },
        { label: 'Исторический любовный роман', value: 'historical-romance' },
        { label: 'Историческое фэнтези', value: 'historical-fantasy' },
        { label: 'Киберпанк', value: 'cyberpunk' },
        { label: 'Короткий любовный роман', value: 'short-romance' },
        { label: 'Космическая фантастика', value: 'sf-space' },
        { label: 'ЛитРПГ', value: 'litrpg' },
        { label: 'Любовное фэнтези', value: 'love-fantasy' },
        { label: 'Любовные романы', value: 'romance' },
        { label: 'Мистика', value: 'paranormal' },
        { label: 'Назад в СССР', value: 'back-to-ussr' },
        { label: 'Научная фантастика', value: 'science-fiction' },
        { label: 'Подростковая проза', value: 'teen-prose' },
        { label: 'Политический роман', value: 'political-fiction' },
        { label: 'Попаданцы', value: 'popadantsy' },
        { label: 'Попаданцы в космос', value: 'popadantsy-v-kosmos' },
        {
          label: 'Попаданцы в магические миры',
          value: 'popadantsy-v-magicheskie-miry',
        },
        { label: 'Попаданцы во времени', value: 'popadantsy-vo-vremeni' },
        { label: 'Постапокалипсис', value: 'postapocalyptic' },
        { label: 'Поэзия', value: 'poetry' },
        { label: 'Приключения', value: 'adventure' },
        { label: 'Публицистика', value: 'publicism' },
        { label: 'Развитие личности', value: 'razvitie-lichnosti' },
        { label: 'Разное', value: 'other' },
        { label: 'РеалРПГ', value: 'realrpg' },
        { label: 'Романтическая эротика', value: 'romantic-erotika' },
        { label: 'Сказка', value: 'fairy-tale' },
        { label: 'Современная проза', value: 'modern-prose' },
        { label: 'Современный любовный роман', value: 'contemporary-romance' },
        { label: 'Социальная фантастика', value: 'sf-social' },
        { label: 'Стимпанк', value: 'steampunk' },
        { label: 'Темное фэнтези', value: 'dark-fantasy' },
        { label: 'Триллер', value: 'thriller' },
        { label: 'Ужасы', value: 'horror' },
        { label: 'Фантастика', value: 'sci-fi' },
        {
          label: 'Фантастический детектив',
          value: 'detective-science-fiction',
        },
        { label: 'Фанфик', value: 'fanfiction' },
        { label: 'Фэнтези', value: 'fantasy' },
        { label: 'Шпионский детектив', value: 'spy-mystery' },
        { label: 'Эпическое фэнтези', value: 'epic-fantasy' },
        { label: 'Эротика', value: 'erotica' },
        { label: 'Эротическая фантастика', value: 'sf-erotika' },
        { label: 'Эротический фанфик', value: 'fanfiction-erotika' },
        { label: 'Эротическое фэнтези', value: 'fantasy-erotika' },
        { label: 'Юмор', value: 'humor' },
        { label: 'Юмористическая фантастика', value: 'sf-humor' },
        { label: 'Юмористическое фэнтези', value: 'ironical-fantasy' },
      ],
      type: FilterTypes.Picker,
    },
    form: {
      label: 'Форма произведения',
      value: 'any',
      options: [
        { label: 'Любой', value: 'any' },
        { label: 'Перевод', value: 'translation' },
        { label: 'Повесть', value: 'tale' },
        { label: 'Рассказ', value: 'story' },
        { label: 'Роман', value: 'novel' },
        { label: 'Сборник поэзии', value: 'poetry' },
        { label: 'Сборник рассказов', value: 'story-book' },
      ],
      type: FilterTypes.Picker,
    },
    state: {
      label: 'Статус произведения',
      value: 'any',
      options: [
        { label: 'Любой статус', value: 'any' },
        { label: 'В процессе', value: 'in-progress' },
        { label: 'Завершено', value: 'finished' },
      ],
      type: FilterTypes.Picker,
    },
    series: {
      label: 'Статус цикла',
      value: 'any',
      options: [
        { label: 'Не важно', value: 'any' },
        { label: 'Вне цикла', value: 'out' },
        { label: 'Цикл завершен', value: 'finished' },
        { label: 'Цикл не завершен', value: 'unfinished' },
      ],
      type: FilterTypes.Picker,
    },
    access: {
      label: 'Тип доступа',
      value: 'any',
      options: [
        { label: 'Любой', value: 'any' },
        { label: 'Платный', value: 'paid' },
        { label: 'Бесплатный', value: 'free' },
      ],
      type: FilterTypes.Picker,
    },
    promo: {
      label: 'Промо-фрагмент',
      value: 'hide',
      options: [
        { label: 'Скрывать', value: 'hide' },
        { label: 'Показывать', value: 'show' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new AuthorToday();

function decrypt(
  encrypt: string,
  encryptedKey: string,
  userId: number | string = '',
) {
  const key = encryptedKey.split('').reverse().join('') + '@_@' + userId;
  let text = '';

  for (let i = 0; i < encrypt.length; i++) {
    text += String.fromCharCode(
      encrypt.charCodeAt(i) ^ key.charCodeAt(i % key.length),
    );
  }

  return text;
}

interface authorization {
  userId: number;
  token: string;
  issued: string;
  expires: string;
}

interface currentUser {
  id: number;
  userName: string;
  fio: string;
  email: string;
  avatarUrl?: null;
  backgroundUrl?: null;
  status?: null;
  hideDislike: boolean;
  hideFinished: boolean;
  isBanned: boolean;
  banReason?: null;
  banEnd?: null;
  emailConfirmed: boolean;
  isDeleted: boolean;
  isDisabled: boolean;
}

interface response {
  searchResults?: SearchResultsEntity[] | null;
  realTotalCount: number;
  code?: string;
  errorMessage?: null;
  isLastPage: boolean;
  format: Format;
  duration: Duration;
  isWorkMarkEnabled: boolean;
}
interface SearchResultsEntity {
  id: number;
  title: string;
  annotation: string;
  authorId: number;
  authorFIO: string;
  authorUserName: string;
  originalAuthor?: null;
  coAuthorId?: number | null;
  coAuthorFIO?: string | null;
  coAuthorUserName?: string | null;
  coAuthorConfirmed: boolean;
  seriesId: number;
  seriesTitle?: string | null;
  publishTime: string;
  lastModificationTime: string;
  finishTime?: string | null;
  isDraft: boolean;
  formEnum: string;
  genreId: number;
  firstSubGenreId: number;
  secondSubGenreId?: number | null;
  adultOnly: boolean;
  tags?: (string | null)[] | null;
  coverUrl: string;
  viewCount: number;
  commentCount: number;
  reviewCount: number;
  textLength: number;
  likeCount: number;
  showAuthor: boolean;
  price?: number | null;
  discount?: null;
  discountStartDate?: null;
  discountEndDate?: null;
  status: string;
  promoFragment: boolean;
  isExclusive: boolean;
  format: string;
  marks?: null[] | null;
  isLiked: boolean;
  isWorkMarkEnabled: boolean;
  workInLibraryState: string;
}
interface Format {
  enumValue: string;
  value: string;
  title: string;
  mobileTitle: string;
}
interface Duration {
  value: string;
  title: string;
  mobileTitle: string;
}

interface responseBook {
  message?: string;
  chapters?: ChaptersEntity[] | null;
  allowDownloads: boolean;
  downloadErrorCode: string;
  downloadErrorMessage: string;
  privacyDownloads: string;
  collectionCount: number;
  annotation: string;
  authorNotes: string;
  atRecommendation: boolean;
  seriesWorkIds?: number[] | null;
  seriesWorkNumber: number;
  reviewCount: number;
  tags?: string[] | null;
  orderId?: null;
  orderStatus: string;
  orderStatusMessage?: null;
  contests?: null[] | null;
  galleryImages?: GalleryImagesEntity[] | null;
  booktrailerVideoUrl?: null;
  isExclusive: boolean;
  freeChapterCount: number;
  promoFragment: boolean;
  recommendations?: RecommendationsEntity[] | null;
  linkedWork?: null;
  id: number;
  title: string;
  coverUrl: string;
  lastModificationTime: string;
  lastUpdateTime: string;
  finishTime?: null;
  isFinished: boolean;
  textLength: number;
  textLengthLastRead: number;
  price: number;
  discount?: null;
  workForm: string;
  status: string;
  authorId: number;
  authorFIO: string;
  authorUserName: string;
  originalAuthor?: null;
  translator?: null;
  reciter?: null;
  coAuthorId?: null;
  coAuthorFIO?: null;
  coAuthorUserName?: null;
  coAuthorConfirmed: boolean;
  secondCoAuthorId?: null;
  secondCoAuthorFIO?: null;
  secondCoAuthorUserName?: null;
  secondCoAuthorConfirmed: boolean;
  isPurchased: boolean;
  userLikeId?: null;
  lastReadTime?: null;
  lastChapterId?: null;
  lastChapterProgress: number;
  likeCount: number;
  commentCount: number;
  rewardCount: number;
  rewardsEnabled: boolean;
  inLibraryState: string;
  addedToLibraryTime: string;
  updateInLibraryTime: string;
  privacyDisplay: string;
  state: string;
  isDraft: boolean;
  enableRedLine: boolean;
  enableTTS: boolean;
  adultOnly: boolean;
  seriesId: number;
  seriesOrder: number;
  seriesTitle: string;
  afterword: string;
  seriesNextWorkId?: null;
  genreId: number;
  firstSubGenreId: number;
  secondSubGenreId: number;
  format: string;
  marks?: null;
  purchaseTime?: null;
  likeTime?: null;
  markTime?: null;
}
interface ChaptersEntity {
  id: number;
  workId: number;
  title: string;
  isDraft: boolean;
  sortOrder: number;
  publishTime?: string;
  lastModificationTime: string;
  textLength: number;
  isAvailable: boolean;
}

interface GalleryImagesEntity {
  id: string;
  caption?: null;
  url: string;
  height: number;
  width: number;
}
interface RecommendationsEntity {
  title: string;
  coverUrl: string;
  authorId: number;
  authorFIO: string;
  authorUserName: string;
  originalAuthor?: null;
  coAuthorId?: null;
  coAuthorFIO?: null;
  coAuthorUserName?: null;
  coAuthorConfirmed: boolean;
  secondCoAuthorId?: null;
  secondCoAuthorFIO?: null;
  secondCoAuthorUserName?: null;
  secondCoAuthorConfirmed: boolean;
  discount?: null;
  price?: number | null;
  lastModificationTime: string;
  finishTime: string;
  finished: boolean;
  isExclusive: boolean;
  format: string;
  status: string;
  state: string;
  removalReason?: null;
  removalReasonComment?: null;
  id: number;
}

interface encryptedСhapter {
  id: number;
  title: string;
  isDraft: boolean;
  publishTime: string;
  lastModificationTime: string;
  text: string;
  key: string;
  code?: string;
  message?: string;
}
