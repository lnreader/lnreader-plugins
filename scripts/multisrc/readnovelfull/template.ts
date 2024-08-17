import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';

interface ReadNovelFullOptions {
  lang?: string;
  versionIncrements?: number;
}

export interface ReadNovelFullMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: ReadNovelFullOptions;
  filters?: any;
}

class ReadNovelFullPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options?: ReadNovelFullOptions;

  constructor(metadata: ReadNovelFullMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/readnovelfull/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const versionIncrements = metadata.options?.versionIncrements || 0;
    this.version = `1.0.${0 + versionIncrements}`;
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

    $('.list-novel > .row').each((i, elem) => {
      const novelName = $(elem).find('h3').text();
      const coverUrl = $(elem).find('img').attr('src');
      const novelUrl = this.site + $(elem).find('a').attr('href');

      if (novelUrl) {
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
    let url = this.site + '/novel-list/most-popular-novel?page=' + pageNo;

    if (!filters) filters = {};

    if (showLatestNovels) {
      url += this.site + '/novel-list/latest-release-novel?page=' + pageNo;
    }

    const $ = await this.getCheerio(url, false);

    return this.parseNovels($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let $ = await this.getCheerio(this.site + novelPath, false);

    const novel: Plugin.SourceNovel = {
      path: novelPath.replace(this.site, ''),
      name: 'Untitled',
    };

    novel.name = $('h3').text().trim();
    novel.cover = $('.book > img').attr('src');

    $('ul.info.info-meta > li').each(function () {
      const detailName = $(this)
        .find('h3')
        .text()
        .toLowerCase()
        .replace(':', '');

      const detail = $(this).text().split(':')[1].trim();

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

    const novelId = $('#rating').attr('data-novel-id');
    const chaptersUrl = this.site + '/ajax/chapter-archive?novelId=' + novelId;

    $ = await this.getCheerio(chaptersUrl, false);

    const chapters: Plugin.ChapterItem[] = [];

    $('.panel-body')
      .find('li')
      .each(function () {
        const chapterName = $(this).find('a').attr('title') || '';
        const chapterUrl = $(this).find('a').attr('href') || '';
        const chapterNumber = Number(chapterName.match(/Chapter (\d*)/g)?.[1]);

        chapters.push({
          name: chapterName,
          path: chapterUrl,
          chapterNumber,
        });
      });

    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath, false);

    return $('#chr-content').html();
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + '/novel-list/search?keyword=' + searchTerm + '&page=' + page;
    const $ = await this.getCheerio(url, true);

    return this.parseNovels($);
  }
}
