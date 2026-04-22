import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  api = 'https://api.novelbuddy.com/';
  version = '2.1.0';
  icon = 'src/en/novelbuddy/icon.png';

  parseNovels(body: Response): Plugin.NovelItem[] {
    return body.data.items.map(item => ({
      name: item.name,
      path: new URL(item.url, this.site).pathname.substring(1),
      cover: item.cover,
    }));
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { genre, min_ch, max_ch, status, demo, orderBy, keyword } = filters;

    // Chapter bounds must be an integer between 0 and 10,000 or api cri
    const parseNumber = (val?: string) => {
      if (!val?.trim()) return;

      const n = Number(val);
      return Number.isInteger(n) && n >= 0 && n <= 10000
        ? String(n)
        : undefined;
    };

    const rawParams: Record<string, string | undefined> = {
      genres: genre.value.include?.join(',') || undefined,
      exclude: genre.value.exclude?.join(',') || undefined,
      min_ch: parseNumber(min_ch.value),
      max_ch: parseNumber(max_ch.value),
      status: String(status.value),
      demographic: demo.value?.join(',') || undefined,
      sort: String(orderBy.value),
      page: String(pageNo),
      limit: '24',
      q: keyword.value || undefined,
    };

    // Filter out the undefined values
    const params = Object.fromEntries(
      Object.entries(rawParams).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    if (!initialManga) throw new Error('Could not find initialManga data');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: initialManga.name || 'Untitled',
      cover: initialManga.cover,
      author: initialManga.authors?.map(a => a.name).join(', ') || '',
      artist: initialManga.artists?.map(a => a.name).join(', ') || '',
      genres: initialManga.genres?.map(g => g.name).join(',') || '',
      chapters: [],
    };

    const rawStatus = initialManga.status;
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
      unknown: NovelStatus.Unknown,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    const summary = $(initialManga.summary || '');
    summary.find('br').replaceWith('\n');
    summary.find('p').before('\n').after('\n\n');

    novel.summary =
      summary
        .text()
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        ?.replace(/\n{3,}/g, '\n\n')
        .trim() || 'Summary Not Found';

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    // Fetch full chapter list from API
    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersJson: ChapterResponse = await chaptersResponse.json();

    if (chaptersJson?.success && chaptersJson?.data?.chapters) {
      novel.chapters = chaptersJson.data.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updated_at,
        }))
        .reverse();
    } else if (initialManga.chapters) {
      novel.chapters = initialManga.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updatedAt,
        }))
        .reverse();
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data: ChapterScript = JSON.parse(script);
    const initialChapter = data.props.pageProps.initialChapter;
    if (!initialChapter) throw new Error('Could not find chapter content');

    let content = initialChapter.content;

    if (content) {
      // Remove Webnovel watermarks/ads
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi,
        '',
      );

      // Remove obfuscated freewebnovel watermarks (e.g., free𝑤𝑒𝑏novel.com)
      content = content.replace(/free.*?novel\.com/gi, '');
    }

    return content;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      'q': searchTerm,
      'limit': '24',
      'page': page.toString(),
    });

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  filters = {
    orderBy: {
      value: 'views',
      label: 'Order by',
      options: [
        { label: 'Default Order', value: '' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Latest Updated', value: 'latest' },
        { label: 'Most Popular', value: 'popular' },
        { label: 'A-Z', value: 'alphabetical' },
        { label: 'Highest Rating', value: 'rating' },
        { label: 'Most Chapters', value: 'chapters' },
      ],
      type: FilterTypes.Picker,
    },
    keyword: {
      value: '',
      label: 'Keywords',
      type: FilterTypes.TextInput,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: {
        include: [],
        exclude: [],
      },
      label: 'Genres (OR, not AND)',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Action Adventure', value: 'action-adventure' },
        { label: 'ActionAdventure', value: 'actionadventure' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventcure', value: 'adventcure' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Adventurer', value: 'adventurer' },
        { label: 'Anime u0026 Comics', value: 'anime-u0026-comics' },
        { label: 'Bender', value: 'bender' },
        { label: 'Booku0026Literature', value: 'booku0026literature' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Comed', value: 'comed' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'ComedySlice of Life', value: 'comedyslice-of-life' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'dventure', value: 'dventure' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Easterni', value: 'easterni' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Ecchi Fantasy', value: 'ecchi-fantasy' },
        { label: 'Fan-Fiction', value: 'fan-fiction' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantas', value: 'fantas' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'FantasyAction', value: 'fantasyaction' },
        { label: 'Game', value: 'game' },
        { label: 'Games', value: 'games' },
        { label: 'Gender', value: 'gender' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'HaremAction', value: 'haremaction' },
        { label: 'Haremv', value: 'haremv' },
        { label: 'Historica', value: 'historica' },
        { label: 'Historical', value: 'historical' },
        { label: 'History', value: 'history' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'lice of Life', value: 'lice-of-life' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial', value: 'martial' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Myster', value: 'myster' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Mystery.Adventure', value: 'mystery.adventure' },
        { label: 'Psychologic', value: 'psychologic' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnatio', value: 'reincarnatio' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romanc', value: 'romanc' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance.Adventure', value: 'romance.adventure' },
        { label: 'Romance.Harem', value: 'romance.harem' },
        { label: 'Romance.Smut', value: 'romance.smut' },
        { label: 'RomanceAction', value: 'romanceaction' },
        { label: 'RomanceAdventure', value: 'romanceadventure' },
        { label: 'RomanceHarem', value: 'romanceharem' },
        { label: 'Romancei', value: 'romancei' },
        { label: 'Romancem', value: 'romancem' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Seinen Wuxia', value: 'seinen-wuxia' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Lif', value: 'slice-of-lif' },
        { label: 'Slice Of Life', value: 'slice-of-life' },
        { label: 'Slice of Lifel', value: 'slice-of-lifel' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Superna', value: 'superna' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    min_ch: {
      value: '',
      label: 'Minimum Chapters',
      type: FilterTypes.TextInput,
    },
    max_ch: {
      value: '',
      label: 'Maximum Chapters',
      type: FilterTypes.TextInput,
    },
    type: {
      value: '',
      label: 'Types',
      options: [
        { label: 'All Types', value: '' },
        { label: 'Japanese comics', value: 'manga' },
        { label: 'Korean comics', value: 'manhwa' },
        { label: 'Chinese comics', value: 'manhua' },
      ],
      type: FilterTypes.Picker,
    },
    demo: {
      value: [],
      label: 'Demographics',
      options: [
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Josei', value: 'josei' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelBuddy();

type Response = {
  data: {
    items: Items[];
  };
};

type ChapterResponse = {
  success: boolean;
  data?: {
    chapters?: Items[];
  };
};

type Items = {
  id: string;
  url: string;
  name: string;
  alt_name?: string;
  cover?: string;
  slug: string;
  updated_at?: string;
  updatedAt?: string;
};

type NovelScript = {
  props: {
    pageProps: {
      initialManga: Manga;
    };
  };
};

type Manga = {
  id: string;
  url: string;
  name?: string;
  altName?: string;
  cover: string;
  status: string;
  ratingStats?: {
    average: number;
  };
  summary?: string;
  artists?: {
    name: string;
    slug: string;
  }[];
  authors?: {
    name: string;
    slug: string;
  }[];
  genres?: {
    name: string;
    slug: string;
  }[];
  chapters?: Items[];
};

type ChapterScript = {
  props: {
    pageProps: {
      initialChapter: Chapter;
    };
  };
};

type Chapter = {
  name: string;
  content: string;
};
