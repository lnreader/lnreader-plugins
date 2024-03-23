import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import qs from 'qs';

class NovelsOnline implements Plugin.PluginBase {
  id = 'NO.net';
  name = 'novelsOnline';
  site = 'https://novelsonline.net';
  icon = 'src/en/novelsonline/icon.png';
  version = '1.0.0';

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site;
    if (filters.genre.value !== '') link += `/category/${filters.genre.value}/`;
    else link += `/top-novel/`;

    link += page;
    link += `?change_type=${filters.sort.value}`;

    const body = await fetchApi(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    const novel: Plugin.NovelItem[] = [];

    loadedCheerio('.top-novel-block').each((i, el) => {
      const novelName = loadedCheerio(el).find('h2').text();
      const novelCover = loadedCheerio(el)
        .find('.top-novel-cover img')
        .attr('src');
      const novelUrl = loadedCheerio(el).find('h2 a').attr('href');
      if (!novelUrl) return;

      novel.push({
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      });
    });
    return novel;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath).then(res =>
      res.text(),
    );
    let $ = parseHTML(result);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').text() || 'Untitled',
      cover: $('.novel-cover').find('a > img').attr('src'),
      chapters: [],
    };

    $('.novel-detail-item').each((i, el) => {
      let detailName = $(el).find('h6').text();
      let detail = $(el).find('.novel-detail-body');

      switch (detailName) {
        case 'Description':
          novel.summary = detail.text();
          break;
        case 'Genre':
          novel.genres = detail
            .find('li')
            .map((_, el) => $(el).text())
            .get()
            .join(', ');
          break;
        case 'Author(s)':
          novel.author = detail
            .find('li')
            .map((_, el) => $(el).text())
            .get()
            .join(', ');
          break;
        case 'Status':
          novel.status = detail.text().trim();
          break;
      }
    });

    novel.chapters = $('ul.chapter-chs > li > a')
      .map((_, el) => {
        const chapterUrl = $(el).attr('href');
        const chapterName = $(el).text();

        return {
          name: chapterName,
          path: chapterUrl?.replace(this.site, ''),
        } as Plugin.ChapterItem;
      })
      .get();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(result);

    const chapterText = loadedCheerio('#contentall').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const result = await fetchApi('https://novelsonline.net/sResults.php', {
      headers: {
        Accept: '*/*',
        'Accept-Language': 'pl,en-US;q=0.7,en;q=0.3',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      body: qs.stringify({ q: searchTerm }),
    }).then(res => res.text());

    const $ = parseHTML(result);

    const headers = $('li');
    return headers
      .map((i, h) => {
        const novelName = $(h).text();
        const novelUrl = $(h).find('a').attr('href');
        const novelCover = $(h).find('img').attr('src');

        if (!novelUrl) return;

        return {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site, ''),
        };
      })
      .get()
      .filter(sr => sr !== null);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    sort: {
      value: 'top_rated',
      label: 'Sort by',
      options: [
        { label: 'Top Rated', value: 'top_rated' },
        { label: 'Most Viewed', value: 'view' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: '',
      label: 'Category',
      options: [
        { label: 'None', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Celebrity', value: 'celebrity' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
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
        { label: 'Shotacon', value: 'shotacon' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelsOnline();
