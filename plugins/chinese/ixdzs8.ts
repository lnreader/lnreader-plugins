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

class ixdzs8Plugin implements Plugin.PluginBase {
  id = 'ixdzs8';
  name = '爱下电子书';
  site = 'https://ixdzs8.com/';
  version = '2.2.8';
  icon = 'src/cn/ixdzs8/favicon.png';

  imageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}hot/?page=${pageNo}`;
    const result = await fetchApi(url);
    if (!result.ok) return [];

    const $ = parseHTML(await result.text());
    const novels: Plugin.NovelItem[] = [];
    const processedPaths = new Set<string>();

    $('ul.u-list > li.burl').each((_i, el) => {
      const $el = $(el);
      let novelPath: string | undefined;
      let novelName: string | undefined;
      let novelCover: string | undefined;

      const $link = $el.find('.l-info h3 a');
      novelPath = $link.attr('href')?.trim();
      novelName = ($link.attr('title') || $link.text() || '').trim();
      novelCover = $el.find('.l-img img').attr('src')?.trim();

      if (novelPath && novelName) {
        novels.push({
          name: novelName,
          path: novelPath,
          cover: makeAbsolute(novelCover, this.site) || defaultCover,
        });
        processedPaths.add(novelPath);
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = makeAbsolute(novelPath, this.site);
    if (!novelUrl) throw new Error('Invalid novel URL');

    const result = await fetchApi(novelUrl);
    if (!result.ok) throw new Error('Failed to fetch novel');

    const $ = parseHTML(await result.text());
    const $novel = $('div.novel');
    const $intro = $('p#intro.pintro');
    // Remove any child elements you don't want, e.g., the "read more" icon
    $intro.find('span.icon').remove();
    // Get text and normalize whitespace
    const summary = $intro
      .html() // get inner HTML
      ?.replace(/<br\s*\/?>/gi, '\n') // convert <br> to line breaks
      .replace(/<[^>]+>/g, '') // remove remaining tags like <font>
      .replace(/\u3000/g, ' ') // replace full-width spaces
      .replace(/&nbsp;/g, ' ') // replace spaces
      .split('\n') // split into lines
      .map(line => line.trim()) // trim each line
      .filter(line => line.length > 0) // remove empty lines
      .join(' '); // join into one paragraph

    const $tagsDiv = $('div.panel div.tags');
    // find all <a> inside <em> and get their text
    // Select <p> that contains <a.nsort>

    const statOngoing = $novel.find('.n-text p span.lz').text().trim();
    const statEnd = $novel.find('.n-text p span.end').text().trim();
    let detail: 'Ongoing' | 'Completed' | 'Unknown' = 'Unknown';
    if (statEnd.length > 0) {
      detail = 'Completed';
    } else if (statOngoing.length > 0) {
      detail = 'Ongoing';
    } else {
      detail = 'Unknown';
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $novel.find('.n-text h1').text().trim() || 'Untitled',
      cover:
        makeAbsolute($novel.find('.n-img img').attr('src'), this.site) ||
        defaultCover,
      summary: summary,
      author: $novel.find('.n-text p a.bauthor').text().trim() || undefined,
      genres: $tagsDiv
        .find('em a')
        .map((_i, el) => $(el).text().trim())
        .get()
        .filter(tag => tag.length > 0) // remove empty strings
        .join(', '),
      status:
        detail === 'Ongoing'
          ? NovelStatus.Ongoing
          : detail === 'Completed'
            ? NovelStatus.Completed
            : NovelStatus.Unknown,
      chapters: [],
    };

    const chapterListPath = $('#bid').attr('value'); // get bid from page
    if (chapterListPath) {
      novel.chapters = await this.parseChapterList(chapterListPath);
    }

    return novel;
  }

  async parseChapterList(bid: string | number): Promise<Plugin.ChapterItem[]> {
    // Convert bid to string just in case
    const bookId = String(bid);

    // POST request to fetch chapter list JSON
    const url = `${this.site}novel/clist/`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `bid=${bookId}`,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch chapters for bid=${bookId}`);
    }

    const json = await res.json();

    if (json.rs !== 200 || !Array.isArray(json.data)) {
      throw new Error('Invalid response format from chapter list');
    }

    // Build chapters array
    const chapters: Plugin.ChapterItem[] = json.data.map((ch: any) => {
      return {
        name: ch.title,
        path: ch.ctype === '0' ? `read/${bookId}/p${ch.ordernum}.html` : '', // only normal chapters get link
        releaseTime: undefined, // optional, not provided here
      };
    });

    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterUrl = makeAbsolute(chapterPath, this.site);
    if (!chapterUrl) throw new Error('Invalid chapter URL');

    // --- 1st request ---
    let result = await fetchApi(chapterUrl);
    if (!result.ok) throw new Error(`Failed to fetch chapter at ${chapterUrl}`);

    let html = await result.text();

    // --- Check if we got challenge page ---
    if (html.includes('正在進行安全驗證') || html.includes('challenge')) {
      const tokenMatch = html.match(/let token\s*=\s*"([^"]+)"/);
      if (tokenMatch) {
        const challengeUrl =
          chapterUrl + '?challenge=' + encodeURIComponent(tokenMatch[1]);

        result = await fetchApi(challengeUrl);
        if (!result.ok)
          throw new Error(`Failed after challenge redirect: ${challengeUrl}`);
        html = await result.text();
      }
    }

    // --- Parse content ---
    const $ = parseHTML(html);
    const $content = $('article section');

    if (!$content.length) {
      return `Error: Could not find chapter content at ${chapterUrl}`;
    }

    // Remove ads & junk
    $content
      .find(
        'script, style, ins, iframe, [class*="abg"], [class*="ads"], [id*="ads"], [class*="google"], [id*="google"], [class*="recommend"], div[align="center"], p:contains("推薦本書"), a[href*="javascript:"]',
      )
      .remove();

    // Drop empty <p>
    $content.find('p').each((_i, el) => {
      const $p = $(el);
      if (!$p.text().trim()) $p.remove();
    });

    // Remove HTML comments
    $content
      .contents()
      .filter(function () {
        return this.type === 'comment';
      })
      .remove();

    // Unwrap <font>
    $content.find('font').each((_i, el) => {
      const $el = $(el);
      $el.replaceWith($el.html() || '');
    });

    // Extract cleaned text
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
    const searchUrl = `${this.site}bsearch?q=${encodeURIComponent(searchTerm)}`;
    let body = '';

    try {
      const result = await fetchApi(searchUrl);
      if (!result.ok) {
        throw new Error(
          `Failed to fetch search results: HTTP ${result.status}`,
        );
      }
      body = await result.text();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch search results: ${error.message}`);
      }
      throw error;
    }

    const $ = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];

    $('ul.u-list li.burl').each((_i, el) => {
      const $el = $(el);

      const novelPath = $el.attr('data-url')?.trim();
      const novelName = $el.find('h3.bname a').text().trim();
      const novelCover = $el.find('.l-img img').attr('src')?.trim();

      if (novelPath && novelName) {
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

export default new ixdzs8Plugin();
