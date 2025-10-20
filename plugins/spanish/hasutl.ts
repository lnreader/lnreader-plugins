import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class HasulTL implements Plugin.PluginBase {
  id = 'HasuTL';
  name = 'Hasu Translations';
  icon = 'src/es/hasutl/icon.jpg';
  site = 'https://hasutl.wordpress.com/';
  version = '1.0.0';

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const url = this.site + 'light-novels-activas/';

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.wp-block-columns').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.wp-block-button').text();
      const novelCover = loadedCheerio(ele).find('img').attr('src');

      const novelUrl = loadedCheerio(ele)
        .find('.wp-block-button > a')
        .attr('href');

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
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.post-header').text(),
    };
    novel.cover = loadedCheerio('.featured-media > img').attr('src');

    const novelSummary = loadedCheerio('.post-content').find('p').html()!;
    novel.summary = novelSummary;

    const novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.wp-block-media-text__content')
      .find('a')
      .each((idx, ele) => {
        const chapterName = loadedCheerio(ele).text().trim();

        const releaseDate = null;

        const chapterUrl = loadedCheerio(ele).attr('href');

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

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('.post-content').html() || '';

    return chapterText;
  }
  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.post-container').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.post-header').text();
      if (
        !novelName.includes('Cap') &&
        !novelName.includes('Vol') &&
        !novelName.includes('Light Novels')
      ) {
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
}

export default new HasulTL();
