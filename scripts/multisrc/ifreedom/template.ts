import { fetchFile, fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';

export interface IfreedomMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
}

class IfreedomPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  filters?: Filters;

  constructor(metadata: IfreedomMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/ifreedom/icons/${metadata.id}.png`;
    this.site = metadata.sourceSite;
    this.version = '1.0.0';
    this.filters = metadata.filters;
  }

  async popularNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url =
      this.site +
      '/vse-knigi/?sort=' +
      (showLatestNovels
        ? 'По дате обновления'
        : filters?.sort?.value || 'По рейтингу');

    Object.entries(filters || {}).forEach(([type, { value }]) => {
      if (value instanceof Array && value.length) {
        url += '&' + type + '[]=' + value.join('&' + type + '[]=');
      }
    });

    url += '&bpage=' + page;

    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = loadedCheerio(
      'div.one-book-home > div.img-home a',
    )
      .map((index, element) => ({
        name: loadedCheerio(element).attr('title') || '',
        cover: loadedCheerio(element).find('img').attr('src'),
        path:
          loadedCheerio(element).attr('href')?.replace?.(this.site, '') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.entry-title').text(),
      cover: loadedCheerio('.img-ranobe > img').attr('src'),
      summary: loadedCheerio('meta[name="description"]').attr('content'),
    };

    loadedCheerio('div.data-ranobe').each(function () {
      switch (loadedCheerio(this).find('b').text()) {
        case 'Автор':
          novel.author = loadedCheerio(this)
            .find('div.data-value')
            .text()
            .trim();
          break;
        case 'Жанры':
          novel.genres = loadedCheerio('div.data-value > a')
            .map((index, element) => loadedCheerio(element).text()?.trim())
            .get()
            .join(',');
          break;
        case 'Статус книги':
          novel.status = loadedCheerio('div.data-value')
            .text()
            .includes('активен')
            ? NovelStatus.Ongoing
            : NovelStatus.Completed;
          break;
      }
    });

    if (novel.author == 'Не указан') delete novel.author;

    const chapters: Plugin.ChapterItem[] = [];
    const totalChapters = loadedCheerio('div.li-ranobe').length;

    loadedCheerio('div.li-ranobe').each((chapterIndex, element) => {
      const name = loadedCheerio(element).find('a').text();
      const url = loadedCheerio(element).find('a').attr('href');
      if (
        !loadedCheerio(element).find('label.buy-ranobe').length &&
        name &&
        url
      ) {
        const releaseDate = loadedCheerio(element)
          .find('div.li-col2-ranobe')
          .text()
          .trim();

        chapters.push({
          name,
          path: url.replace(this.site, ''),
          releaseTime: this.parseDate(releaseDate),
          chapterNumber: totalChapters - chapterIndex,
        });
      }
    });

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    loadedCheerio('.entry-content img').each((index, element) => {
      const srcset = loadedCheerio(element).attr('srcset')?.split?.(' ');
      if (srcset?.length) {
        loadedCheerio(element).removeAttr('srcset');
        const bestlink: string[] = srcset.filter(url => url.startsWith('http'));
        if (bestlink[bestlink.length - 1]) {
          loadedCheerio(element).attr('src', bestlink[bestlink.length - 1]);
        }
      }
    });

    const chapterText = loadedCheerio('.entry-content').html() || '';
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/vse-knigi/?searchname=' + searchTerm + '&bpage=' + page;
    const result = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(result);

    const novels: Plugin.NovelItem[] = loadedCheerio(
      'div.one-book-home > div.img-home a',
    )
      .map((index, element) => ({
        name: loadedCheerio(element).attr('title') || '',
        cover: loadedCheerio(element).find('img').attr('src'),
        path:
          loadedCheerio(element).attr('href')?.replace?.(this.site, '') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);

    return novels;
  }

  parseDate = (dateString: string | undefined = '') => {
    const months: { [key: string]: number } = {
      января: 1,
      февраля: 2,
      марта: 3,
      апреля: 4,
      мая: 5,
      июня: 6,
      июля: 7,
      августа: 8,
      сентября: 9,
      октября: 10,
      ноября: 11,
      декабря: 12,
    };

    if (dateString.includes('.')) {
      const [day, month, year] = dateString.split('.');
      if (day && month && year) {
        return dayjs(year + '-' + month + '-' + day).format('LL');
      }
    } else if (dateString.includes(' ')) {
      const [day, month] = dateString.split(' ');
      if (day && months[month]) {
        const year = new Date().getFullYear();
        return dayjs(year + '-' + months[month] + '-' + day).format('LL');
      }
    }
    return dateString || null;
  };

  fetchImage = fetchFile;
}
