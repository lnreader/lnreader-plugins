import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

class NovelHall implements Plugin.PluginBase {
  id = 'novelhall';
  name = 'Novel Hall';
  version = '1.0.3';
  icon = 'src/en/novelhall/icon.png';
  site = 'https://novelhall.com/';

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
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
    const chapterText = loadedCheerio('#htmlContent').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}index.php?s=so&module=book&keyword=${encodeURIComponent(searchTerm)}`;
    const body = await fetchApi(url).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('table tr').each((idx, ele) => {
      const novelName = loadedCheerio(ele)
        .find('td:nth-child(2)')
        .text()
        .replace(/\t+/g, '')
        .replace(/\n/g, ' ');
      const novelUrl = loadedCheerio(ele)
        .find('td:nth-child(2) a')
        .attr('href');
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
}

export default new NovelHall();
