import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

interface ChapterEntry {
  id: number;
  title: string;
  date: string;
  link: string;
}

class RanobesPlugin implements Plugin.PagePlugin {
  id = 'ranobes';
  name = 'Ranobes';
  icon = 'src/en/ranobes/icon.png';
  site = 'https://ranobes.top';
  filters?: Filters | undefined;
  version = '1.0.0';

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.short-cont').each((i, el) => {
      const novelName = loadedCheerio(el).find('h2.title').text();
      const novelUrl = loadedCheerio(el).find('h2.title a').attr('href');
      const novelCover = loadedCheerio(el)
        .find('figure')
        .attr('style')
        ?.replace(/.*url\((.*?)\)./g, '$1');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl?.replace(this.site, ''),
      };
      novels.push(novel);
    });
    return novels;
  }

  parseChapters(data: { chapters: ChapterEntry[] }) {
    const chapter: Plugin.ChapterItem[] = [];
    data.chapters.map((item: ChapterEntry) => {
      chapter.push({
        name: item.title,
        releaseTime: new Date(item.date).toISOString(),
        path: item.link.replace(this.site, ''),
      });
    });
    return chapter.reverse();
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}/novels/page/${page}/`;
    const body = await fetchApi(link).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('.poster img').attr('alt') || 'Untitled',
      cover: this.site + loadedCheerio('.poster img').attr('src'),
      author: loadedCheerio('[itemprop="creator"]').text(),
      chapters: [],
      totalPages: 1,
    };

    novel.summary = loadedCheerio('.moreless')
      .find('br')
      .replaceWith('\n')
      .end()
      .text()
      .trim();

    novel.status =
      loadedCheerio('li:contains("Status") span').text() === 'Ongoing'
        ? 'Ongoing'
        : 'Completed';

    novel.genres = loadedCheerio('div#mc-fs-genre').text().trim();

    let chapterListUrl = loadedCheerio('.read-continue:last').attr('href');

    if (!chapterListUrl?.startsWith('http')) {
      chapterListUrl = this.site + chapterListUrl;
    }

    const chaptersHtmlToString = await fetchApi(chapterListUrl).then(r =>
      r.text(),
    );
    const pageCheerio = parseHTML(chaptersHtmlToString);

    const json = pageCheerio('#dle-content main').next().html()!;
    const data = JSON.parse(json.replace('window.__DATA__ =', ''));
    novel.totalPages = Number(data.pages_count);
    novel.chapters = this.parseChapters(data);

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pagePath = novelPath.split('-')[0];
    const firstUrl = this.site + '/chapters' + pagePath.replace('novels/', '');
    const pageUrl = firstUrl + '/page/' + page;

    const body = await fetchApi(firstUrl).then(r => r.text());

    let loadedCheerio = parseHTML(body);
    let json = loadedCheerio('#dle-content main').next().html()!;
    let data = JSON.parse(json.replace('window.__DATA__ =', ''));

    const latestChapterUrl = data.chapters[0].link;
    const latestChapterName = data.chapters[0].title;
    const latestChapterDate = data.chapters[0].date;

    const latestChapter: Plugin.ChapterItem | undefined = latestChapterUrl
      ? {
          path: latestChapterUrl.replace(this.site, ''),
          name: latestChapterName,
          releaseTime: new Date(latestChapterDate).toISOString(),
        }
      : undefined;

    await this.sleep(1000);

    const pageBody = await fetchApi(pageUrl).then(r => r.text());
    loadedCheerio = parseHTML(pageBody);
    json = loadedCheerio('#dle-content main').next().html()!;
    data = JSON.parse(json.replace('window.__DATA__ =', ''));
    const chapters = this.parseChapters(data);
    return {
      chapters,
      latestChapter,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#arrticle').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}/search/${searchTerm}/page/${page}`;

    const body = await fetchApi(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }
}
export default new RanobesPlugin();
