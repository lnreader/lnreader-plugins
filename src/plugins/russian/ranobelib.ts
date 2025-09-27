import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { storage, localStorage } from '@libs/storage';
import dayjs from 'dayjs';

const statusKey: Record<number, string> = {
  1: NovelStatus.Ongoing,
  2: NovelStatus.Completed,
  3: NovelStatus.OnHiatus,
  4: NovelStatus.Cancelled,
};

class RLIB implements Plugin.PluginBase {
  id = 'RLIB';
  name = 'RanobeLib';
  site = 'https://ranobelib.me';
  apiSite = 'https://api.cdnlibs.org/api/manga/';
  version = '2.2.1';
  icon = 'src/ru/ranobelib/icon.png';
  webStorageUtilized = true;
  imageRequestInit = {
    headers: {
      Accept:
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: this.site,
    },
  };

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.apiSite + '?site_id[0]=3&page=' + pageNo;
    url +=
      '&sort_by=' +
      (showLatestNovels
        ? 'last_chapter_at'
        : filters?.sort_by?.value || 'rating_score');
    url += '&sort_type=' + (filters?.sort_type?.value || 'desc');

    if (filters?.require_chapters?.value) {
      url += '&chapters[min]=1';
    }
    if (filters?.types?.value?.length) {
      url += '&types[]=' + filters.types.value.join('&types[]=');
    }
    if (filters?.scanlateStatus?.value?.length) {
      url +=
        '&scanlateStatus[]=' +
        filters.scanlateStatus.value.join('&scanlateStatus[]=');
    }
    if (filters?.manga_status?.value?.length) {
      url +=
        '&manga_status[]=' +
        filters.manga_status.value.join('&manga_status[]=');
    }

    if (filters?.genres) {
      if (filters.genres.value?.include?.length) {
        url += '&genres[]=' + filters.genres.value.include.join('&genres[]=');
      }
      if (filters.genres.value?.exclude?.length) {
        url +=
          '&genres_exclude[]=' +
          filters.genres.value.exclude.join('&genres_exclude[]=');
      }
    }
    if (filters?.tags) {
      if (filters.tags.value?.include?.length) {
        url += '&tags[]=' + filters.tags.value.include.join('&tags[]=');
      }
      if (filters.tags.value?.exclude?.length) {
        url +=
          '&tags_exclude[]=' +
          filters.tags.value.exclude.join('&tags_exclude[]=');
      }
    }

    const result: TopLevel = await fetchApi(url, {
      headers: this.user?.token,
    }).then(res => res.json());

    const novels: Plugin.NovelItem[] = [];
    if (result.data instanceof Array) {
      result.data.forEach(novel =>
        novels.push({
          name: novel.rus_name || novel.eng_name || novel.name,
          cover: novel.cover?.default || defaultCover,
          path: novel.slug_url || novel.id + '--' + novel.slug,
        }),
      );
    }
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const { data }: { data: DataClass } = await fetchApi(
      `${this.apiSite}${novelPath}?fields[]=summary&fields[]=genres&fields[]=tags&fields[]=teams&fields[]=authors&fields[]=status_id&fields[]=artists`,
      { headers: { ...this.user?.token, 'Site-Id': '3' } },
    ).then(res => res.json());

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.rus_name || data.name,
      cover: data.cover?.default || defaultCover,
      summary: data.summary?.trim(),
    };

    if (data.status?.id) {
      novel.status = statusKey[data.status.id] || NovelStatus.Unknown;
    }

    if (data.authors?.length) {
      novel.author = data.authors[0].name;
    }
    if (data.artists?.length) {
      novel.artist = data.artists[0].name;
    }

    const genres = [data.genres || [], data.tags || []]
      .flat()
      .map(genres => genres?.name)
      .filter(genres => genres);
    if (genres.length) {
      novel.genres = genres.join(', ');
    }

    const branch_name: Record<string, string> = data.teams?.reduce(
      (acc, { name, details }) => {
        acc[String(details?.branch_id ?? '0')] = name;
        return acc;
      },
      { '0': 'Главная страница' } as Record<string, string>,
    ) || { '0': 'Главная страница' };

    const chaptersJSON: { data: DataChapter[] } = await fetchApi(
      `${this.apiSite}${novelPath}/chapters`,
      { headers: this.user?.token },
    ).then(res => res.json());

    if (chaptersJSON.data?.length) {
      let chapters: Plugin.ChapterItem[] = chaptersJSON.data.flatMap(chapter =>
        chapter.branches.map(({ branch_id, created_at }) => {
          const bId = String(branch_id ?? '0');
          return {
            name: `Том ${chapter.volume} Глава ${chapter.number}${
              chapter.name ? ' ' + chapter.name.trim() : ''
            }`,
            path: `${novelPath}/${chapter.volume}/${chapter.number}/${bId}`,
            releaseTime: created_at ? dayjs(created_at).format('LLL') : null,
            chapterNumber: chapter.index,
            page: branch_name[bId] || 'Неизвестный',
          };
        }),
      );

      if (chapters.length) {
        const uniquePages = new Set(chapters.map(c => c.page));

        if (uniquePages.size === 1) {
          // If only one unique page value, set page to undefined for all chapters
          // Need more investigation one app side for single page shenanigans
          chapters = chapters.map(chapter => ({
            ...chapter,
            page: undefined,
          }));
        } else if (data.teams?.length > 1) {
          // Original sorting logic for multiple pages, for reasons chapters overlap with one another
          chapters.sort((chapterA, chapterB) => {
            if (
              chapterA.page &&
              chapterB.page &&
              chapterA.page !== chapterB.page
            ) {
              return chapterA.page.localeCompare(chapterB.page);
            }
            return (
              (chapterA.chapterNumber || 0) - (chapterB.chapterNumber || 0)
            );
          });
        }
        novel.chapters = chapters;
      }
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [slug, volume, number, branch_id] = chapterPath.split('/');
    let chapterText = '';

    if (slug && volume && number) {
      const result: { data: DataClass } = await fetchApi(
        this.apiSite +
          slug +
          '/chapter?' +
          (branch_id ? 'branch_id=' + branch_id + '&' : '') +
          'number=' +
          number +
          '&volume=' +
          volume,
        { headers: this.user?.token },
      ).then(res => res.json());
      chapterText =
        result?.data?.content?.type == 'doc'
          ? jsonToHtml(
              result.data.content.content,
              result.data.attachments || [],
            )
          : result?.data?.content;
    }
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = this.apiSite + '?site_id[0]=3&q=' + searchTerm;
    const result: TopLevel = await fetchApi(url, {
      headers: this.user?.token,
    }).then(res => res.json());

    const novels: Plugin.NovelItem[] = [];
    if (result.data instanceof Array) {
      result.data.forEach(novel =>
        novels.push({
          name: novel.rus_name || novel.eng_name || novel.name,
          cover: novel.cover?.default || defaultCover,
          path: novel.slug_url || novel.id + '--' + novel.slug,
        }),
      );
    }

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    const ui = this.user?.ui ? 'ui=' + this.user.ui : '';

    if (isNovel) return this.site + '/ru/book/' + path + (ui ? '?' + ui : '');

    const [slug, volume, number, branch_id] = path.split('/');
    const chapterPath =
      slug +
      '/read/v' +
      volume +
      '/c' +
      number +
      (branch_id ? '?bid=' + branch_id : '');

    return (
      this.site +
      '/ru/' +
      chapterPath +
      (ui ? (branch_id ? '&' : '?') + ui : '')
    );
  };

  getUser = () => {
    const user = storage.get('user');
    if (user) {
      return { token: { Authorization: 'Bearer ' + user.token }, ui: user.id };
    }
    const dataRaw = localStorage.get()?.auth;
    if (!dataRaw) {
      return {};
    }

    const data = JSON.parse(dataRaw) as authorization;
    if (!data?.token?.access_token) return;
    storage.set(
      'user',
      {
        id: data.auth.id,
        token: data.token.access_token,
      },
      data.token.timestamp + data.token.expires_in, //the token is valid for about 7 days
    );
    return {
      token: { Authorization: 'Bearer ' + data.token.access_token },
      ui: data.auth.id,
    };
  };
  user = this.getUser(); //To change the account, you need to restart the application

  filters = {
    sort_by: {
      label: 'Сортировка',
      value: 'rating_score',
      options: [
        { label: 'По рейтингу', value: 'rate_avg' },
        { label: 'По популярности', value: 'rating_score' },
        { label: 'По просмотрам', value: 'views' },
        { label: 'Количеству глав', value: 'chap_count' },
        { label: 'Дате обновления', value: 'last_chapter_at' },
        { label: 'Дате добавления', value: 'created_at' },
        { label: 'По названию (A-Z)', value: 'name' },
        { label: 'По названию (А-Я)', value: 'rus_name' },
      ],
      type: FilterTypes.Picker,
    },
    sort_type: {
      label: 'Порядок',
      value: 'desc',
      options: [
        { label: 'По убыванию', value: 'desc' },
        { label: 'По возрастанию', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    types: {
      label: 'Тип',
      value: [],
      options: [
        { label: 'Япония', value: '10' },
        { label: 'Корея', value: '11' },
        { label: 'Китай', value: '12' },
        { label: 'Английский', value: '13' },
        { label: 'Авторский', value: '14' },
        { label: 'Фанфик', value: '15' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    scanlateStatus: {
      label: 'Статус перевода',
      value: [],
      options: [
        { label: 'Продолжается', value: '1' },
        { label: 'Завершен', value: '2' },
        { label: 'Заморожен', value: '3' },
        { label: 'Заброшен', value: '4' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    manga_status: {
      label: 'Статус тайтла',
      value: [],
      options: [
        { label: 'Онгоинг', value: '1' },
        { label: 'Завершён', value: '2' },
        { label: 'Анонс', value: '3' },
        { label: 'Приостановлен', value: '4' },
        { label: 'Выпуск прекращён', value: '5' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genres: {
      label: 'Жанры',
      value: { include: [], exclude: [] },
      options: [
        { label: 'Арт', value: '32' },
        { label: 'Безумие', value: '91' },
        { label: 'Боевик', value: '34' },
        { label: 'Боевые искусства', value: '35' },
        { label: 'Вампиры', value: '36' },
        { label: 'Военное', value: '89' },
        { label: 'Гарем', value: '37' },
        { label: 'Гендерная интрига', value: '38' },
        { label: 'Героическое фэнтези', value: '39' },
        { label: 'Демоны', value: '81' },
        { label: 'Детектив', value: '40' },
        { label: 'Детское', value: '88' },
        { label: 'Дзёсэй', value: '41' },
        { label: 'Драма', value: '43' },
        { label: 'Игра', value: '44' },
        { label: 'Исекай', value: '79' },
        { label: 'История', value: '45' },
        { label: 'Киберпанк', value: '46' },
        { label: 'Кодомо', value: '76' },
        { label: 'Комедия', value: '47' },
        { label: 'Космос', value: '83' },
        { label: 'Магия', value: '85' },
        { label: 'Махо-сёдзё', value: '48' },
        { label: 'Машины', value: '90' },
        { label: 'Меха', value: '49' },
        { label: 'Мистика', value: '50' },
        { label: 'Музыка', value: '80' },
        { label: 'Научная фантастика', value: '51' },
        { label: 'Омегаверс', value: '77' },
        { label: 'Пародия', value: '86' },
        { label: 'Повседневность', value: '52' },
        { label: 'Полиция', value: '82' },
        { label: 'Постапокалиптика', value: '53' },
        { label: 'Приключения', value: '54' },
        { label: 'Психология', value: '55' },
        { label: 'Романтика', value: '56' },
        { label: 'Самурайский боевик', value: '57' },
        { label: 'Сверхъестественное', value: '58' },
        { label: 'Сёдзё', value: '59' },
        { label: 'Сёдзё-ай', value: '60' },
        { label: 'Сёнэн', value: '61' },
        { label: 'Сёнэн-ай', value: '62' },
        { label: 'Спорт', value: '63' },
        { label: 'Супер сила', value: '87' },
        { label: 'Сэйнэн', value: '64' },
        { label: 'Трагедия', value: '65' },
        { label: 'Триллер', value: '66' },
        { label: 'Ужасы', value: '67' },
        { label: 'Фантастика', value: '68' },
        { label: 'Фэнтези', value: '69' },
        { label: 'Хентай', value: '84' },
        { label: 'Школа', value: '70' },
        { label: 'Эротика', value: '71' },
        { label: 'Этти', value: '72' },
        { label: 'Юри', value: '73' },
        { label: 'Яой', value: '74' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    tags: {
      label: 'Теги',
      value: { include: [], exclude: [] },
      options: [
        { label: 'Авантюристы', value: '328' },
        { label: 'Антигерой', value: '175' },
        { label: 'Бессмертные', value: '333' },
        { label: 'Боги', value: '218' },
        { label: 'Борьба за власть', value: '309' },
        { label: 'Брат и сестра', value: '360' },
        { label: 'Ведьма', value: '339' },
        { label: 'Видеоигры', value: '204' },
        { label: 'Виртуальная реальность', value: '214' },
        { label: 'Владыка демонов', value: '349' },
        { label: 'Военные', value: '198' },
        { label: 'Воспоминания из другого мира', value: '310' },
        { label: 'Выживание', value: '212' },
        { label: 'ГГ женщина', value: '294' },
        { label: 'ГГ имба', value: '292' },
        { label: 'ГГ мужчина', value: '295' },
        { label: 'ГГ не ояш', value: '325' },
        { label: 'ГГ не человек', value: '331' },
        { label: 'ГГ ояш', value: '326' },
        { label: 'Главный герой бог', value: '324' },
        { label: 'Глупый ГГ', value: '298' },
        { label: 'Горничные', value: '171' },
        { label: 'Гуро', value: '306' },
        { label: 'Гяру', value: '197' },
        { label: 'Демоны', value: '157' },
        { label: 'Драконы', value: '313' },
        { label: 'Древний мир', value: '317' },
        { label: 'Зверолюди', value: '163' },
        { label: 'Зомби', value: '155' },
        { label: 'Исторические фигуры', value: '323' },
        { label: 'Кулинария', value: '158' },
        { label: 'Культивация', value: '161' },
        { label: 'ЛГБТ', value: '344' },
        { label: 'ЛитРПГ', value: '319' },
        { label: 'Лоли', value: '206' },
        { label: 'Магия', value: '170' },
        { label: 'Машинный перевод', value: '345' },
        { label: 'Медицина', value: '159' },
        { label: 'Межгалактическая война', value: '330' },
        { label: 'Монстр Девушки', value: '207' },
        { label: 'Монстры', value: '208' },
        { label: 'Мрачный мир', value: '316' },
        { label: 'Музыка', value: '358' },
        { label: 'Музыка', value: '209' },
        { label: 'Ниндзя', value: '199' },
        { label: 'Обратный Гарем', value: '210' },
        { label: 'Офисные Работники', value: '200' },
        { label: 'Пираты', value: '341' },
        { label: 'Подземелья', value: '314' },
        { label: 'Политика', value: '311' },
        { label: 'Полиция', value: '201' },
        { label: 'Преступники / Криминал', value: '205' },
        { label: 'Призраки / Духи', value: '196' },
        { label: 'Призыватели', value: '329' },
        { label: 'Прыжки между мирами', value: '321' },
        { label: 'Путешествие в другой мир', value: '318' },
        { label: 'Путешествие во времени', value: '213' },
        { label: 'Рабы', value: '355' },
        { label: 'Ранги силы', value: '312' },
        { label: 'Реинкарнация', value: '154' },
        { label: 'Самураи', value: '202' },
        { label: 'Скрытие личности', value: '315' },
        { label: 'Средневековье', value: '174' },
        { label: 'Традиционные игры', value: '203' },
        { label: 'Умный ГГ', value: '303' },
        { label: 'Характерный рост', value: '332' },
        { label: 'Хикикомори', value: '167' },
        { label: 'Эволюция', value: '322' },
        { label: 'Элементы РПГ', value: '327' },
        { label: 'Эльфы', value: '217' },
        { label: 'Якудза', value: '165' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    require_chapters: {
      label: 'Только проекты с главами',
      value: true,
      type: FilterTypes.Switch,
    },
  } satisfies Filters;
}

export default new RLIB();

function jsonToHtml(json: HTML[], images: Attachment[], html = '') {
  json.forEach(element => {
    switch (element.type) {
      case 'hardBreak':
        html += '<br>';
        break;
      case 'horizontalRule':
        html += '<hr>';
        break;
      case 'image':
        if (element.attrs?.images?.length) {
          element.attrs.images.forEach(
            ({ image }: { image: string | number }) => {
              const file = images.find(
                (f: Attachment) => f.name == image || f.id == image,
              );
              if (file) {
                html += `<img src='${file.url}'>`;
              }
            },
          );
        } else if (element.attrs) {
          const attrs = Object.entries(element.attrs)
            .filter(attr => attr?.[1])
            .map(attr => `${attr[0]}="${attr[1]}"`);
          html += '<img ' + attrs.join('; ') + '>';
        }
        break;
      case 'paragraph':
        html +=
          '<p>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</p>';
        break;
      case 'orderedList':
        html +=
          '<ol>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</ol>';
        break;
      case 'listItem':
        html +=
          '<li>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</li>';
        break;
      case 'blockquote':
        html +=
          '<blockquote>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</blockquote>';
        break;
      case 'italic':
        html +=
          '<i>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</i>';
        break;
      case 'bold':
        html +=
          '<b>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</b>';
        break;
      case 'underline':
        html +=
          '<u>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</u>';
        break;
      case 'heading':
        html +=
          '<h2>' +
          (element.content ? jsonToHtml(element.content, images) : '<br>') +
          '</h2>';
        break;
      case 'text':
        html += element.text;
        break;
      default:
        html += JSON.stringify(element, null, '\t'); //maybe I missed something.
        break;
    }
  });
  return html;
}

type HTML = {
  type: string;
  content?: HTML[];
  attrs?: Attrs;
  text?: string;
};

type Attrs = {
  src?: string;
  alt?: string | null;
  title?: string | null;
  images?: { image: string | number }[];
};

type authorization = {
  token: Token;
  auth: Auth;
  timestamp: number;
};
type Token = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  timestamp: number;
};
type Auth = {
  id: number;
  username: string;
  avatar: Cover;
  last_online_at: string;
  metadata: Metadata;
};
type Metadata = {
  auth_domains: string;
};

type TopLevel = {
  data: DataClass | DataClass[];
  links?: Links;
  meta?: Meta;
};

type AgeRestriction = {
  id: number;
  label: string;
};

type Branch = {
  id: number;
  branch_id: null;
  created_at: string;
  teams: BranchTeam[];
  user: User;
};

type BranchTeam = {
  id: number;
  slug: string;
  slug_url: string;
  model: string;
  name: string;
  cover: Cover;
};

type Cover = {
  filename: null | string;
  thumbnail: string;
  default: string;
};

type User = {
  username: string;
  id: number;
};

type DataClass = {
  id: number;
  name: string;
  rus_name?: string;
  eng_name?: string;
  slug: string;
  slug_url?: string;
  cover?: Cover;
  ageRestriction?: AgeRestriction;
  site?: number;
  type: string;
  summary?: string;
  is_licensed?: boolean;
  teams: DataTeam[];
  genres?: Genre[];
  tags?: Genre[];
  authors?: Artist[];
  model?: string;
  status?: AgeRestriction;
  scanlateStatus?: AgeRestriction;
  artists?: Artist[];
  releaseDateString?: string;
  volume?: string;
  number?: string;
  number_secondary?: string;
  branch_id?: null;
  manga_id?: number;
  created_at?: string;
  moderated?: AgeRestriction;
  likes_count?: number;
  content?: any;
  attachments?: Attachment[];
};

type Artist = {
  id: number;
  slug: string;
  slug_url: string;
  model: string;
  name: string;
  rus_name: null;
  alt_name: null;
  cover: Cover;
  subscription: Subscription;
  confirmed: null;
  user_id: number;
  titles_count_details: null;
};

type Subscription = {
  is_subscribed: boolean;
  source_type: string;
  source_id: number;
  relation: null;
};

type Attachment = {
  id?: string | null; // Allow null for id
  filename: string;
  name: string;
  extension: string;
  url: string;
  width: number;
  height: number;
};

type Genre = {
  id: number;
  name: string;
};

type DataTeam = {
  id: number;
  slug: string;
  slug_url: string;
  model: string;
  name: string;
  cover: Cover;
  details?: Details;
  vk?: string;
  discord?: null;
};

type Details = {
  branch_id: null;
  is_active: boolean;
  subscriptions_count: null;
};

type Links = {
  first: string;
  last: null;
  prev: null;
  next: string;
};

type Meta = {
  current_page?: number;
  from?: number;
  path?: string;
  per_page?: number;
  to?: number;
  page?: number;
  has_next_page?: boolean;
  seed?: string;
  country?: string;
};

type DataChapter = {
  id: number;
  index: number;
  item_number: number;
  volume: string;
  number: string;
  number_secondary: string;
  name: string;
  branches_count: number;
  branches: Branch[];
};
