import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { Filters, FilterTypes } from '@libs/filterInputs';

/**
 * Azora Manga.
 *
 * The site used to run Madara (WP Reader) at azoramoon.com, but it has since
 * moved to azorafly.com and rebuilt on Astro. Listing, series detail and
 * chapter text are all server-rendered, so they can be scraped directly.
 *
 * Two limits are worth knowing about:
 *  - the chapter list on a series page only carries the newest 20 chapters
 *    plus a "featured" one, so novels are listed newest-first;
 *  - `/novels` has no pages, and `?page=` is ignored, so paging is client-side
 *    and popularNovels returns the first page only.
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
        { label: 'Manga', value: 'manga' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private baseUrl = 'https://azorafly.com';

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
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
    // of results to hand back.
    void pageNo;
    void showLatestNovels;

    const html = await this.fetchHtml(
      `${this.baseUrl}/${filters.sort.value === 'manga' ? 'mangas' : 'novels'}`,
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

    const pageText = $('body').text().replace(/\s+/g, ' ');

    const labelFor = (label: string) => {
      const i = pageText.indexOf(label);
      if (i < 0) return '';
      return pageText.slice(i + label.length, i + label.length + 40).trim();
    };

    const status = labelFor('الحالة');
    const statusMap: Record<string, string> = {
      مكتملة: NovelStatus.Completed,
      مستمرة: NovelStatus.Ongoing,
      متوقفة: NovelStatus.OnHiatus,
      ملغاة: NovelStatus.Cancelled,
    };
    const statusText = Object.keys(statusMap).find(k => status.includes(k));

    const genres = [
      ...new Set(
        [...html.matchAll(/href="\/(?:genre|tag)\/([^"]+)"/g)].map(m =>
          decodeURIComponent(m[1]).replace(/-/g, ' '),
        ),
      ),
    ];

    // The summary is the long <p> in the main column, before the chapter list.
    const summary = $('section p')
      .toArray()
      .map(el => $(el).text().trim())
      .filter(t => t.length > 60)
      .sort((a, b) => b.length - a.length)[0];

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
      summary: summary || '',
      status: statusText ? statusMap[statusText] : NovelStatus.Unknown,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(`${this.baseUrl}${chapterPath}`);
    const $ = loadCheerio(html);

    const content = $('.novel-reader-content').first();
    if (!content.length) {
      throw new Error('Could not find the chapter text on the page');
    }

    // The block also holds the reader's own promo/notice paragraphs; the prose
    // is the run of <p> that follows them.
    const paragraphs = content
      .find('p')
      .toArray()
      .map(el => $(el).html() || '')
      .map(html => html.trim())
      .filter(html => html.length > 0);

    return paragraphs.join('\n') || content.html()?.trim() || '';
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    // The site's ?s= is not wired to the series catalogue, so match against
    // what the listing page itself offers.
    const html = await this.fetchHtml(`${this.baseUrl}/novels`);
    const term = searchTerm.toLowerCase();

    return this.parseCards(html).filter(novel =>
      novel.name.toLowerCase().includes(term),
    );
  }
}

export default new AzoraFly();
