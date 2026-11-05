import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { Filters, FilterTypes } from '@libs/filterInputs';

/**
 * Drop markup that would execute instead of display, keeping everything else
 * as the site sent it. Mirrors the epub exporter (src/lib/epub.ts) so a
 * chapter reads the same in the app as it does in an exported file.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<(\w+)([^>]*?)\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '<$1$2')
    .replace(/javascript\s*:/gi, '');
}

/**
 * Azora Manga.
 *
 * The site used to run Madara (WP Reader) at azoramoon.com, but it has since
 * moved to azorafly.com and rebuilt on Astro. Listing, series detail and
 * chapter text are all server-rendered, so they can be scraped directly.
 *
 * Two limits are worth knowing about:
 *  - a series page lists the newest 20 chapters plus chapter 1 as a
 *    "featured" link, so a long novel's middle chapters need a page the
 *    plugin does not have;
 *  - the listing pages carry no pagination, so both popularNovels and
 *    searchNovels return the first page only.
 */
class AzoraFly implements Plugin.PluginBase {
  id = 'azorafly';
  name = 'Azora Manga';
  version = '1.0.0';
  icon = 'src/ar/azorafly/icon.png';
  site = 'https://azorafly.com/';

  filters = {
    sort: {
      label: 'Sort By',
      value: 'novels',
      options: [
        { label: 'Novels', value: 'novels' },
        { label: 'Manga', value: 'comics' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private baseUrl = 'https://azorafly.com';

  /**
   * The two catalogues. They are separate routes — the comics listing is at
   * /comics, not /mangas, which is a 404 that answers with a normal-looking
   * page and so reads as "this site has no comics" rather than as an error.
   */
  private readonly catalogs = {
    novels: '/novels',
    manga: '/comics',
  } as const;

  /**
   * The site sits behind Cloudflare, which answers plain HTTP clients with a
   * 403 challenge page. The shared multisrc templates point users at the
   * app's webview in that case, because a real browser passes the challenge
   * and the plugin's own request never will — so the message has to name the
   * way out rather than dead-end on a bare status code.
   */
  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(
        `Could not reach site (${res.status}) try to open in webview.`,
      );
    }
    return res.text();
  }

  /**
   * Every listing card links to /series/<slug> and carries the title in the
   * anchor's title attribute; the cover is the first <img> inside it.
   */
  private parseCards(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a[href^="/series/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const slug = href.replace('/series/', '').replace(/\/$/, '');
      // Skip the deeper /series/<slug>/chapter-<n> links that share the prefix.
      if (!slug || slug.includes('/')) return;
      if (seen.has(slug)) return;

      const name =
        $el.attr('title')?.trim() ||
        $el.find('img').first().attr('alt')?.trim();
      if (!name) return;

      seen.add(slug);
      novels.push({
        name,
        path: `/series/${slug}`,
        cover: $el.find('img').first().attr('src') || undefined,
      });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // `?page=` is accepted but ignored by the site, so there is only one page
    // of results to hand back. Returning [] past the first page is what tells
    // the browse list there is nothing more to load.
    if (pageNo > 1) {
      return [];
    }

    void showLatestNovels;

    const html = await this.fetchHtml(
      `${this.baseUrl}/${
        filters.sort.value === 'manga'
          ? this.catalogs.manga
          : this.catalogs.novels
      }`,
    );
    return this.parseCards(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.fetchHtml(`${this.baseUrl}${novelPath}`);
    const $ = loadCheerio(html);

    // The page leads with a row of info tiles (status/type/chapters/updated)
    // whose labels are <h1>; the work's own title is the last <h1> on the page.
    const headings = $('h1')
      .toArray()
      .map(el => $(el).text().trim())
      .filter(Boolean);
    const name = headings[headings.length - 1] || novelPath;

    const cover =
      $('img[src*="/upload/series/"]').first().attr('src') ||
      $('img[alt*="Cover"]').first().attr('src');

    // Each info tile is an Arabic label in an <h1> with the value beside it.
    // The status value is the English ONGOING/COMPLETED the site renders, not
    // an Arabic word, so read the tile rather than searching the page text.
    const tileValue = (label: string) => {
      const heading = $('h1')
        .toArray()
        .find(el => $(el).text().trim() === label);
      if (!heading) return '';
      const tile = $(heading).closest('div').text().replace(/\s+/g, ' ').trim();
      return tile.slice(label.length).trim();
    };

    const statusValue = tileValue('الحالة');
    const statusMap: Record<string, NovelStatus> = {
      COMPLETED: NovelStatus.Completed,
      ONGOING: NovelStatus.Ongoing,
      HIATUS: NovelStatus.OnHiatus,
      CANCELLED: NovelStatus.Cancelled,
    };
    const statusKey = Object.keys(statusMap).find(k =>
      statusValue.toUpperCase().includes(k),
    );

    // The genre pills link to /series?genres=%2B<n> — an id, not a name, so
    // there is no slug to read. The label is the pill's own text.
    const genres = [
      ...new Set(
        $('a[href^="/series?genres="]')
          .toArray()
          .map(el => $(el).text().replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      ),
    ];

    // The synopsis is not in the body markup — the page has no <p> holding
    // it. It is published as the page's description, wrapped in <p> and cut
    // to 200 characters, so strip the tags and keep what survived the cut.
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
    const summary = loadCheerio(`<div>${description}</div>`)('div')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    $(`a[href^="${novelPath}/chapter-"]`).each((_, el) => {
      const href = $(el).attr('href') || '';
      if (seen.has(href)) return;
      seen.add(href);

      const number = Number(href.match(/chapter-(\d+)/)?.[1] ?? 0);
      chapters.push({
        name:
          $(el).text().trim().replace(/\s+/g, ' ') ||
          $(el).attr('title')?.trim() ||
          `Chapter ${number}`,
        path: href,
        chapterNumber: number,
      });
    });
    chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

    return {
      path: novelPath,
      name,
      cover,
      author: 'Unknown',
      genres: genres.join(', '),
      summary,
      status: statusKey ? statusMap[statusKey] : NovelStatus.Unknown,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(`${this.baseUrl}${chapterPath}`);
    const $ = loadCheerio(html);

    const content = $('.novel-reader-content').first();
    if (!content.length) {
      // The site answers a locked chapter with 200 and a page that has the
      // reader's chrome but no prose, so this is the paywall rather than a
      // broken selector. Locked chapters are rare — none of the first twelve
      // novels in /novels had one — but the reader should be told which it
      // is, and the page shows the paywall, not the text.
      throw new Error(
        'This chapter is not available on the site (locked). Open the chapter in the webview to read it.',
      );
    }

    // The block also holds the reader's own promo/notice paragraphs; the prose
    // is the run of <p> that follows them.
    const paragraphs = content
      .find('p')
      .toArray()
      .map(el => $(el).html() || '')
      .map(html => html.trim())
      .filter(html => html.length > 0);

    // The reader renders chapter text as HTML, so a response carrying a script
    // or style block inside a paragraph would execute rather than display.
    // Strip those before the text leaves the plugin, the same way the epub
    // exporter does (src/lib/epub.ts).
    return sanitizeHtml(paragraphs.join('\n') || content.html()?.trim() || '');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's ?s= is not wired to the series catalogue, so match against
    // the listing pages themselves. Manga are searchable too, otherwise a
    // title browsable under the Manga filter could never be found.
    if (pageNo > 1) {
      return [];
    }

    const term = searchTerm.toLowerCase();
    const match = (html: string) =>
      this.parseCards(html).filter(novel =>
        novel.name.toLowerCase().includes(term),
      );

    // Novels first, so search still answers if the comics listing is the half
    // that is down; a failed half is skipped rather than failing the query.
    const results = await match(
      await this.fetchHtml(`${this.baseUrl}${this.catalogs.novels}`),
    );

    try {
      results.push(
        ...match(await this.fetchHtml(`${this.baseUrl}${this.catalogs.manga}`)),
      );
    } catch {
      // comics listing unavailable — search the novels alone
    }

    return results;
  }
}

export default new AzoraFly();
