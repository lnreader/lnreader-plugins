import { Plugin } from '@typings/plugin';
import { fetchApi, fetchFile } from '@libs/fetch';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import qs from 'qs';
import { Filters, FilterTypes } from '@libs/filterInputs';

class LibReadPlugin implements Plugin.PluginBase {
  id = 'libread';
  name = 'Lib Read';
  icon = 'src/en/libread/icon.png';
  site = 'https://libread.org';
  version = '1.0.0';

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
    if (showLatestNovels) url += '/sort/latest-novels/';
    else {
      if (
        filters &&
        filters.type_genre &&
        filters.type_genre.value !== 'all' &&
        filters.type_genre.value !== 'genre'
      )
        url += filters.type_genre.value;
      else {
        url += '/most-popular/';
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
    type_genre: {
      type: FilterTypes.Picker,
      label: 'Novel Type/Genre',
      value: 'all',
      options: [
        { label: 'Tous', value: 'all' },
        { label: '═══NOVEL TYPES═══', value: '/sort/latest-release/' },
        {
          label: 'Chinese Novel',
          value: '/sort/latest-release/chinese-novel/',
        },
        { label: 'Korean Novel', value: '/sort/latest-release/korean-novel/' },
        {
          label: 'Japanese Novel',
          value: '/sort/latest-release/japanese-novel/',
        },
        {
          label: 'English Novel',
          value: '/sort/latest-release/english-novel/',
        },
        { label: '═══GENRES═══', value: 'genre' },
        { label: 'Action', value: '/genre/Action/' },
        { label: 'Adult', value: '/genre/Adult/' },
        { label: 'Adventure', value: '/genre/Adventure/' },
        { label: 'Comedy', value: '/genre/Comedy/' },
        { label: 'Drama', value: '/genre/Drama/' },
        { label: 'Eastern', value: '/genre/Eastern/' },
        { label: 'Ecchi', value: '/genre/Ecchi/' },
        { label: 'Fantasy', value: '/genre/Fantasy/' },
        { label: 'Game', value: '/genre/Game/' },
        { label: 'Gender Bender', value: '/genre/Gender+Bender/' },
        { label: 'Harem', value: '/genre/Harem/' },
        { label: 'Historical', value: '/genre/Historical/' },
        { label: 'Horror', value: '/genre/Horror/' },
        { label: 'Josei', value: '/genre/Josei/' },
        { label: 'Martial Arts', value: '/genre/Martial+Arts/' },
        { label: 'Mature', value: '/genre/Mature/' },
        { label: 'Mecha', value: '/genre/Mecha/' },
        { label: 'Mystery', value: '/genre/Mystery/' },
        { label: 'Psychological', value: '/genre/Psychological/' },
        { label: 'Reincarnation', value: '/genre/Reincarnation/' },
        { label: 'Romance', value: '/genre/Romance/' },
        { label: 'School Life', value: '/genre/School+Life/' },
        { label: 'Sci-fi', value: '/genre/Sci-fi/' },
        { label: 'Seinen', value: '/genre/Seinen/' },
        { label: 'Shoujo', value: '/genre/Shoujo/' },
        { label: 'Shounen Ai', value: '/genre/Shounen+Ai/' },
        { label: 'Shounen', value: '/genre/Shounen/' },
        { label: 'Slice of Life', value: '/genre/Slice+of+Life/' },
        { label: 'Smut', value: '/genre/Smut/' },
        { label: 'Sports', value: '/genre/Sports/' },
        { label: 'Supernatural', value: '/genre/Supernatural/' },
        { label: 'Tragedy', value: '/genre/Tragedy/' },
        { label: 'Wuxia', value: '/genre/Wuxia/' },
        { label: 'Xianxia', value: '/genre/Xianxia/' },
        { label: 'Xuanhuan', value: '/genre/Xuanhuan/' },
        { label: 'Yaoi', value: '/genre/Yaoi/' },
      ],
    },
  } satisfies Filters;
}

export default new LibReadPlugin();
