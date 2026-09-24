import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import dayjs from 'dayjs';
import { storage } from '@libs/storage';

class Mynovels implements Plugin.PagePlugin {
  id = 'mynovels';
  name = 'Mynovels';
  version = '1.0.0';
  icon = 'src/en/mynovels/icon.png';
  site = 'https://mynovels.su/';

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  private getChunkSize(totalChapters: number): number {
    return totalChapters > 500 ? 300 : 100;
  }

  private parseTotalChapters(
    loadedCheerio: ReturnType<typeof parseHTML>,
  ): number {
    let totalChapters = 0;
    loadedCheerio('#select-pagination-chapter > option').each((_, el) => {
      const text = loadedCheerio(el).text().trim();
      const match = text.match(/([0-9]+)\s*-\s*([0-9]+)/);
      if (match) {
        const end = parseInt(match[2], 10);
        if (end > totalChapters) totalChapters = end;
      }
    });
    return (
      totalChapters ||
      loadedCheerio('#select-pagination-chapter > option').length * 50 ||
      1
    );
  }

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

    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.item').each((idx, ele) => {
      const el = loadedCheerio(ele);
      const novelName = el.find('div.title').text().trim();
      const novelUrl = ele.attribs.href;
      const bareNovelCover = el.find('img').attr('src');
      const novelCover = bareNovelCover
        ? this.site + bareNovelCover.replace(/^\//, '')
        : defaultCover;
      if (!novelUrl) return;

      novels.push({
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(/^\//, ''),
      });
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const coverSrc = loadedCheerio('.poster > img').attr('src');
    const totalChapters = this.parseTotalChapters(loadedCheerio);
    const chunkSize = this.getChunkSize(totalChapters);
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('h1').text().trim() || 'Untitled',
      cover: coverSrc ? this.site + coverSrc.replace(/^\//, '') : defaultCover,
      summary: loadedCheerio('section.text-info.section > p').text().trim(),
      totalPages: Math.ceil(totalChapters / chunkSize) || 1,
      chapters: [],
    };

    const info = loadedCheerio('div.mini-info > .item').toArray();
    let status = '';
    let translation = '';
    for (const child of info) {
      const el = loadedCheerio(child);
      const type = el.find('.sub-header').text().trim();
      if (type === 'Status') {
        status = el.find('div.info').text().trim().toLowerCase();
      }
      if (type === 'Translation') {
        translation = el.find('div.info').text().trim().toLowerCase();
      }
      if (type === 'Author') {
        novel.author = el.find('div.info').text().trim();
      }
      if (type === 'Genres') {
        novel.genres = el
          .find('div.info > a')
          .map((i, a) => loadedCheerio(a).text())
          .toArray()
          .join(', ');
      }
    }
    if (status === 'cancelled') {
      novel.status = NovelStatus.Cancelled;
    } else if (status === 'releasing' || translation === 'ongoing') {
      novel.status = NovelStatus.Ongoing;
    } else if (status === 'completed' && translation === 'completed') {
      novel.status = NovelStatus.Completed;
    }

    return novel;
  }

  private async fetchSitePageChapters(
    novelPath: string,
    csrftoken: string,
    bookId: string,
    sitePage: number,
    pluginPage: string,
  ): Promise<Plugin.ChapterItem[]> {
    const r = await fetchApi(
      `${this.site}book/ajax/chapter-pagination?csrfmiddlewaretoken=${csrftoken}&book_id=${bookId}&page=${sitePage}`,
      {
        headers: {
          'Host': this.site.replace('https://', '').replace('/', ''),
          'Referer': this.site + novelPath,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    );

    let chaptersRaw;
    try {
      chaptersRaw = (await r.json()).html;
    } catch {
      return [];
    }

    const chapter: Plugin.ChapterItem[] = [];
    const $ = parseHTML(chaptersRaw);

    $('a').each((idx, ele) => {
      const el = $(ele);
      const title = el.find('.title').text().trim();
      const isLocked = Boolean(el.find('.cost').text().trim());
      if (this.hideLocked && isLocked) return;

      let date;
      try {
        date = dayjs(
          el.find('.date').text().trim(),
          'DD.MM.YYYY',
        ).toISOString();
      } catch {
        // linter happy
      }

      const chapterName = isLocked ? '🔒 ' + title : title;
      const chapterUrl = ele.attribs.href?.replace(/^\//, '') || '';
      chapter.push({
        name: chapterName,
        path: chapterUrl,
        page: pluginPage,
        releaseTime: date,
      });
    });

    return chapter.reverse();
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const rawBody = await fetchApi(this.site + novelPath).then(r => r.text());
    const csrftoken =
      rawBody?.match(/window\.CSRF_TOKEN = "([^"]+)"/)?.[1] || '';
    const bookId =
      rawBody?.match(/const OBJECT_BY_COMMENT = ([0-9]+)/)?.[1] || '';
    const loadedCheerio = parseHTML(rawBody);

    const totalChapters = this.parseTotalChapters(loadedCheerio);
    const chunkSize = this.getChunkSize(totalChapters);
    const pluginPageNum = parseInt(page, 10);

    const desiredStartIdx = (pluginPageNum - 1) * chunkSize + 1;
    const desiredEndIdx = Math.min(pluginPageNum * chunkSize, totalChapters);

    const sitePagesToFetch: {
      sp: number;
      rangeStart: number;
      rangeEnd: number;
    }[] = [];
    loadedCheerio('#select-pagination-chapter > option').each((_, el) => {
      const sp = parseInt(loadedCheerio(el).val() || '1', 10);
      const text = loadedCheerio(el).text().trim();
      const match = text.match(/([0-9]+)\s*-\s*([0-9]+)/);
      if (match) {
        const rangeStart = parseInt(match[1], 10);
        const rangeEnd = parseInt(match[2], 10);
        if (rangeStart <= desiredEndIdx && rangeEnd >= desiredStartIdx) {
          sitePagesToFetch.push({ sp, rangeStart, rangeEnd });
        }
      }
    });

    sitePagesToFetch.sort((a, b) => a.rangeStart - b.rangeStart);

    const results = await Promise.all(
      sitePagesToFetch.map(p =>
        this.fetchSitePageChapters(novelPath, csrftoken, bookId, p.sp, page),
      ),
    );

    const fetchedChapters = results.flat();
    if (sitePagesToFetch.length === 0) {
      return { chapters: fetchedChapters };
    }

    const sliceOffset = desiredStartIdx - sitePagesToFetch[0].rangeStart;
    const countNeeded = desiredEndIdx - desiredStartIdx + 1;
    const chapters = fetchedChapters.slice(
      sliceOffset,
      sliceOffset + countNeeded,
    );

    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const cleanPath = chapterPath.replace(/^\//, '');
    const rawBody = await fetchApi(this.site + cleanPath).then(r => r.text());

    const csrftoken = rawBody?.match(/window\.CSRF_TOKEN = "([^"]+)"/)?.[1];
    const chapterId = rawBody?.match(/const CHAPTER_ID = "([0-9]+)/)?.[1];

    let className = '';
    const body = await fetchApi(
      `${this.site}book/ajax/read-chapter/${chapterId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `csrftoken=${csrftoken}`,
          Referer: this.site + cleanPath,
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
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('a.item').each((idx, ele) => {
      const el = loadedCheerio(ele);
      const novelName = el.find('div.title').text().trim();
      const novelUrl = ele.attribs.href;
      const bareNovelCover = el.find('img').attr('src');
      const novelCover = bareNovelCover
        ? this.site + bareNovelCover.replace(/^\//, '')
        : defaultCover;
      if (!novelUrl) return;

      novels.push({
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(/^\//, ''),
      });
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

export default new Mynovels();
