import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { storage } from '@libs/storage';
import { NovelStatus } from '@libs/novelStatus';

const MOBILE_SITE = 'https://m.webnovel.com';

type Named = { name?: string }[] | null;
type BookInfo = {
  bookId?: string;
  bookName?: string;
  authorName?: string;
  authorItems?: Named;
  description?: string;
  categoryName?: string;
  tagInfos?: { tagName?: string }[] | null;
  actionStatus?: number;
  totalScore?: number;
  voters?: number;
  pvNum?: number;
  chapterNum?: number;
  totalChapterNum?: number;
  updateFrequency?: number;
  frequencyUnit?: string;
  updateTime?: number;
  coverUpdateTime?: number;
  groupItems?: Named;
  translatorItems?: Named;
  editorItems?: Named;
};
type TabInfo = { power?: { nums?: number }; golden?: { nums?: number } };
type MobileChapter = { publishTime?: number };
/** `props` of a m.webnovel.com page's `__NEXT_DATA__` */
type NextProps = {
  initialProps?: {
    pageProps?: { initData?: { bookInfo?: BookInfo; tabInfo?: TabInfo } };
  };
  initialState?: {
    entities?: { chapter?: Record<string, MobileChapter> };
  };
};

const STATUS: Record<number, string> = {
  30: NovelStatus.Ongoing,
  50: NovelStatus.Completed,
};

const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Same as the site: 82255255 -> "82.2M" (truncated, not rounded) */
const compact = (n: number) => {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [div, suffix] of units) {
    if (n >= div) return (Math.floor((n / div) * 10) / 10).toFixed(1) + suffix;
  }
  return grouped(n);
};

const names = (items?: Named) =>
  (items || []).map(i => i.name?.trim()).filter((n): n is string => !!n);

const titleCase = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, c => c.toUpperCase());

const bookIdOf = (novelPath: string) => novelPath.match(/(\d+)\/?$/)?.[1];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const stat = (n: unknown, format: (n: number) => string) =>
  typeof n === 'number' && n >= 0 ? format(n) : undefined;

class Webnovel implements Plugin.PluginBase {
  id = 'webnovel';
  name = 'Webnovel';
  version = '1.1.0';
  icon = 'src/en/webnovel/icon.png';
  site = 'https://www.webnovel.com';
  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  imageRequestInit?: Plugin.ImageRequestInit | undefined = {
    headers: {
      'referrer': this.site,
    },
  };
  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async parseNovels(
    loadedCheerio: CheerioAPI,
    category_bool: boolean,
    search_bool: boolean,
  ): Promise<Plugin.NovelItem[]> {
    const selector = category_bool
      ? '.j_category_wrapper'
      : search_bool
        ? '.j_list_container'
        : '';
    const attribute = category_bool
      ? 'data-original'
      : search_bool
        ? 'src'
        : '';

    return loadedCheerio(`${selector} li`)
      .map((i_, ele) => {
        const novelName =
          loadedCheerio(ele).find('.g_thumb').attr('title') || 'No Title Found';
        const novelCover = loadedCheerio(ele)
          .find('.g_thumb > img')
          .attr(attribute);
        const novelPath = loadedCheerio(ele).find('.g_thumb').attr('href');

        if (!novelPath) return null;

        return {
          name: novelName,
          cover: 'https:' + novelCover,
          path: novelPath,
        };
      })
      .get()
      .filter(novel => novel !== null);
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (filters?.fanfic_search.value) {
      return this.searchNovelsInternal(
        filters.fanfic_search.value,
        pageNo,
        'fanfic',
      );
    }
    let url = this.site + '/stories/';
    const params = new URLSearchParams();

    if (showLatestNovels) {
      url += `novel?orderBy=5&pageIndex=${pageNo}`;
    } else if (filters) {
      if (filters.genres_gender.value === '1') {
        if (filters.genres_male.value !== '1') {
          url += filters.genres_male.value;
        } else {
          url += 'novel';
          params.append('gender', '1');
        }
      } else if (filters.genres_gender.value === '2') {
        if (filters.genres_female.value !== '2') {
          url += filters.genres_female.value;
        } else {
          url += 'novel';
          params.append('gender', '2');
        }
      }

      if (filters.type.value !== '3') {
        params.append('sourceType', filters.type.value);
      } else {
        params.append('translateMode', '3');
        params.append('sourceType', '1');
      }

      params.append('bookStatus', filters.status.value);
      params.append('orderBy', filters.sort.value);
      params.append('pageIndex', pageNo.toString());

      url += '?' + params.toString();
    } else {
      url += `novel?orderBy=1&pageIndex=${pageNo}`;
    }

    const result = await fetchApi(url, {
      headers: this.headers,
    });
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio, true, false);
  }

  /** Desktop page; retries a Cloudflare "Just a moment" 403 once, then throws */
  async fetchDesktop(url: string): Promise<string> {
    let status = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await delay(1500);
      const result = await fetchApi(url, { headers: this.headers });
      if (result.ok) return result.text();
      status = result.status;
    }
    throw new Error(
      `Webnovel: HTTP ${status} for ${url} (Cloudflare? open the novel in WebView, then retry)`,
    );
  }

  /**
   * Best effort: undefined on Cloudflare blocks, network or parse errors.
   * No User-Agent override: the app's default is the WebView's, so its
   * Cloudflare cookies apply (m.webnovel.com redirects desktop agents).
   */
  async fetchNextData(url: string): Promise<NextProps | undefined> {
    let html = '';
    for (let attempt = 0; attempt < 2 && !html; attempt++) {
      if (attempt) await delay(1500);
      try {
        const result = await fetchApi(url);
        if (result.status === 404) return undefined;
        if (result.ok) html = await result.text();
      } catch {
        // network error: retry once
      }
    }
    // indexOf, not a regex: pages are 1-3 MB
    const tag = html.indexOf('id="__NEXT_DATA__"');
    if (tag < 0) return undefined;
    const start = html.indexOf('>', tag) + 1;
    try {
      return JSON.parse(html.slice(start, html.indexOf('</script>', start)))
        .props;
    } catch {
      return undefined;
    }
  }

  /**
   * Paths come from the desktop catalog and must not change: the app keys
   * chapters on (novelId, path). Mobile chapters (same ids) add dates.
   */
  parseChapterList(body: string, mobile?: NextProps): Plugin.ChapterItem[] {
    const loadedCheerio = parseHTML(body);
    const mobileChapters = mobile?.initialState?.entities?.chapter || {};

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.volume-item').each((i_v_, ele_v) => {
      // "Volume 0 : Auxiliary Volume" or "Volume 1"
      const heading = loadedCheerio(ele_v)
        .find('h4')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      const volumeMatch =
        heading.match(/^Volume\s*(\d+)\s*(?::\s*(.+))?$/) ||
        loadedCheerio(ele_v)
          .first()
          .text()
          .match(/Volume\s(\d+)/);
      const volumeName = volumeMatch
        ? `Volume ${volumeMatch[1]}` +
          (volumeMatch[2]?.trim() ? `: ${volumeMatch[2].trim()}` : '')
        : 'Unknown Volume';

      loadedCheerio(ele_v)
        .find('li')
        .each((i_c_, ele_c) => {
          const chapterName =
            `${volumeName}: ` +
            (loadedCheerio(ele_c).find('a').attr('title')?.trim() ||
              'No Title Found');
          const chapterPath = loadedCheerio(ele_c).find('a').attr('href');
          const locked = loadedCheerio(ele_c).find('svg').length;
          const publishTime =
            mobileChapters[loadedCheerio(ele_c).attr('data-cid') || '']
              ?.publishTime;

          if (chapterPath && !(locked && this.hideLocked)) {
            chapters.push({
              name: locked ? `${chapterName} 🔒` : chapterName,
              path: chapterPath,
              // Absolute only: relative dates would change on every refresh
              releaseTime:
                publishTime && !isNaN(new Date(publishTime).getTime())
                  ? new Date(publishTime).toISOString()
                  : undefined,
            });
          }
        });
    });

    return chapters;
  }

  /** Desktop `g_data.book= {...}`: JSON except for escapes like `\ ` */
  parseGData(body: string): BookInfo | undefined {
    const start = body.indexOf('{', body.indexOf('g_data.book='));
    const end = body.indexOf(',g_data.', start);
    if (body.indexOf('g_data.book=') < 0 || end < 0) return undefined;
    try {
      return JSON.parse(
        body
          .slice(start, end)
          .replace(/\\(["\\/bfnrtu])|\\/g, (m, valid) => (valid ? m : '')),
      ).bookInfo;
    } catch {
      return undefined;
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // Required, so first: if Cloudflare blocks it we throw before the extras
    const catalog = await this.fetchDesktop(this.site + novelPath + '/catalog');
    const bookId = bookIdOf(novelPath);
    // The mobile book page is ~200 KB vs up to 3.4 MB desktop and has more
    // stats; only the mobile catalog has absolute chapter dates
    const [mobileBook, mobileCatalog] = await Promise.all([
      this.fetchNextData(MOBILE_SITE + novelPath),
      bookId
        ? this.fetchNextData(`${MOBILE_SITE}/book/${bookId}/catalog`)
        : undefined,
    ]);
    const initData = mobileBook?.initialProps?.pageProps?.initData;

    // Throws when blocked: placeholders would overwrite real metadata
    const body = initData?.bookInfo
      ? ''
      : await this.fetchDesktop(this.site + novelPath);

    return {
      ...this.buildNovel(novelPath, body, initData),
      chapters: this.parseChapterList(catalog, mobileCatalog),
    };
  }

  /** From mobile data, else desktop `g_data`, else desktop HTML */
  buildNovel(
    novelPath: string,
    desktopBody: string,
    initData?: { bookInfo?: BookInfo; tabInfo?: TabInfo },
  ): Plugin.SourceNovel {
    const book = initData?.bookInfo || this.parseGData(desktopBody) || {};
    const tab = initData?.tabInfo;
    const loadedCheerio = parseHTML(desktopBody);

    const genres: string[] = [];
    [book.categoryName]
      .concat((book.tagInfos || []).map(t => t.tagName))
      .forEach(genre => {
        const name = genre && titleCase(genre);
        if (name && genres.indexOf(name) < 0) genres.push(name);
      });

    const translators = names(book.groupItems).length
      ? names(book.groupItems)
      : names(book.translatorItems);
    const editors = names(book.editorItems).filter(
      n => names(book.translatorItems).indexOf(n) < 0,
    );
    const chapterCount = book.totalChapterNum || book.chapterNum;
    const info: { label: string; value: string }[] = [];
    const add = (label: string, value?: string) => {
      if (value) info.push({ label, value });
    };
    add('Views', stat(book.pvNum, compact));
    add('Power Stones', stat(tab?.power?.nums, grouped));
    add('Golden Tickets', stat(tab?.golden?.nums, grouped));
    add('Chapters', stat(chapterCount, grouped));
    add(
      'Schedule',
      book.updateFrequency && book.frequencyUnit
        ? `${book.updateFrequency} ${book.frequencyUnit.replace(/\s*\/\s*/g, '/')}`
        : undefined,
    );
    add(
      'Updated',
      book.updateTime && !isNaN(new Date(book.updateTime).getTime())
        ? new Date(book.updateTime).toISOString().slice(0, 10)
        : undefined,
    );
    add('Translator', translators.join(', '));
    add('Editor', editors.join(', '));

    const htmlStatus = loadedCheerio('.det-hd-detail svg')
      .filter((i_, ele) => loadedCheerio(ele).attr('title') === 'Status')
      .next()
      .text()
      .trim();

    const name = book.bookName || loadedCheerio('.g_thumb > img').attr('alt');
    if (!name) {
      throw new Error(`Webnovel: no novel data found for ${novelPath}`);
    }
    const bookId = bookIdOf(novelPath);
    const coverSrc = loadedCheerio('.g_thumb > img').attr('src');

    return {
      path: novelPath,
      name,
      cover:
        bookId && book.coverUpdateTime
          ? `https://book-pic.webnovel.com/bookcover/${bookId}?imageMogr2/thumbnail/600x&imageId=${book.coverUpdateTime}`
          : coverSrc && 'https:' + coverSrc,
      genres: genres.length
        ? genres.join(',')
        : loadedCheerio('.det-hd-detail > .det-hd-tag').attr('title') || '',
      summary:
        book.description?.replace(/\r\n?/g, '\n').trim() ||
        loadedCheerio('.j_synopsis > p')
          .find('br')
          .replaceWith('\n')
          .end()
          .text()
          .trim() ||
        'No Summary Found',
      author:
        book.authorName ||
        names(book.authorItems).join(', ') ||
        loadedCheerio('.det-info .c_s')
          .filter((i_, ele) => {
            return loadedCheerio(ele).text().trim() === 'Author:';
          })
          .next()
          .text()
          .trim() ||
        'No Author Found',
      status:
        (book.actionStatus && STATUS[book.actionStatus]) ||
        htmlStatus ||
        NovelStatus.Unknown,
      rating: book.totalScore || undefined,
      ratingCount: book.voters || undefined,
      info: info.length ? info : undefined,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const result = await fetchApi(url, {
      headers: this.headers,
    });
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const bloatElements = ['.para-comment'];
    bloatElements.forEach(tag => loadedCheerio(tag).remove());

    return (
      loadedCheerio('.cha-tit').html()! + loadedCheerio('.cha-words').html()!
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.searchNovelsInternal(searchTerm, pageNo);
  }

  async searchNovelsInternal(
    searchTerm: string,
    pageNo: number,
    type?: string,
  ): Promise<Plugin.NovelItem[]> {
    searchTerm = searchTerm.replace(/\s+/g, '+');

    const url = `${this.site}/search?keywords=${encodeURIComponent(searchTerm)}&pageIndex=${pageNo}${type ? `&type=${type}` : ''}`;
    const result = await fetchApi(url, {
      headers: this.headers,
    });
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio, false, true);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: '1',
      options: [
        { label: 'Popular', value: '1' },
        { label: 'Recommended', value: '2' },
        { label: 'Most Collections', value: '3' },
        { label: 'Rating', value: '4' },
        { label: 'Time Updated', value: '5' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Content Status',
      value: '0',
      options: [
        { label: 'All', value: '0' },
        { label: 'Completed', value: '2' },
        { label: 'Ongoing', value: '1' },
      ],
      type: FilterTypes.Picker,
    },
    genres_gender: {
      label: 'Genres (Male/Female)',
      value: '1',
      options: [
        { label: 'Male', value: '1' },
        { label: 'Female', value: '2' },
      ],
      type: FilterTypes.Picker,
    },
    genres_male: {
      label: 'Male Genres',
      value: '1',
      options: [
        { label: 'All', value: '1' },
        { label: 'Action', value: 'novel-action-male' },
        { label: 'Animation, Comics, Games', value: 'novel-acg-male' },
        { label: 'Eastern', value: 'novel-eastern-male' },
        { label: 'Fantasy', value: 'novel-fantasy-male' },
        { label: 'Games', value: 'novel-games-male' },
        { label: 'History', value: 'novel-history-male' },
        { label: 'Horror', value: 'novel-horror-male' },
        { label: 'Realistic', value: 'novel-realistic-male' },
        { label: 'Sci-fi', value: 'novel-scifi-male' },
        { label: 'Sports', value: 'novel-sports-male' },
        { label: 'Urban', value: 'novel-urban-male' },
        { label: 'War', value: 'novel-war-male' },
      ],
      type: FilterTypes.Picker,
    },
    genres_female: {
      label: 'Female Genres',
      value: '2',
      options: [
        { label: 'All', value: '2' },
        { label: 'Fantasy', value: 'novel-fantasy-female' },
        { label: 'General', value: 'novel-general-female' },
        { label: 'History', value: 'novel-history-female' },
        { label: 'LGBT+', value: 'novel-lgbt-female' },
        { label: 'Sci-fi', value: 'novel-scifi-female' },
        { label: 'Teen', value: 'novel-teen-female' },
        { label: 'Urban', value: 'novel-urban-female' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      label: 'Content Type',
      value: '0',
      options: [
        { label: 'All', value: '0' },
        { label: 'Translate', value: '1' },
        { label: 'Original', value: '2' },
        { label: 'MTL (Machine Translation)', value: '3' },
      ],
      type: FilterTypes.Picker,
    },
    fanfic_search: {
      label: 'Search fanfics (Overrides other filters)',
      value: '',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;
}

export default new Webnovel();
