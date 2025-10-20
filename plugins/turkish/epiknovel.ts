import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class EpikNovel implements Plugin.PluginBase {
  id = 'epiknovel';
  name = 'EpikNovel';
  icon = 'src/tr/epiknovel/icon.png';
  site = 'https://www.epiknovel.com/';
  version = '1.0.0';
  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = this.site + 'seri-listesi?Sayfa=' + pageNo;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.col-lg-12.col-md-12').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h3').text();
      const novelCover = loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele).find('h3 > a').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    // console.log(novels);

    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    // console.log(url);

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1#tables').text().trim(),
    };

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

    const novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('table').find('tr').first().remove();

    loadedCheerio('table')
      .find('tr')
      .each((idx, ele) => {
        const releaseDate = loadedCheerio(ele).find('td:nth-child(3)').text();

        let chapterName = loadedCheerio(ele).find('td:nth-child(1) > a').text();

        if (loadedCheerio(ele).find('td:nth-child(1) > span').length > 0) {
          chapterName = '🔒 ' + chapterName;
        }

        const chapterUrl = loadedCheerio(ele)
          .find(' td:nth-child(1) > a')
          .attr('href');

        if (!chapterUrl) return;

        novelChapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
          releaseTime: releaseDate,
        });
      });

    novel.chapters = novelChapters;
    // console.log(novel);

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;

    // console.log(url);

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let chapterText = '';

    if (result.url === this.site + 'login') {
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
    const url = this.site + 'seri-listesi?q=' + searchTerm + '&Sayfa=' + pageNo;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.col-lg-12.col-md-12').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h3').text();
      const novelCover = loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele).find('h3 > a').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    return novels;
  }
}

export default new EpikNovel();
