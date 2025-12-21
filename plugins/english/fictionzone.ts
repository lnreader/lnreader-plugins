import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';

class FictionZonePlugin implements Plugin.PluginBase {
  id = 'fictionzone';
  name = 'Fiction Zone';
  icon = 'src/en/fictionzone/icon.png';
  site = 'https://fictionzone.net';
  version = '1.0.2';
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
    return await this.getPage(
      `/platform/browse?page=${pageNo}&page_size=20&sort_by=${showLatestNovels ? 'created_at' : 'bookmark_count'}&sort_order=desc&include_genres=true`,
    );
  }

  async getData(url: string) {
    return await fetchApi(this.site + '/api/__api_party/fictionzone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        'path': url,
        'headers': [
          ['content-type', 'application/json'],
          ['x-request-time', new Date().toISOString()],
        ],
        'method': 'GET',
      }),
    }).then(r => r.json());
  }

  async getPage(url: string) {
    const data = await this.getData(url);

    return data.data.novels.map((n: any) => ({
      name: n.title,
      cover: `https://cdn.fictionzone.net/insecure/rs:fill:165:250/${n.image}.webp`,
      path: `novel/${n.slug}`,
    }));
  }

  async getChapterPage(id: string, novelPath: string) {
    const data = await this.getData('/platform/chapter-lists?novel_id=' + id);

    return data.data.chapters.map((n: any) => ({
      name: n.title,
      number: n.chapter_number,
      date: new Date(n.published_date).toISOString(),
      path: `${novelPath}/${n.chapter_id}|/platform/chapter-content?novel_id=15752&chapter_id=1136402`,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(this.site + '/' + novelPath);
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.novel-title').text(),
    };

    // novel.artist = '';
    novel.cover = loadedCheerio('div.novel-img > img').attr('src');
    novel.genres = [
      ...loadedCheerio('a.tag--genre')
        .map((i, el) => loadedCheerio(el).text())
        .toArray(),
      ...loadedCheerio('a.tag--tag')
        .map((i, el) => loadedCheerio(el).text())
        .toArray(),
    ].join(',');
    loadedCheerio('.metadata-item > .metadata-content')
      .toArray()
      .forEach(el => {
        const label = loadedCheerio(el).find('.metadata-label').text().trim();
        const value = loadedCheerio(el).find('.metadata-value').text().trim();
        if (label == 'Author') {
          novel.author = value;
        } else if (label == 'Status') {
          novel.status = loadedCheerio(el).find('.status-tag').text().trim();
        }
      });
    novel.summary = loadedCheerio('.synopsis-text > div.text-content').text();

    const nuxtData = loadedCheerio('script#__NUXT_DATA__').html();
    const parsed = JSON.parse(nuxtData!);
    let id = '';
    for (const a of parsed) {
      if (typeof a === 'string' && parseInt(a).toString() == a) {
        id = a;
        break;
      }
    }
    // @ts-ignore
    novel.chapters = await this.getChapterPage(id, novelPath);

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const data = await this.getData(chapterPath.split('|')[1]);
    return '<p>' + data.data.content.replaceAll('\n', '</p><p>') + '</p>';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return await this.getPage(
      `/platform/browse?search=${encodeURIComponent(searchTerm)}&page=${pageNo}&page_size=20&search_in_synopsis=true&sort_by=bookmark_count&sort_order=desc&include_genres=true`,
    );
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/' + path.split('|')[0];
}

export default new FictionZonePlugin();
