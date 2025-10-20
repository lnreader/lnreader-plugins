import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { Filters } from '@libs/filterInputs';

class ReinoWuxia implements Plugin.PluginBase {
  id = 'reinowuxia';
  name = 'ReinoWuxia';
  icon = 'src/es/reinowuxia/icon.png';
  filters?: Filters | undefined;
  version = '1.0.0';
  site = 'http://www.reinowuxia.com/';
  getNovelName(y: string | undefined) {
    return y?.replace(/-/g, ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }
  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const url = this.site + 'p/todas-las-novelas.html';

    const result = await fetchApi(url, {
      method: 'GET',
    });
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

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

        const novelUrl = loadedCheerio(ele).attr('href');

        if (!novelName || !novelUrl) return;

        const novel = {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site, ''),
        };

        novels.push(novel);
      });

    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.post-title').text().trim(),
    };

    novel.cover = loadedCheerio('div.separator').find('a').attr('href');

    novel.status = '';

    loadedCheerio('div > b').each(function () {
      const detailName = loadedCheerio(this).text();
      const detail = loadedCheerio(this)[0].nextSibling;

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

    const novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('div').each((idx, rootEle) => {
      const detailName = loadedCheerio(rootEle).text();
      if (detailName.includes('Sinopsis')) {
        novel.summary =
          loadedCheerio(rootEle).next().text() !== ''
            ? loadedCheerio(rootEle)
                .next()
                .text()
                .replace('Sinopsis', '')
                .trim()
            : loadedCheerio(rootEle)
                .next()
                .next()
                .text()
                .replace('Sinopsis', '')
                .trim();
      }

      if (detailName.includes('Lista de Capítulos')) {
        loadedCheerio(rootEle)
          .find('a')
          .each((idx, ele) => {
            const chapterName = loadedCheerio(ele).text();
            const chapterPath = loadedCheerio(ele)
              .attr('href')
              ?.replace(this.site, '');
            const releaseDate = null;

            if (
              chapterName &&
              chapterPath &&
              chapterPath !== '/' &&
              !novelChapters.some(chap => chap.name === chapterName)
            ) {
              const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                path: chapterPath,
              };

              novelChapters.push(chapter);
            }
          });
      }
    });

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.post-body.entry-content').html() || '';

    return chapterText;
  }
  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search?q=${searchTerm}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

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
          path: novelUrl.replace(this.site, ''),
        };

        novels.push(novel);
      }
    });

    return novels;
  }
}

export default new ReinoWuxia();
