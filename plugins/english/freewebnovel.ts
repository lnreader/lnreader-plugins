import { Plugin } from '@typings/plugin';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import qs from 'qs';

class FreeWebNovel implements Plugin.PluginBase {
  id = 'FWN.com';
  name = 'Free Web Novel';
  site = 'https://freewebnovel.com';
  version = '1.0.0';
  icon = 'src/en/freewebnovel/icon.png';

  async popularNovels(
    page: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels
      ? '/latest-release-novels/'
      : '/completed-novels/';

    const body = await fetchApi(this.site + sort + page).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = loadedCheerio('.li-row')
      .map((index, element) => ({
        name: loadedCheerio(element).find('.tit').text() || '',
        cover: loadedCheerio(element).find('img').attr('src'),
        path: loadedCheerio(element).find('h3 > a').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.tit').text(),
      cover: loadedCheerio('.pic > img').attr('src'),
      summary: loadedCheerio('.inner').text().trim(),
    };

    novel.genres = loadedCheerio('[title=Genre]')
      .next()
      .text()
      .replace(/[\t\n]/g, '');

    novel.author = loadedCheerio('[title=Author]')
      .next()
      .text()
      .replace(/[\t\n]/g, '');

    novel.status = loadedCheerio('[title=Status]')
      .next()
      .text()
      .replace(/[\t\n]/g, '');

    const chapters: Plugin.ChapterItem[] = loadedCheerio('#idData > li > a')
      .map((chapterIndex, element) => ({
        name:
          loadedCheerio(element).attr('title') ||
          'Chapter ' + (chapterIndex + 1),
        path:
          loadedCheerio(element).attr('href') ||
          novelPath.replace(
            '.html',
            '/chapter-' + (chapterIndex + 1) + '.html',
          ),
        releaseTime: null,
        chapterNumber: chapterIndex + 1,
      }))
      .get();

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('div.txt').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site + '/search/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.site,
        Origin: this.site,
      },
      method: 'POST',
      body: qs.stringify({ searchkey: searchTerm }),
    }).then(res => res.text());

    const loadedCheerio = parseHTML(body);
    const novels: Plugin.NovelItem[] = loadedCheerio('.li-row > .li > .con')
      .map((index, element) => ({
        name: loadedCheerio(element).find('.tit').text() || '',
        cover: loadedCheerio(element).find('.pic > a > img').attr('src'),
        path: loadedCheerio(element).find('h3 > a').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);

    return novels;
  }

  fetchImage = fetchFile;
}

export default new FreeWebNovel();
