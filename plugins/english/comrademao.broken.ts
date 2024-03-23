import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import dayjs from 'dayjs';

class ComradeMaoPlugin implements Plugin.PluginBase {
  id = 'comrademao';
  name = 'Comrade Mao';
  site = 'https://comrademao.com/';
  version = '1.0.0';
  icon = 'src/en/comrademao/icon.png';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.listupd')
      .find('div.bs')
      .each(function () {
        const novelName = loadedCheerio(this).find('.tt').text().trim();
        const novelCover = loadedCheerio(this).find('img').attr('src');
        const novelUrl = loadedCheerio(this).find('a').attr('href');

        if (!novelUrl) return;

        const novel = {
          name: novelName,
          cover: novelCover,
          url: novelUrl,
        };
        novels.push(novel);
      });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site;

    link += filters.category.value;

    link += 'page/' + pageNo + '/?post_type=novel';

    const body = await fetchApi(link).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(novelUrl).then(result => result.text());

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      url: novelUrl,
      chapters: [],
    };

    novel.name = loadedCheerio('.entry-title').text().trim();

    novel.cover = loadedCheerio('div.thumbook > div > img').attr('src');

    loadedCheerio('.infox .wd-full').each((i, el) => {
      const detailName = loadedCheerio(el).find('b').text();
      const detail = loadedCheerio(el).find('span').text();

      switch (detailName) {
        case 'Publisher: ':
          novel.author = detail.trim();
          break;
        case 'Status: ':
          novel.status = detail.trim();
          break;
        case 'Genres:':
          novel.genres = detail.trim().replace(/ , /g, ',');
          break;
        case 'Description: ':
          novel.summary = detail.trim();
          break;
      }
    });

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('#chapterlist')
      .find('li')
      .each(function () {
        const chapterUrl = loadedCheerio(this).find('a').attr('href');
        if (!chapterUrl) return;

        const chapterName = loadedCheerio(this).find('.chapternum').text();
        let releaseTime = loadedCheerio(this).find('.chapterdate').text();

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
        chapter.push({
          name: chapterName,
          url: chapterUrl,
          releaseTime,
        });
      });

    novel.chapters = chapter.reverse();

    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const body = await fetchApi(chapterUrl).then(result => result.text());
    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#chaptercontent').html()?.trim() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}page/${pageNo}/?s=${searchTerm}&post_type=novel`;

    const body = await fetchApi(url).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }

  filters = {
    category: {
      value: '',
      label: 'Type',
      options: [
        { label: 'None', value: '' },
        { label: 'Chinese', value: '/mtype/chinese/' },
        { label: 'Japanese', value: '/mtype/japanese/' },
        { label: 'Korean', value: '/mtype/korean/' },
        { label: 'Manhua', value: '/mtype/manhua/' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new ComradeMaoPlugin();
