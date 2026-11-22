import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import dayjs from 'dayjs';

type WebNovelWorldOptions = {
  lang?: string;
  versionIncrements?: number;
  down?: boolean;
  downSince?: number;
};

export type WebNovelWorldMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: WebNovelWorldOptions;
  filters?: Filters;
};

export class WebNovelWorld implements Plugin.PagePlugin {
  id: string;
  name: string;
  site: string;
  version: string;
  icon: string;
  headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  imageRequestInit?: Plugin.ImageRequestInit | undefined = {
    headers: this.headers,
  };
  options?: WebNovelWorldOptions;
  filters?: Filters;

  constructor(metadata: WebNovelWorldMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/webnovelworld/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const versionIncrements = metadata.options?.versionIncrements || 0;
    this.version = `1.0.${2 + versionIncrements}`;
    this.options = metadata.options;
    this.filters = metadata.filters;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}browse/`;
    link += `${filters?.genres?.value || 'all'}/`;
    link += `${filters?.order?.value || 'popular'}/`;
    link += `${filters?.status?.value || 'all'}/`;
    link += page;

    const body = await fetchApi(link).then((r: Response) => r.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.novel-item.ads').remove();

    loadedCheerio('.novel-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.novel-title').text().trim();
      const novelCover = loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele)
        .find('.novel-title > a')
        .attr('href')
        ?.substring(1);

      if (!novelUrl) return;
      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl,
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath).then((r: Response) =>
      r.text(),
    );

    const loadedCheerio = parseHTML(body);
    const totalChapters = parseInt(
      loadedCheerio('.header-stats span:first strong').text(),
      10,
    );

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('h1.novel-title').text().trim() || 'Untitled',
      cover: loadedCheerio('figure.cover > img').attr('data-src'),
      author: loadedCheerio('.author > a > span').text(),
      summary: loadedCheerio('.summary > .content').text().trim(),
      status: loadedCheerio('.header-stats span:last strong').text(),
      totalPages: Math.ceil(totalChapters / 100),
      chapters: [],
    };

    novel.genres = loadedCheerio('.categories ul li')
      .map((a, ex) => loadedCheerio(ex).text().trim())
      .toArray()
      .join(',');

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath + '/chapters/page-' + page;
    const body = await fetchApi(url).then((res: Response) => res.text());
    const loadedCheerio = parseHTML(body);
    const chapter: Plugin.ChapterItem[] = [];
    loadedCheerio('.chapter-list li').each(function () {
      const chapterName =
        'Chapter ' +
        loadedCheerio(this).find('.chapter-no').text().trim() +
        ' - ' +
        loadedCheerio(this).find('.chapter-title').text().trim();

      const releaseDate = loadedCheerio(this)
        .find('.chapter-update')
        .attr('datetime');

      const chapterUrl = loadedCheerio(this)
        .find('a')
        .attr('href')
        ?.substring(1);
      if (!chapterUrl) return;

      chapter.push({
        name: chapterName,
        path: chapterUrl,
        releaseTime: dayjs(releaseDate).toISOString(),
      });
    });
    const chapters = chapter;
    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then((r: Response) =>
      r.text(),
    );

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#chapter-container').html() || '';

    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}lnsearchlive`;
    const link = `${this.site}search`;
    const response = await fetchApi(link).then((r: Response) => r.text());
    const token = parseHTML(response);
    const verifytoken = token('#novelSearchForm > input').attr('value');

    const formData = new FormData();
    formData.append('inputContent', searchTerm);

    const results = await fetchApi(url, {
      method: 'POST',
      headers: { LNRequestVerifyToken: verifytoken! },
      body: formData,
    }).then((r: Response) => r.json());

    const novels: Plugin.NovelItem[] = [];

    const loadedCheerio = parseHTML(results.resultview);

    loadedCheerio('.novel-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h4.novel-title').text().trim();
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      const novelUrl = loadedCheerio(ele).find('a').attr('href')?.substring(1);
      if (!novelUrl) return;
      novels.push({
        name: novelName,
        path: novelUrl,
        cover: novelCover,
      });
    });

    return novels;
  }
}
