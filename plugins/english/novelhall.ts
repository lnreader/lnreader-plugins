import { load, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

class NovelHall implements Plugin.PluginBase {
  id = 'novelhall';
  name = 'Novel Hall';
  version = '1.0.0';
  icon = 'src/en/novelhall/icon.png';
  filters?: Filters | undefined; //TODO: Filters Requires hideOnSelect
  site = 'https://novelhall.com/';

  async popularNovels(
    page: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}all2022-${page}.html`;

    const body = await fetchApi(url).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('li.btm').each((idx, ele) => {
      const novelName = loadedCheerio(ele).text().trim();
      const novelUrl = loadedCheerio(ele).find('a').attr('href');
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: defaultCover,
        path: novelUrl,
      };

      novels.push(novel);
    });

    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.book-info > h1').text() || 'Untitled',
      cover: loadedCheerio('meta[property="og:image"]').attr('content'),
      summary: loadedCheerio('.intro').text().trim(),
      chapters: [],
    };

    loadedCheerio('.total').find('p').remove();
    novel.author = loadedCheerio('.total span:contains("Author")')
      .text()
      .replace('Author：', '')
      .trim();

    novel.status = loadedCheerio('.total span:contains("Status")')
      .text()
      .replace('Status：', '')
      .replace('Active', 'Ongoing')
      .trim();

    novel.genres = loadedCheerio('.total a')
      .map((a, ex) => loadedCheerio(ex).text())
      .toArray()
      .join(',');

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('#morelist ul > li').each((idx, ele) => {
      const chapterName = loadedCheerio(ele).find('a').text().trim();
      const chapterUrl = loadedCheerio(ele).find('a').attr('href');
      if (!chapterUrl) return;

      chapter.push({
        name: chapterName,
        path: chapterUrl,
      });
    });

    novel.chapters = chapter;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    const chapterText = loadedCheerio('.content').html() || '';
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}index.php?s=so&module=book&keyword=${searchTerm}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('#article_list_content > li').each((idx, ele) => {
      const novelName = loadedCheerio(ele)
        .find('h3')
        .text()
        .replace(/\t+/g, '')
        .replace(/\n/g, ' ');
      const novelCover = loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele).find('a').attr('href')?.slice(1);
      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl,
      };

      novels.push(novel);
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new NovelHall();
