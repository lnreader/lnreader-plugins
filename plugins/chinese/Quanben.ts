import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi, fetchFile } from '@/lib/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const getStandardNovelPath = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/^(\/amp)?(\/n\/[^\/]+\/)/);
    return match?.[2];
  } catch (error) {
    return undefined;
  }
};

const getChapterFileName = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];
    if (fileName && /^\d+\.html$/.test(fileName)) {
      return fileName;
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
};

const makeAbsolute = (
  relativeUrl: string | undefined,
  baseUrl: string,
): string | undefined => {
  if (!relativeUrl) return undefined;
  try {
    if (relativeUrl.startsWith('//')) {
      return 'https:' + relativeUrl;
    }
    if (
      relativeUrl.startsWith('http://') ||
      relativeUrl.startsWith('https://')
    ) {
      return relativeUrl;
    }
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    return undefined;
  }
};

class QuanbenPlugin implements Plugin.PluginBase {
  id = 'quanben';
  name = 'Quanben';
  site = 'https://www.quanben.io/';
  version = '1.0.0';
  icon = 'src/cn/quanben/icon.png';
  defaultCover = defaultCover;

  filters = {} satisfies Filters;

  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = this.site + 'amp/';
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error(
        `[Quanben] Failed to fetch AMP popular novels page: ${url} - Status: ${result.status}`,
      );
    }
    const body = await result.text();
    const $ = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];
    const processedAmpPaths = new Set<string>();

    $('div.box').each((_i, box) => {
      const $box = $(box);

      // 1. Process the featured novel (div.list2) if it exists
      const $featured = $box.find('div.list2');
      if ($featured.length > 0) {
        const $link = $featured.find('h3 > a');
        const ampPath = $link.attr('href')?.trim();
        const name = $link.text().trim();
        const rawCoverSrc = $featured.find('amp-img').attr('src')?.trim();
        const cover = makeAbsolute(rawCoverSrc, this.site) || this.defaultCover;

        if (ampPath && name && !processedAmpPaths.has(ampPath)) {
          novels.push({ name, path: ampPath, cover });
          processedAmpPaths.add(ampPath);
        }
      }

      // 2. Process novels in the list (ul.list)
      $box.find('ul.list li').each((_j, listItem) => {
        const $listItem = $(listItem);
        const $link = $listItem.find('a');
        const ampPath = $link.attr('href')?.trim();
        const name = $link.find('span').first().text().trim(); // Name is inside a span within the link

        if (ampPath && name && !processedAmpPaths.has(ampPath)) {
          novels.push({ name, path: ampPath, cover: this.defaultCover }); // Use default cover for list items
          processedAmpPaths.add(ampPath);
        }
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // ** Expects AMP path: /amp/n/novel-name/ **
    if (
      !novelPath ||
      !novelPath.startsWith('/amp/n/') ||
      !novelPath.endsWith('/')
    ) {
      throw new Error(
        `[Quanben parseNovel] Invalid novelPath received: "${novelPath}". Expected AMP format: "/amp/n/novel-name/"`,
      );
    }

    // Construct full AMP novel URL
    const fullNovelUrl = makeAbsolute(novelPath, this.site);
    if (!fullNovelUrl) {
      throw new Error(
        `[Quanben parseNovel] Could not construct full AMP novel URL from path: ${novelPath}`,
      );
    }

    // 1. Fetch AMP Novel Page HTML
    const novelPageResult = await fetchApi(fullNovelUrl);
    if (!novelPageResult.ok) {
      throw new Error(
        `[Quanben parseNovel] Failed to fetch AMP novel page: ${fullNovelUrl} - Status: ${novelPageResult.status}`,
      );
    }
    const novelPageHtml = await novelPageResult.text();
    const $ = parseHTML(novelPageHtml);

    // 2. Parse Novel Details from AMP page - **Refined Selectors**
    const $infoBox = $('div.list2'); // Base element for many details
    const $descriptionBox = $('div.description'); // Separate element for summary

    const novel: Plugin.SourceNovel = {
      path: novelPath, // Use the input AMP path
      name:
        $infoBox.find('h3').text().trim() || // **Use h3 inside list2**
        $('h1[itemprop="name headline"]').text().trim() || // Fallback H1
        'Unknown Novel Name',
      cover:
        makeAbsolute($infoBox.find('amp-img').attr('src'), this.site) || // **amp-img inside list2**
        this.defaultCover,
      summary:
        $descriptionBox.find('p').text().trim() || // **Use p inside div.description**
        $descriptionBox.text().trim() || // Fallback to div.description text
        undefined,
      // Use :contains() for more robust selection within the info box
      author:
        $infoBox.find("p:contains('作者:') span").text().trim() || undefined,
      status: NovelStatus.Unknown, // Parsed below
      genres:
        $infoBox.find("p:contains('类别:') span").text().trim() || undefined,
      chapters: [], // Parsed below
    };

    // Parse Status from AMP page
    const statusText =
      $infoBox.find("p:contains('状态:') span").text().trim() || // Try specific span first
      $infoBox.text(); // Fallback to full text
    if (statusText.includes('完结') || statusText.includes('已完成')) {
      novel.status = NovelStatus.Completed;
    } else if (statusText.includes('连载中') || statusText.includes('进行中')) {
      novel.status = NovelStatus.Ongoing;
    }

    // 3. Fetch and Parse Chapter List
    novel.chapters = await this.parseChapterList(novelPath);

    return novel;
  }

  // Separate function to handle chapter list parsing - **Using AMP**
  async parseChapterList(novelPath: string): Promise<Plugin.ChapterItem[]> {
    // ** Expects AMP path: /amp/n/novel-name/ **
    if (
      !novelPath ||
      !novelPath.startsWith('/amp/n/') ||
      !novelPath.endsWith('/')
    ) {
      return [];
    }

    // Construct the AMP chapter list URL
    const ampChapterListUrl = makeAbsolute(novelPath + 'list.html', this.site);
    if (!ampChapterListUrl) {
      return [];
    }

    const chapterListResult = await fetchApi(ampChapterListUrl);
    if (!chapterListResult.ok) {
      return [];
    }
    const chapterListHtml = await chapterListResult.text();
    const $ = parseHTML(chapterListHtml);

    const chapters: Plugin.ChapterItem[] = [];
    // Extract standard novel name from AMP path for chapter path storage
    const standardNovelPathMatch = novelPath.match(/(\/n\/[^\/]+\/)/);
    if (!standardNovelPathMatch || !standardNovelPathMatch[1]) {
      return [];
    }
    const novelNameOnly = standardNovelPathMatch[1].replace(/^\/n\/|\/$/g, '');

    // 1. Parse chapters from ALL list3 uls in the AMP HTML
    $('ul.list3 li a').each((_i, el) => {
      const $el = $(el);
      const chapterName = $el.text().trim();
      const chapterHref = $el.attr('href');
      if (chapterName && chapterHref) {
        // URLs in AMP page usually point to the standard chapter URLs
        const absoluteUrl = makeAbsolute(chapterHref, this.site); // Use base site URL
        const chapterFileName = getChapterFileName(absoluteUrl);
        if (chapterFileName) {
          // ** Store chapter path in standard format for parseChapter **
          const chapterPathForStorage = novelNameOnly + '/' + chapterFileName;
          chapters.push({
            name: chapterName,
            path: chapterPathForStorage,
            // chapterNumber assigned later
          });
        }
      }
    });

    // 2. Deduplicate chapters based on path
    const chapterMap = new Map<string, Plugin.ChapterItem>();
    chapters.forEach(chapter => {
      if (!chapterMap.has(chapter.path)) {
        chapterMap.set(chapter.path, chapter);
      }
    });
    const uniqueChapters = Array.from(chapterMap.values());

    // 3. Sort chapters numerically based on filename
    uniqueChapters.sort((a, b) => {
      const numA = parseInt(a.path.match(/(\d+)\.html$/)?.[1] || '0', 10);
      const numB = parseInt(b.path.match(/(\d+)\.html$/)?.[1] || '0', 10);
      return numA - numB;
    });

    // 4. Assign chapter numbers
    return uniqueChapters.map((chapter, index) => ({
      ...chapter,
      chapterNumber: index + 1,
    }));
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // ** Expects standard path: novel-name/chapterFileName.html **
    if (
      !chapterPath ||
      !chapterPath.includes('/') ||
      chapterPath.endsWith('/')
    ) {
      throw new Error(
        `[Quanben] Invalid chapterPath format received in parseChapter: "${chapterPath}". Expected format: "novel-name/chapterFileName.html"`,
      );
    }

    // Construct the standard chapter URL using /n/ prefix
    const chapterUrl = `${this.site}n/${chapterPath}`;

    const result = await fetchApi(chapterUrl);
    if (!result.ok) {
      // Handle potential redirects (e.g., chapter moved) - check Location header if status is 3xx
      if (result.status >= 300 && result.status < 400) {
        const redirectUrl = result.headers.get('Location');
        if (redirectUrl) {
          const absoluteRedirectUrl = makeAbsolute(redirectUrl, chapterUrl);
          if (!absoluteRedirectUrl) {
            throw new Error(
              `[Quanben] Failed to make redirected URL absolute: ${redirectUrl}`,
            );
          }
          const redirectResult = await fetchApi(absoluteRedirectUrl);
          if (!redirectResult.ok) {
            throw new Error(
              `[Quanben] Failed to fetch redirected chapter content: ${absoluteRedirectUrl} - Status: ${redirectResult.status}`,
            );
          }
          return this.extractChapterContent(
            await redirectResult.text(),
            absoluteRedirectUrl,
          );
        }
      }
      throw new Error(
        `[Quanben] Failed to fetch chapter content: ${chapterUrl} - Status: ${result.status}`,
      );
    }
    const body = await result.text();
    return this.extractChapterContent(body, chapterUrl);
  }

  // Helper function to extract and clean chapter content from HTML body
  private extractChapterContent(body: string, urlForLog: string): string {
    const $ = parseHTML(body);
    let $content = $('#contentbody');
    if (!$content.length) {
      $content = $('#content');
    }
    if (!$content.length) {
      $content = $('.content');
    }
    if (!$content.length) {
      return 'Error: Could not find chapter content container.';
    }
    $content
      .find(
        'script, style, ins, iframe, [class*="ads"], [id*="ads"], [class*="google"], [id*="google"], [class*="recommend"], div[align="center"]',
      )
      .remove();
    $content.find('p').each((_i, el) => {
      const $p = $(el);
      const pText = $p.text().trim();
      if (
        pText.includes('请记住本书首发域名') ||
        pText.includes('手机版阅读网址') ||
        pText.includes('quanben') ||
        pText.includes('最新网址') ||
        pText.includes('章节报错') ||
        pText.match(/app|APP|下载|客户端/) ||
        pText.length === 0 ||
        ($p
          .html()
          ?.replace(/&nbsp;/g, '')
          .trim() === '' &&
          $p.find('img').length === 0)
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
    if (!chapterText) {
      return 'Error: Chapter content was empty after cleaning.';
    }
    chapterText = chapterText.replace(/<\s*p[^>]*>/gi, '\n\n');
    chapterText = chapterText.replace(/<\s*br[^>]*>/gi, '\n');
    chapterText = chapterText.replace(/<[^>]+>/g, '');
    chapterText = parseHTML(`<div>${chapterText}</div>`).text();
    chapterText = chapterText.replace(/[\t ]+/g, ' ');
    chapterText = chapterText.replace(/\n{3,}/g, '\n\n');
    chapterText = chapterText.trim();
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}index.php?c=book&a=search&keywords=${encodeURIComponent(searchTerm)}`;
    const result = await fetchApi(searchUrl);
    if (!result.ok) {
      return [];
    }
    const body = await result.text();
    const $ = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    $('div.list2').each((_i, element) => {
      const $el = $(element);
      const nameLink = $el.find('h3 > a').first();
      const img = $el.find('img').first();

      const novelName = nameLink.text().trim();
      const novelHref = nameLink.attr('href');
      const novelCover = img.attr('src') || img.attr('data-src');

      if (novelHref && novelName) {
        const absoluteUrl = makeAbsolute(novelHref, this.site);
        const standardPath = getStandardNovelPath(absoluteUrl);

        if (standardPath) {
          // **Construct AMP Path for storage**
          const ampPath = '/amp' + standardPath;
          const absoluteCover = makeAbsolute(novelCover, this.site);
          novels.push({
            name: novelName,
            path: ampPath, // **Store the AMP path**
            cover: absoluteCover || this.defaultCover,
          });
        }
      }
    });
    return novels;
  }

  // Use fetchApi for fetchImage as it handles potential errors and returns Response
  async fetchImage(url: string): Promise<Response> {
    return fetchApi(url);
  }
}

export default new QuanbenPlugin();
