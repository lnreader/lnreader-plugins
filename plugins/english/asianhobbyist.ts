import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const SITE_HOST = /^(?:www\.)?asianhobbyist\.com$/i;
// The theme's own image for series that have no cover.
const PLACEHOLDER_COVER = /\/assets\/images\/404\.jpg$/i;
// Parts of a chapter that are advertising, donation requests or widgets.
const CHAPTER_JUNK =
  'script, style, noscript, iframe, form, .code-block, .adsbygoogle, #vuukle-quiz, [id^="vuukle"]';

class AsianHobbyist implements Plugin.PluginBase {
  id = 'asianhobbyist';
  name = 'Asian Hobbyist';
  site = 'https://www.asianhobbyist.com';
  icon = 'src/en/asianhobbyist/icon.png';
  version = '1.0.0';

  filters = {
    sort: {
      label: 'Sort by',
      value: 'latest',
      options: [
        { label: 'Latest updates', value: 'latest' },
        { label: 'Weekly ranking', value: '1x1' },
        { label: 'Monthly ranking', value: '1x2' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async request(url: string, init?: Parameters<typeof fetchApi>[1]) {
    const response = await fetchApi(url, init);
    if (!response.ok) {
      throw Object.assign(
        new Error(`Asian Hobbyist: HTTP ${response.status}.`),
        { status: response.status },
      );
    }
    return response;
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Converts an href into a site-relative path (`/series/slug/`). Returns
   * undefined for links to other sites, anchors and the home page.
   */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href, this.site);
    } catch {
      return undefined;
    }
    if (!SITE_HOST.test(url.hostname) || url.pathname === '/') return undefined;
    return url.pathname;
  }

  /**
   * Some covers still point at the old http://asianhobbyist.com host, and
   * series without a cover show the theme's own placeholder image.
   */
  private coverUrl(src: string | undefined): string {
    if (!src || src.startsWith('data:') || PLACEHOLDER_COVER.test(src)) {
      return defaultCover;
    }
    try {
      const url = new URL(src, this.site);
      if (SITE_HOST.test(url.hostname)) {
        url.protocol = 'https:';
        url.hostname = 'www.asianhobbyist.com';
      }
      return url.href;
    } catch {
      return defaultCover;
    }
  }

  private imageOf(img: { attr(name: string): string | undefined }): string {
    // Images are lazy loaded: the real address is in data-src.
    return this.coverUrl(img.attr('data-src') || img.attr('src'));
  }

  /**
   * The site's AJAX endpoint (ranking and search) needs the token that every
   * page carries in `<meta name="enc">`.
   */
  private async ajax(action: string, src: string): Promise<string> {
    const home = loadCheerio(await (await this.request(this.site)).text());
    const enc = home('meta[name="enc"]').attr('content');
    if (!enc) throw new Error('Asian Hobbyist: search token not found.');
    const response = await this.request(
      `${this.site}/wp-admin/admin-ajax.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=${action}&enc=${encodeURIComponent(enc)}&src=${encodeURIComponent(src)}`,
      },
    );
    return response.text();
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? 'latest' : filters?.sort?.value || 'latest';
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    const add = (name: string, href?: string, cover?: string) => {
      const path = this.sitePath(href);
      if (!name || !path || !path.startsWith('/series/') || seen.has(path)) {
        return;
      }
      seen.add(path);
      novels.push({ name, path, cover: cover || defaultCover });
    };

    if (sort === 'latest') {
      // The home page lists series by their latest chapter, nine per page.
      const url = pageNo > 1 ? `${this.site}/page/${pageNo}/` : this.site;
      let html: string;
      try {
        html = await (await this.request(url)).text();
      } catch (error) {
        if ((error as { status?: number }).status === 404) return [];
        throw error;
      }
      const $ = loadCheerio(html);
      $('ul.series > li.item').each((_, item) => {
        const link = $(item).find('.title a').first();
        add(
          this.cleanText(link.text()),
          link.attr('href'),
          this.imageOf($(item).find('img').first()),
        );
      });
      return novels;
    }

    // The ranking is a single list.
    if (pageNo > 1) return [];
    const $ = loadCheerio(await this.ajax('fs', sort));
    $('.table_pop').each((_, item) => {
      const link = $(item).find('.table_title a').first();
      add(
        this.cleanText(link.text()),
        link.attr('href'),
        this.imageOf($(item).find('.thumb img').first()),
      );
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(novelPath))).text(),
    );

    const name =
      this.cleanText($('.info h1.entry-title').first().text()) ||
      this.cleanText($('h1.entry-title').first().text()) ||
      'Untitled';
    const summary = $('.info .description')
      .first()
      .text()
      .replace(/[ \t]+/g, ' ')
      .trim();

    const chapters: Plugin.ChapterItem[] = [];
    $('.releases .tableBody .row').each((_, row) => {
      const link = $(row).find('a[href]').first();
      const path = this.sitePath(link.attr('href'));
      const chapterName = this.cleanText(link.text());
      if (!path || !chapterName) return;
      const number = /(\d+(?:\.\d+)?)/.exec(chapterName)?.[1];
      chapters.push({
        name: chapterName,
        path,
        chapterNumber: number ? Number(number) : undefined,
      });
    });
    if (!chapters.length) {
      throw new Error('Asian Hobbyist: no chapters were found.');
    }

    return {
      path: novelPath,
      name,
      cover: this.imageOf($('.info .thumb img').first()),
      summary: summary || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(chapterPath))).text(),
    );
    const content = $('.entry-content').first();
    content.find(CHAPTER_JUNK).remove();

    const chapter = content.html()?.trim() || '';
    if (this.cleanText(loadCheerio(chapter).text()).length < 100) {
      throw new Error('Asian Hobbyist: no readable chapter text found.');
    }
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's search box shows a single list of matching series.
    const term = searchTerm.trim();
    if (pageNo > 1 || term.length < 3) return [];
    const $ = loadCheerio(await this.ajax('gsr', term));
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('li').each((_, item) => {
      const link = $(item).find('.title a').first();
      const path = this.sitePath(link.attr('href'));
      // The visible text is re-cased around the matched word; the title
      // attribute holds the real name.
      const name = this.cleanText(link.attr('title') || link.text());
      if (!path || !name || seen.has(path)) return;
      seen.add(path);
      novels.push({
        name,
        path,
        cover: this.imageOf($(item).find('img').first()),
      });
    });
    return novels;
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new AsianHobbyist();
