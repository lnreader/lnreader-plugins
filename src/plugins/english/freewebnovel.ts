import { Plugin } from '@typings/plugin';
import { fetchApi, fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import qs from 'qs';
import { Filters, FilterTypes } from '@libs/filterInputs';

class FreeWebNovel implements Plugin.PluginBase {
  id = 'FWN.com';
  name = 'Free Web Novel';
  site = 'https://freewebnovel.com';
  version = '1.0.1';
  icon = 'src/en/freewebnovel/icon.png';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok)
      throw new Error(
        `Could not reach site (${r.status}: ${r.statusText}) try to open in webview.`,
      );
    return parseHTML(await r.text());
  }

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    return loadedCheerio('.li-row')
      .map((index, element) => ({
        name: loadedCheerio(element).find('.tit').text() || '',
        cover: loadedCheerio(element).find('img').attr('src'),
        path: loadedCheerio(element).find('h3 > a').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site;
    if (showLatestNovels) url += '/latest-release-novels/';
    else {
      if (filters && filters.genres && filters.genres.value !== 'all')
        url += filters.genres.value;
      else {
        url += '/most-popular-novels/';
        if (page != 1) return [];
        page = 0;
      }
    }
    url += page;

    const $ = await this.getCheerio(url);
    return this.parseNovels($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const loadedCheerio = await this.getCheerio(this.site + novelPath);

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

    novel.genres = loadedCheerio('[title=Genre]')
      .next()
      .text()
      .trim()
      .replace(/[\t\n]/g, ',')
      .replace(/, /g, ',');

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
    const loadedCheerio = await this.getCheerio(this.site + chapterPath);

    // remove freewebnovel signature
    if (loadedCheerio('style').text().includes('p:nth-last-child(1)'))
      loadedCheerio('div.txt').find('p:last-child').remove();

    const chapterText = loadedCheerio('div.txt').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const r = await fetchApi(this.site + '/search/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.site,
        Origin: this.site,
      },
      method: 'POST',
      body: qs.stringify({ searchkey: searchTerm }),
    });
    if (!r.ok)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );

    const loadedCheerio = parseHTML(await r.text());
    const alertText =
      loadedCheerio('script')
        .text()
        .match(/alert\((.*?)\)/)?.[1] || '';
    if (alertText) throw new Error(alertText);

    return this.parseNovels(loadedCheerio);
  }

  filters = {
    genres: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: 'all',
      options: [
        { label: 'Action', value: '/genres/Action/' },
        { label: 'Adult', value: '/genres/Adult/' },
        { label: 'Adventure', value: '/genres/Adventure/' },
        { label: 'Comedy', value: '/genres/Comedy/' },
        { label: 'Drama', value: '/genres/Drama/' },
        { label: 'Eastern', value: '/genres-novel/Eastern' },
        { label: 'Ecchi', value: '/genres/Ecchi/' },
        { label: 'Fantasy', value: '/genres/Fantasy/' },
        { label: 'Gender Bender', value: '/genres/Gender+Bender/' },
        { label: 'Harem', value: '/genres/Harem/' },
        { label: 'Historical', value: '/genres/Historical/' },
        { label: 'Horror', value: '/genres/Horror/' },
        { label: 'Josei', value: '/genres/Josei/' },
        { label: 'Game', value: '/genres/Game/' },
        { label: 'Martial Arts', value: '/genres/Martial+Arts/' },
        { label: 'Mature', value: '/genres/Mature/' },
        { label: 'Mecha', value: '/genres/Mecha/' },
        { label: 'Mystery', value: '/genres/Mystery/' },
        { label: 'Psychological', value: '/genres/Psychological/' },
        { label: 'Reincarnation', value: '/genres-novel/Reincarnation' },
        { label: 'Romance', value: '/genres/Romance/' },
        { label: 'School Life', value: '/genres/School+Life/' },
        { label: 'Sci-fi', value: '/genres/Sci-fi/' },
        { label: 'Seinen', value: '/genres/Seinen/' },
        { label: 'Shoujo', value: '/genres/Shoujo/' },
        { label: 'Shounen Ai', value: '/genres/Shounen+Ai/' },
        { label: 'Shounen', value: '/genres/Shounen/' },
        { label: 'Slice of Life', value: '/genres/Slice+of+Life/' },
        { label: 'Smut', value: '/genres/Smut/' },
        { label: 'Sports', value: '/genres/Sports/' },
        { label: 'Supernatural', value: '/genres/Supernatural/' },
        { label: 'Tragedy', value: '/genres/Tragedy/' },
        { label: 'Wuxia', value: '/genres/Wuxia/' },
        { label: 'Xianxia', value: '/genres/Xianxia/' },
        { label: 'Xuanhuan', value: '/genres/Xuanhuan/' },
        { label: 'Yaoi', value: '/genres/Yaoi/' },
      ],
    },
  } satisfies Filters;
}

export default new FreeWebNovel();
