import { Plugin } from '@typings/plugin';
import { fetchApi, fetchFile } from '@libs/fetch';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

class StorySeedlingPlugin implements Plugin.PluginBase {
  id = 'storyseedling';
  name = 'StorySeedling';
  icon = 'src/en/storyseedling/icon.png';
  site = 'https://storyseedling.com/';
  version = '1.0.0';

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    let novels: Plugin.NovelItem[] = [];
    let url = 'https://storyseedling.com/ajax';

    const postUrl = `https://storyseedling.com/browse/`;
    const body = await fetchApi(postUrl).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    var postValue = loadedCheerio('div[ax-load][x-data]')
      .attr('x-data')
      ?.replace("browse('", '')
      .replace("')", '') as string;

    var data = new FormData();
    data.set('search', '');
    data.set('orderBy', 'recent');
    data.set('curpage', pageNo.toString());
    data.set('post', postValue);
    data.set('action', 'fetch_browse');

    var response = await (
      await fetchApi(url, { body: data, method: 'POST' })
    ).json();

    response.data.posts.forEach((element: any) => {
      const novel = {
        name: element.title,
        cover: element.thumbnail,
        path: element.permalink.replace(this.site, ''),
      };
      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    var site = this.site;
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    novel.name = loadedCheerio('h1').text().trim();

    //novel.artist = "";
    //novel.author = "";
    novel.cover = loadedCheerio(
      'img[x-ref="art"].w-full.rounded.shadow-md',
    ).attr('src');
    if (!novel.cover) {
      novel.cover = defaultCover;
    }
    let genres: string[] = [];
    loadedCheerio(
      'section[x-data="{ tab: location.hash.substr(1) || \'chapters\' }"].relative > div > div > div.flex.flex-wrap > a',
    ).each(function () {
      genres.push(loadedCheerio(this).text().trim());
    });
    novel.genres = genres.join(', ');
    // novel.status = NovelStatus.Completed;
    novel.summary = loadedCheerio('div.mb-4.order-2:not(.lg\\:grid-in-buttons)')
      .text()
      .trim()
      .replace(/(\r\n|\n|\r)/gm, '');

    let chapters: Plugin.ChapterItem[] = [];

    loadedCheerio(
      'div.grid.w-full.grid-cols-1.gap-4.md\\:grid-cols-2 > a',
    ).each(function () {
      if (loadedCheerio(this).find('> div').length == 2) {
        return;
      }
      let name = loadedCheerio(this).find('.truncate').text().trim();
      let url = loadedCheerio(this).attr('href') as string;
      let releaseTime = loadedCheerio(this)
        .find('div > div > small')
        .text()
        .trim();
      let chapterNumber = name.split('-')[0].trim().split(' ')[1];
      const chapter: Plugin.ChapterItem = {
        name: name,
        path: url.replace(site, ''),
        releaseTime: releaseTime,
        chapterNumber: parseInt(chapterNumber),
      };
      chapters.push(chapter);
    });
    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    let t = loadedCheerio('div.justify-center > div.mb-4');
    let chapterText = t.html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let novels: Plugin.NovelItem[] = [];
    let url = 'https://storyseedling.com/ajax';

    const postUrl = `https://storyseedling.com/browse/`;
    const body = await fetchApi(postUrl).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    var postValue = loadedCheerio('div[ax-load][x-data]')
      .attr('x-data')
      ?.replace("browse('", '')
      .replace("')", '') as string;

    var data = new FormData();
    data.set('search', searchTerm);
    data.set('orderBy', 'recent');
    data.set('curpage', pageNo.toString());
    data.set('post', postValue);
    data.set('action', 'fetch_browse');

    var response = await (
      await fetchApi(url, { body: data, method: 'POST' })
    ).json();

    response.data.posts.forEach((element: any) => {
      const novel = {
        name: element.title,
        cover: element.thumbnail,
        path: element.permalink.replace(this.site, ''),
      };
      novels.push(novel);
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new StorySeedlingPlugin();
