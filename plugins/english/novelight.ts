import { load as parseHTML } from 'cheerio';
import { fetchApi, FetchInit } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import dayjs from 'dayjs';
import { storage } from '@libs/storage';

type ChapterPaginationOption = {
  value: string;
  start: number;
};

type RawChapter = {
  name: string;
  path: string;
  releaseTime?: string;
  isLocked: boolean;
};

class Novelight implements Plugin.PagePlugin {
  id = 'novelight';
  name = 'Novelight';
  version = '1.1.7';
  icon = 'src/en/novelight/icon.png';
  site = 'https://novelight.net/';

  // Browser-like headers (important for Cloudflare-fronted sites, which
  // may serve a bot-check page to requests without a User-Agent).
  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    Referer: this.site,
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Throw (carrying the HTTP status) on a refused response so a
  // runner-side block is reported INCONCLUSIVE per docs/testing.md
  // instead of being parsed into a false empty-result FAIL.
  private async fetchSite(url: string, init?: FetchInit) {
    const res = await fetchApi(url, init);
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res;
  }

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}catalog/`;
    if (showLatestNovels) {
      url += `?ordering=-time_updated&page=${pageNo}`;
    } else if (filters) {
      const params = new URLSearchParams();
      for (const country of filters.country.value) {
        params.append('country', country);
      }
      for (const genre of filters.genres.value) {
        params.append('genre', genre);
      }
      for (const translation of filters.translation.value) {
        params.append('translation', translation);
      }
      for (const status of filters.status.value) {
        params.append('status', status);
      }
      for (const novel_type of filters.novel_type.value) {
        params.append('type', novel_type);
      }
      params.append('ordering', filters.sort.value);
      params.append('page', pageNo.toString());
      url += `?${params.toString()}`;
    } else {
      url += `?&ordering=popularity&page=${pageNo}`;
    }

    const body = await this.fetchSite(url, { headers: this.headers }).then(r =>
      r.text(),
    );

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('div.title').text().trim();
      const novelUrl = ele.attribs.href;
      const bareNovelCover = loadedCheerio(ele).find('img').attr('src');
      const novelCover = bareNovelCover
        ? this.site + bareNovelCover
        : defaultCover;
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover ?? defaultCover,
        path: novelUrl.replace('/', ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await this.fetchSite(this.site + novelPath, {
      headers: this.headers,
    }).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    // The chapter select tiles the chapter list, so one app page per site
    // range keeps `totalPages` and the served pages in agreement.
    const totalPages = this.parseChapterPagination(loadedCheerio).length || 1;

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('h1').text() || 'Untitled',
      cover: this.site + loadedCheerio('.poster > img').attr('src'),
      summary: loadedCheerio('section.text-info.section > p').text(),
      totalPages,
      chapters: [],
    };

    const info = loadedCheerio('div.mini-info > .item').toArray();
    let status = '';
    let translation = '';
    for (const child of info) {
      const type = loadedCheerio(child).find('.sub-header').text().trim();
      if (type === 'Status') {
        status = loadedCheerio(child)
          .find('div.info')
          .text()
          .trim()
          .toLowerCase();
      }
      if (type === 'Translation') {
        translation = loadedCheerio(child)
          .find('div.info')
          .text()
          .trim()
          .toLowerCase();
      }
      if (type === 'Author') {
        novel.author = loadedCheerio(child).find('div.info').text().trim();
      }
      if (type === 'Genres') {
        novel.genres = loadedCheerio(child)
          .find('div.info > a')
          .map((i, el) => loadedCheerio(el).text())
          .toArray()
          .join(', ');
      }
    }
    if (status === 'cancelled') novel.status = NovelStatus.Cancelled;
    else if (status === 'releasing' || translation === 'ongoing')
      novel.status = NovelStatus.Ongoing;
    else if (status === 'completed' && translation === 'completed')
      novel.status = NovelStatus.Completed;

    return novel;
  }

  /**
   * The site's chapter select lists page ranges such as `1-17`, `18-67`,
   * newest page first, each holding 50 chapters except the oldest page,
   * which holds the remainder. Those ranges tile the whole chapter list,
   * so they describe the site's own partition. The chapter-pagination
   * endpoint serves exactly one of these ranges per request and accepts
   * no page-size or offset parameter, so serving the site's own ranges
   * one-to-one is the only way to spend a single ajax request per page.
   */
  private parseChapterPagination(
    loadedCheerio: ReturnType<typeof parseHTML>,
  ): ChapterPaginationOption[] {
    const options: ChapterPaginationOption[] = [];
    loadedCheerio('#select-pagination-chapter > option').each((_, ele) => {
      const option = loadedCheerio(ele);
      // Skip entries that are not chapter ranges (e.g. placeholder options
      // without an `N-M` label); they hold no page of chapters.
      const range = option
        .text()
        .trim()
        .match(/([0-9]+)\s*-\s*[0-9]+/);
      if (!range) return;
      const value = option.val() ?? '';
      if (typeof value !== 'string' || !value) return;
      options.push({
        value,
        start: parseInt(range[1], 10),
      });
    });
    return options;
  }

  private async parseSitePageChapters(params: {
    novelPath: string;
    csrftoken: string;
    bookId: string;
    sitePage: string;
  }): Promise<RawChapter[]> {
    const { novelPath, csrftoken, bookId, sitePage } = params;
    const r = await this.fetchSite(
      `${this.site}book/ajax/chapter-pagination?csrfmiddlewaretoken=${csrftoken}&book_id=${bookId}&page=${sitePage}`,
      {
        headers: {
          ...this.headers,
          'Host': this.site.replace('https://', '').replace('/', ''),
          'Referer': this.site + novelPath,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    );

    // Endpoint failures propagate with their original stack; a JSON body
    // without an `html` field throws here instead of parsing silently
    // into zero chapters.
    const chaptersRaw = await r.json();
    const chaptersHtml = chaptersRaw?.html;
    if (typeof chaptersHtml !== 'string') {
      throw new Error('Unexpected chapter-pagination response');
    }

    const chapters: RawChapter[] = [];

    parseHTML('<html>' + chaptersHtml + '</html>')('a').each((idx, ele) => {
      const title = parseHTML(ele)('.title').text().trim();
      const isLocked = !!parseHTML(ele)('.cost').text().trim();

      let releaseTime;
      try {
        releaseTime = dayjs(
          parseHTML(ele)('.date').text().trim(),
          'DD.MM.YYYY',
        ).toISOString();
      } catch (error) {
        // linter happy
      }

      let chapterUrl = ele.attribs.href;
      if (chapterUrl.charAt(0) == '/') {
        chapterUrl = chapterUrl.substring(1);
      }
      chapters.push({
        name: title,
        path: chapterUrl,
        releaseTime,
        isLocked,
      });
    });

    // The site lists a page newest first, while pages are served oldest first.
    return chapters.reverse();
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const rawBody = await this.fetchSite(this.site + novelPath, {
      headers: this.headers,
    }).then(r => r.text());
    const csrftoken = rawBody?.match(/window\.CSRF_TOKEN = "([^"]+)"/)?.[1];
    const bookId = rawBody?.match(/const OBJECT_BY_COMMENT = ([0-9]+)/)?.[1];
    // Serve the site's own ranges one-to-one, oldest chunk first: app page
    // N is the Nth site range in ascending chapter order. One site page per
    // app page means exactly one chapter-pagination request per call; the
    // trade-off is that the short (remainder) page comes first instead of
    // last, and adding new chapters shifts every page's contents because
    // the site anchors its partition at the newest chapter.
    const sitePages = this.parseChapterPagination(parseHTML(rawBody)).sort(
      (a, b) => a.start - b.start,
    );
    const pageNo = parseInt(page, 10);
    const sitePage = sitePages[pageNo - 1];

    if (Number.isNaN(pageNo) || !csrftoken || !bookId || !sitePage) {
      return { chapters: [] };
    }

    // The requested value comes straight from the parsed select, so it can
    // never fall outside the site's pages (out-of-range values used to be
    // silently clamped to the oldest page, duplicating its chapters).
    const chapters = await this.parseSitePageChapters({
      novelPath,
      csrftoken,
      bookId,
      sitePage: sitePage.value,
    });

    return {
      chapters: chapters
        .filter(chapter => !(this.hideLocked && chapter.isLocked))
        .map(chapter => ({
          name: chapter.isLocked ? '🔒 ' + chapter.name : chapter.name,
          path: chapter.path,
          page: page,
          releaseTime: chapter.releaseTime,
        })),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.charAt(0) == '/') {
      chapterPath = chapterPath.substring(1);
    }
    const rawBody = await this.fetchSite(this.site + chapterPath, {
      headers: this.headers,
    }).then(r => {
      const res = r.text();
      return res;
    });

    const csrftoken = rawBody?.match(/window\.CSRF_TOKEN = "([^"]+)"/)?.[1];
    const chapterId = rawBody?.match(/const CHAPTER_ID = "([0-9]+)/)?.[1];

    let className;
    const body = await this.fetchSite(
      this.site + 'book/ajax/read-chapter/' + chapterId,
      {
        method: 'GET',
        headers: {
          ...this.headers,
          Cookie: 'csrftoken=' + csrftoken,
          Referer: this.site + chapterPath,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    ).then(async r => {
      const res = await r.json();
      className = res.class;
      return res.content;
    });

    const $ = parseHTML(body);
    $('script').remove();
    $(`.${className} > *:not(br)`).after('<br>');
    const chapterText = $('.' + className).html() || '';

    return chapterText.replace(
      /class="advertisment"/g,
      'style="display:none;"',
    );
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}catalog/?search=${encodeURIComponent(searchTerm)}`;
    const body = await this.fetchSite(url, { headers: this.headers }).then(r =>
      r.text(),
    );
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('div.title').text().trim();
      const novelUrl = ele.attribs.href;
      const bareNovelCover = loadedCheerio(ele).find('img').attr('src');
      const novelCover = bareNovelCover
        ? this.site + bareNovelCover
        : defaultCover;
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover ?? defaultCover,
        path: novelUrl.replace('/', ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'popularity',
      options: [
        { label: 'Title (A>Z)', value: 'title' },
        { label: 'Publication Date', value: '-time_created' },
        { label: 'Update Date (Newest)', value: '-time_updated' },
        { label: 'Year Release', value: '-year_of_release' },
        { label: 'Popularity', value: 'popularity' },
      ],
      type: FilterTypes.Picker,
    },
    translation: {
      label: 'Translation Status',
      value: [],
      options: [
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Paused', value: 'paused' },
        { label: 'Dropped', value: 'dropped' },
        { label: 'None', value: 'none' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    status: {
      label: 'Status',
      value: [],
      options: [
        { label: 'Releasing', value: 'releasing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Not yet released', value: 'not+yet+released' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    novel_type: {
      label: 'Type',
      value: [],
      options: [
        { label: 'Fan Fiction', value: '4' },
        { label: 'Light Novel', value: '1' },
        { label: 'Published Novel', value: '2' },
        { label: 'Web Novel', value: '3' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'Thriller', value: '1' },
        { label: 'Supernatural', value: '2' },
        { label: 'Sports', value: '3' },
        { label: 'Slice of Life', value: '4' },
        { label: 'Sci-Fi', value: '5' },
        { label: 'Romance', value: '6' },
        { label: 'Psychological', value: '7' },
        { label: 'Mystery', value: '8' },
        { label: 'Mecha', value: '9' },
        { label: 'Horror', value: '10' },
        { label: 'Fantasy', value: '11' },
        { label: 'Ecchi', value: '12' },
        { label: 'Drama', value: '13' },
        { label: 'Comedy', value: '14' },
        { label: 'Adventure', value: '15' },
        { label: 'Action', value: '16' },
        { label: 'Adult', value: '17' },
        { label: 'Isekai', value: '18' },
        { label: 'Wuxia', value: '19' },
        { label: 'Shounen', value: '20' },
        { label: 'Yuri', value: '21' },
        { label: 'Shoujo', value: '22' },
        { label: 'Shoujo Ai', value: '23' },
        { label: 'Harem', value: '24' },
        { label: 'Seinen', value: '25' },
        { label: 'Tragedy', value: '26' },
        { label: 'Mature', value: '27' },
        { label: 'Martial Arts', value: '28' },
        { label: 'Gender Bender', value: '29' },
        { label: 'School Life', value: '30' },
        { label: 'Xuanhuan', value: '31' },
        { label: 'Yaoi', value: '32' },
        { label: 'Historical', value: '33' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    country: {
      label: 'Country',
      value: [],
      options: [
        { label: 'China', value: '1' },
        { label: 'Japan', value: '2' },
        { label: 'Korea', value: '3' },
        { label: 'Other', value: '6' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new Novelight();
