import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// NovelDex is a Next.js application using app router, rsc ( react server components ), and flight protocol

type SeriesUrlFilters = {
  sort?: { value?: string };
  genre?: { value?: { include?: string[]; exclude?: string[] } };
  tag?: { value?: { include?: string[]; exclude?: string[] } };
  type?: { value?: string[] };
  status?: { value?: string[] };
  origin?: { value?: string[] };
  sale?: { value?: boolean };
  images?: { value?: boolean };
  ch_min?: { value?: string };
  ch_max?: { value?: string };
};

// Dealing with content encryption from noveldex
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

function deriveNoveldexKey(
  hint: string,
  timestamp: number,
  nonce: string,
): Uint8Array {
  const material = `${hint}|${timestamp}|${nonce}`;
  const key = new Uint8Array(32);
  let i = 0x811c9dc5;
  for (let j = 0; j < material.length; j++) {
    i ^= material.charCodeAt(j);
    i = Math.imul(i, 0x1000193) >>> 0;
  }
  for (let k = 0; k < 32; k++) {
    i ^= Math.imul(k, 0x9e3779b9) >>> 0;
    i = Math.imul(i, 0x1000193) >>> 0;
    key[k] = i & 0xff;
  }
  return key;
}

function xorDecrypt(cipher: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i++) {
    out[i] = cipher[i] ^ key[i % key.length];
  }
  return out;
}

type NoveldexChapter = {
  title: string;
  number: number;
  publishedAt: string;
  hasAccess?: boolean;
};

type NoveldexGenre = {
  name: string;
};

type NoveldexSeriesData = {
  title: string;
  description?: string;
  coverImage?: string;
  status: string;
  chapterCount?: number; // HTML fallback only, for totalPages
  genres: NoveldexGenre[];
};

type NoveldexSeriesPage = {
  series: NoveldexSeriesData;
  chapters: NoveldexChapter[];
  totalPages: number;
};

type BrowseSeriesItem = {
  title: string;
  urlSlug: string;
  coverImage?: string;
};

type SeriesBrowsePage = {
  initialSeries: BrowseSeriesItem[];
};

type NovelStatusValue = (typeof NovelStatus)[keyof typeof NovelStatus];

class Noveldex implements Plugin.PluginBase {
  id = 'noveldex';
  name = 'NovelDex';
  icon = 'src/en/noveldex/icon.png';
  site = 'https://noveldex.io';
  version = '1.0.0';
  // Filter do take a lot of space
  filters = {
    sort: {
      label: 'Sort By',
      type: FilterTypes.Picker,
      value: 'views',
      options: [
        { label: 'Recently Updated', value: 'updated' },
        { label: 'Most Bookmarked', value: 'popular' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Longest', value: 'longest' },
        { label: 'Trending', value: 'trending' },
        { label: 'Rating', value: 'rating' },
        { label: 'Newest', value: 'newest' },
      ],
    },
    type: {
      label: 'Type',
      type: FilterTypes.CheckboxGroup,
      value: [],
      options: [
        { label: 'Novel', value: 'Novel' },
        { label: 'Light Novel', value: 'Light Novel' },
        { label: 'Web Novel', value: 'Web Novel' },
        { label: 'Published Novel', value: 'Published Novel' },
        { label: 'Fanfiction', value: 'Fanfiction' },
        { label: 'Original Fiction', value: 'Original Fiction' },
        { label: 'One Shot', value: 'One Shot' },
        { label: 'Manhwa', value: 'Manhwa' },
        { label: 'Manhua', value: 'Manhua' },
        { label: 'Manga', value: 'Manga' },
        { label: 'Webtoon', value: 'Webtoon' },
      ],
    },
    status: {
      label: 'Status',
      type: FilterTypes.CheckboxGroup,
      value: [],
      options: [
        { label: 'Ongoing', value: 'Ongoing' },
        { label: 'Completed', value: 'Completed' },
        { label: 'Hiatus', value: 'Hiatus' },
        { label: 'Dropped', value: 'Dropped' },
        { label: 'Discontinued', value: 'Discontinued' },
        { label: 'Upcoming', value: 'Upcoming' },
      ],
    },
    origin: {
      label: 'Origin',
      type: FilterTypes.CheckboxGroup,
      value: [],
      options: [
        { label: 'Korean', value: 'KOREAN' },
        { label: 'Japanese', value: 'JAPANESE' },
        { label: 'Chinese', value: 'CHINESE' },
        { label: 'Other', value: 'OTHER' },
      ],
    },
    sale: {
      label: 'On Sale',
      type: FilterTypes.Switch,
      value: false,
    },
    images: {
      label: 'Illustrated',
      type: FilterTypes.Switch,
      value: false,
    },
    ch_min: {
      label: 'Min Chapters',
      type: FilterTypes.TextInput,
      value: '',
    },
    ch_max: {
      label: 'Max Chapters',
      type: FilterTypes.TextInput,
      value: '',
    },
    genre: {
      label: 'Genres',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: { include: [], exclude: [] },
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'GameLit', value: 'gamelit' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'LitRPG', value: 'litrpg' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Virtual Reality', value: 'virtual-reality' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
    tag: {
      label: 'Tags',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: { include: [], exclude: [] },
      options: [
        { label: 'Male Protagonist', value: 'male-protagonist' },
        { label: 'Overpowered Protagonist', value: 'overpowered-protagonist' },
        { label: 'Modern Day', value: 'modern-day' },
        { label: 'Harem', value: 'harem' },
        { label: 'Misunderstandings', value: 'misunderstandings' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Academy', value: 'academy' },
        { label: 'Transmigration', value: 'transmigration' },
        { label: 'Fantasy World', value: 'fantasy-world' },
        { label: 'Magic', value: 'magic' },
        { label: 'Character Growth', value: 'character-growth' },
        { label: 'Obsessive Love', value: 'obsessive-love' },
        { label: 'Beautiful Female Lead', value: 'beautiful-female-lead' },
        { label: 'Modern Fantasy', value: 'modern-fantasy' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Game Elements', value: 'game-elements' },
        { label: 'Female Protagonist', value: 'female-protagonist' },
        { label: 'Action', value: 'action' },
        { label: 'Romance', value: 'romance' },
        { label: 'Survival', value: 'survival' },
        { label: 'Monsters', value: 'monsters' },
        { label: 'Possession', value: 'possession' },
        { label: 'Weak to Strong', value: 'weak-to-strong' },
        { label: 'R-18', value: 'r-18' },
        { label: 'Yandere', value: 'yandere' },
        { label: 'Adventure', value: 'adventure' },
        { label: '19+', value: '19-360615' },
        { label: 'Hunters', value: 'hunters' },
        { label: 'Special Abilities', value: 'special-abilities' },
        { label: 'Adult', value: 'adult' },
        { label: 'Dark Fantasy', value: 'dark-fantasy' },
        { label: 'Genius Protagonist', value: 'genius-protagonist' },
        { label: 'Calm Protagonist', value: 'calm-protagonist' },
        { label: 'Nobles', value: 'nobles' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'System', value: 'system' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Obsession', value: 'obsession' },
        { label: 'Dungeons', value: 'dungeons' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Clever Protagonist', value: 'clever-protagonist' },
        { label: 'Drama', value: 'drama' },
        { label: 'Sword And Magic', value: 'sword-and-magic' },
        { label: 'Handsome Male Lead', value: 'handsome-male-lead' },
        { label: 'Aristocracy', value: 'aristocracy' },
        { label: 'Revenge', value: 'revenge' },
        { label: 'Male to Female', value: 'male-to-female' },
        { label: 'Adventurers', value: 'adventurers' },
        { label: 'Corruption', value: 'corruption' },
        { label: 'Second Chance', value: 'second-chance' },
        { label: 'Demons', value: 'demons' },
        { label: 'Mature', value: 'mature' },
        { label: 'Smut', value: 'smut' },
        { label: 'Pure Love', value: 'pure-love-978330' },
        { label: 'Regression', value: 'regression' },
        { label: 'Medieval', value: 'medieval' },
        { label: 'Politics', value: 'politics' },
        { label: 'Alternate World', value: 'alternate-world' },
        { label: 'Apocalypse', value: 'apocalypse' },
        { label: 'Accelerated Growth', value: 'accelerated-growth' },
        {
          label: 'Protagonist Strong from the Start',
          value: 'protagonist-strong-from-the-start',
        },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Antihero Protagonist', value: 'antihero-protagonist' },
        { label: 'Heroes', value: 'heroes' },
        { label: 'Adapted to Manhwa', value: 'adapted-to-manhwa' },
        {
          label: 'Hard-Working Protagonist',
          value: 'hard-working-protagonist',
        },
        { label: 'Training', value: 'training' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Royalty', value: 'royalty' },
        { label: 'Sword Wielder', value: 'sword-wielder' },
        { label: 'Urban Fantasy', value: 'urban-fantasy' },
        { label: 'Strong to Stronger', value: 'strong-to-stronger' },
        { label: 'Acting', value: 'acting' },
        { label: 'Regret', value: 'regret-728982' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Dark', value: 'dark' },
        { label: 'Betrayal', value: 'betrayal' },
        { label: 'Fantasy Creatures', value: 'fantasy-creatures' },
        { label: 'European Ambience', value: 'european-ambience' },
        {
          label: 'Schemes And Conspiracies',
          value: 'schemes-and-conspiracies',
        },
        { label: 'Level System', value: 'level-system' },
        { label: 'High Level', value: 'highlevel-008161' },
        { label: 'Romance Fantasy', value: 'romance-fantasy-578698' },
        { label: 'Live Streaming', value: 'livestreaming' },
        { label: 'Cunning Protagonist', value: 'cunning-protagonist' },
        { label: 'Gods', value: 'gods' },
        { label: 'Tragic Past', value: 'tragic-past' },
        { label: 'Incest', value: 'incest' },
        {
          label: 'Reincarnated in Another World',
          value: 'reincarnated-in-another-world',
        },
        { label: 'Hidden Identity', value: 'hidden-identity' },
        { label: 'Multiple POV', value: 'multiple-pov' },
        { label: 'First-time Intercourse', value: 'first-time-intercourse' },
        { label: 'Possessive Characters', value: 'possessive-characters' },
        {
          label: 'Transported into a Game World',
          value: 'transported-into-a-game-world',
        },
        { label: 'Hyundai', value: 'hyundai-025236' },
        { label: 'Kingdom Building', value: 'kingdom-building' },
        { label: 'Secret Identity', value: 'secret-identity' },
        { label: 'Tower Climbing', value: 'tower-climbing' },
        { label: 'Kingdoms', value: 'kingdoms' },
        { label: 'Military', value: 'military' },
        { label: 'Guilds', value: 'guilds' },
        { label: 'Netori', value: 'netori' },
        { label: 'Past Plays a Big Role', value: 'past-plays-a-big-role' },
        { label: 'Childhood Friends', value: 'childhood-friends' },
        { label: 'Ruthless Protagonist', value: 'ruthless-protagonist' },
        { label: 'Modern Knowledge', value: 'modern-knowledge' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Hunter', value: 'hunter-343706' },
        { label: 'Slow Romance', value: 'slow-romance' },
        { label: 'Depictions of Cruelty', value: 'depictions-of-cruelty' },
        { label: 'Hidden Abilities', value: 'hidden-abilities' },
        { label: 'Strategist', value: 'strategist' },
        { label: 'Elves', value: 'elves' },
        { label: 'Modern', value: 'modern-943487' },
        { label: 'Hidden Power', value: 'hidden-power' },
        { label: 'Knights', value: 'knights' },
        { label: 'BDSM', value: 'bdsm' },
        { label: 'Determined Protagonist', value: 'determined-protagonist' },
      ],
    },
  } satisfies Filters;

  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;
  webStorageUtilized?: boolean;

  private headers = {
    'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
  };

  // little fetchers helpers
  /*
        RSC response looks like this (simplified)

        1:I[99630,[],"LoadingBoundaryProvider"]
        5c:I[46538,[...chunks...],"SeriesBrowseGrid"]
        59:["$","$L5c",null,{"seed":"...","initialSeries":[...],...}]
    */

  private async fetchPage(url: string) {
    const repsonse = await fetchApi(url, {
      headers: this.headers,
    });
    return loadCheerio(await repsonse.text());
  }

  private async fetchRsc(url: string): Promise<string> {
    const res = await fetchApi(url, {
      headers: {
        'User-Agent': this.headers['User-Agent'],
        Referer: this.site,
        RSC: '1',
      },
    });
    return res.text();
  }

  // -----------------------------------------------------------------------
  // RSC parsing
  // -----------------------------------------------------------------------

  /**
        Find the flight-stream module id
        The id changes with each build, so we resolve it dynamically.
    */

  // For searching novels | Helpers for main function
  private findClientId(rscText: string, componentName: string): string | null {
    const escaped = componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = rscText.match(
      new RegExp(`^([0-9a-fA-F]+):I\\[\\d+,\\[[^\\]]*\\],"${escaped}"\\]`, 'm'),
    );
    return match ? match[1] : null;
  }

  private findSeriesClientId(rscText: string): string | null {
    return this.findClientId(rscText, 'SeriesDetailClient');
  }

  /**
   * Return the substring of `text` starting at `start` (which must be `{` or
   * `[`) up to and including the matching closing bracket.
   * Handles nested braces, string literals, and escapes.
   */
  private extractBalancedJson(text: string, start: number): string | null {
    const first = text[start];
    if (first !== '{' && first !== '[') return null;

    const open = first;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  // Pull `{ series, chapters, totalPages, ... }` out of the flight payload.
  private extractSeriesPage(rscText: string): NoveldexSeriesPage | null {
    const clientId = this.findSeriesClientId(rscText);
    if (!clientId) return null;

    const marker = `"$L${clientId}",null,`;

    let idx = rscText.indexOf(marker);
    while (idx !== -1) {
      const jsonText = this.extractBalancedJson(rscText, idx + marker.length);
      if (jsonText) {
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed && parsed.series && Array.isArray(parsed.chapters)) {
            return parsed as NoveldexSeriesPage;
          }
        } catch {
          // fall through and try the next occurrence
        }
      }
      idx = rscText.indexOf(marker, idx + marker.length);
    }

    return null;
  }

  //Fetch one page of a series via RSC
  private async fetchSeriesPage(
    novelPath: string,
    page: number,
  ): Promise<NoveldexSeriesPage | null> {
    const base = novelPath.split('?')[0]; // Modify the path lil bit
    const url = `${this.site}${base}?page=${page}`;
    const rscText = await this.fetchRsc(url);
    return this.extractSeriesPage(rscText);
  }

  // Function to continue fetching the remaining chapters through RSC raw flight text
  private mapChapters(
    chapters: NoveldexChapter[],
    base: string,
  ): Plugin.ChapterItem[] {
    return chapters.map(chapter => {
      const accessible = chapter.hasAccess !== false;
      const title = chapter.title || 'Untitled';
      return {
        name: accessible ? title : `🔒 ${title}`,
        path: `${base}/chapter/${chapter.number}`,
        releaseTime: chapter.publishedAt,
        chapterNumber: chapter.number,
      };
    });
  }

  // Convert NovelDex's raw status strings into the framework's NovelStatus enum.
  private mapStatus(raw: string | undefined): NovelStatusValue {
    switch (raw?.toUpperCase()) {
      case 'ONGOING':
        return NovelStatus.Ongoing;
      case 'COMPLETED':
        return NovelStatus.Completed;
      case 'HIATUS':
        return NovelStatus.OnHiatus;
      case 'DROPPED':
      case 'DISCONTINUED':
      case 'CANCELLED':
      case 'CANCELED':
        return NovelStatus.Cancelled;
      case 'UPCOMING':
      case 'INACTIVE':
        return NovelStatus.Inactive;
      case 'LICENSED':
        return NovelStatus.Licensed;
      default:
        return NovelStatus.Unknown;
    }
  }

  // Popular list or Latest Novel
  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.buildSeriesUrl(page, {
      // "Latest" tab wins over the sort picker — the site defaults to recently-updated when sort is omitted.
      sort: showLatestNovels ? undefined : filters?.sort?.value || 'views',
      filters,
    });

    const rscText = await this.fetchRsc(url);
    const pageData = this.extractBrowsePage(rscText);
    if (!pageData) return [];

    return pageData.initialSeries.map(s => ({
      name: s.title,
      path: `/series/novel/${s.urlSlug}`,
      cover: s.coverImage
        ? new URL(s.coverImage, this.site).href
        : defaultCover,
    }));
  }

  private buildSeriesUrl(
    page: number,
    opts: {
      q?: string;
      sort?: string;
      filters?: SeriesUrlFilters;
    } = {},
  ): string {
    const params = new URLSearchParams();

    if (opts.sort) params.set('sort', opts.sort);
    if (opts.q) params.set('q', opts.q);

    const f = opts.filters;

    // Excludable groups — genre and tag have include/exclude halves.
    const addExcludable = (
      value: { include?: string[]; exclude?: string[] } | undefined,
      includeKey: string,
      excludeKey: string,
    ) => {
      if (value?.include?.length) {
        params.set(includeKey, value.include.join(','));
      }
      if (value?.exclude?.length) {
        params.set(excludeKey, value.exclude.join(','));
      }
    };

    addExcludable(f?.genre?.value, 'genre', 'exgenre');
    addExcludable(f?.tag?.value, 'tag', 'extag');

    // Simple multi-select groups — comma-joined, include only.
    const addList = (value: string[] | undefined, key: string) => {
      if (value?.length) params.set(key, value.join(','));
    };

    addList(f?.type?.value, 'type');
    addList(f?.status?.value, 'status');
    addList(f?.origin?.value, 'origin');

    // Boolean toggles — only added when true.
    if (f?.sale?.value) params.set('sale', 'true');
    if (f?.images?.value) params.set('images', 'true');

    // Chapter count range — added only when the user typed something.
    const min = f?.ch_min?.value?.trim();
    const max = f?.ch_max?.value?.trim();
    if (min) params.set('ch_min', min);
    if (max) params.set('ch_max', max);

    if (page > 1) params.set('page', String(page));

    return `${this.site}/series?${params.toString()}`;
  }

  // -----------------------------------------------------------------------
  // HTML fallbacks - used only if RSC parsing fails, RIP 🙏
  // -----------------------------------------------------------------------
  private async parseChapterPage(
    novelPath: string,
    page: string,
  ): Promise<Plugin.ChapterItem[]> {
    const $ = await this.fetchPage(
      `${this.site}${novelPath.split('?')[0]}?page=${page}`,
    );

    let chapters: NoveldexChapter[] = [];

    $('script').each((_, el) => {
      const text = $(el).text();

      if (text.includes('hasAccess')) {
        const chapterStart = text.indexOf('\\"chapters\\":[');
        const chapterEnd = text.indexOf(',\\"characters\\"', chapterStart);

        if (chapterStart === -1 || chapterEnd === -1) return;

        const chaptersText = text.slice(
          chapterStart + '\\"chapters\\":'.length,
          chapterEnd,
        );

        const chaptersJson = chaptersText
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"');

        chapters = JSON.parse(chaptersJson) as NoveldexChapter[];
        return false;
      }
    });

    const clrNovelPath = novelPath.split('?')[0];

    return chapters.map(chapter => ({
      name: chapter.title || 'Untitled',
      path: `${clrNovelPath}/chapter/${chapter.number}`,
      releaseTime: chapter.publishedAt,
      chapterNumber: chapter.number,
    }));
  }

  private async parseNovelFromHtml(
    novelPath: string,
  ): Promise<Plugin.SourceNovel> {
    const $ = await this.fetchPage(`${this.site}${novelPath}`);

    const title = $('h1').text().trim() || '';
    const src = $(`img[alt="${title}"]`).attr('src');
    const cover = src ? new URL(src, this.site).href : undefined;

    let seriesData: NoveldexSeriesData | undefined;

    $('script').each((_, el) => {
      const text = $(el).text();

      if (text.includes('hasAccess')) {
        const jsonStartIdx = text.indexOf('{\\"id\\"');
        const jsonEndIdx = text.indexOf(',\\"chapters\\"', jsonStartIdx);

        if (jsonStartIdx !== -1 && jsonEndIdx !== -1) {
          const seriesText = text.slice(jsonStartIdx, jsonEndIdx);
          const jsonText = seriesText.replace(/\\"/g, '"');
          seriesData = JSON.parse(jsonText) as NoveldexSeriesData;
          return false;
        }
      }
    });

    const chapterCount = seriesData?.chapterCount || 0;
    const totalPages = Math.ceil(chapterCount / 100);

    const allChapters: Plugin.ChapterItem[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const pageChapters = await this.parseChapterPage(novelPath, i.toString());
      allChapters.push(...pageChapters);

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const description = seriesData?.description
      ?.replace(/\\r\\n/g, '\n')
      ?.replace(/\\n/g, '\n')
      ?.trim();

    const genres = seriesData?.genres?.map(g => g.name) || [];

    return {
      path: novelPath,
      name: title || seriesData?.title || 'Untitled',
      cover: cover || defaultCover,
      status: this.mapStatus(seriesData?.status),
      summary: description,
      genres: genres.join(', '),
      chapters: allChapters,
    };
  }

  // -----------------------------------------------------------------------
  // Main parser — RSC first, HTML fallback
  // -----------------------------------------------------------------------

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const base = novelPath.split('?')[0];

    try {
      const first = await this.fetchSeriesPage(base, 1);

      if (first?.series) {
        const allChapters = this.mapChapters(first.chapters, base);

        // Walk remaining pages — RSC-only
        for (let page = 2; page <= first.totalPages; page++) {
          try {
            const next = await this.fetchSeriesPage(base, page);
            if (next?.chapters?.length) {
              allChapters.push(...this.mapChapters(next.chapters, base));
            }
            await new Promise(r => setTimeout(r, 100));
          } catch (error) {
            console.warn(`Failed to fetch page ${page}:`, error);
          }
        }

        allChapters.sort(
          (a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0),
        );

        const s = first.series;

        const cover = s.coverImage
          ? new URL(s.coverImage, this.site).href
          : defaultCover;

        const description = (s.description || '')
          .replace(/\\r\\n/g, '\n')
          .replace(/\\n/g, '\n')
          .trim();

        const genres =
          s.genres
            ?.map(g => g.name)
            .filter(Boolean)
            .join(', ') || '';

        return {
          path: base,
          name: s.title || 'Untitled',
          cover,
          status: this.mapStatus(s.status),
          summary: description,
          genres,
          chapters: allChapters,
        };
      }
    } catch {
      // fall through to the HTML scraper
    }

    /*
            Next.js's flight format is not a stable public API
            If noveldex upgrades next.js, Client Component returns null so to make sure the code still work
            We fall back on extracting with html + cheerio, we lose speed but it works.
        */

    return this.parseNovelFromHtml(base);
  }

  // Chapter content helper
  private extractDeferredText(
    rscText: string,
    refId: string,
  ): string | undefined {
    const esc = refId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|\\n)${esc}:T([0-9a-fA-F]+),`).exec(rscText);
    if (!m) return undefined;
    const start = m.index + m[0].length;
    const bytes = new TextEncoder().encode(rscText.slice(start));
    return new TextDecoder().decode(bytes.slice(0, parseInt(m[1], 16)));
  }

  // Main chapter content
  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}`;
    const rscText = await this.fetchRsc(url);

    // Checking whether the chapter is free
    if (/"isUnlocked"\s*:\s*false/.test(rscText)) {
      throw new Error(
        'This chapter requires premium access and cannot be read here.',
      );
    }

    // Decrypting starts

    // 1. Locate the xorEncryption block
    const xorMatch = rscText.match(/"xorEncryption"\s*:\s*(\{[^}]+\})/);
    if (!xorMatch)
      throw new Error(
        'Could not load chapter. It may require premium access or a purchase.',
      );

    const xor = JSON.parse(xorMatch[1]) as {
      encryptedBase64: string;
      partialKeyHint: string;
      timestamp: number;
      clientNonce: string;
    };

    // 2. Resolve "$64" → line "64:T<hexlen>,<base64>"
    let b64: string;
    const refMatch = /^\$([0-9a-zA-Z]+)$/.exec(xor.encryptedBase64);

    if (refMatch) {
      const esc = refMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`(?:^|\\n)${esc}:T([0-9a-fA-F]+),`).exec(rscText);
      if (!m) throw new Error('noveldex: cannot resolve encrypted ref');

      const start = m.index + m[0].length;
      const byteLen = parseInt(m[1], 16);
      const bytes = new TextEncoder().encode(rscText.slice(start));
      b64 = new TextDecoder().decode(bytes.slice(0, byteLen));
    } else {
      b64 = xor.encryptedBase64;
    }

    // 3. Decrypt
    const cipher = base64ToBytes(b64);
    const key = deriveNoveldexKey(
      xor.partialKeyHint,
      xor.timestamp,
      xor.clientNonce,
    );
    const content = new TextDecoder('utf-8').decode(xorDecrypt(cipher, key));

    if (!content?.trim()) throw new Error('noveldex: empty chapter');

    // 4. Normalize
    return (
      content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Make NovelDex hosted images absolute.
        //   src="/uploads/..."  →  src="https://noveldex.io/uploads/..."
        .replace(/(<img\b[^>]*?\bsrc=")\/(?!\/)([^"]*")/gi, `$1${this.site}/$2`)
        /*
                    Unwrap stray <p> wrapping around block-level <div>s.
                    NovelDex emits <p><div>...</div></p> — invalid HTML that
                    breaks the system-UI card layout in the reader WebView.
                */
        .replace(/<p>\s*(<div\b[^>]*>)/gi, '$1')
        .replace(/(<\/div>)\s*<\/p>/gi, '$1')

        /*
                    Collapse <br> runs adjacent to block-level tags. 
                    Every source line ends in <br>, which doubles spacing around the styled div blocks.
                */
        .replace(/(<\/(?:p|div|figure)>)\s*(?:<br\s*\/?>\s*)+/gi, '$1')
        .replace(/(?:<br\s*\/?>\s*)+(<(?:p|div|figure)\b)/gi, '$1')

        .replace(/style="([^"]*?)"/g, (match, styles) =>
          /border|background|box-shadow/.test(styles)
            ? `style="font-family:'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;${styles}"`
            : match,
        )
        /*
                    Split into chunks and wrap plain-text ones. 
                    Chunks that already begin with a block-level tag pass through as-is
                    so we don't nest <p> inside <p>.
                */

        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p =>
          /^<(?:p|div|figure|img|h[1-6]|blockquote|hr|ul|ol)\b/i.test(p)
            ? p
            : `<p>${p.replace(/\n/g, '<br>')}</p>`,
        )
        .join('')
    );
  }

  // Search starts
  // Bridge between raw RSC and structured data
  private extractBrowsePage(rscText: string): SeriesBrowsePage | null {
    const clientId = this.findClientId(rscText, 'SeriesBrowseGrid');
    if (!clientId) return null;

    const marker = `"$L${clientId}",null,`;

    let idx = rscText.indexOf(marker);
    while (idx !== -1) {
      const jsonText = this.extractBalancedJson(rscText, idx + marker.length);
      if (jsonText) {
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed && Array.isArray(parsed.initialSeries)) {
            return parsed as SeriesBrowsePage;
          }
        } catch {
          // try the next occurrence
        }
      }
      idx = rscText.indexOf(marker, idx + marker.length);
    }

    return null;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (!searchTerm.trim()) return [];

    const params = new URLSearchParams({ q: searchTerm, sort: 'views' });
    if (pageNo > 1) params.set('page', String(pageNo));

    const rscText = await this.fetchRsc(
      `${this.site}/series?${params.toString()}`,
    );

    const page = this.extractBrowsePage(rscText);
    if (!page) return [];

    return page.initialSeries.map(s => ({
      name: s.title,
      path: `/series/novel/${s.urlSlug}`,
      cover: s.coverImage
        ? new URL(s.coverImage, this.site).href
        : defaultCover,
    }));
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new Noveldex();
