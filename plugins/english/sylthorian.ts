import { load as parseHTML } from 'cheerio';
import { fetchApi, FetchInit } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * The Sylthorian (thesylthorian.com) — English LNReader plugin.
 *
 * thesylthorian.com is the author's own Squarespace storefront. The free web
 * chapters are readable in full; some of the same books are also sold as
 * e-books/paperbacks under `/published-books-portofolio/`, which this plugin
 * intentionally ignores.
 *
 * The site is a hand-built Squarespace 7.1 site, so each section is authored
 * HTML rather than a CMS collection. The shape the plugin relies on:
 *
 * - Listing:      `/web-novels` — one `<h3>` title immediately followed by a
 *                 "Read it!" button linking to `/web-novels-1/<slug>`. All 10
 *                 web novels fit on this single page; no covers are exposed.
 * - Novel page:   `/web-novels-1/<slug>` — title in the first `<h2>`, cover in
 *                 `og:image`, a "Synopsis:" text block, and the full chapter
 *                 list as `/latest-chapters/<slug>-N` links (ascending, no
 *                 pagination — up to ~189 chapters for the largest novel).
 * - Chapter page: `/latest-chapters/<slug>-N` — body HTML inside
 *                 `.blog-item-content.e-content .sqs-html-content`.
 * - Search:       the site's own `/search?q=` page is JS-driven and mostly
 *                 returns chapter hits, burying novel pages behind them, so
 *                 the plugin filters the small `/web-novels` catalogue by
 *                 title instead — deterministic and complete for 10 novels.
 */
class Sylthorian implements Plugin.PluginBase {
  id = 'sylthorian';
  name = 'The Sylthorian';
  version = '1.0.0';
  icon = 'src/en/sylthorian/icon.png';
  site = 'https://thesylthorian.com';

  // Throw (carrying the HTTP status) on a refused response so a runner-side
  // block is reported INCONCLUSIVE per docs/testing.md instead of being
  // parsed into a false empty-result FAIL.
  private async fetchSite(url: string, init?: FetchInit) {
    const res = await fetchApi(url, init);
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res;
  }

  private fetchSiteText(url: string) {
    return this.fetchSite(url).then(res => res.text());
  }

  /** Squarespace serves `og:image` over cleartext `http://`; upgrade it. */
  private toHttps(url?: string) {
    return url ? url.replace(/^http:\/\//, 'https://') : url;
  }

  /**
   * The `/web-novels` page pairs each novel's `<h3>` title with the "Read it!"
   * button that follows it, so walk the two in document order.
   */
  private parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    let lastTitle = '';

    $('h3, a[href^="/web-novels-1/"]').each((_, el) => {
      const node = $(el);
      if (node.is('h3')) {
        lastTitle = node.text().replace(/\s+/g, ' ').trim();
        return;
      }
      const path = node.attr('href');
      if (!path || seen.has(path)) return;
      seen.add(path);
      novels.push({
        name: lastTitle || path.split('/').pop() || path,
        path,
        cover: defaultCover,
      });
      lastTitle = '';
    });

    return novels;
  }

  private parseSummary($: ReturnType<typeof parseHTML>): string | undefined {
    let summary: string | undefined;
    $('.sqs-html-content').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (/^synopsis\b/i.test(text)) {
        summary = text.replace(/^synopsis\s*:?\s*/i, '').trim();
      }
    });
    return summary;
  }

  private parseChapters(
    $: ReturnType<typeof parseHTML>,
    novelPath: string,
  ): Plugin.ChapterItem[] {
    // Chapter slugs reuse the novel slug (`/web-novels-1/<slug>` ->
    // `/latest-chapters/<slug>-N`), so match on that prefix to avoid picking
    // up unrelated chapter links from the page navigation.
    const slug = novelPath.split('/').filter(Boolean).pop() ?? '';
    const prefix = `/latest-chapters/${slug}-`;
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    $(`a[href^="${prefix}"]`).each((_, el) => {
      const node = $(el);
      const path = node.attr('href');
      const name = node.text().replace(/\s+/g, ' ').trim();
      const number = path?.slice(prefix.length).match(/^(\d+)$/);
      if (!path || !name || !number || seen.has(path)) return;
      seen.add(path);

      chapters.push({ name, path, chapterNumber: parseInt(number[1], 10) });
    });

    return chapters;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // All web novels are listed on one page.
    if (pageNo > 1) return [];
    const html = await this.fetchSiteText(this.site + '/web-novels');
    return this.parseNovelList(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchSiteText(this.site + novelPath);
    const $ = parseHTML(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h2').first().text().replace(/\s+/g, ' ').trim() || 'Untitled',
      cover: this.toHttps($('meta[property="og:image"]').attr('content')),
      summary: this.parseSummary($),
      chapters: this.parseChapters($, novelPath),
    };

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchSiteText(this.site + chapterPath);
    const $ = parseHTML(html);

    const node = $('.blog-item-content.e-content .sqs-html-content').first();
    if (!node.length) {
      // A page without the post body is a real failure, not empty content.
      throw new Error('Chapter content not found');
    }

    node.find('script, style').remove();
    return node.html() ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const novels = this.parseNovelList(
      await this.fetchSiteText(this.site + '/web-novels'),
    );
    const term = searchTerm.trim().toLowerCase();
    if (!term) return novels;
    return novels.filter(novel => novel.name.toLowerCase().includes(term));
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new Sylthorian();
