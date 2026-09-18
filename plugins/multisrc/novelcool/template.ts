import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';

export type NovelCoolMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options: {
    lang: string;
    langCode: string;
    app: Record<string, string>;
  };
};

export class NovelCoolPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  mainUrl: string;
  version: string;
  options: NovelCoolMetadata['options'];
  filters: Filters;

  constructor(metadata: NovelCoolMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.site = 'https://en.novelcool.com';
    this.mainUrl = this.site;
    this.icon = 'multisrc/novelcool/novelcool/icon.png';
    this.version = '2.0.0';
    this.options = metadata.options;

    this.filters = {
      sortby: {
        label: 'Order by',
        value: 'hot',
        options: [
          { label: 'Hottest', value: 'hot' },
          { label: 'Latest', value: 'latest' },
          { label: 'New Books', value: 'new_book' },
        ],
        type: FilterTypes.Picker,
      },
    };
  }

  async popularNovels(
    page: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url: string;

    if (showLatestNovels || filters?.sortby?.value === 'latest') {
      url = `${this.mainUrl}/category/latest.html`;
    } else if (filters?.sortby?.value === 'new_book') {
      url = `${this.mainUrl}/category/new.html`;
    } else {
      url = `${this.mainUrl}/category/popular.html`;
    }

    if (page > 1) {
      url += `?page=${page}`;
    }

    const html = await fetchApi(url).then(res => res.text());
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('a[href*="/novel/"]').each((_, el) => {
      const link = $(el).attr('href');
      const name = $(el).attr('title') || $(el).text().trim();

      if (!link || !name || !link.includes('/novel/')) return;

      const path = this.cleanUrl(link);

      if (
        !novels.some(novel => novel.path === path) &&
        !/^(Latest|Popular|Novel|Read|Home)$/i.test(name)
      ) {
        const cover =
          $(el).find('img').attr('src') ||
          $(el).closest('.book-item, .item, li').find('img').first().attr('src') ||
          '';

        novels.push({
          name,
          cover: this.absoluteUrl(cover),
          path,
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.absoluteUrl(novelPath);

    const html = await fetchApi(url).then(res => res.text());
    const $ = loadCheerio(html);

    const name =
      $('.bookinfo-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      '';

    const cover =
      $('.bookinfo-pic-img').attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      '';

    const author =
      $('.bookinfo-author').first().text().replace(/^Author:\s*/i, '').trim() ||
      $('[itemprop="creator"]').first().text().trim();

    const summary =
      $('[itemprop="description"]').first().text().trim() ||
      $('.bookinfo-intro').first().text().trim() ||
      $('.bookinfo-summary').first().text().trim();

    const genres: string[] = [];

    $('[itemprop="genre"], .bookinfo-tag a, .bookinfo-category a').each(
      (_, el) => {
        const genre = $(el).text().trim();

        if (genre && !genres.includes(genre)) {
          genres.push(genre);
        }
      },
    );

    const chapters: Plugin.ChapterItem[] = [];

    $('.chapter-item-list a, .chapter-list a').each((index, el) => {
      const href = $(el).attr('href');
      const chapterName = $(el).text().trim();

      if (!href || !chapterName) return;

      const path = this.cleanUrl(href);

      if (chapters.some(chapter => chapter.path === path)) return;

      const date =
        $(el).find('.chapter-item-date, .date').text().trim() ||
        $(el).closest('.chapter-item, li').find('.date').text().trim() ||
        '';

      chapters.push({
        name: chapterName,
        path,
        releaseTime: date,
        chapterNumber: this.extractChapterNumber(chapterName, index + 1),
      });
    });

    chapters.reverse();

    return {
      path: novelPath,
      name,
      cover: this.absoluteUrl(cover),
      author,
      artist: '',
      genres: genres.join(','),
      summary,
      status: NovelStatus.Ongoing,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.absoluteUrl(chapterPath);

    const html = await fetchApi(url).then(res => res.text());
    const $ = loadCheerio(html);

    const images: string[] = [];

    $('.mangaread-manga-pic').each((_, el) => {
      const src =
        $(el).attr('src') ||
        $(el).attr('data-src') ||
        $(el).attr('data-original');

      if (src) {
        const absolute = this.absoluteUrl(src);

        if (!images.includes(absolute)) {
          images.push(absolute);
        }
      }
    });

    /*
     * A NovelCool chapter can contain many image pages.
     * The chapter HTML itself provides the page URLs in .sl-page.
     */
    if (images.length === 0) {
      $('.sl-page option').each((_, el) => {
        const href = $(el).attr('value');

        if (!href) return;

        const pageUrl = this.absoluteUrl(href);

        // Do not fetch here; page URLs are handled below.
        if (!pageUrl) return;
      });
    }

    /*
     * NovelCool's reader uses:
     *
     * Chapter-ID-1.html
     * Chapter-ID-2.html
     * Chapter-ID-3.html
     *
     * etc.
     *
     * Fetch all page URLs exposed by the chapter selector.
     */
    const pageUrls: string[] = [];

    $('.sl-page option').each((_, el) => {
      const href = $(el).attr('value');

      if (href) {
        const absolute = this.absoluteUrl(href);

        if (!pageUrls.includes(absolute)) {
          pageUrls.push(absolute);
        }
      }
    });

    if (pageUrls.length > 0) {
      const pageImages: string[] = [];

      for (const pageUrl of pageUrls) {
        try {
          const pageHtml = await fetchApi(pageUrl).then(res => res.text());
          const $$ = loadCheerio(pageHtml);

          const src =
            $$('.mangaread-manga-pic').first().attr('src') ||
            $$('.mangaread-manga-pic').first().attr('data-src') ||
            $$('.mangaread-manga-pic').first().attr('data-original');

          if (src) {
            const absolute = this.absoluteUrl(src);

            if (!pageImages.includes(absolute)) {
              pageImages.push(absolute);
            }
          }
        } catch {
          // Ignore an individual broken page.
        }
      }

      if (pageImages.length > 0) {
        return pageImages
          .map(
            image =>
              `<img src="${this.escapeHtml(image)}" style="display:block;width:100%;height:auto;" />`,
          )
          .join('\n');
      }
    }

    if (images.length > 0) {
      return images
        .map(
          image =>
            `<img src="${this.escapeHtml(image)}" style="display:block;width:100%;height:auto;" />`,
        )
        .join('\n');
    }

    return '<p>Unable to load chapter images.</p>';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      `${this.mainUrl}/search.html?keyword=` +
      encodeURIComponent(searchTerm) +
      (pageNo > 1 ? `&page=${pageNo}` : '');

    const html = await fetchApi(url).then(res => res.text());
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('a[href*="/novel/"]').each((_, el) => {
      const href = $(el).attr('href');
      const name =
        $(el).attr('title') ||
        $(el).find('h3, h4').first().text().trim() ||
        $(el).text().trim();

      if (!href || !name || !href.includes('/novel/')) return;

      const path = this.cleanUrl(href);

      if (novels.some(novel => novel.path === path)) return;

      const cover =
        $(el).find('img').attr('src') ||
        $(el).closest('.book-item, .item, li').find('img').first().attr('src') ||
        '';

      novels.push({
        name,
        cover: this.absoluteUrl(cover),
        path,
      });
    });

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    return this.absoluteUrl(path);
  };

  private absoluteUrl(url: string): string {
    if (!url) return '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    if (url.startsWith('//')) {
      return 'https:' + url;
    }

    if (url.startsWith('/')) {
      return this.mainUrl + url;
    }

    return this.mainUrl + '/' + url;
  }

  private cleanUrl(url: string): string {
    if (!url) return '';

    try {
      const parsed = new URL(url, this.mainUrl);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  }

  private extractChapterNumber(
    name: string,
    fallback: number,
  ): number {
    const match = name.match(/chapter\s*([\d.]+)/i);

    return match ? parseFloat(match[1]) : fallback;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
