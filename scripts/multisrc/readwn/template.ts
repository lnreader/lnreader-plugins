import { fetchFile, fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import dayjs from 'dayjs';
import qs from 'qs';

export interface ReadwnMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
}

class ReadwnPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  filters?: Filters;

  constructor(metadata: ReadwnMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/readwn/icons/${metadata.id}.png`;
    this.site = metadata.sourceSite;
    this.version = '1.0.0';
    this.filters = metadata.filters;
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + '/list/';
    url += (filters?.genres?.value || 'all') + '/';
    url += (filters?.status?.value || 'all') + '-';
    url += showLatestNovels ? 'lastdotime' : filters?.sort?.value || 'newstime';
    url += '-' + (pageNo - 1) + '.html';

    if (filters?.tags?.value) {
      //only 1 page
      url = this.site + '/tags/' + filters.tags.value + '-0.html';
    }

    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = loadedCheerio('li.novel-item')
      .map((index, element) => ({
        name: loadedCheerio(element).find('h4').text() || '',
        cover:
          this.site +
          loadedCheerio(element).find('.novel-cover > img').attr('data-src'),
        path: loadedCheerio(element).find('a').attr('href') || '',
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
      name: loadedCheerio('h1.novel-title').text() || '',
    };

    novel.author = loadedCheerio('span[itemprop=author]').text();
    novel.cover =
      this.site + loadedCheerio('figure.cover > img').attr('data-src');

    novel.summary = loadedCheerio('.summary')
      .text()
      .replace('Summary', '')
      .trim();

    novel.genres = loadedCheerio('div.categories > ul > li')
      .map((index, element) => loadedCheerio(element).text()?.trim())
      .get()
      .join(',');

    loadedCheerio('div.header-stats > span').each(function () {
      if (loadedCheerio(this).find('small').text() === 'Status') {
        novel.status =
          loadedCheerio(this).find('strong').text() === 'Ongoing'
            ? NovelStatus.Ongoing
            : NovelStatus.Completed;
      }
    });

    const latestChapterNo = parseInt(
      loadedCheerio('.header-stats')
        .find('span > strong')
        .first()
        .text()
        .trim(),
    );

    const chapters: Plugin.ChapterItem[] = loadedCheerio('.chapter-list li')
      .map((chapterIndex, element) => {
        const name = loadedCheerio(element)
          .find('a .chapter-title')
          .text()
          .trim();
        const path = loadedCheerio(element).find('a').attr('href')?.trim();
        if (!name || !path) return null;

        let releaseTime = loadedCheerio(element)
          .find('a .chapter-update')
          .text()
          .trim();
        if (releaseTime?.includes?.('ago')) {
          const timeAgo = releaseTime.match(/\d+/)?.[0] || '0';
          const timeAgoInt = parseInt(timeAgo, 10);

          if (timeAgoInt) {
            const dayJSDate = dayjs(); // today
            if (
              releaseTime.includes('hours ago') ||
              releaseTime.includes('hour ago')
            ) {
              dayJSDate.subtract(timeAgoInt, 'hours'); // go back N hours
            }

            if (
              releaseTime.includes('days ago') ||
              releaseTime.includes('day ago')
            ) {
              dayJSDate.subtract(timeAgoInt, 'days'); // go back N days
            }

            if (
              releaseTime.includes('months ago') ||
              releaseTime.includes('month ago')
            ) {
              dayJSDate.subtract(timeAgoInt, 'months'); // go back N months
            }

            releaseTime = dayJSDate.format('LL');
          }
        }

        return {
          name,
          path,
          releaseTime,
          chapterNumber: chapterIndex + 1,
        };
      })
      .get()
      .filter(chapter => chapter);

    if (latestChapterNo > chapters.length) {
      const lastChapterNo = parseInt(
        chapters[chapters.length - 1].path.match(/_(\d+)\.html/)?.[1] || '',
        10,
      );

      for (
        let i = (lastChapterNo || chapters.length) + 1;
        i <= latestChapterNo;
        i++
      ) {
        chapters.push({
          name: 'Chapter ' + i,
          path: novelPath.replace('.html', '_' + i + '.html'),
          releaseTime: null,
          chapterNumber: i,
        });
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.chapter-content').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const result = await fetchApi(this.site + '/e/search/index.php', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.site + '/search.html',
        Origin: this.site,
      },
      method: 'POST',
      body: qs.stringify({
        show: 'title',
        tempid: 1,
        tbname: 'news',
        keyboard: searchTerm,
      }),
    }).then(res => res.text());
    const loadedCheerio = parseHTML(result);

    const novels: Plugin.NovelItem[] = loadedCheerio('li.novel-item')
      .map((index, element) => ({
        name: loadedCheerio(element).find('h4').text() || '',
        cover: this.site + loadedCheerio(element).find('img').attr('data-src'),
        path: loadedCheerio(element).find('a').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);
    return novels;
  }

  fetchImage = fetchFile;
}
