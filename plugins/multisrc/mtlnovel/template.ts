import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { Filters } from '@libs/filterInputs';

type MTLNovelOptions = {
  lang?: string;
  down?: boolean;
  downSince?: string;
};

export type MTLNovelMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: MTLNovelOptions;
  filters?: any;
};

class MTLNovelPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  mainUrl: string;
  version: string;
  options?: MTLNovelOptions;
  filters?: Filters;

  constructor(metadata: MTLNovelMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = 'multisrc/mtlnovel/mtlnovel/icon.png';
    this.site = metadata.sourceSite;
    this.mainUrl = 'https://www.mtlnovels.com/';
    this.version = '1.1.3';
    this.options = metadata.options ?? ({} as MTLNovelOptions);
    this.filters = metadata.filters satisfies Filters;
  }

  async safeFecth(
    url: string,
    headers: Headers = new Headers(),
  ): Promise<Response> {
    headers.append('Alt-Used', 'www.mtlnovels.com');
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
      )
        novelCover = defaultCover;
      const novelUrl = loadedCheerio(el).find('a.list-title').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.mainUrl, '').replace(this.site, ''),
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
      name: loadedCheerio('h1.entry-title').text().trim() || 'Untitled',
      cover: loadedCheerio('.nov-head > amp-img').attr('src') || defaultCover,
      summary: loadedCheerio('div.desc > h2').next().text().trim(),
      chapters: [],
    };

    loadedCheerio('.info tr').each((i, el) => {
      const infoName = loadedCheerio(el).find('td').eq(0).text().trim();
      const infoValue = loadedCheerio(el).find('td').eq(2).text().trim();
      switch (infoName) {
        case 'Genre':
        case 'Tags':
        case 'Mots Clés':
        case 'Género':
        case 'Label':
        case 'Gênero':
        case 'Tag':
        case 'Теги':
          if (novel.genres) novel.genres += ', ' + infoValue;
          else novel.genres = infoValue;
          break;
        case 'Author':
        case 'Auteur':
        case 'Autor(a)':
        case 'Autor':
        case 'Автор':
          novel.author = infoValue;
          break;
        case 'Status':
        case 'Statut':
        case 'Estado':
        case 'Положение дел':
          if (infoValue == 'Hiatus') novel.status = NovelStatus.OnHiatus;
          else novel.status = infoValue;
          break;
      }
    });

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
            path: chapterUrl.replace(this.mainUrl, '').replace(this.site, ''),
            name: chapterName,
            releaseTime: releaseDate,
          });
        });
      return chapter.reverse();
    };

    novel.chapters = await getChapters();

    if (novel.genres) {
      const genresArray = novel.genres.split(', ');
      genresArray.pop();
      novel.genres = genresArray.join(', ');
    }

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
      this.site +
      'wp-admin/admin-ajax.php?action=autosuggest&q=' +
      encodeURIComponent(searchTerm);

    const res = await this.safeFecth(searchUrl);
    const result = await res.json();

    const novels: Plugin.NovelItem[] = [];
    type SearchEntry = {
      title: string;
      thumbnail: string;
      permalink: string;
    };
    result.items[0].results.map((item: SearchEntry) => {
      const novelName = item.title.replace(/<\/?strong>/g, '');
      const novelCover = item.thumbnail;
      const novelUrl = item.permalink
        .replace(this.mainUrl, '')
        .replace(this.site, '');

      const novel = { name: novelName, cover: novelCover, path: novelUrl };

      novels.push(novel);
    });

    return novels;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      'Alt-Used': 'www.mtlnovels.com',
    },
  };
}
