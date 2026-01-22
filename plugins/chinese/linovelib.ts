import { load as parseHTML } from 'cheerio';
import { fetchText } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { storage } from '@libs/storage';

class Linovelib implements Plugin.PluginBase {
  id = 'linovelib';
  name = 'Linovelib';
  icon = 'src/cn/linovelib/icon.png';
  site = 'https://www.bilinovel.com';
  version = '1.2.0';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
      'Referer': 'https://www.linovelib.com',
      'Accept':
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  };
  webStorageUtilized = true;
  // The URL of the custom LDS (Linovelib Descramble Server) URL. Due to complex de-scrambling logic, an external LDS is required.
  pluginSettings = {
    host: {
      value: 'http://example.com',
      label: 'Custom LDS Host',
      type: 'Text',
    },
  };
  serverUrl = storage.get('host') || 'http://localhost:5301';

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const rank = showLatestNovels ? 'lastupdate' : filters.rank.value;
    const url = `${this.site}/top/${rank}/${pageNo}.html`;

    const body = await fetchText(url);
    if (body === '') throw Error('无法获取小说列表，请检查网络');

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.module-rank-booklist .book-layout').each((i, el) => {
      const url = loadedCheerio(el).attr('href');

      const novelName = loadedCheerio(el).find('.book-title').text();
      const novelCover = loadedCheerio(el)
        .find('div.book-cover > img')
        .attr('data-src')
        ?.replace('/https', 'https');
      if (!url) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: url,
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // move major logic to LDS
    const res = await fetchText(
      `${this.serverUrl}/api/novel?path=${novelPath}`,
    );
    const novel = JSON.parse(res) as Plugin.SourceNovel;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // move major logic to LDS
    const lastFetchChapterTime =
      storage.get('lastFetchChapterTime_' + chapterPath) || 0;
    if (Date.now() - lastFetchChapterTime < 10000) {
      return storage.get('chapterContent_' + chapterPath) || '';
    }
    const res = await fetchText(
      `${this.serverUrl}/api/chapter?path=${chapterPath}`,
    );
    const resObj = JSON.parse(res);
    storage.set('lastFetchChapterTime_' + chapterPath, Date.now());
    storage.set('chapterContent_' + chapterPath, resObj.content);
    return resObj.content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // move major logic to LDS
    const lastSearchTime = storage.get('lastSearchTime_' + this.id) || 0;
    if (Date.now() - lastSearchTime < 5000) {
      return [];
    }
    const res = await fetchText(
      `${this.serverUrl}/api/search?keyword=${encodeURIComponent(searchTerm)}`,
    );
    const novelsData = JSON.parse(res).results as Plugin.NovelItem[];
    storage.set('lastSearchTime_' + this.id, Date.now());
    return novelsData;
  }

  filters = {
    rank: {
      label: '排行榜',
      value: 'monthvisit',
      options: [
        { label: '月点击榜', value: 'monthvisit' },
        { label: '周点击榜', value: 'weekvisit' },
        { label: '月推荐榜', value: 'monthvote' },
        { label: '周推荐榜', value: 'weekvote' },
        { label: '月鲜花榜', value: 'monthflower' },
        { label: '周鲜花榜', value: 'weekflower' },
        { label: '月鸡蛋榜', value: 'monthegg' },
        { label: '周鸡蛋榜', value: 'weekegg' },
        { label: '最近更新', value: 'lastupdate' },
        { label: '最新入库', value: 'postdate' },
        { label: '收藏榜', value: 'goodnum' },
        { label: '新书榜', value: 'newhot' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new Linovelib();
