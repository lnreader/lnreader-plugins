import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type TocChapter = {
  href: string;
  ts?: number;
  title: string;
};

type TocData = {
  chapters?: TocChapter[];
  statusKey?: string;
};

type SearchHit = {
  title: string;
  url: string;
  image?: string;
};

/**
 * Kay's Translations (kaystls.site) is a custom WordPress site, so this
 * plugin reads the site's own pages and AJAX actions:
 *
 * - The "Browse" page lists every series through the `kay_browse_query`
 *   admin-ajax action (20 series per page). The action needs a nonce that is
 *   printed on the Browse page itself.
 * - Search uses the `kay_series_search` action behind the Browse page's live
 *   search box. It returns every match at once.
 * - A series page embeds its complete chapter list as `KaySeriesTOCData`
 *   (title, address, timestamp) and a `lockedChapters` field holding the
 *   early-access chapters that cannot be read without signing in. Those are
 *   left out of the chapter list.
 * - A chapter page holds the story text as paragraphs of the column that
 *   starts with the chapter heading.
 */
class KaysTranslationsPlugin implements Plugin.PluginBase {
  id = 'kaystranslations';
  name = "Kay's Translations";
  icon = 'src/en/kaystranslations/icon.png';
  site = 'https://kaystls.site/';
  version = '1.0.0';

  private ajaxUrl = 'https://kaystls.site/wp-admin/admin-ajax.php';
  private nonce: string | undefined;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const status = filters?.status?.value || 'all';
    const sort = showLatestNovels
      ? 'updated_free'
      : filters?.sort?.value || 'popular';

    let result = await this.browse(pageNo, status, sort, false);
    if (result === undefined) {
      // The cached nonce expired: read a fresh one and retry once.
      result = await this.browse(pageNo, status, sort, true);
    }
    if (result === undefined) {
      throw new Error("Kay's Translations: the browse request was rejected.");
    }

    const $ = loadCheerio(result);
    const novels: Plugin.NovelItem[] = [];
    $('article.kay-card').each((_, el) => {
      const card = $(el);
      const link = card.find('h3.kay-card-title a').first();
      const path = this.toPath(link.attr('href') || '');
      const name = link.text().trim();
      if (!path || !name) return;
      novels.push({
        name,
        path,
        cover: this.imageOrDefault(card.find('img').first().attr('src')),
      });
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.resolveUrl(novelPath));
    if (!response.ok) {
      throw new Error(`Kay's Translations: HTTP ${response.status}.`);
    }
    const html = await response.text();
    const $ = loadCheerio(html);

    const name = $('.wp-block-column h1.wp-block-heading').first().text();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: this.normalizeText(name) || this.titleFromDocument($),
      cover: this.imageOrDefault(
        $('.wp-block-cover__image-background').first().attr('src'),
      ),
      chapters: [],
    };

    const synopsis = this.readSynopsis($);
    if (synopsis) novel.summary = synopsis;

    const toc = this.readToc(html);
    if (!toc || !Array.isArray(toc.chapters)) {
      throw new Error(
        `Kay's Translations: no chapter list found at ${novelPath}.`,
      );
    }
    novel.status = this.toStatus(toc.statusKey);

    // Early-access chapters are listed on the page but need a sign-in.
    const locked = new Set(
      ($('input.lockedChapters').attr('value') || '')
        .split(',')
        .map(href => this.toPath(href))
        .filter(path => path),
    );
    const chapters: Plugin.ChapterItem[] = [];
    toc.chapters.forEach(item => {
      const path = this.toPath(item.href);
      if (!path || locked.has(path)) return;
      const numbered = item.title.match(/^Chapter\s*(\d+(?:\.\d+)?)/i);
      chapters.push({
        name: this.normalizeText(item.title),
        path,
        releaseTime: item.ts
          ? new Date(item.ts * 1000).toISOString()
          : undefined,
        chapterNumber: numbered ? Number(numbered[1]) : chapters.length + 1,
      });
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(this.resolveUrl(chapterPath));
    if (!response.ok) {
      throw new Error(`Kay's Translations: HTTP ${response.status}.`);
    }
    const $ = loadCheerio(await response.text());

    // The story text is the run of paragraphs under the chapter heading; the
    // next heading ("TOC | Next chapter") and the donation blocks follow it.
    const column = $(
      '.wp-block-column > h3.wp-block-heading + p.wp-block-paragraph',
    )
      .first()
      .parent();
    const parts: string[] = [];
    column
      .children()
      .slice(1)
      .each((_, el) => {
        if (el.tagName === 'h3') return false;
        const node = $(el);
        if (el.tagName === 'p' && node.hasClass('wp-block-paragraph')) {
          if (node.text().trim() || node.find('img').length) {
            parts.push($.html(node));
          }
        }
      });

    if (parts.length === 0) {
      throw new Error(
        `Kay's Translations: no readable chapter text at ${chapterPath}. ` +
          'The chapter may be early access and need a sign-in on the site.',
      );
    }
    return parts.join('\n');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's search answers with every match at once and has no pages.
    if (pageNo > 1) return [];
    const query = searchTerm.trim();
    if (query.length < 2) return [];

    const response = await fetchApi(this.ajaxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({
        action: 'kay_series_search',
        q: query,
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`Kay's Translations: HTTP ${response.status}.`);
    }
    const hits: SearchHit[] = await response.json();
    if (!Array.isArray(hits)) return [];

    const novels: Plugin.NovelItem[] = [];
    hits.forEach(hit => {
      const path = this.toPath(hit.url);
      if (!path || !hit.title) return;
      novels.push({
        name: this.normalizeText(hit.title),
        path,
        cover: this.imageOrDefault(hit.image),
      });
    });
    return novels;
  }

  resolveUrl = (path: string) => this.site + path;

  /**
   * Run the Browse page's `kay_browse_query` action. Resolves to the cards'
   * HTML, or to `undefined` when the site rejected the nonce.
   */
  private async browse(
    pageNo: number,
    status: string,
    sort: string,
    refreshNonce: boolean,
  ): Promise<string | undefined> {
    if (refreshNonce || !this.nonce) {
      this.nonce = await this.fetchNonce();
    }
    const response = await fetchApi(this.ajaxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({
        action: 'kay_browse_query',
        status,
        sort,
        page: String(pageNo),
        _wpnonce: this.nonce,
      }).toString(),
    });
    if (!response.ok) {
      return undefined;
    }
    const data: { html?: string; success?: boolean } = await response.json();
    return typeof data.html === 'string' ? data.html : undefined;
  }

  private async fetchNonce(): Promise<string> {
    const response = await fetchApi(this.site + 'browse/');
    if (!response.ok) {
      throw new Error(`Kay's Translations: HTTP ${response.status}.`);
    }
    const $ = loadCheerio(await response.text());
    const nonce = $('#kay-browse-grid').attr('data-nonce');
    if (!nonce) {
      throw new Error("Kay's Translations: the browse page has no nonce.");
    }
    return nonce;
  }

  /** The synopsis is the paragraphs between its heading and the TOC. */
  private readSynopsis($: ReturnType<typeof loadCheerio>): string {
    const heading = $('.wp-block-column h4.wp-block-heading')
      .filter((_, el) => /synopsis/i.test($(el).text()))
      .first();
    const paragraphs: string[] = [];
    let node = heading.next();
    while (node.length && !/^h\d$/.test(node.get(0)?.tagName || '')) {
      if (node.is('p.wp-block-paragraph')) {
        node.find('br').replaceWith('\n');
        const text = this.normalizeText(node.text());
        // The closing paragraph asks readers to rate the series.
        if (text && !/novel\s*updates/i.test(text)) paragraphs.push(text);
      }
      node = node.next();
    }
    return paragraphs.join('\n\n');
  }

  /** Read the `KaySeriesTOCData = {...};` object out of the page's scripts. */
  private readToc(html: string): TocData | undefined {
    const marker = html.indexOf('KaySeriesTOCData');
    if (marker === -1) return undefined;
    const start = html.indexOf('{', html.indexOf('=', marker));
    if (start === -1) return undefined;

    let depth = 0;
    let inString = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (inString) {
        if (char === '\\') i++;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}' && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as TocData;
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  }

  private toStatus(key: string | undefined): string {
    switch (key) {
      case 'ongoing':
        return NovelStatus.Ongoing;
      case 'completed':
        return NovelStatus.Completed;
      case 'hiatus':
        return NovelStatus.OnHiatus;
      case 'dropped':
        return NovelStatus.Cancelled;
      default:
        return NovelStatus.Unknown;
    }
  }

  private titleFromDocument($: ReturnType<typeof loadCheerio>): string {
    return this.normalizeText(
      $('title')
        .text()
        .split(/[–|-]\s*Kay/)[0],
    );
  }

  private imageOrDefault(src: string | undefined): string {
    // The site fills missing covers with a shared "no-image" placeholder.
    if (!src || /no-image/i.test(src)) return defaultCover;
    return src;
  }

  /** Reduce an address on this site to the path stored for novels/chapters. */
  private toPath(href: string): string {
    try {
      const url = new URL(href, this.site);
      if (url.hostname.replace(/^www\./, '') !== 'kaystls.site') return '';
      return url.pathname.replace(/^\/+/, '');
    } catch {
      return '';
    }
  }

  private normalizeText(text: string): string {
    return text
      .replace(new RegExp('\\u3000', 'g'), ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
  }

  filters = {
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'On Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      label: 'Sort by',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Updated (Free)', value: 'updated_free' },
        { label: 'Updated (Premium)', value: 'updated_premium' },
        { label: 'Newest', value: 'newest' },
        { label: 'Oldest', value: 'oldest' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new KaysTranslationsPlugin();
