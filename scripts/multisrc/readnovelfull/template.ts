import { CheerioAPI, load as parseHTML, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';

type ReadNovelFullOptions = {
  lang?: string;
  versionIncrements?: number;
  popularPage: string;
  latestPage: string;
  searchPage: string;
  ajaxChapterList?: boolean;
};

export type ReadNovelFullMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options: ReadNovelFullOptions;
  filters?: any;
};

class ReadNovelFullPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options: ReadNovelFullOptions;

  constructor(metadata: ReadNovelFullMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/readnovelfull/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const versionIncrements = metadata.options?.versionIncrements || 0;
    this.version = `1.0.${1 + versionIncrements}`;
    this.options = metadata.options;
  }

  async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok && search != true)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const $ = load(await r.text());

    return $;
  }

  parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $('.list-novel > .row, .list-truyen > .row').each((i, elem) => {
      const novelName = $(elem).find('h3').text();
      let coverUrl = $(elem).find('img').attr('src');
      const novelUrl = this.site + $(elem).find('a').attr('href');

      if (
        coverUrl &&
        !(coverUrl.includes('https://') || coverUrl.includes('http://'))
      ) {
        coverUrl = this.site + coverUrl;
      }

      if (novelUrl && novelName.trim()) {
        novels.push({
          name: novelName,
          cover: coverUrl,
          path: novelUrl.replace(this.site, ''),
        });
      }
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url =
      this.site +
      '/' +
      this.options.popularPage.replace('%%PAGE%%', pageNo.toString());

    if (!filters) filters = {};

    if (showLatestNovels) {
      url =
        this.site +
        '/' +
        this.options.latestPage.replace('%%PAGE%%', pageNo.toString());
    }

    const $ = await this.getCheerio(url, false);

    return this.parseNovels($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let $ = await this.getCheerio(this.site + novelPath, false);

    const novel: Plugin.SourceNovel & { totalPages?: number } = {
      path: novelPath.replace(this.site, ''),
      name: 'Untitled',
    };

    novel.name = $('h3.title').first().text().trim();
    novel.cover = $('.book > img').attr('src');
    if (
      novel.cover &&
      !(novel.cover.includes('https://') || novel.cover.includes('http://'))
    ) {
      novel.cover = this.site + novel.cover;
    }

    $('ul.info.info-meta > li, .info > div').each(function () {
      const detailName = $(this)
        .find('h3')
        .first()
        .text()
        .toLowerCase()
        .replace(':', '');

      const detail = $(this).text().split(':')[1].trim().toLowerCase();

      switch (detailName) {
        case 'author':
          novel.author = detail;
          break;
        case 'genre':
          novel.genres = detail;
          break;
        case 'status':
          switch (detail) {
            case 'completed':
              novel.status = NovelStatus.Completed;
              break;
            case 'ongoing':
              novel.status = NovelStatus.Ongoing;
              break;
            case 'hiatus':
              novel.status = NovelStatus.OnHiatus;
              break;
            default:
              novel.status = NovelStatus.Unknown;
              break;
          }
          break;
      }
    });

    novel.summary = $('.desc-text').text();
    const chapters: Plugin.ChapterItem[] = [];

    const novelId = $('#rating').attr('data-novel-id');
    if (this.options?.ajaxChapterList) {
      const chaptersUrl =
        this.site + '/ajax/chapter-archive?novelId=' + novelId;

      $ = await this.getCheerio(chaptersUrl, false);

      $('.panel-body')
        .find('li')
        .each(function () {
          const chapterName = $(this).find('a').attr('title') || '';
          const chapterUrl = $(this).find('a').attr('href') || '';

          chapters.push({
            name: chapterName,
            path: chapterUrl,
          });
        });
    } else {
      chapters.push(...this.parsePageChapters($));
      novel.totalPages = parseInt(
        ($('ul.pagination > li.last > a').attr('data-page') ??
          $('ul.pagination > li.last > a')
            .attr('href')
            ?.match(/\?page_num=(\d+)/)?.[1])!,
      );
    }

    novel.chapters = chapters;

    return novel;
  }

  parsePageChapters($: CheerioAPI) {
    const chapters: Plugin.ChapterItem[] = [];
    $('.list-chapter')
      .find('li')
      .each(function () {
        const chapterName = $(this).find('a').attr('title') || '';
        const chapterUrl = $(this).find('a').attr('href') || '';

        chapters.push({
          name: chapterName,
          path: chapterUrl,
        });
      });
    return chapters;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const $ = await this.getCheerio(
      this.site + novelPath + '?page=' + page,
      false,
    );
    const chapters = this.parsePageChapters($);
    return {
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath, false);

    return $('#chr-content, #chapter-content').html()!;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site +
      '/' +
      this.options?.searchPage
        .replace('%%SEARCH%%', encodeURIComponent(searchTerm))
        .replace('%%PAGE%%', page.toString());
    const $ = await this.getCheerio(url, true);

    return this.parseNovels($);
  }
}
