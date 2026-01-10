import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class LinovelPlugin implements Plugin.PluginBase {
  id = 'linovel';
  name = 'linovel';
  icon = 'src/cn/linovel/icon.png';
  site = 'https://www.linovel.net';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  private userAgent =
    'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0';

  private async fetchHTML(url: string) {
    const body = await fetchText(url, {
      headers: { 'User-Agent': this.userAgent },
    });
    if (body === '') throw Error('无法获取内容，请检查网络');
    return parseHTML(body);
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    const loadedCheerio = await this.fetchHTML(this.site);

    loadedCheerio('a.book-item-inner').each((i, elem) => {
      const name = loadedCheerio(elem).find('.book-item-name').text().trim();
      const path = loadedCheerio(elem).attr('href') ?? '';
      const cover = (
        loadedCheerio(elem).find('img').attr('data-original') ?? ''
      ).replace(/!min300jpg$/, '');

      novels.push({ name, path, cover });
    });
    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const loadedCheerio = await this.fetchHTML(this.site + novelPath);

    loadedCheerio('div.name')
      .find('a')
      .each((_i, elem) => {
        novel.author = loadedCheerio(elem).text().trim();
      });

    loadedCheerio('.book-title').each((_i, elem) => {
      novel.name = loadedCheerio(elem).text().trim();
    });

    loadedCheerio('.book-data')
      .find('span')
      .each((_i, elem) => {
        const text = loadedCheerio(elem).text().trim();
        if (text.includes('字数')) {
          // Handle word count
        } else if (text.includes('热度')) {
          // Handle popularity
        } else if (text.includes('收藏')) {
          // Handle favorites
        } else if (text === '连载中') {
          novel.status = NovelStatus.Ongoing;
        } else if (text === '已完结') {
          novel.status = NovelStatus.Completed;
        }
      });

    loadedCheerio('.book-cover')
      .find('img')
      .each((_i, elem) => {
        novel.cover = loadedCheerio(elem).attr('src') ?? '';
      });

    novel.genres = loadedCheerio('.book-cats')
      .children('a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    novel.summary = loadedCheerio('.about-text').text().trim();

    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('div.chapter')
      .find('a')
      .each((i, elem) => {
        const name = loadedCheerio(elem).text().trim();
        const path = loadedCheerio(elem).attr('href') ?? '';
        chapters.push({ name, path });
      });

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const loadedCheerio = await this.fetchHTML(this.site + chapterPath);
    let chapterText = '';

    if (loadedCheerio('.fufei-app-download-hint').length) {
      throw Error('本章节需订阅后才能阅览，请下载轻之文库App订阅');
    }

    loadedCheerio('.article-text')
      .find('p, img')
      .each((i, elem) => {
        if (elem.tagName === 'img') {
          const imgSrc = loadedCheerio(elem).attr('src');
          chapterText += `<img src="${imgSrc}">\n`;
        } else {
          const text = loadedCheerio(elem).text().trim();
          if (text === '&nbsp;') {
            chapterText += '<br>\n';
          } else {
            chapterText += `<p>${text}</p>\n`;
          }
        }
      });

    return chapterText.trim();
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const loadedCheerio = await this.fetchHTML(
      this.site + '/search/?kw=' + searchTerm,
    );

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.rank-book-list')
      .find('a.search-book')
      .each((i, elem) => {
        const name = loadedCheerio(elem).find('.book-name').text().trim();
        const path = loadedCheerio(elem).attr('href') ?? '';
        const cover = (
          loadedCheerio(elem).find('img').attr('src') ?? ''
        ).replace(/!min300jpg$/, '');

        novels.push({ name, path, cover });
      });

    return novels;
  }
}

export default new LinovelPlugin();
