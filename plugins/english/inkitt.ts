import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class InkittPlugin implements Plugin.PluginBase {
  id = 'inkitt';
  name = 'Inkitt';
  icon = 'src/en/inkitt/icon.png';
  site = 'https://www.inkitt.com';
  version = '1.0.1';
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
    let req;
    if (filters?.genres?.value) {
      req = await fetchApi(
        this.site +
          `/genre/${filters.genres.value}/${pageNo}?period=alltime&sort=popular`,
      );
    } else {
      req = await fetchApi(
        this.site + `/trending_stories?page=${pageNo}&period=alltime`,
      );
    }
    let data;
    try {
      data = await req.json();
    } catch (e) {
      throw new Error('Failed to load novels, try opening in webview.');
    }

    return data.stories.map((novel: any) => {
      return {
        name: novel.title,
        path: this.getPath(novel),
        cover:
          novel.vertical_cover.url ||
          novel.vertical_cover.iphone ||
          novel.cover.url,
      };
    });
  }

  getPath(novel: any) {
    return (novel.category_one || novel.genres[0]) + '/' + novel.id;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(this.site + `/stories/${novelPath}`);
    const text = await req.text();
    const loadedCheerio = loadCheerio(text);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.story-title').text(),
    };

    novel.author = loadedCheerio('dl > dd > a.author-link').text();

    novel.genres = loadedCheerio('dd.genres > a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(', ');
    const status = loadedCheerio('div.dlc > dl:has(dt:contains("Status")) > dd')
      .text()
      .trim();
    if (status === 'Complete') novel.status = NovelStatus.Completed;
    if (status === 'Ongoing') novel.status = NovelStatus.Ongoing;

    const apiReq = await fetchApi(
      this.site + `/api/stories/${novelPath.split('/')[1]}`,
    );
    const apiData = await apiReq.json();
    novel.cover = apiData.vertical_cover.url;

    novel.summary = loadedCheerio('p.story-summary').text();

    novel.chapters = apiData.chapters.map((c: any) => {
      return {
        name: c.name,
        path: novelPath + '/chapters/' + c.chapter_number,
        chapterNumber: c.chapter_number,
      };
    });
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const req = await fetchApi(this.site + '/stories/' + chapterPath);
    const text = await req.text();
    const loadedCheerio = loadCheerio(text);

    return loadedCheerio('div#chapterText').html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const req = await fetchApi(
      this.site +
        `/api/2/search/title?q=${encodeURIComponent(searchTerm)}&page=${pageNo}`,
    );
    let data;
    try {
      data = await req.json();
    } catch (e) {
      throw new Error('Failed to search novels, try opening in webview.');
    }

    return data.stories.map((novel: any) => {
      return {
        name: novel.title,
        path: this.getPath(novel),
        cover:
          novel.vertical_cover.url ||
          novel.vertical_cover.iphone ||
          novel.cover.url,
      };
    });
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/stories/' + path;

  filters = {
    genres: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: '',
      options: [
        { 'label': 'Sci-Fi', 'value': 'scifi' },
        { 'label': 'Fantasy', 'value': 'fantasy' },
        { 'label': 'Adventure', 'value': 'adventure' },
        { 'label': 'Mystery', 'value': 'mystery' },
        { 'label': 'Action', 'value': 'action' },
        { 'label': 'Horror', 'value': 'horror' },
        { 'label': 'Humor', 'value': 'humor' },
        { 'label': 'Erotica', 'value': 'erotica' },
        { 'label': 'Poetry', 'value': 'poetry' },
        { 'label': 'Other', 'value': 'other' },
        { 'label': 'Thriller', 'value': 'thriller' },
        { 'label': 'Romance', 'value': 'romance' },
        { 'label': 'Children', 'value': 'children' },
        { 'label': 'Drama', 'value': 'drama' },
      ],
    },
  } satisfies Filters;
}

export default new InkittPlugin();
