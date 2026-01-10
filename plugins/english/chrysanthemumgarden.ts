import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

class Chrysanthemumgarden implements Plugin.PluginBase {
  id = 'chrysanthemumgarden';
  name = 'Chrysanthemum Garden';
  icon = 'src/en/chrysanthemumgarden/icon.png';
  site = 'https://chrysanthemumgarden.com';
  version = '1.0.1';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const req = await fetchApi(
      this.site + (pageNo === 1 ? '/books' : '/books/page/' + pageNo) + '/',
    );
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);
    return loadedCheerio('article')
      .map((i, el) => {
        if (
          loadedCheerio(el)
            .find('div.series-genres > a')
            .text()
            .includes('Manhua')
        )
          return;
        const href = loadedCheerio(el).find('h2.novel-title > a').attr('href');
        if (!href) return;
        return {
          name: loadedCheerio(el).find('h2.novel-title > a').text(),
          path: href
            .replace(this.site, '')
            .replace(/^\//, '')
            .replace(/\/$/, ''),
          cover:
            loadedCheerio(el)
              .find('div.novel-cover > img')
              .attr('data-breeze') || defaultCover,
        };
      })
      .toArray()
      .filter(Boolean);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(this.site + '/' + novelPath + '/');
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);
    loadedCheerio('h1.novel-title > span.novel-raw-title').remove();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.novel-title').text(),
      cover: loadedCheerio('div.novel-cover > img').attr('data-breeze'),
      summary: loadedCheerio('div.entry-content > p')
        .map((i, el) => loadedCheerio(el).text())
        .toArray()
        .join('\n\n'),
    };

    const novelInfoHtml = loadedCheerio('div.novel-info').html();
    novel.author = novelInfoHtml
      ? novelInfoHtml.match(/Author:\s*([^<]*)<br>/)?.[1]?.trim()
      : undefined;
    novel.genres = [
      ...loadedCheerio('div.series-genres > a')
        .map((i, el) => loadedCheerio(el).text())
        .toArray(),
      ...loadedCheerio('a.series-tag')
        .map((i, el) => loadedCheerio(el).text().split('(')[0].trim())
        .toArray(),
    ].join(', ');

    novel.chapters = loadedCheerio('div.chapter-item > a')
      .map((i, el) => {
        const href = loadedCheerio(el).attr('href');
        if (!href) return;
        return {
          name: loadedCheerio(el).text().trim(),
          path: href
            .replace(this.site, '')
            .replace(/^\//, '')
            .replace(/\/$/, ''),
        };
      })
      .toArray();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const req = await fetchApi(this.site + '/' + chapterPath + '/');
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return loadedCheerio('div#novel-content').html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const req = await fetchApi(this.site + '/wp-json/cg/novels');
    const body = await req.json();

    const allNovels: ChrysanthemumGardenNovelItem[] = (
      body as ChrysanthemumGardenNovel[]
    ).map(
      (novel: ChrysanthemumGardenNovel): ChrysanthemumGardenNovelItem => ({
        name: novel.name,
        path: novel.link
          .replace(this.site, '')
          .replace(/\/$/, '')
          .replace(/^\//, ''),
        cover: defaultCover,
      }),
    );

    if (!allNovels) return [];

    return allNovels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }

  async getAllNovels() {}

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/book/' : '/chapter/') + path;
}

export default new Chrysanthemumgarden();

type ChrysanthemumGardenNovel = {
  name: string;
  link: string;
};

type ChrysanthemumGardenNovelItem = {
  name: string;
  path: string;
  cover: string;
};
