import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy.io';
  site = 'https://novelbuddy.io/';
  version = '1.0.0';
  icon = 'src/en/novelbuddy/icon.png';
  filters?: undefined; //TODO: Filters, Filters in Filters required

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.book-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.title').text();
      const novelCover =
        'https:' + loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele)
        .find('.title a')
        .attr('href')
        ?.substring(1);

      if (!novelUrl) return;

      const novel = { name: novelName, cover: novelCover, path: novelUrl };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}popular?page=${pageNo}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.name h1').text().trim() || 'Untitled',
      cover: 'https:' + loadedCheerio('.img-cover img').attr('data-src'),
      summary: loadedCheerio('.section-body.summary').text().trim(),
      chapters: [],
    };

    loadedCheerio('.meta.box p').each((i, el) => {
      const detailName = loadedCheerio(el).find('strong').text();
      const detail = loadedCheerio(el).find('a');

      switch (detailName) {
        case 'Authors :':
          novel.author = detail
            .find('span')
            .map((a, ex) => loadedCheerio(ex).text())
            .toArray()
            .join(', ');
          break;
        case 'Status :':
          novel.status = detail.text();
          break;
        case 'Genres :':
          novel.genres = detail.text().trim();
          break;
      }
    });
    const novelId = loadedCheerio('script')
      .text()
      .match(/bookId = (\d+);/)![1];
    const chapter: Plugin.ChapterItem[] = [];

    const getChapters = async (id: string) => {
      const chapterListUrl = `${this.site}api/manga/${id}/chapters?source=detail`;
      const data = await fetchApi(chapterListUrl);
      const chapterlist = await data.text();

      loadedCheerio = parseHTML(chapterlist);

      loadedCheerio('li').each((i, el) => {
        const chapterName = loadedCheerio(el)
          .find('.chapter-title')
          .text()
          .trim();

        const releaseDate = loadedCheerio(el)
          .find('.chapter-update')
          .text()
          .trim();

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
        ].join('|');
        const rx = new RegExp(`(${months}) (\\d{1,2}), (\\d{4})`, 'i').exec(
          releaseDate,
        );
        if (!rx) return;
        const year = +rx[3];
        const month = months.indexOf(rx[1].toLowerCase());
        const day = +rx[2];

        const chapterUrl = loadedCheerio(el).find('a').attr('href')?.slice(1);

        if (!chapterUrl) return;

        chapter.push({
          name: chapterName,
          releaseTime: new Date(year, month, day).toISOString(),
          path: chapterUrl,
        });
      });
      return chapter;
    };

    novel.chapters = (await getChapters(novelId)).reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('#listen-chapter').remove();
    loadedCheerio('#google_translate_element').remove();

    const chapterText = loadedCheerio('.chapter__content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search?q=${searchTerm}&page=${page}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new NovelBuddy();
