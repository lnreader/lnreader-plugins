import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';

class LightNovelWorldPlugin implements Plugin.PluginBase {
  id = 'lightnovelworld';
  name = 'LightNovelWorld';
  icon = 'src/en/lightnovelworld/icon.png';
  site = 'https://www.lightnovelworld.org';
  version = '1.0.0';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: 'https://www.lightnovelworld.org',
    },
  };

  filters = {
    order: {
      label: 'Sort By',
      options: [
        { label: 'Popular', value: '' },
        { label: 'Latest Updates', value: '?orderby=updatedtime' },
        { label: 'New Novels', value: '?orderby=releasetime' },
        { label: 'Rating', value: '?orderby=rating' },
      ],
      type: FilterTypes.Picker,
      value: '',
    },
    status: {
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
      value: '',
    },
  } satisfies Filters;

  // ─── Popular / Browse ──────────────────────────────────────────────────────

  async popularNovels(
    page: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { showLatestNovels, filters } = options;

    let url: string;

    if (showLatestNovels) {
      // "Latest" tab
      url = `${this.site}/latest-updates-04061612?page=${page}`;
    } else {
      const statusSegment = filters.status.value
        ? `/${filters.status.value}`
        : '';
      const orderQuery = filters.order.value || '';
      url = `${this.site}/novel-list${statusSegment}${orderQuery}&page=${page}`;
    }

    const result = await fetchApi(url);
    const body = await result.text();
    const $ = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    // Novel cards appear in different containers depending on the page
    $('li.novel-item, div.novel-item').each((_, el) => {
      const anchor = $(el).find('a.novel-cover, a').first();
      const imgEl = $(el).find('img');
      const titleEl = $(el).find('.novel-title, h4, h3').first();

      const novelUrl = anchor.attr('href') || '';
      const name = titleEl.text().trim() || anchor.attr('title') || '';
      const cover = imgEl.attr('data-src') || imgEl.attr('src') || defaultCover;

      if (name && novelUrl) {
        novels.push({
          name,
          url: novelUrl.startsWith('http')
            ? novelUrl
            : `${this.site}${novelUrl}`,
          cover,
        });
      }
    });

    return novels;
  }

  // ─── Novel Details + Chapter List ─────────────────────────────────────────

  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(novelUrl);
    const body = await result.text();
    const $ = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      url: novelUrl,
      name:
        $('h1.novel-title').text().trim() ||
        $('h1').first().text().trim() ||
        '',
      cover:
        $('.cover-wrap img, .novel-cover img').attr('data-src') ||
        $('.cover-wrap img, .novel-cover img').attr('src') ||
        defaultCover,
      author:
        $('.author a, span[itemprop="author"]').text().trim() || 'Unknown',
      genres: $('.categories a, .genre-item')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
      summary: $('.summary, .description, #info .content')
        .text()
        .trim(),
      status: this.parseStatus($('.novel-status, .status').text()),
    };

    // ── Chapter list (paginated) ──────────────────────────────────────────
    const chapters: Plugin.ChapterItem[] = [];

    // Determine how many chapter pages there are
    const lastPageHref = $('ul.pagination a:last-child, .pagination .last')
      .attr('href');
    let totalPages = 1;
    if (lastPageHref) {
      const match = lastPageHref.match(/page=(\d+)/);
      if (match) totalPages = parseInt(match[1], 10);
    }

    for (let p = 1; p <= totalPages; p++) {
      const chapUrl = `${novelUrl}?tab=chapters&page=${p}&chorder=asc`;
      const chapRes = await fetchApi(chapUrl);
      const chapBody = await chapRes.text();
      const $c = parseHTML(chapBody);

      $c('ul#chapterlist li, ul.chapter-list li').each((_, el) => {
        const a = $c(el).find('a');
        const href = a.attr('href') || '';
        const chName =
          a.find('.chapter-title').text().trim() ||
          a.attr('title') ||
          a.text().trim();
        const releaseTime =
          $c(el).find('.chapter-update, time').attr('datetime') ||
          $c(el).find('.chapter-update, time').text().trim() ||
          '';
        const numMatch = chName.match(/chapter\s*([\d.]+)/i);
        const chapterNumber = numMatch ? parseFloat(numMatch[1]) : 0;

        if (href && chName) {
          chapters.push({
            name: chName,
            url: href.startsWith('http') ? href : `${this.site}${href}`,
            releaseTime,
            chapterNumber,
          });
        }
      });
    }

    novel.chapters = chapters;
    return novel;
  }

  // ─── Chapter Content ───────────────────────────────────────────────────────

  async parseChapter(chapterUrl: string): Promise<string> {
    const result = await fetchApi(chapterUrl);
    const body = await result.text();
    const $ = parseHTML(body);

    // Remove ads / navigation clutter
    $(
      '.ad, .ads, .adsense, #patreon-adsense, .chapter-nav, .chapter-warning, script',
    ).remove();

    const content =
      $('#chapter-container, .chapter-content, .text-left').first().html() ||
      '';

    return content;
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/search?keywords=${encodeURIComponent(searchTerm)}&page=${pageNo}`;

    const result = await fetchApi(url);
    const body = await result.text();
    const $ = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    $('li.novel-item, div.novel-item').each((_, el) => {
      const anchor = $(el).find('a').first();
      const imgEl = $(el).find('img');
      const titleEl = $(el).find('.novel-title, h4, h3').first();

      const novelUrl = anchor.attr('href') || '';
      const name = titleEl.text().trim() || anchor.attr('title') || '';
      const cover = imgEl.attr('data-src') || imgEl.attr('src') || defaultCover;

      if (name && novelUrl) {
        novels.push({
          name,
          url: novelUrl.startsWith('http')
            ? novelUrl
            : `${this.site}${novelUrl}`,
          cover,
        });
      }
    });

    return novels;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private parseStatus(raw: string): string {
    const s = raw.toLowerCase();
    if (s.includes('ongoing')) return NovelStatus.Ongoing;
    if (s.includes('completed')) return NovelStatus.Completed;
    if (s.includes('hiatus')) return NovelStatus.OnHiatus;
    return NovelStatus.Unknown;
  }
}

export default new LightNovelWorldPlugin();
