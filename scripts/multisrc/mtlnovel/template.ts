import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { Filters } from '@libs/filterInputs';

interface MTLNovelOptions {
  lang?: string;
}

export interface MTLNovelMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: MTLNovelOptions;
  filters?: any;
}

class MTLNovelPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options?: MTLNovelOptions;
  filters?: Filters;

  constructor(metadata: MTLNovelMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = 'multisrc/mtlnovel/mtlnovel/icon.png';
    this.site = metadata.sourceSite;
    this.version = '1.1.0';
    this.options = metadata.options ?? ({} as MTLNovelOptions);
    this.filters = metadata.filters satisfies Filters;
  }

  async safeFecth(
    url: string,
    headers: Headers = new Headers(),
  ): Promise<Response> {
    headers.append('Alt-Used', 'www.mtlnovel.com');
    const r = await fetchApi(url, { headers });
    if (!r.ok)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    return r;
  }

  async popularNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}novel-list/?`;
    if (filters) {
      link += `orderby=${filters.order.value}`;
      link += `&order=${filters.sort.value}`;
      link += `&status=${filters.storyStatus.value}`;
    }
    if (showLatestNovels) link += '&m_orderby=date';
    link += `&pg=${page}`;

    const body = await this.safeFecth(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.box.wide').each((i, el) => {
      const novelName = loadedCheerio(el).find('a.list-title').text().trim();
      let novelCover = loadedCheerio(el).find('amp-img').attr('src');
      if (
        !novelCover ||
        novelCover == 'https://www.mtlnovel.net/no-image.jpg.webp'
      ) {
        novelCover = defaultCover;
      }
      const novelUrl = loadedCheerio(el).find('a.list-title').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const headers = new Headers();
    headers.append('Referer', `${this.site}novel-list/`);

    const body = await this.safeFecth(this.site + novelPath, headers).then(r =>
      r.text(),
    );

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.entry-title').text() || 'Untitled',
      cover: loadedCheerio('.nov-head > amp-img').attr('src'),
      summary: loadedCheerio('div.desc > h2').next().text().trim(),
      author: loadedCheerio('#author').text(),
      status: loadedCheerio('#status').text(),
      genres: loadedCheerio('#genre').text().replace(/\s+/g, ''),
      chapters: [],
    };

    const chapterListUrl = this.site + novelPath + 'chapter-list/';

    const getChapters = async () => {
      const listBody = await this.safeFecth(chapterListUrl, headers).then(r =>
        r.text(),
      );

      loadedCheerio = parseHTML(listBody);

      const chapter: Plugin.ChapterItem[] = [];

      loadedCheerio('div.ch-list')
        .find('a.ch-link')
        .each((i, el) => {
          const chapterName = loadedCheerio(el).text().replace('~ ', '');
          const releaseDate = null;
          const chapterUrl = loadedCheerio(el).attr('href');
          if (!chapterUrl) return;
          chapter.push({
            path: chapterUrl.replace(this.site, ''),
            name: chapterName,
            releaseTime: releaseDate,
          });
        });
      return chapter.reverse();
    };

    novel.chapters = await getChapters();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await this.safeFecth(this.site + chapterPath).then(r =>
      r.text(),
    );

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('div.par').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const searchUrl =
      this.site + 'wp-admin/admin-ajax.php?action=autosuggest&q=' + searchTerm;

    const res = await this.safeFecth(searchUrl);
    const result = await res.json();

    const novels: Plugin.NovelItem[] = [];
    interface SearchEntry {
      title: string;
      thumbnail: string;
      permalink: string;
    }
    result.items[0].results.map((item: SearchEntry) => {
      const novelName = item.title.replace(/<\/?strong>/g, '');
      const novelCover = item.thumbnail;
      const novelUrl = item.permalink.replace(this.site, '');

      const novel = { name: novelName, cover: novelCover, path: novelUrl };

      novels.push(novel);
    });

    return novels;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      'Alt-Used': 'www.mtlnovel.com',
    },
  };
}
