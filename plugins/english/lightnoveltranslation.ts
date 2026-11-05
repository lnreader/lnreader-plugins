import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
// import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { storage, localStorage, sessionStorage } from '@libs/storage';
// import { encode, decode } from 'urlencode';
// import dayjs from 'dayjs';
// import { Parser } from 'htmlparser2';

class LNTPlugin implements Plugin.PluginBase {
  id = 'lightnoveltranslations';
  name = 'Light Novel Translations';
  icon = 'src/en/lightnoveltranslations/icon.png';
  site = 'https://lightnovelstranslations.com/';
  version = '1.0.2';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  // The site serves only 6 novels per page, so one app page fetches
  // several consecutive site pages and combines them. Otherwise opening
  // the source shows a nearly empty grid next to sources that serve 20+
  // novels per page.
  pagesPerAppPage = 5;

  // Site pages covered by one app page: app page 1 -> site pages 1-5,
  // app page 2 -> site pages 6-10, and so on.
  appPageSitePages(appPage: number): number[] {
    const first = (appPage - 1) * this.pagesPerAppPage + 1;
    const pages: number[] = [];
    for (let i = 0; i < this.pagesPerAppPage; i++) {
      pages.push(first + i);
    }
    return pages;
  }

  async fetchNovelCards(urls: string[]): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    for (const url of urls) {
      const body = await fetchApi(url);
      const html = await body.text();
      const cards = this.parseNovelCards(html);
      novels.push(...cards);
    }
    return novels;
  }

  browsePageUrl(pageNo: number, sortby: string): string {
    return pageNo > 1
      ? `${this.site}browse/page/${pageNo}/?sortby=${sortby}`
      : `${this.site}browse/?sortby=${sortby}`;
  }

  searchPageUrl(pageNo: number, searchTerm: string): string {
    const query = `field-search=${encodeURIComponent(searchTerm)}`;
    return pageNo > 1
      ? `${this.site}browse/page/${pageNo}/?${query}`
      : `${this.site}browse/?${query}`;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      // filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sortby = showLatestNovels ? 'most-recent' : 'most-liked';
    const urls = this.appPageSitePages(pageNo).map(page =>
      this.browsePageUrl(page, sortby),
    );
    return this.fetchNovelCards(urls);
  }

  parseNovelCards(html: string): Plugin.NovelItem[] {
    const loadedCheerio = loadCheerio(html);

    const baseUrl = this.site;
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('.read_list-story-item').each((i, el) => {
      const card = loadedCheerio(el);
      const thumbLink = card.find('.item_thumb').find('a').first();
      const img = card.find('.item_thumb').find('img').first().attr('src');
      let path = thumbLink.attr('href');
      path = path ? path.slice(baseUrl.length) : '';
      const title =
        thumbLink.attr('aria-label') ||
        card.find('.wrap_item_content').find('h3').first().text().trim() ||
        thumbLink.attr('title') ||
        '';
      const tempNovel = {} as Plugin.NovelItem;
      tempNovel.name = title;
      tempNovel.path = path;
      tempNovel.cover = img;
      novels.push(tempNovel);
    });

    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const body = await fetchApi(url);
    const html = await body.text().then(r => r.replace(/>\s+</g, '><'));

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: '',
      totalPages: 1,
      summary: '',
      author: '',
      status: '',
      chapters: [],
    };

    const loadedCheerio = loadCheerio(html);
    novel.cover = loadedCheerio('div.novel-image').find('img').attr('src');
    novel.status = loadedCheerio('div.novel_status').text().trim();
    switch (novel.status) {
      case 'Ongoing':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'Hiatus':
        novel.status = NovelStatus.OnHiatus;
        break;
      case 'Completed':
        novel.status = NovelStatus.Completed;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }
    novel.name = loadedCheerio('div.novel_title')
      .find('h3')
      .first()
      .text()
      .trim();
    novel.author = loadedCheerio('div.novel_detail_info')
      .find('li')
      .filter(function () {
        return loadedCheerio(this).text().includes('Author');
      })
      .first()
      .text()
      .trim();
    novel.summary = loadedCheerio('div.novel_text')
      .find('p')
      .first()
      .text()
      .trim();

    const baseUrl = this.site;
    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('li.chapter-item.unlock').each((i, el) => {
      const chapterName = loadedCheerio(el).find('a').text().trim();
      const chapterPath = loadedCheerio(el).find('a').attr('href');
      if (chapterPath) {
        const chapter: Plugin.ChapterItem = {
          name: chapterName,
          path: chapterPath.slice(baseUrl.length),
        };
        chapters.push(chapter);
      }
    });
    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    // parse chapter text here
    const body = await fetchApi(this.site + chapterPath);
    const html = await body.text().then(r => r.replace(/>\s+</g, '><'));

    const loadedCheerio = loadCheerio(html);

    const chapterText = loadedCheerio('div.text_story');
    chapterText.find('div.ads_content').remove();

    return chapterText.html() || '';
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's search box submits `field-search`, not `search`. Sending
    // `search` is silently ignored and returns the default browse list for
    // every term, so results looked identical no matter what was searched.
    const urls = this.appPageSitePages(pageNo).map(page =>
      this.searchPageUrl(page, searchTerm),
    );
    return this.fetchNovelCards(urls);
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new LNTPlugin();
