import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type FlightChapter = {
  title?: string;
  slug?: string;
  chapter_number?: number;
  published_at?: string | null;
  premium?: boolean;
};

type FlightChapterPayload = {
  novelSlug: string;
  chapters: FlightChapter[];
};

const novelCardPath = /^novels\/[^/]+$/;
const stripSlashPattern = /^\//;
const scriptStylePattern = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const chapterPrefixPattern =
  /^(?:chapter|ch\.?|episode|ep\.?|prologue|epilogue)\b/i;
const unlockHeadingPattern = /unlock this chapter/i;

/**
 * Penguin Squad migrated from WordPress Fictioneer to a custom Next.js App
 * Router application.
 *
 * - Listing:      `/novels?sort=…&status=…&lang=…&genre=…&tag=…&illustrated=true`
 *                 renders all matching novels on a single page as `a.group` cards.
 * - Search:       `/search?q=<term>` renders matching `a.group` cards.
 * - Novel page:   `/novels/<slug>`. For novels with >20 chapters and no arcs,
 *                 SSR HTML only renders the first 10 and last 10 links; the
 *                 complete chapter list lives in the embedded RSC flight payload.
 * - Chapter page: `/novels/<slug>/<chapter-slug>`, body in `.reader-content`.
 */
class PenguinSquad implements Plugin.PluginBase {
  id = 'penguinsquad';
  name = 'Penguin Squad';
  version = '2.0.0';
  icon = 'src/en/penguinsquad/icon.png';
  site = 'https://penguin-squad.com/';

  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error('Request failed: ' + res.status);
    }
    return res.text();
  }

  private stripLeadingSlash(path: string): string {
    return path.replace(stripSlashPattern, '');
  }

  private parseDocument(html: string): CheerioAPI {
    // Strip Next.js RSC flight scripts and inline styles before Cheerio parses
    // the DOM, avoiding ~350–930 KB of non-content nodes on mobile.
    return parseHTML(html.replace(scriptStylePattern, ''));
  }

  private resolveCoverUrl(src: string | undefined): string {
    const trimmed = src?.trim();
    if (!trimmed) return defaultCover;
    try {
      return new URL(trimmed, this.site).toString();
    } catch {
      return defaultCover;
    }
  }

  private buildChapterItem(params: {
    rawTitle: string;
    path: string;
    chapterNumber?: number;
    locked?: boolean;
    releaseTime?: string | null;
    hideLocked: boolean;
  }): Plugin.ChapterItem | undefined {
    if (params.locked && params.hideLocked) return undefined;
    const title = params.rawTitle.trim();
    const num = params.chapterNumber;
    const baseName = !title
      ? `Chapter ${num ?? ''}`.trim()
      : chapterPrefixPattern.test(title) || num === undefined
        ? title
        : `Chapter ${num} - ${title}`;

    return {
      name: params.locked ? `🔒 ${baseName}` : baseName,
      path: params.path,
      releaseTime: params.releaseTime ?? null,
      chapterNumber: num,
    };
  }

  private parsePayloadFromFlightText(
    flightText: string,
  ): FlightChapterPayload | undefined {
    for (const line of flightText.split('\n')) {
      if (!line.includes('"chapters":[')) continue;
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      try {
        const parsed = JSON.parse(line.slice(colon + 1));
        const payload = this.findChapterPayload(parsed);
        if (payload) return payload;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  private extractChapterPayload(
    html: string,
  ): FlightChapterPayload | undefined {
    const chunks: string[] = [];
    const flightPushPattern =
      /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;
    let match: RegExpExecArray | null;
    while ((match = flightPushPattern.exec(html)) !== null) {
      let decoded: string;
      try {
        decoded = JSON.parse(match[1]);
      } catch {
        continue;
      }
      // Fast-path: return immediately if the complete chapters row lives in
      // this chunk without concatenating the full flight stream.
      if (decoded.includes('"chapters":[')) {
        const payload = this.parsePayloadFromFlightText(decoded);
        if (payload) return payload;
      }
      chunks.push(decoded);
    }
    return this.parsePayloadFromFlightText(chunks.join(''));
  }

  private findChapterPayload(node: unknown): FlightChapterPayload | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = this.findChapterPayload(item);
        if (found) return found;
      }
      return undefined;
    }
    const record = node as Record<string, unknown>;
    if (
      typeof record.novelSlug === 'string' &&
      Array.isArray(record.chapters)
    ) {
      return record as unknown as FlightChapterPayload;
    }
    for (const key in record) {
      const found = this.findChapterPayload(record[key]);
      if (found) return found;
    }
    return undefined;
  }

  private parseCards($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('a.group[href^="/novels/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const path = this.stripLeadingSlash(href);
      if (!novelCardPath.test(path) || seen.has(path)) return;
      seen.add(path);
      const name = $(el).find('h3').first().text().trim();
      if (!name) return;
      const cover = this.resolveCoverUrl($(el).find('img').first().attr('src'));
      novels.push({ name, path, cover });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    // `/novels` without `sort` defaults to `updated` on the server.
    const url = new URL('novels', this.site);
    if (!showLatestNovels && filters) {
      if (filters.genre?.value) {
        url.searchParams.set('genre', filters.genre.value);
      }
      for (const tag of filters.tags?.value || []) {
        url.searchParams.append('tag', tag);
      }
      if (filters.lang?.value) {
        url.searchParams.set('lang', filters.lang.value);
      }
      if (filters.status?.value) {
        url.searchParams.set('status', filters.status.value);
      }
      if (filters.illustrated?.value) {
        url.searchParams.set('illustrated', 'true');
      }
      if (filters.sort?.value && filters.sort.value !== 'updated') {
        url.searchParams.set('sort', filters.sort.value);
      }
    }

    const html = await this.fetchHtml(url.toString());
    return this.parseCards(this.parseDocument(html));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const cleanPath = this.stripLeadingSlash(novelPath).replace(/\/+$/, '');
    const html = await this.fetchHtml(this.site + cleanPath);
    const $ = this.parseDocument(html);

    const genreSet = new Set<string>();
    $('a[href^="/novels?genre="], a[href^="/novels?tag="]').each((_, el) => {
      const text = $(el).text().trim();
      if (text) genreSet.add(text);
    });
    const genres = Array.from(genreSet).join(', ');

    let status: NovelStatus = NovelStatus.Unknown;
    $('span[data-slot="badge"]').each((_, el) => {
      const badgeText = $(el).text().trim().toLowerCase();
      if (badgeText === 'ongoing') status = NovelStatus.Ongoing;
      else if (badgeText === 'completed') status = NovelStatus.Completed;
      else if (badgeText === 'dropped') status = NovelStatus.Cancelled;
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Untitled',
      cover: this.resolveCoverUrl(
        $('meta[property="og:image"]').attr('content') ||
          $('img[src*="/covers/"]').first().attr('src'),
      ),
      author: $('a[href^="/search?q="]').first().text().trim() || undefined,
      summary:
        $('p.line-clamp-10').first().text().trim() ||
        $('meta[name="description"]').attr('content')?.trim() ||
        undefined,
      genres: genres || undefined,
      status,
    };

    const hideLocked = Boolean(storage.get('hideLocked'));
    const chapters: Plugin.ChapterItem[] = [];

    const payload = this.extractChapterPayload(html);
    if (payload) {
      for (const ch of payload.chapters) {
        if (!ch.slug) continue;
        const item = this.buildChapterItem({
          rawTitle: ch.title || '',
          path: `novels/${payload.novelSlug}/${ch.slug}`,
          chapterNumber:
            typeof ch.chapter_number === 'number'
              ? ch.chapter_number
              : undefined,
          locked: Boolean(ch.premium),
          releaseTime: ch.published_at || null,
          hideLocked,
        });
        if (item) chapters.push(item);
      }
    }

    if (!payload || payload.chapters.length === 0) {
      $(`a[href^="/${cleanPath}/"]`).each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const numText = $(el).find('span').first().text().trim();
        const chNum = numText ? Number(numText) : undefined;
        const item = this.buildChapterItem({
          rawTitle: $(el).find('p').first().text().trim(),
          path: this.stripLeadingSlash(href),
          chapterNumber:
            chNum !== undefined && Number.isFinite(chNum) ? chNum : undefined,
          locked: $(el).find('svg.lucide-lock').length > 0,
          hideLocked,
        });
        if (item) chapters.push(item);
      });
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const cleanPath = this.stripLeadingSlash(chapterPath);
    const html = await this.fetchHtml(this.site + cleanPath);
    const $ = this.parseDocument(html);

    let isLocked = false;
    $('h2').each((_, el) => {
      if (unlockHeadingPattern.test($(el).text())) {
        isLocked = true;
        return false;
      }
    });
    if (isLocked) {
      throw new Error(
        'This chapter is locked. Unlock it on Penguin Squad to read it.',
      );
    }

    const content = $('.reader-content').first();
    if (!content.length) {
      throw new Error('Could not find chapter content.');
    }

    content.find('p').each((_, el) => {
      if (!$(el).text().trim() && !$(el).find('img').length) {
        $(el).remove();
      }
    });

    return content.html()?.trim() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = searchTerm.trim();
    if (pageNo > 1 || !query) return [];
    const html = await this.fetchHtml(
      `${this.site}search?q=${encodeURIComponent(query)}`,
    );
    return this.parseCards(this.parseDocument(html));
  }

  resolveUrl = (path: string) => this.site + this.stripLeadingSlash(path);

  filters = {
    sort: {
      label: 'Sort By',
      value: 'trending',
      options: [
        { label: 'Trending', value: 'trending' },
        { label: 'Recently Updated', value: 'updated' },
        { label: 'Newest', value: 'newest' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Most Saved', value: 'bookmarks' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
    lang: {
      label: 'Language',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Korean', value: 'ko' },
        { label: 'Japanese', value: 'ja' },
        { label: 'Chinese', value: 'zh' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Genre',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Alternate History', value: 'Alternate History' },
        { label: "Boys' Love", value: "Boys' Love" },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Gender Bender', value: 'Gender Bender' },
        { label: "Girls' Love", value: "Girls' Love" },
        { label: 'Harem', value: 'Harem' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Martial Arts', value: 'Martial Arts' },
        { label: 'Modern Fantasy', value: 'Modern Fantasy' },
        { label: 'Murim', value: 'Murim' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Slice of Life', value: 'Slice of Life' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Tragedy', value: 'Tragedy' },
        { label: 'Xianxia', value: 'Xianxia' },
      ],
      type: FilterTypes.Picker,
    },
    illustrated: {
      label: 'Illustrated Only',
      value: false,
      type: FilterTypes.Switch,
    },
    tags: {
      label: 'Tags',
      value: [],
      options: [
        { label: 'Academy', value: 'Academy' },
        { label: 'Dungeon', value: 'Dungeon' },
        { label: 'Game', value: 'Game' },
        { label: 'Medieval', value: 'Medieval' },
        { label: 'Military', value: 'Military' },
        { label: 'Misunderstandings', value: 'Misunderstandings' },
        { label: 'Modern', value: 'Modern' },
        { label: 'Obsessive Characters', value: 'Obsessive Characters' },
        { label: 'Overpowered MC', value: 'Overpowered MC' },
        { label: 'Post-Apocalyptic', value: 'Post-Apocalyptic' },
        { label: 'Rebirth', value: 'Rebirth' },
        { label: 'Redemption', value: 'Redemption' },
        { label: 'Regression', value: 'Regression' },
        { label: 'Regret', value: 'Regret' },
        { label: 'Sports', value: 'Sports' },
        { label: 'Streaming', value: 'Streaming' },
        { label: 'System', value: 'System' },
        { label: 'Transmigration', value: 'Transmigration' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new PenguinSquad();
