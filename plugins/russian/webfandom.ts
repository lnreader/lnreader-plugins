import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const PAGE_SIZE = 40;

class WebFandom implements Plugin.PluginBase {
  id = 'webfandom';
  name = 'WebFandom';
  site = 'https://webfandom.ru';
  api = this.site + '/api/v1';
  version = '1.0.0';
  icon = 'src/ru/webfandom/icon.png';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? '-date_change' : filters?.sort?.value;
    let query = '&sort=' + (sort || '-views');
    if (filters?.genre?.value) query += '&genres=' + filters.genre.value;
    if (filters?.status?.value) {
      query += '&publication_status=' + filters.status.value;
    }
    return this.fetchNovels(pageNo, query);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.fetchNovels(
      pageNo,
      '&search=' + encodeURIComponent(searchTerm),
    );
  }

  async fetchNovels(
    pageNo: number,
    query: string,
  ): Promise<Plugin.NovelItem[]> {
    const data: Page<CatalogItem> = await this.fetchJson(
      this.api +
        '/catalog/publications/?type=NOVELLA&limit=' +
        PAGE_SIZE +
        '&offset=' +
        (pageNo - 1) * PAGE_SIZE +
        query,
    );
    return data.results.map(novel => ({
      name: novel.name,
      path: '/publications/' + novel.slug,
      cover: novel.image ? this.absolute(novel.image) : defaultCover,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = this.lastSegment(novelPath);
    const data: Publication = await this.fetchJson(
      this.api + '/catalog/publications/' + slug + '/',
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.name,
      cover: data.image ? this.absolute(data.image) : defaultCover,
      summary: data.description?.trim() || undefined,
      author: data.authors?.map(author => author.name).join(', ') || undefined,
      genres:
        (data.genres || [])
          .concat(data.tags || [])
          .map(genre => genre.name)
          // tags often repeat the genres
          .filter((name, index, names) => names.indexOf(name) === index)
          .join(',') || undefined,
      status: statuses[data.publicationStatus] || NovelStatus.Unknown,
    };

    // one request is enough: the API returns the whole list in a single page
    const chapters: Page<ChapterItem> = await this.fetchJson(
      this.api +
        '/catalog/publications/' +
        slug +
        '/chapters/?ordering=asc&limit=10000',
    );
    novel.chapters = chapters.results.map((chapter, index) => ({
      name:
        'Том ' +
        chapter.volume +
        ' Глава ' +
        chapter.chapter +
        (chapter.name ? ' - ' + chapter.name : ''),
      path: '/reader/novella/' + chapter.slug,
      releaseTime: chapter.dateCreate,
      chapterNumber: index + 1,
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const data: Chapter = await this.fetchJson(
      this.api +
        '/catalog/publication_chapters/' +
        this.lastSegment(chapterPath) +
        '/',
    );
    if (!data.isAccess || data.isAccessAdult === false) {
      throw new Error('Глава доступна только после входа на сайте');
    }

    const html = (data.content || [])
      .slice()
      .sort((a, b) => a.number - b.number)
      .map(block => {
        if (block.type === 'TEXT') return block.text || '';
        if (block.type === 'IMAGE' && block.image) {
          return '<img src="' + this.absolute(block.image) + '">';
        }
        if (block.type === 'SEPARATION') return '<hr>';
        return '';
      })
      .join('\n');
    if (!html.trim()) throw new Error('Текст главы недоступен');
    return html;
  }

  // DDoS-Guard sometimes answers with its HTML check page instead of JSON
  async fetchJson(url: string) {
    const res = await fetchApi(url, {
      headers: { Accept: 'application/json' },
    });
    const body = await res.text();
    // keep the status so callers (and the live check) can tell a block
    // (403/503) from a broken plugin
    const fail = (message: string) =>
      Object.assign(new Error(message), { status: res.status });
    if (res.status === 404) throw fail('Страница не найдена (404)');

    let data;
    try {
      // the API uses snake_case keys
      data = JSON.parse(body, (key, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return value;
        }
        const result: Record<string, unknown> = {};
        for (const name in value) {
          result[
            name.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())
          ] = value[name];
        }
        return result;
      });
    } catch {
      throw fail('Пройдите проверку: откройте сайт в WebView');
    }
    if (!res.ok) {
      throw fail('Не удалось загрузить данные (' + res.status + ')');
    }
    return data;
  }

  lastSegment = (path: string) =>
    path.replace(/\/+$/, '').split('/').pop() || path;

  absolute = (url: string) =>
    url.startsWith('http')
      ? url
      : this.site + (url.startsWith('/') ? '' : '/') + url;

  resolveUrl = (path: string) => this.absolute(path);

  filters = {
    sort: {
      label: 'Сортировка',
      value: '-views',
      options: [
        { label: 'По популярности', value: '-views' },
        { label: 'Популярное за неделю', value: '-views_week' },
        { label: 'По обновлению', value: '-date_change' },
        { label: 'По дате выхода', value: '-date_publication' },
        { label: 'По количеству глав', value: '-chapters_count' },
        { label: 'По названию', value: 'name' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Статус',
      value: '',
      options: [
        { label: 'Любой', value: '' },
        { label: 'Продолжается', value: 'CONTINUES' },
        { label: 'Завершён', value: 'FINISHED' },
        { label: 'Заморожен', value: 'FROZEN' },
        { label: 'Нет переводчика', value: 'NOT_TRANSLATOR' },
        { label: 'Анонс', value: 'ANNOUNCE' },
        { label: 'Лицензировано', value: 'LICENSED' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанр',
      value: '',
      options: [
        { label: 'Любой', value: '' },
        { label: 'Арт', value: 'art' },
        { label: 'Безумие', value: 'bezumie' },
        { label: 'Боевик', value: 'boevik' },
        { label: 'Боевые искусства', value: 'boevyie-iskusstva' },
        { label: 'Вампиры', value: 'vampiryi' },
        { label: 'Военное', value: 'voennoe' },
        { label: 'Гарем', value: 'garem' },
        { label: 'Героическое фэнтези', value: 'geroicheskoe-fentezi' },
        { label: 'Демоны', value: 'demonyi' },
        { label: 'Детектив', value: 'detektiv' },
        { label: 'Дзёсэй', value: 'dzyosej' },
        { label: 'Драма', value: 'drama' },
        { label: 'Игра', value: 'igra' },
        { label: 'Исекай', value: 'isekaj' },
        { label: 'История', value: 'istoriya' },
        { label: 'Киберпанк', value: 'kiberpank' },
        { label: 'Комедия', value: 'komediya' },
        { label: 'Космос', value: 'kosmos' },
        { label: 'Магия', value: 'magiya' },
        { label: 'Махо-сёдзё', value: 'maho-syodzyo' },
        { label: 'Машины', value: 'mashinyi' },
        { label: 'Меха', value: 'meha' },
        { label: 'Мистика', value: 'mistika' },
        { label: 'Музыка', value: 'muzyika' },
        { label: 'Научная фантастика', value: 'nauchnaya-fantastika' },
        { label: 'Омегаверс', value: 'omegavers' },
        { label: 'Пародия', value: 'parodiya' },
        { label: 'Повседневность', value: 'povsednevnost' },
        { label: 'Полиция', value: 'politsiya' },
        { label: 'Постапокалиптика', value: 'postapokaliptika' },
        { label: 'Приключения', value: 'priklyucheniya' },
        { label: 'Психология', value: 'psihologiya' },
        { label: 'Романтика', value: 'romantika' },
        { label: 'Самурайский боевик', value: 'samurajskij-boevik' },
        { label: 'Сверхъестественное', value: 'sverhestestvennoe' },
        { label: 'Сёдзё', value: 'syodzyo' },
        { label: 'Сёнэн', value: 'syonen' },
        { label: 'Спорт', value: 'sport' },
        { label: 'Супер сила', value: 'super-sila' },
        { label: 'Сэйнэн', value: 'sejnen' },
        { label: 'Трагедия', value: 'tragediya' },
        { label: 'Триллер', value: 'triller' },
        { label: 'Ужасы', value: 'uzhasyi' },
        { label: 'Фантастика', value: 'fantastika' },
        { label: 'Фэнтези', value: 'fentezi' },
        { label: 'Школа', value: 'shkola' },
        { label: 'Этти', value: 'etti' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

const statuses: Record<string, string> = {
  FINISHED: NovelStatus.Completed,
  CONTINUES: NovelStatus.Ongoing,
  FROZEN: NovelStatus.OnHiatus,
  LICENSED: NovelStatus.Licensed,
};

type Page<T> = {
  count: number;
  results: T[];
};

type Named = { name: string; slug: string };

type CatalogItem = {
  name: string;
  slug: string;
  image?: string | null;
};

type Publication = CatalogItem & {
  description?: string | null;
  publicationStatus: string;
  authors?: Named[];
  genres?: Named[];
  tags?: Named[];
};

type ChapterItem = {
  slug: string;
  volume: number;
  chapter: number;
  name?: string | null;
  dateCreate: string;
};

type Chapter = {
  isAccess: boolean;
  isAccessAdult?: boolean;
  content?: {
    number: number;
    type: string;
    text?: string | null;
    image?: string | null;
  }[];
};

export default new WebFandom();
