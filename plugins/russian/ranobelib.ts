import { Plugin } from '@/types/plugin';
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
  version = '2.2.5';
  icon = 'src/ru/ranobelib/icon.png';
  webStorageUtilized = true;

  // Обновлённые заголовки
  baseHeaders = {
    Accept: 'application/json',
    Referer: this.site,
    'Site-Id': '3',
    'client-time-zone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 YaBrowser/25.12.0.0 Safari/537.36'
  };

  imageRequestInit = {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: this.site,
    },
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

    try {
      const data = JSON.parse(dataRaw) as authorization;
      if (data?.token?.access_token) {
        storage.set(
          'user',
          {
            id: data.auth.id,
            token: data.token.access_token,
          },
          data.token.timestamp + data.token.expires_in
        );
        return {
          token: { Authorization: 'Bearer ' + data.token.access_token },
          ui: data.auth.id,
        };
      }
    } catch (e) {
      console.log('Failed to parse auth data:', e);
    }
    return {};
  };

  user = this.getUser();

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>
  ): Promise<Plugin.NovelItem[]> {
    let url = this.apiSite + '?site_id[0]=3&page=' + pageNo;
    url +=
      '&sort_by=' +
      (showLatestNovels ? 'last_chapter_at' : filters?.sort_by?.value || 'rating_score');
    url += '&sort_type=' + (filters?.sort_type?.value || 'desc');

    if (filters?.require_chapters?.value) {
      url += '&chapters[min]=1';
    }
    if (filters?.types?.value?.length) {
      url += '&types[]=' + filters.types.value.join('&types[]=');
    }
    if (filters?.scanlateStatus?.value?.length) {
      url += '&scanlateStatus[]=' + filters.scanlateStatus.value.join('&scanlateStatus[]=');
    }
    if (filters?.manga_status?.value?.length) {
      url += '&manga_status[]=' + filters.manga_status.value.join('&manga_status[]=');
    }
    if (filters?.genres) {
      if (filters.genres.value?.include?.length) {
        url += '&genres[]=' + filters.genres.value.include.join('&genres[]=');
      }
      if (filters.genres.value?.exclude?.length) {
        url += '&genres_exclude[]=' + filters.genres.value.exclude.join('&genres_exclude[]=');
      }
    }
    if (filters?.tags) {
      if (filters.tags.value?.include?.length) {
        url += '&tags[]=' + filters.tags.value.include.join('&tags[]=');
      }
      if (filters.tags.value?.exclude?.length) {
        url += '&tags_exclude[]=' + filters.tags.value.exclude.join('&tags_exclude[]=');
      }
    }

    const headers = { ...this.baseHeaders };
    if (this.user?.token?.Authorization) {
      headers.Authorization = this.user.token.Authorization;
    }

    const result: TopLevel = await fetchApi(url, { headers }).then(res => res.json());

    const novels: Plugin.NovelItem[] = [];
    if (result.data instanceof Array) {
      result.data.forEach(novel =>
        novels.push({
          name: novel.rus_name || novel.eng_name || novel.name,
          cover: novel.cover?.default || defaultCover,
          path: novel.slug_url || novel.id + '--' + novel.slug,
        })
      );
    }
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const headers = { ...this.baseHeaders, 'Site-Id': '3' };
    if (this.user?.token?.Authorization) {
      headers.Authorization = this.user.token.Authorization;
    }

    const { data }: { data: DataClass } = await fetchApi(
      `${this.apiSite}${novelPath}?fields[]=summary&fields[]=genres&fields[]=tags&fields[]=teams&fields[]=authors&fields[]=status_id&fields[]=artists`,
      { headers }
    ).then(res => res.json());

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.rus_name || data.name,
      cover: data.cover?.default || defaultCover,
      summary: data.summary ? String(data.summary).trim() : '',
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
      .map(g => g?.name)
      .filter(g => g);
    if (genres.length) {
      novel.genres = genres.join(', ');
    }

    const branch_name: Record<string, string> = data.teams?.reduce(
      (acc, { name, details }) => {
        acc[String(details?.branch_id ?? '0')] = name;
        return acc;
      },
      { '0': 'Главная страница' } as Record<string, string>
    ) || { '0': 'Главная страница' };

    const chaptersHeaders = { ...this.baseHeaders };
    if (this.user?.token?.Authorization) {
      chaptersHeaders.Authorization = this.user.token.Authorization;
    }

    const chaptersJSON: { data: DataChapter[] } = await fetchApi(
      `${this.apiSite}${novelPath}/chapters`,
      { headers: chaptersHeaders }
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
        })
      );

      if (chapters.length) {
        const uniquePages = new Set(chapters.map(c => c.page));
        if (uniquePages.size === 1) {
          chapters = chapters.map(chapter => ({ ...chapter, page: undefined }));
        } else if (data.teams?.length > 1) {
          chapters.sort((chapterA, chapterB) => {
            if (chapterA.page && chapterB.page && chapterA.page !== chapterB.page) {
              return chapterA.page.localeCompare(chapterB.page);
            }
            return (chapterA.chapterNumber || 0) - (chapterB.chapterNumber || 0);
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
      const headers = { ...this.baseHeaders };
      if (this.user?.token?.Authorization) {
        headers.Authorization = this.user.token.Authorization;
      }

      const result: { data: DataClass } = await fetchApi(
        this.apiSite +
          slug +
          '/chapter?' +
          (branch_id ? 'branch_id=' + branch_id + '&' : '') +
          'number=' +
          number +
          '&volume=' +
          volume,
        { headers }
      ).then(res => res.json());

      chapterText =
        result?.data?.content?.type == 'doc'
          ? jsonToHtml(result.data.content.content, result.data.attachments || [])
          : result?.data?.content;
    }
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = this.apiSite + '?site_id[0]=3&q=' + searchTerm;
    const headers = { ...this.baseHeaders };
    if (this.user?.token?.Authorization) {
      headers.Authorization = this.user.token.Authorization;
    }

    const result: TopLevel = await fetchApi(url, { headers }).then(res => res.json());

    const novels: Plugin.NovelItem[] = [];
    if (result.data instanceof Array) {
      result.data.forEach(novel =>
        novels.push({
          name: novel.rus_name || novel.eng_name || novel.name,
          cover: novel.cover?.default || defaultCover,
          path: novel.slug_url || novel.id + '--' + novel.slug,
        })
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
        { label: 'По названию (А-Я)', value: 'rus_name' }
      ],
      type: FilterTypes.Picker,
    },
    sort_type: {
      label: 'Порядок',
      value: 'desc',
      options: [
        { label: 'По убыванию', value: 'desc' },
        { label: 'По возрастанию', value: 'asc' }
      ],
      type: FilterTypes.Picker,
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
      case 'hardBreak': html += '<br>'; break;
      case 'horizontalRule': html += '<hr>'; break;
      case 'image':
        if (element.attrs?.images?.length) {
          element.attrs.images.forEach(({ image }: { image: string | number }) => {
            const file = images.find((f: Attachment) => f.name == image || f.id == image);
            if (file) html += `<img src='${file.url}'>`;
          });
        }
        break;
      case 'paragraph':
        html += '<p>' + (element.content ? jsonToHtml(element.content, images) : '<br>') + '</p>';
        break;
      case 'orderedList':
        html += '<ol>' + (element.content ? jsonToHtml(element.content, images) : '<br>') + '</ol>';
        break;
      case 'listItem':
        html += '<li>' + (element.content ? jsonToHtml(element.content, images) : '<br>') + '</li>';
        break;
      case 'italic':
        html += '<i>' + (element.content ? jsonToHtml(element.content, images) : '<br>') + '</i>';
        break;
      case 'bold':
        html += '<b>' + (element.content ? jsonToHtml(element.content, images) : '<br>') + '</b>';
        break;
      case 'text':
        html += element.text;
        break;
      default:
        if (element.content) {
          html += jsonToHtml(element.content, images);
        }
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
