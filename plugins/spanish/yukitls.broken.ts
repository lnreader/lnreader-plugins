import { fetchApi, fetchFile } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';
import { load as parseHTML } from 'cheerio';

export const id = 'yuukitls.com';
export const name = 'Yuuki Tls';
export const site = 'https://yuukitls.com/';
export const version = '1.0.0';
export const icon = 'src/es/yuukitls/icon.png';

const baseUrl = site;

class Yuuki implements Plugin.PluginBase {
  id = 'yuukitls.com';
  name = 'Yuuki Tls';
  icon = 'src/es/yuukitls/icon.png';
  site = 'https://yuukitls.com/';
  filters?: Filters | undefined;
  version = '1.0.0';
  baseUrl = this.site;

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = baseUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.quadmenu-navbar-collapse ul li:nth-child(2)')
      .find('li')
      .each(function () {
        const novelName = loadedCheerio(this)
          .text()
          .replace(/[\s\n]+/g, ' ');
        const novelCover = loadedCheerio(this).find('img').attr('src');

        let novelUrl = loadedCheerio(this).find('a').attr('href');
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
  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const url = novelUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novel: Plugin.SourceNovel = {
      url,
    };

    novel.name = loadedCheerio('h1.entry-title')
      .text()
      .replace(/[\t\n]/g, '')
      .trim();

    novel.cover = loadedCheerio('img[loading="lazy"]').attr('src');

    loadedCheerio('.entry-content')
      .find('div')
      .each(function () {
        if (loadedCheerio(this).text().includes('Escritor:')) {
          novel.author = loadedCheerio(this)
            .text()
            .replace('Escritor: ', '')
            .trim();
        }
        if (loadedCheerio(this).text().includes('Género:')) {
          novel.genres = loadedCheerio(this)
            .text()
            .replace(/Género: |\s/g, '');
        }

        if (loadedCheerio(this).text().includes('Sinopsis:')) {
          novel.summary = loadedCheerio(this).next().text();
        }
      });

    let novelChapters: Plugin.ChapterItem[] = [];

    if (loadedCheerio('.entry-content').find('li').length) {
      loadedCheerio('.entry-content')
        .find('li')
        .each(function () {
          let chapterUrl = loadedCheerio(this).find('a').attr('href');

          if (chapterUrl && chapterUrl.includes(baseUrl)) {
            const chapterName = loadedCheerio(this).text();
            const releaseDate = null;

            const chapter = {
              name: chapterName,
              releaseTime: releaseDate,
              url: chapterUrl,
            };

            novelChapters.push(chapter);
          }
        });
    } else {
      loadedCheerio('.entry-content')
        .find('p')
        .each(function () {
          let chapterUrl = loadedCheerio(this).find('a').attr('href');

          if (chapterUrl && chapterUrl.includes(baseUrl)) {
            const chapterName = loadedCheerio(this).text();
            const releaseDate = null;

            const chapter = {
              name: chapterName,
              releaseTime: releaseDate,
              url: chapterUrl,
            };

            novelChapters.push(chapter);
          }
        });
    }

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
    let chapterText = loadedCheerio('.entry-content').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    searchTerm = searchTerm.toLowerCase();

    let url = baseUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.menu-item-2869')
      .find('.menu-item.menu-item-type-post_type.menu-item-object-post')
      .each(function () {
        const novelName = loadedCheerio(this).text();
        const novelCover = loadedCheerio(this).find('img').attr('src');

        let novelUrl = loadedCheerio(this).find('a').attr('href');
        if (!novelUrl) return;

        const novel = {
          name: novelName,
          cover: novelCover,
          url: novelUrl,
        };

        novels.push(novel);
      });

    novels = novels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm),
    );

    return novels;
  }
  fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new Yuuki();
