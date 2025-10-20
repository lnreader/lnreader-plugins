import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
class Oasis implements Plugin.PluginBase {
  id = 'oasistranslations';
  name = 'Oasis Translations';
  site = 'https://oasistranslations.wordpress.com/';
  version = '1.0.0';
  filters?: Filters | undefined;
  icon = 'src/es/oasistranslations/icon.png';
  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const result = await fetchApi(this.site);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.menu-item-1819')
      .find('.sub-menu > li')
      .each((idx, ele) => {
        const novelName = loadedCheerio(ele).text();
        if (!novelName.match(/Activas|Finalizadas|Dropeadas/)) {
          const novelCover = loadedCheerio(ele).find('img').attr('src');

          const novelUrl = loadedCheerio(ele).find('a').attr('href');

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

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.entry-title')
        .text()
        .replace(/[\t\n]/g, '')
        .trim(),
    };
    novel.cover = loadedCheerio('img[loading="lazy"]').attr('src');

    loadedCheerio('.entry-content > p').each(() => {
      if (loadedCheerio(this).text().includes('Autor')) {
        const details = loadedCheerio(this)
          .html()
          ?.match(/<\/strong>(.|\n)*?<br>/g)
          ?.map(detail => detail.replace(/<strong>|<\/strong>|<br>|:\s/g, ''));

        novel.genres = '';
        if (details) {
          novel.author = details[2];
          novel.genres = details[4].replace(/\s|&nbsp;/g, '');
        }
      }
    });

    // let novelSummary = $(this).next().html();
    novel.summary = '';

    const novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.entry-content')
      .find('a')
      .each((idx, ele) => {
        const chapterUrl = loadedCheerio(ele).attr('href');

        if (chapterUrl && chapterUrl.includes(this.site)) {
          const chapterName = loadedCheerio(ele).text();
          const releaseDate = null;

          const chapter = {
            name: chapterName,
            releaseTime: releaseDate,
            path: chapterUrl.replace(this.site, ''),
          };

          novelChapters.push(chapter);
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

    loadedCheerio('div#jp-post-flair').remove();

    const chapterText = loadedCheerio('.entry-content').html() || '';

    return chapterText;
  }
  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    searchTerm = searchTerm.toLowerCase();

    const result = await fetchApi(this.site);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];
    loadedCheerio('.menu-item-1819')
      .find('.sub-menu > li')
      .each((idx, ele) => {
        const novelName = loadedCheerio(ele).text();
        if (!novelName.match(/Activas|Finalizadas|Dropeadas/)) {
          const novelCover = loadedCheerio(ele).find('img').attr('src');

          const novelUrl = loadedCheerio(ele).find('a').attr('href');

          if (!novelUrl) return;

          const novel = {
            name: novelName,
            cover: novelCover,
            path: novelUrl.replace(this.site, ''),
          };

          novels.push(novel);
        }
      });

    novels = novels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm),
    );

    return novels;
  }
}

export default new Oasis();
