import { load as parseHTML } from 'cheerio';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import dayjs from 'dayjs';

class ReadLiteNovel implements Plugin.PluginBase {
  id = 'rln.app';
  name = 'ReadLiteNovel';
  version = '1.0.0';
  icon = 'src/en/readlitenovel/icon.png';
  site = 'https://rln.app';

  parseAgoDate(date: string | undefined) {
    //parseMadaraDate
    if (date?.includes('ago')) {
      const dayJSDate = dayjs(new Date()); // today
      const timeAgo = date.match(/\d+/)?.[0] || '';
      const timeAgoInt = parseInt(timeAgo, 10);

      if (!timeAgo) return null; // there is no number!

      if (date.includes('hours ago') || date.includes('hour ago')) {
        dayJSDate.subtract(timeAgoInt, 'hours'); // go back N hours
      }

      if (date.includes('days ago') || date.includes('day ago')) {
        dayJSDate.subtract(timeAgoInt, 'days'); // go back N days
      }

      if (date.includes('months ago') || date.includes('month ago')) {
        dayJSDate.subtract(timeAgoInt, 'months'); // go back N months
      }

      if (date.includes('years ago') || date.includes('year ago')) {
        dayJSDate.subtract(timeAgoInt, 'years'); // go back N years
      }

      return dayJSDate.toISOString();
    }
    return null; // there is no "ago" so give up
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const link = `${this.site}/ranking/${filters.order.value}/${page}`;
    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.category-items li').each((i, el) => {
      const novelUrl = loadedCheerio(el).find('.category-name a').attr('href');

      if (!novelUrl) return;
      const novelName = loadedCheerio(el)
        .find('.category-name a')
        .text()
        .trim();
      let novelCover = loadedCheerio(el).find('.category-img img').attr('src');

      if (novelCover && !isUrlAbsolute(novelCover)) {
        novelCover = this.site + novelCover;
      }

      const novel = {
        path: novelUrl?.replace(this.site, ''),
        name: novelName,
        cover: novelCover,
      };
      novels.push(novel);
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.novel-title').text() || 'Untitled',
      cover: loadedCheerio('.novels-detail img').attr('src'),
      summary: loadedCheerio('.empty-box').text().trim(),
      chapters: [],
    };

    loadedCheerio('.novels-detail-right li').each((i, el) => {
      const detailName = loadedCheerio(el).find('div:first').text();
      const detail = loadedCheerio(el).find('div:last');

      switch (detailName) {
        case 'Status:':
          novel.status = detail.text();
          break;
        case 'Genres:':
          novel.genres =
            detail
              .find('a')
              .map((i, el) => loadedCheerio(el).text())
              .toArray()
              .join(', ') || detail.text();
          break;
        case 'Author(s):':
          novel.author =
            detail
              .find('a')
              .map((i, el) => loadedCheerio(el).text())
              .toArray()
              .join(', ') || detail.text();
          break;
        case 'Translator:':
          novel.artist = detail.text();
          break;
      }
    });
    const chapter: Plugin.ChapterItem[] = [];
    loadedCheerio('.cm-tabs-content li').each((i, el) => {
      const chapterUrl = loadedCheerio(el).find('a').attr('href');
      if (!chapterUrl) return;
      const chapterName = loadedCheerio(el).find('a').text().trim();
      const releaseDate = this.parseAgoDate(
        loadedCheerio(el).find('svg').attr('data-bs-original-title')!,
      );

      chapter.push({
        name: chapterName,
        path: chapterUrl?.replace(this.site, ''),
        releaseTime: releaseDate,
      });
    });

    novel.chapters = chapter;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#chapterText').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + `/search/autocomplete?dataType=json&query=${searchTerm}`;
    const result = await fetchApi(url);
    const body = await result.json();
    const novels: Plugin.NovelItem[] = [];

    body.results.forEach(
      (item: { link: string; original_title: string; image: string }) =>
        novels.push({
          path: item.link,
          name: item.original_title,
          cover: item.image,
        }),
    );

    return novels;
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    order: {
      value: 'top-rated',
      label: 'Order by',
      options: [
        { label: 'MOST VIEWED', value: 'most-viewed' },
        { label: 'TOP RATED', value: 'top-rated' },
        { label: 'BOOKMARKS', value: 'subscribers' },
        { label: 'NEW', value: 'new' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new ReadLiteNovel();
