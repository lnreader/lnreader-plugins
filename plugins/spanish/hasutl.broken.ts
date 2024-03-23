import { load as parseHTML } from 'cheerio';
import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';

class HasulTL implements Plugin.PluginBase {
  id = 'HasuTL';
  name = 'Hasu Translations';
  icon = 'src/es/hasutl/icon.png';
  site = 'https://hasutl.wordpress.com/';
  filters?: Filters | undefined;
  version = '1.0.0';
  baseUrl = this.site;
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.baseUrl + 'light-novels-activas/';

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.wp-block-columns').each(function () {
      const novelName = loadedCheerio(this).find('.wp-block-button').text();
      const novelCover = loadedCheerio(this).find('img').attr('src');

      let novelUrl = loadedCheerio(this)
        .find('.wp-block-button > a')
        .attr('href');

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

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novel: Plugin.SourceNovel = {
      url,
    };

    novel.url = novelUrl;

    novel.name = loadedCheerio('.post-header').text();

    novel.cover = loadedCheerio('.featured-media > img').attr('src');

    let novelSummary = loadedCheerio('.post-content').find('p').html()!;
    novel.summary = novelSummary;

    let novelChapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.wp-block-media-text__content')
      .find('a')
      .each(function () {
        const chapterName = loadedCheerio(this).text().trim();

        const releaseDate = null;

        let chapterUrl = loadedCheerio(this).attr('href');

        if (!chapterUrl) return;

        const chapter = {
          name: chapterName,
          releaseTime: releaseDate,
          url: chapterUrl,
        };

        novelChapters.push(chapter);
      });

    novel.chapters = novelChapters;

    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const url = chapterUrl;

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio('.post-content').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.baseUrl}?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetch(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('.post-container').each(function () {
      const novelName = loadedCheerio(this).find('.post-header').text();
      if (
        !novelName.includes('Cap') &&
        !novelName.includes('Vol') &&
        !novelName.includes('Light Novels')
      ) {
        const novelCover = loadedCheerio(this).find('img').attr('src');

        let novelUrl = loadedCheerio(this).find('a').attr('href');

        if (!novelUrl) return;

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

export default new HasulTL();
