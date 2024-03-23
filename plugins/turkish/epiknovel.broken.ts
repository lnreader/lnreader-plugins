import { load as parseHTML } from 'cheerio';
import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';

class EpikNovel implements Plugin.PluginBase {
  id = 'epiknovel.com';
  name = 'EpikNovel';
  icon = 'src/tr/epiknovel/icon.png';
  site = 'https://www.epiknovel.com/';
  version = '1.0.0';
  baseUrl = this.site;
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.baseUrl + 'seri-listesi?Sayfa=' + pageNo;

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.col-lg-12.col-md-12').each(function () {
      const novelName = loadedCheerio(this).find('h3').text();
      const novelCover = loadedCheerio(this).find('img').attr('data-src');
      const novelUrl = loadedCheerio(this).find('h3 > a').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        url: novelUrl,
      };

      novels.push(novel);
    });

    // console.log(novels);

    return novels;
  }
  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const url = novelUrl;
    // console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novel: Plugin.SourceNovel = { url };

    novel.name = loadedCheerio('h1#tables').text().trim();

    novel.cover = loadedCheerio('img.manga-cover').attr('src');

    novel.summary = loadedCheerio(
      '#wrapper > div.row > div.col-md-9 > div:nth-child(6) > p:nth-child(3)',
    )
      .text()
      .trim();

    novel.status = loadedCheerio(
      '#wrapper > div.row > div.col-md-9 > div.row > div.col-md-9 > h4:nth-child(3) > a',
    )
      .text()
      .trim();

    novel.author = loadedCheerio('#NovelInfo > p:nth-child(4)')
      .text()
      .replace(/Publisher:|\s/g, '')
      .trim();

    let novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('table').find('tr').first().remove();

    loadedCheerio('table')
      .find('tr')
      .each(function () {
        const releaseDate = loadedCheerio(this).find('td:nth-child(3)').text();

        let chapterName = loadedCheerio(this)
          .find('td:nth-child(1) > a')
          .text();

        if (loadedCheerio(this).find('td:nth-child(1) > span').length > 0) {
          chapterName = '🔒 ' + chapterName;
        }

        const chapterUrl = loadedCheerio(this)
          .find(' td:nth-child(1) > a')
          .attr('href');

        if (!chapterUrl) return;

        novelChapters.push({
          name: chapterName,
          url: chapterUrl,
          releaseTime: releaseDate,
        });
      });

    novel.chapters = novelChapters;
    // console.log(novel);

    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const url = chapterUrl;

    // console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterText = '';

    if (result.url === 'https://www.epiknovel.com/login') {
      chapterText = 'Premium Chapter';
    } else {
      chapterText = loadedCheerio('div#icerik').html() || '';
    }

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.baseUrl + 'seri-listesi?q=' + searchTerm + '&Sayfa=' + pageNo;

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.col-lg-12.col-md-12').each(function () {
      const novelName = loadedCheerio(this).find('h3').text();
      const novelCover = loadedCheerio(this).find('img').attr('data-src');
      const novelUrl = loadedCheerio(this).find('h3 > a').attr('href');

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
  fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new EpikNovel();
