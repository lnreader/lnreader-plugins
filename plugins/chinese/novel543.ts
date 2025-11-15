import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const makeAbsolute = (
  relativeUrl: string | undefined,
  baseUrl: string,
): string | undefined => {
  if (!relativeUrl) return undefined;
  try {
    if (relativeUrl.startsWith('//')) {
      return new URL(baseUrl).protocol + relativeUrl;
    }
    if (
      relativeUrl.startsWith('http://') ||
      relativeUrl.startsWith('https://')
    ) {
      return relativeUrl;
    }
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return undefined;
  }
};

class Novel543Plugin implements Plugin.PluginBase {
  id = 'novel543';
  name = 'Novel543';
  site = 'https://www.novel543.com/';
  version = '1.0.0';
  icon = 'src/cn/novel543/icon.png';

  imageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const result = await fetchApi(this.site);
    if (!result.ok) return [];

    const $ = parseHTML(await result.text());
    const novels: Plugin.NovelItem[] = [];
    const processedPaths = new Set<string>();

    $('ul.list > li.media, ul.list li > a[href^="/"][href$="/"]').each(
      (_i, el) => {
        const $el = $(el);
        let novelPath: string | undefined;
        let novelName: string | undefined;
        let novelCover: string | undefined;

        if ($el.is('li.media')) {
          const $link = $el.find('.media-content h3 a');
          novelPath = $link.attr('href')?.trim();
          novelName = $link.text().trim();
          novelCover = $el.find('.media-left img').attr('src')?.trim();
        } else if ($el.is('a')) {
          novelPath = $el.attr('href')?.trim();
          novelName =
            $el.find('h3, b, span').first().text().trim() ||
            $el.parent().find('h3').text().trim() ||
            $el.text().trim();
          novelCover =
            $el.find('img').attr('src')?.trim() ||
            $el.parent().find('img').attr('src')?.trim();
        }

        if (
          novelPath &&
          novelName &&
          novelPath.match(/^\/\d+\/$/) &&
          !processedPaths.has(novelPath)
        ) {
          novels.push({
            name: novelName,
            path: novelPath,
            cover: makeAbsolute(novelCover, this.site) || defaultCover,
          });
          processedPaths.add(novelPath);
        }
      },
    );

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = makeAbsolute(novelPath, this.site);
    if (!novelUrl) throw new Error('Invalid novel URL');

    const result = await fetchApi(novelUrl);
    if (!result.ok) throw new Error('Failed to fetch novel');

    const $ = parseHTML(await result.text());
    const $infoSection = $('section#detail div.media-content.info');
    const $modSection = $('section#detail div.mod');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $infoSection.find('h1.title').text().trim() || 'Untitled',
      cover:
        makeAbsolute(
          $('section#detail div.cover img').attr('src'),
          this.site,
        ) || defaultCover,
      summary: $modSection.find('div.intro').text().trim() || undefined,
      author:
        $infoSection.find('p.meta span.author').text().trim() || undefined,
      genres:
        $infoSection
          .find('p.meta a[href*="/bookstack/"]')
          .map((_i, el) => $(el).text().trim())
          .get()
          .join(', ') || undefined,
      status: NovelStatus.Unknown,
      chapters: [],
    };

    const chapterListPath =
      $modSection
        .find('p.action.buttons a.button.is-info[href$="/dir"]')
        .attr('href') ||
      $infoSection.find('a.button.is-info[href$="/dir"]').attr('href');

    if (chapterListPath) {
      novel.chapters = await this.parseChapterList(chapterListPath);
    }

    return novel;
  }

  async parseChapterList(
    chapterListPath: string,
  ): Promise<Plugin.ChapterItem[]> {
    const chapterListUrl = makeAbsolute(chapterListPath, this.site);
    if (!chapterListUrl) return [];

    const result = await fetchApi(chapterListUrl);
    if (!result.ok) return [];

    const $ = parseHTML(await result.text());
    const chapters: Plugin.ChapterItem[] = [];

    $('div.chaplist ul.all li a').each((index, el) => {
      const $el = $(el);
      const chapterName = $el.text().trim();
      const chapterUrl = $el.attr('href')?.trim();

      if (chapterName && chapterUrl) {
        chapters.push({
          name: chapterName,
          path: chapterUrl,
          chapterNumber: index + 1,
        });
      }
    });

    const sortButtonText = $('div.chaplist .header button.reverse span')
      .last()
      .text()
      .trim();
    if (sortButtonText === '倒序') {
      chapters.reverse();
      chapters.forEach((chap, index) => (chap.chapterNumber = index + 1));
    }

    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterUrl = makeAbsolute(chapterPath, this.site);
    if (!chapterUrl) throw new Error('Invalid chapter URL');

    const result = await fetchApi(chapterUrl);
    if (!result.ok) throw new Error('Failed to fetch chapter');

    const $ = parseHTML(await result.text());
    const $content = $('div.content.py-5');
    if (!$content.length) return 'Error: Could not find chapter content';

    $content
      .find(
        'script, style, ins, iframe, [class*="ads"], [id*="ads"], [class*="google"], [id*="google"], [class*="recommend"], div[align="center"], p:contains("推薦本書"), a[href*="javascript:"]',
      )
      .remove();

    $content.find('p').each((_i, el) => {
      const $p = $(el);
      const pText = $p.text().trim();
      if (
        pText.includes('請記住本站域名') ||
        pText.includes('手機版閱讀網址') ||
        pText.includes('novel543') ||
        pText.includes('稷下書院') ||
        pText.includes('最快更新') ||
        pText.includes('最新章節') ||
        pText.includes('章節報錯') ||
        pText.match(/app|APP|下載|客户端|关注微信|公众号/i) ||
        pText.length === 0 ||
        ($p
          .html()
          ?.replace(/&nbsp;/g, '')
          .trim() === '' &&
          $p.find('img').length === 0) ||
        pText.includes('溫馨提示')
      ) {
        $p.remove();
      }
    });

    $content
      .contents()
      .filter(function () {
        return this.type === 'comment';
      })
      .remove();

    let chapterText = $content.html();
    if (!chapterText) return 'Error: Chapter content was empty';

    chapterText = chapterText
      .replace(/<\s*p[^>]*>/gi, '\n\n')
      .replace(/<\s*br[^>]*>/gi, '\n');

    chapterText = parseHTML(`<div>${chapterText}</div>`).text();

    return chapterText
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    if (/^\d+$/.test(searchTerm)) {
      try {
        const novelPath = `/${searchTerm}/`;
        const novel = await this.parseNovel(novelPath);
        return [
          {
            name: novel.name,
            path: novelPath,
            cover: novel.cover,
          },
        ];
      } catch {
        return [];
      }
    }

    const searchUrl = `${this.site}search/${encodeURIComponent(searchTerm)}`;
    let body = '';

    try {
      const result = await fetchApi(searchUrl);
      if (!result.ok) {
        if (result.status === 403 || result.status === 503) {
          throw new Error(
            'Cloudflare protection detected (HTTP error). Please try opening the plugin in WebView first to solve the challenge.',
          );
        }
        return [];
      }

      body = await result.text();
      const $ = parseHTML(body);
      const pageTitle = $('title').text().toLowerCase();

      // Check for various Cloudflare challenge indicators
      if (
        pageTitle.includes('attention required') ||
        pageTitle.includes('just a moment') ||
        pageTitle.includes('please wait') ||
        pageTitle.includes('verifying') ||
        body.includes('Verifying you are human') ||
        body.includes('cf-browser-verification') ||
        body.includes('cf_captcha_container')
      ) {
        throw new Error(
          'Cloudflare protection detected. Please try opening the plugin in WebView first to solve the challenge.',
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        // If it's already our custom error, re-throw it
        if (error.message.includes('Cloudflare protection detected')) {
          throw error;
        }
        // For other errors, throw a generic error
        throw new Error(`Failed to fetch search results: ${error.message}`);
      }
      throw error;
    }

    const $ = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];

    $('div.search-list ul.list > li.media').each((_i, el) => {
      const $el = $(el);
      const $link = $el.find('.media-content h3 a');
      const novelPath = $link.attr('href')?.trim();
      const novelName = $link.text().trim();
      const novelCover = $el.find('.media-left img').attr('src')?.trim();

      if (novelPath && novelName && novelPath.match(/^\/\d+\/$/)) {
        novels.push({
          name: novelName,
          path: novelPath,
          cover: makeAbsolute(novelCover, this.site) || defaultCover,
        });
      }
    });

    return novels;
  }
}

export default new Novel543Plugin();
