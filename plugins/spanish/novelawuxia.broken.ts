import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { Filters } from '@libs/filterInputs';

class ReinoWuxia implements Plugin.PluginBase {
  id = 'awuxia.com';
  name = 'ReinoWuxia';
  icon = 'src/es/novelawuxia/icon.png';
  filters?: Filters | undefined;
  version = '1.0.0';
  site = 'http://www.reinowuxia.com/';
  baseUrl = this.site;
  getNovelName(y: string | undefined) {
    return y?.replace(/-/g, ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.baseUrl + 'p/todas-las-novelas.html';

    const result = await fetchApi(url, {
      method: 'GET',
    });
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.post-body.entry-content')
      .find('a')
      .each((idx, ele) => {
        let novelName = loadedCheerio(ele)
          .attr('href')
          ?.split('/')
          .pop()
          ?.replace('.html', '');
        novelName = this.getNovelName(novelName);
        const novelCover = loadedCheerio(ele).find('img').attr('src');

        let novelUrl = loadedCheerio(ele).attr('href');

        if (!novelName || !novelUrl) return;

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

    let novel: Plugin.SourceNovel = { url };

    novel.name = loadedCheerio('h1.post-title').text().trim();

    novel.cover = loadedCheerio('div.separator').find('a').attr('href');

    novel.status = '';

    loadedCheerio('div > b').each(function () {
      const detailName = loadedCheerio(this).text();
      let detail = loadedCheerio(this)[0].nextSibling;

      if (detailName && detail) {
        const text = loadedCheerio(detail).text();

        if (detailName.includes('Autor')) {
          novel.author = text.replace('Autor:', '');
        }

        if (detailName.includes('Estatus')) {
          novel.status = text.replace('Estatus: ', '');
        }
        if (detailName.includes('Géneros:')) {
          novel.genres = text.replace('Géneros: ', '').replace(/,\s/g, ',');
        }
      }
    });

    let novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('div').each(function () {
      const detailName = loadedCheerio(this).text();
      if (detailName.includes('Sinopsis')) {
        novel.summary =
          loadedCheerio(this).next().text() !== ''
            ? loadedCheerio(this).next().text().replace('Sinopsis', '').trim()
            : loadedCheerio(this)
                .next()
                .next()
                .text()
                .replace('Sinopsis', '')
                .trim();
      }

      if (detailName.includes('Lista de Capítulos')) {
        loadedCheerio(this)
          .find('a')
          .each(function (res) {
            const chapterName = loadedCheerio(this).text();
            let chapterUrl = loadedCheerio(this).attr('href');
            const releaseDate = null;

            if (
              chapterName &&
              chapterUrl &&
              !novelChapters.some(chap => chap.name === chapterName)
            ) {
              const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
              };

              novelChapters.push(chapter);
            }
          });
      }
    });

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio('.post-body.entry-content').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.baseUrl}search?q=${searchTerm}`;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.date-outer').each((idx, ele) => {
      let novelName = loadedCheerio(ele)
        .find('a')
        .attr('href')
        ?.split('/')
        .pop()
        ?.replace(/-capitulo(.*?).html/, '');

      const novelUrl = novelName + '.html/';

      novelName = this.getNovelName(novelName);

      const exists = novels.some(novel => novel.name === novelName);

      if (!exists) {
        const novelCover = defaultCover;

        if (!novelUrl || !novelName) return;
        const novel = {
          name: novelName,
          cover: novelCover,
          url: novelUrl,
        };

        novels.push(novel);
      }
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new ReinoWuxia();
