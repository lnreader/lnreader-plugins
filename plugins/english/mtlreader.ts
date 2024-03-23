import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';

class MTLReader implements Plugin.PluginBase {
  id = 'mtlreader';
  name = 'MTL Reader';
  version = '1.0.0';
  icon = 'src/en/mtlreader/icon.png';
  site = 'https://mtlreader.com/';
  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.col-md-4').each((i, el) => {
      const novelName = loadedCheerio(el).find('h5').text();
      const novelCover = loadedCheerio(el).find('img').attr('src');
      const novelUrl = loadedCheerio(el).find('h5 > a').attr('href');

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

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}novels?page=${pageNo}`;

    const body = await fetchApi(url).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.agent-title').text().trim() || 'Untitled',
      cover: loadedCheerio('.agent-p-img > img').attr('src'),
      summary: loadedCheerio('#editdescription').text().trim(),
      chapters: [],
    };

    novel.author = loadedCheerio('i.fa-user')
      .parent()
      .text()
      .replace('Author: ', '')
      .trim();

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('tr.spaceUnder').each((i, el) => {
      const chapterName = loadedCheerio(el).find('a').text().trim();
      const chapterUrl = loadedCheerio(el).find('a').attr('href');

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
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    loadedCheerio('.container ins,script,p.mtlreader').remove();
    const chapterText = loadedCheerio('.container').html() || '';

    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site).then(r => r.text());
    const tokenCheerio = parseHTML(body);
    const token = tokenCheerio('input[name="_token"]').attr('value');

    const searchUrl = `${this.site}search?_token=${token}&input=${searchTerm}`;
    const seacrhBody = await fetchApi(searchUrl).then(r => r.text());
    const loadedCheerio = parseHTML(seacrhBody);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}
export default new MTLReader();
