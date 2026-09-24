import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
// import { Filters, FilterTypes } from '@libs/filterInputs';

class IndoWebNovel implements Plugin.PluginBase {
  id = 'IDWN.id';
  name = 'IndoWebNovel';
  icon = 'src/id/indowebnovel/icon.png';
  site = 'https://indowebnovel.id/';
  version = '1.3.1';

  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: 'https://indowebnovel.id/',
  };

  private async fetchPage(url: string) {
    const res = await fetchApi(url, { headers: this.headers });
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res.text();
  }

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    // The search/paged listing (`page/<n>/?s`) renders `.flexbox2-item`
    // cards, while the front page renders `.flexbox3-item` cards (latest
    // updates) and `.popular .flexbox-item` cards (ranked list). Accept
    // every variant so a listing page never parses to zero novels just
    // because the server returned another listing layout.
    const items = loadedCheerio('.flexbox2-item').length
      ? loadedCheerio('.flexbox2-item')
      : loadedCheerio('.flexbox3-item').length
        ? loadedCheerio('.flexbox3-item')
        : loadedCheerio('.popular .flexbox-item');

    items.each((i, el) => {
      const item = loadedCheerio(el);
      const novelName = (
        item.find('.flexbox2-title span').first().text() ||
        item.find('.title a').first().text() ||
        item.find('.flexbox-title').first().text()
      ).trim();
      const novelCover = item.find('img').attr('src');
      const novelUrl =
        item.find('.flexbox2-content > a').attr('href') ||
        item.find('.flexbox3-content > a').attr('href') ||
        item.find('a').attr('href');

      if (!novelUrl) return;

      novels.push({
        name: novelName,
        cover: novelCover,
        path: novelUrl.slice(this.site.length),
      });
    });

    return novels;
  }

  async popularNovels(
    page = 1,
    // { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    /*
    let link = `${this.site}advanced-search/page/${page}/?title=&author=&yearx=`;
    link += `&status=${filters.status.value}`;
    link += `&type=${filters.type.value}`;
    link += `&order=${filters.sort.value}`;

    if (filters.lang.value.length)
      link += filters.lang.value.map(i => `&country[]=${i}`).join('');
    if (filters.genre.value.length)
      link += filters.genre.value.map(i => `&genre[]=${i}`).join('');
    */
    const link = this.site + `page/${page}/?s`;
    const body = await this.fetchPage(link);

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await this.fetchPage(this.site + novelPath);

    const loadedCheerio = parseHTML(body);
    loadedCheerio('.series-synops div').remove();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.series-title h2').text().trim() || 'Untitled',
      cover: loadedCheerio('.series-thumb img').attr('src'),
      author: loadedCheerio(".series-infolist li:contains('Author') span")
        .text()
        .trim(),
      status:
        loadedCheerio('.status').text().trim() === 'Completed'
          ? NovelStatus.Completed
          : NovelStatus.Ongoing,
      summary: loadedCheerio('.series-synops').text().trim(),
      chapters: [],
    };

    novel.genres = loadedCheerio('.series-genres a')
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.series-chapterlists li').each((i, el) => {
      // The list entry also holds a `span.date`; drop it so the chapter name
      // does not end with the release date.
      const chapterName = loadedCheerio(el)
        .find('a span')
        .not('.date')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      const chapterUrl = loadedCheerio(el).find('a').attr('href');

      if (!chapterUrl) return;

      const chapter: Plugin.ChapterItem = {
        name: chapterName,
        path: chapterUrl.slice(this.site.length),
      };

      // Each entry also holds a `span.date` like "October 23, 2025".
      const releaseDate = loadedCheerio(el)
        .find('span.date')
        .first()
        .text()
        .trim();
      if (releaseDate && !isNaN(Date.parse(releaseDate))) {
        chapter.releaseTime = new Date(releaseDate).toISOString();
      }

      chapters.push(chapter);
    });

    novel.chapters = chapters.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await this.fetchPage(this.site + chapterPath);

    const loadedCheerio = parseHTML(body);

    // The chapter body is nested in `main .content .container` behind a div
    // whose class is a rotating random token (the previous hardcoded name,
    // `.adsads`, no longer exists), so use the stable inner `#content`
    // element instead of that wrapper class.
    const chapterText = loadedCheerio('main #content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page = 1,
  ): Promise<Plugin.NovelItem[]> {
    /*
    let link = `${this.site}advanced-search/page/${page}/?title=${searchTerm}&author=&yearx=`;
    link += `&status=${this.filters.status.value}`;
    link += `&type=${this.filters.type.value}`;
    link += `&order=${this.filters.sort.value}`;
    link += this.filters.lang.value.map(i => `&country[]=${i}`).join('');
    */
    const link = this.site + `page/${page}/?s=${searchTerm}`;
    const body = await this.fetchPage(link);

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  // filters = {
  //   status: {
  //     value: '',
  //     label: 'Status',
  //     options: [
  //       { label: 'All', value: '' },
  //       { label: 'Ongoing', value: 'ongoing' },
  //       { label: 'Completed', value: 'completed' },
  //     ],
  //     type: FilterTypes.Picker,
  //   },
  //   type: {
  //     value: '',
  //     label: 'Type',
  //     options: [
  //       { label: 'All', value: '' },
  //       { label: 'Web Novel', value: 'Web+Novel' },
  //       { label: 'Light Novel', value: 'Light+Novel' },
  //     ],
  //     type: FilterTypes.Picker,
  //   },
  //   sort: {
  //     value: 'rating',
  //     label: 'Order By',
  //     options: [
  //       { label: 'A-Z', value: 'title' },
  //       { label: 'Z-A', value: 'titlereverse' },
  //       { label: 'Latest Update', value: 'update' },
  //       { label: 'Latest Added', value: 'latest' },
  //       { label: 'Popular', value: 'popular' },
  //       { label: 'Rating', value: 'rating' },
  //     ],
  //     type: FilterTypes.Picker,
  //   },
  //   lang: {
  //     value: ['china', 'jepang', 'korea', 'unknown'],
  //     label: 'Country',
  //     options: [
  //       { label: 'China', value: 'china' },
  //       { label: 'Jepang', value: 'jepang' },
  //       { label: 'Korea', value: 'korea' },
  //       { label: 'Unknown', value: 'unknown' },
  //     ],
  //     type: FilterTypes.CheckboxGroup,
  //   },
  //   genre: {
  //     value: [],
  //     label: 'Genres',
  //     options: [
  //       { label: 'Action', value: 'action' },
  //       { label: 'Adult', value: 'adult' },
  //       { label: 'Adventure', value: 'adventure' },
  //       { label: 'Comedy', value: 'comedy' },
  //       { label: 'Drama', value: 'drama' },
  //       { label: 'Ecchi', value: 'ecchi' },
  //       { label: 'Fantasy', value: 'fantasy' },
  //       { label: 'Gender Bender', value: 'gender-bender' },
  //       { label: 'Harem', value: 'harem' },
  //       { label: 'Horror', value: 'horror' },
  //       { label: 'Josei', value: 'josei' },
  //       { label: 'Josei', value: 'josei' },
  //       { label: 'Martial Arts', value: 'martial-arts' },
  //       { label: 'Mature', value: 'mature' },
  //       { label: 'Mecha', value: 'mecha' },
  //       { label: 'Mystery', value: 'mystery' },
  //       { label: 'Psychological', value: 'psychological' },
  //       { label: 'Romance', value: 'romance' },
  //       { label: 'School Life', value: 'school-life' },
  //       { label: 'Sci-fi', value: 'sci-fi' },
  //       { label: 'Seinen', value: 'seinen' },
  //       { label: 'Shoujo', value: 'shoujo' },
  //       { label: 'Shounen', value: 'shounen' },
  //       { label: 'Slice of Life', value: 'slice-of-life' },
  //       { label: 'Smut', value: 'smut' },
  //       { label: 'Supernatural', value: 'supernatural' },
  //       { label: 'Tragedy', value: 'tragedy' },
  //       { label: 'Wuxia', value: 'wuxia' },
  //       { label: 'Xianxia', value: 'xianxia' },
  //       { label: 'Xuanhuan', value: 'xuanhuan' },
  //     ],
  //     type: FilterTypes.CheckboxGroup,
  //   },
  // } satisfies Filters;
}

export default new IndoWebNovel();
