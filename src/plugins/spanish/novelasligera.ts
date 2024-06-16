import { load as parseHTML } from 'cheerio';
import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';

class Ligera implements Plugin.PluginBase {
  id = 'novelasligera';
  name = 'Novelas Ligera';
  icon = 'src/es/novelasligera/icon.png';
  site = 'https://novelasligera.com/';
  filters?: Filters | undefined;
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site;

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.elementor-column').each((idx, ele) => {
      const novelName = loadedCheerio(ele)
        .find('.widget-image-caption.wp-caption-text')
        .text();
      if (novelName) {
        const novelCover = loadedCheerio(ele)
          .find('a > img')
          .attr('data-lazy-src');

        let novelUrl = loadedCheerio(ele).find('a').attr('href');
        if (!novelUrl) return;
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
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;

    // console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1').text(),
    };

    novel.cover = loadedCheerio('.elementor-widget-container')
      .find('img')
      .attr('data-lazy-src');

    loadedCheerio('.elementor-row')
      .find('p')
      .each(function () {
        if (loadedCheerio(this).text().includes('Autor:')) {
          novel.author = loadedCheerio(this)
            .text()
            .replace('Autor:', '')
            .trim();
        }
        if (loadedCheerio(this).text().includes('Estado:')) {
          novel.status = loadedCheerio(this)
            .text()
            .replace('Estado: ', '')
            .trim();
        }

        if (loadedCheerio(this).text().includes('Género:')) {
          loadedCheerio(this).find('span').remove();
          novel.genres = loadedCheerio(this).text().replace(/,\s/g, ',');
        }
      });

    novel.summary = loadedCheerio(
      '.elementor-text-editor.elementor-clearfix',
    ).text();

    let novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.elementor-accordion-item').remove();

    loadedCheerio('.elementor-tab-content')
      .find('li')
      .each((idx, ele) => {
        const chapterName = loadedCheerio(ele).text();
        const releaseDate = null;
        const chapterUrl = loadedCheerio(ele).find('a').attr('href');
        if (!chapterUrl) return;
        const chapter = {
          name: chapterName,
          releaseTime: releaseDate,
          path: chapterUrl.replace(this.site, ''),
        };

        novelChapters.push(chapter);
      });

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    // console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
    loadedCheerio('.osny-nightmode.osny-nightmode--left').remove();
    loadedCheerio('.code-block.code-block-1').remove();
    loadedCheerio('.adsb30').remove();
    loadedCheerio('.saboxplugin-wrap').remove();
    loadedCheerio('.wp-post-navigation').remove();

    let chapterText = loadedCheerio('.entry-content').html() || '';
    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.site + '?s=' + searchTerm + '&post_type=wp-manga';
    // console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.inside-article').each((idx, ele) => {
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      let novelUrl = loadedCheerio(ele).find('a').attr('href');

      let novelName;

      if (novelUrl) {
        novelName = novelUrl.replace(/-/g, ' ').replace(/^./, function (x) {
          return x.toUpperCase();
        });
      }

      novelUrl += '/';

      if (!novelName || !novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    novels = [{ ...novels[1] }];

    return novels;
  }
}

export default new Ligera();
