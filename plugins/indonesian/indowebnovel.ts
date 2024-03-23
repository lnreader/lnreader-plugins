import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class IndoWebNovel implements Plugin.PluginBase {
  id = 'IDWN.id';
  name = 'IndoWebNovel';
  icon = 'src/id/indowebnovel/icon.png';
  site = 'https://indowebnovel.id/';
  version = '1.2.0';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.flexbox2-item').each((i, el) => {
      const novelName = loadedCheerio(el)
        .find('.flexbox2-title span')
        .first()
        .text();
      const novelCover = loadedCheerio(el).find('img').attr('src');
      const novelUrl = loadedCheerio(el)
        .find('.flexbox2-content > a')
        .attr('href');

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
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}advanced-search/page/${page}/?title=&author=&yearx=`;
    link += `&status=${filters.status.value}`;
    link += `&type=${filters.type.value}`;
    link += `&order=${filters.sort.value}`;

    if (filters.lang.value.length)
      link += filters.lang.value.map(i => `&country[]=${i}`).join('');
    if (filters.genre.value.length)
      link += filters.genre.value.map(i => `&genre[]=${i}`).join('');

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    loadedCheerio('.series-synops div').remove();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.series-title').text().trim() || 'Untitled',
      cover: loadedCheerio('.series-thumb img').attr('src'),
      author: loadedCheerio("ul.series-infolist b:contains('Author') +")
        .text()
        .trim(),
      status: loadedCheerio('.status').text().trim(),
      summary: loadedCheerio('.series-synops').text().trim(),
      chapters: [],
    };

    novel.genres = loadedCheerio('.series-genres a')
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.series-chapterlist li').each((i, el) => {
      const chapterName = loadedCheerio(el).find('a').text().trim();
      const chapterUrl = loadedCheerio(el).find('a').attr('href');

      if (!chapterUrl) return;

      chapters.push({
        name: chapterName,
        path: chapterUrl.slice(this.site.length),
      });
    });

    novel.chapters = chapters.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.readerss').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}advanced-search/page/${page}/?title=${searchTerm}&author=&yearx=`;
    link += `&status=${this.filters.status.value}`;
    link += `&type=${this.filters.type.value}`;
    link += `&order=${this.filters.sort.value}`;
    link += this.filters.lang.value.map(i => `&country[]=${i}`).join('');

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    status: {
      value: '',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      value: '',
      label: 'Type',
      options: [
        { label: 'All', value: '' },
        { label: 'Web Novel', value: 'Web+Novel' },
        { label: 'Light Novel', value: 'Light+Novel' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      value: 'rating',
      label: 'Order By',
      options: [
        { label: 'A-Z', value: 'title' },
        { label: 'Z-A', value: 'titlereverse' },
        { label: 'Latest Update', value: 'update' },
        { label: 'Latest Added', value: 'latest' },
        { label: 'Popular', value: 'popular' },
        { label: 'Rating', value: 'rating' },
      ],
      type: FilterTypes.Picker,
    },
    lang: {
      value: ['china', 'jepang', 'korea', 'unknown'],
      label: 'Country',
      options: [
        { label: 'China', value: 'china' },
        { label: 'Jepang', value: 'jepang' },
        { label: 'Korea', value: 'korea' },
        { label: 'Unknown', value: 'unknown' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genre: {
      value: [],
      label: 'Genres',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Horror', value: 'horror' },
        { label: 'Josei', value: 'josei' },
        { label: 'Josei', value: 'josei' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new IndoWebNovel();
