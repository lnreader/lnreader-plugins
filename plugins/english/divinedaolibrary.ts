import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';

class DDLPlugin implements Plugin.PluginBase {
  id = 'DDL.com';
  name = 'Divine Dao Library';
  site = 'https://www.divinedaolibrary.com/';
  version = '1.0.1';
  icon = 'src/en/divinedaolibrary/icon.png';
  filters?: undefined;

  parseNovels(loadedCheerio: CheerioAPI, searchTerm?: string) {
    let novels: Plugin.NovelItem[] = [];

    loadedCheerio('#main')
      .find('li')
      .each((i, el) => {
        const novelName = loadedCheerio(el).find('a').text();
        const novelCover = defaultCover;
        const novelUrl = loadedCheerio(el).find('a').attr('href');

        if (!novelUrl) return;

        const novel = {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site, ''),
        };

        novels.push(novel);
      });

    if (searchTerm) {
      novels = novels.filter(novel =>
        novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }
    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + 'novels';

    const body = await fetchApi(link).then(res => res.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.entry-title').text().trim() || 'Untitled',
      cover:
        loadedCheerio('.entry-content').find('img').attr('data-ezsrc') ||
        defaultCover,
      chapters: [],
    };

    novel.summary = loadedCheerio('#main > article > div > p:nth-child(6)')
      .text()
      .trim();

    novel.author = loadedCheerio('#main > article > div > h3:nth-child(2)')
      .text()
      .replace(/Author:/g, '')
      .trim();

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('#main')
      .find('li > span > a')
      .each((i, el) => {
        const chapterName = loadedCheerio(el).text().trim();
        const chapterUrl = loadedCheerio(el).attr('href');

        if (!chapterUrl) return;

        chapter.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
        });
      });

    novel.chapters = chapter;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterName = loadedCheerio('.entry-title').text().trim();

    let chapterText = loadedCheerio('.entry-content').html();

    if (!chapterText) {
      chapterText = loadedCheerio('.page-header').html();
    }

    chapterText = `<p><h1>${chapterName}</h1></p>` + chapterText;

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + 'novels';

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio, searchTerm);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }
}

export default new DDLPlugin();
