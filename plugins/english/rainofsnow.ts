import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class Rainofsnow implements Plugin.PagePlugin {
  id = 'rainofsnow';
  name = 'Rainofsnow';
  icon = 'src/en/rainofsnow/icon.png';
  site = 'https://rainofsnow.com/';
  version = '1.1.2';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.minbox').each((index, element) => {
      const name = loadedCheerio(element).find('h3').text();
      const cover = loadedCheerio(element).find('img').attr('data-src');
      const path = loadedCheerio(element)
        .find('h3 > a')
        .attr('href')
        ?.replace(this.site, '')
        .replace(/\/+$/, '');

      if (!path) {
        return;
      }

      novels.push({ name, cover, path });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.site + 'novels/page/' + pageNo + filters.genre.value;
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      totalPages: 0,
    };

    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    novel.name = loadedCheerio('.text h2').text().trim();

    novel.cover = loadedCheerio('.imagboca1 img').attr('data-src');

    novel.summary = loadedCheerio('#synop').text().trim();

    novel.genres = loadedCheerio('span:contains("Genre(s)")')
      .next()
      .text()
      .trim();

    novel.author = loadedCheerio('span:contains("Author")').next().text();

    let x = 1;
    loadedCheerio('.page-numbers li').each((i, el) => {
      const num = loadedCheerio(el).find('a').text().trim().match(/(\d+)/);
      const n = Number(num?.[1] || '0');
      if (n > x) {
        x = n;
      }
    });

    novel.totalPages = x;
    novel.chapters = this.parseChapters(loadedCheerio);
    novel.status = NovelStatus.Unknown;
    return novel;
  }

  // parse paged chapters
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath + '/page/' + page + '/#chapter';
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    const chapters = this.parseChapters(loadedCheerio);
    return { chapters };
  }

  // helper to parse a novel
  parseChapters(loadedCheerio: CheerioAPI) {
    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('#chapter .march1 li').each((i, el) => {
      const path = loadedCheerio(el)
        .find('a')
        .attr('href')
        ?.slice(this.site.length);
      if (!path) return;
      const name = loadedCheerio(el).find('.chapter').first().text().trim();
      const date = loadedCheerio(el).find('small').text().trim().toLowerCase();
      const months = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ];
      const regex = /([a-z]+) (..?), (.+)/;
      const [, monthName, day, year] = regex.exec(date) || [];
      const month = months.indexOf(monthName.slice(0, 3));
      const releaseTime =
        monthName && month !== -1
          ? new Date(+year, month, +day).toISOString()
          : null;

      chapter.push({
        name,
        path,
        releaseTime,
      });
    });

    return chapter;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // parse chapter text here
    const result = await fetch(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterName = loadedCheerio('.content > h2').text();
    const chapterText = loadedCheerio('.content').html();
    if (!chapterText) return '';
    return chapterName + '\n' + chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    // get novels using the search term
    // no page number, infinite scroll

    const newSearch = searchTerm.replace(/\s+/g, '+');
    const url = this.site + '?s=' + encodeURIComponent(newSearch);

    const result = await fetch(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  filters = {
    genre: {
      value: '',
      label: 'Filter By',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: '?n_orderby=16' },
        { label: 'Adventure', value: '?n_orderby=11' },
        { label: 'Angst', value: '?n_orderby=776' },
        { label: 'Chinese', value: '?n_orderby=342' },
        { label: 'Comedy', value: '?n_orderby=13' },
        { label: 'Drama', value: '?n_orderby=3' },
        { label: 'Fantasy', value: '?n_orderby=7' },
        { label: 'Japanese', value: '?n_orderby=343' },
        { label: 'Korean', value: '?n_orderby=341' },
        { label: 'Mature', value: '?n_orderby=778' },
        { label: 'Mystery', value: '?n_orderby=12' },
        { label: 'Original Novel', value: '?n_orderby=339' },
        { label: 'Psychological', value: '?n_orderby=769' },
        { label: 'Romance', value: '?n_orderby=5' },
        { label: 'Sci-fi', value: '?n_orderby=14' },
        { label: 'Slice of Life', value: '?n_orderby=779' },
        { label: 'Supernatural', value: '?n_orderby=780' },
        { label: 'Tragedy', value: '?n_orderby=777' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new Rainofsnow();
