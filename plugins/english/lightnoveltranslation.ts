import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { storage, localStorage, sessionStorage } from '@libs/storage';
// import { encode, decode } from 'urlencode';
// import dayjs from 'dayjs';
import { Parser } from 'htmlparser2';

class LNTPlugin implements Plugin.PluginBase {
  id = 'lightnoveltranslations';
  name = 'Light Novel Translations';
  icon = 'src/en/lightnoveltranslations/icon.png';
  site = 'https://lightnovelstranslations.com/';
  version = '1.0.0';
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
    let link = this.site + 'read/';
    link += `page/${pageNo}`;
    link += `?sortby=${showLatestNovels ? 'most-recent' : 'most-liked'}`;

    const body = await fetchApi(link);
    const html = await body.text();

    const loadedCheerio = loadCheerio(html);

    const baseUrl = this.site;
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div.read_list-story-item').each((i, el) => {
      const tempNovel = {} as Plugin.NovelItem;
      const img = loadedCheerio(el)
        .find('.item_thumb')
        .find('img')
        .first()
        .attr('src');
      let path = loadedCheerio(el)
        .find('.item_thumb')
        .find('a')
        .first()
        .attr('href');
      path = path ? path.slice(baseUrl.length) : '';
      const title = loadedCheerio(el)
        .find('.item_thumb')
        .find('a')
        .first()
        .attr('title');
      tempNovel.name = title ? title : '';
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

    const body2 = await fetchApi(url.replace('?tab=table_contents', ''));
    const html2 = await body2.text().then(r => r.replace(/>\s+</g, '><'));
    const loadedCheerio2 = loadCheerio(html2);

    novel.summary = loadedCheerio2('div.novel_text')
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
    // get novels using the search term

    if (pageNo !== 1) return [];
    const searchUrl = this.site + '/read';
    const formData = new FormData();
    formData.append('field-search', searchTerm);

    const results = await fetchApi(searchUrl, {
      method: 'POST',
      body: formData,
    });

    const body = await results.text();
    const loadedCheerio = loadCheerio(body);
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div.read_list-story-item').each((i, el) => {
      const tempNovel = {} as Plugin.NovelItem;
      const img = loadedCheerio(el)
        .find('.item_thumb')
        .find('img')
        .first()
        .attr('src');
      let path = loadedCheerio(el)
        .find('.item_thumb')
        .find('a')
        .first()
        .attr('href');
      path = path ? path.slice(this.site.length) : '';
      const title = loadedCheerio(el)
        .find('.item_thumb')
        .find('a')
        .first()
        .attr('title');
      tempNovel.name = title ? title : '';
      tempNovel.path = path;
      tempNovel.cover = img;
      novels.push(tempNovel);
    });

    type SearchEntry = {
      title: string;
      thumbnail: string;
      permalink: string;
    };
    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/book/' : '/chapter/') + path;
}

export default new LNTPlugin();
