import { load as parseHTML } from 'cheerio';
import { fetchApi, FetchInit } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * DaoTekno (daotekno.com) LNReader plugin
 *
 * daotekno.com serves the DaoTranslate.com catalog — pages are titled
 * "DaoTranslate.com - Web Novel Reader" and chapter footers link to
 * DaoTranslate (the connection mentioned in the plugin request). It is a
 * custom PHP reader, not WordPress/Madara:
 *
 * - Catalog:      `/?page=N` — 50 `a.novel-card.novel-item` rows per page,
 *                 title in `.novel-title`, page marker `N / M`.
 * - Search:       `/?q=<term>` — filtered server-side, same card markup,
 *                 single page (page parameters are ignored).
 * - Novel page:   `/series/<slug>/` — `<h1>` title, chapter tiles in
 *                 `#allChaptersGrid` (`.chapter-box`, newest first) split
 *                 across `?page=N`, 200 per page.
 * - Chapter page: `/series/<slug>/<chapter>/` — text inside `#novel-content`.
 *
 * The site gates chapter pages on User-Agent: desktop UAs receive a
 * "Mobile Only Content" interstitial instead of the chapter, so every
 * request sends a mobile browser UA.
 */
class DaoTekno implements Plugin.PluginBase {
  id = 'daotekno';
  name = 'DaoTekno';
  version = '1.0.1';
  icon = 'src/en/daotekno/icon.png';
  site = 'https://daotekno.com/';

  // Browser-like headers (important for Cloudflare-fronted sites, which
  // serve a bot-check page to requests without them). The UA is a mobile
  // Chrome: the site serves chapter pages only to mobile UAs. The
  // sec-ch-ua/sec-fetch-* fields mirror what a Chrome fetch() sends here
  // (Sec-Fetch-Mode: cors is added by fetchApi's default headers).
  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': this.site,
    'sec-ch-ua':
      '"Chromium";v="126", "Not(A:Brand";v="24", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Dest': 'empty',
  };

  // Throw (carrying the HTTP status) on a refused response so a
  // runner-side block is reported INCONCLUSIVE per docs/testing.md
  // instead of being parsed into a false empty-result FAIL.
  private async fetchSite(url: string, init?: FetchInit) {
    const res = await fetchApi(url, init);
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res;
  }

  private parseNovelCards(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];
    $('a.novel-card.novel-item').each((_, el) => {
      const href = $(el).attr('href');
      const name =
        $(el).find('.novel-title').text().trim() ||
        $(el)
          .text()
          .replace(/Index\s*»/g, '')
          .trim();
      if (!href || !name) return;
      novels.push({
        name,
        path: href.replace(/^\//, ''),
        // The listing exposes no covers at all.
        cover: defaultCover,
      });
    });
    return novels;
  }

  private collectChapters(
    $: ReturnType<typeof parseHTML>,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    $('#allChaptersGrid > a.chapter-box').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (!href || !name) return;
      chapters.push({ name, path: href.replace(/^\//, '') });
    });
    return chapters;
  }

  private nextChapterPage($: ReturnType<typeof parseHTML>): string | null {
    const next = $('a.btn-page')
      .filter((_, el) => $(el).text().includes('Next'))
      .attr('href');
    return next ?? null;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const html = await this.fetchSite(`${this.site}?page=${pageNo}`, {
      headers: this.headers,
    }).then(r => r.text());

    // Out-of-range pages are clamped to the last page (?page=11 serves
    // page 10), so compare the requested page against the `N / M` marker
    // to stop pagination instead of returning the same cards forever.
    const marker = parseHTML(html)('span.btn-pagi.active').text();
    const totalPages = parseInt(marker.split('/')[1] ?? '', 10);
    if (Number.isFinite(totalPages) && pageNo > totalPages) {
      return [];
    }

    return this.parseNovelCards(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const firstHtml = await this.fetchSite(this.site + novelPath, {
      headers: this.headers,
    }).then(r => r.text());
    const $first = parseHTML(firstHtml);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $first('h1').first().text().trim() || 'Untitled',
      // The novel page carries no cover, summary, author or status.
      cover: defaultCover,
      chapters: [],
    };

    const chapters = this.collectChapters($first);
    let nextHref = this.nextChapterPage($first);
    let pagesFetched = 1;
    const maxChapterPages = 100;

    while (nextHref && pagesFetched < maxChapterPages) {
      const html = await this.fetchSite(this.site + novelPath + nextHref, {
        headers: this.headers,
      }).then(r => r.text());
      const $ = parseHTML(html);
      chapters.push(...this.collectChapters($));
      nextHref = this.nextChapterPage($);
      pagesFetched++;
    }

    // Every page lists the newest chapter first, and the pages themselves
    // are served newest first, so the concatenation is fully descending.
    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchSite(this.site + chapterPath, {
      headers: this.headers,
    }).then(r => r.text());
    const $ = parseHTML(html);

    const content = $('#novel-content');
    if (content.length === 0) {
      // The site serves a "Mobile Only Content" interstitial (HTTP 200)
      // to desktop UAs instead of the chapter body; treat a page without
      // the content container as a real failure, not empty content.
      throw new Error('Chapter content not found (site served a placeholder)');
    }

    content.find('script, style, .promo').remove();
    return content.html() ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // Search is filtered server-side and served as a single page; the
    // site ignores page parameters on `?q=` requests.
    if (pageNo > 1) {
      return [];
    }

    const html = await this.fetchSite(
      `${this.site}?q=${encodeURIComponent(searchTerm)}`,
      { headers: this.headers },
    ).then(r => r.text());

    return this.parseNovelCards(html);
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new DaoTekno();
