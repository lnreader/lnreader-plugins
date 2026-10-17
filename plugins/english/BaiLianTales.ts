import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

/**
 * BaiLianTales moved from the Madara theme to its own "jormuntl" WordPress
 * theme, so it no longer fits the madara multisrc template.
 *
 * - Listing:      `/novel/page/<n>/?orderby=…&status=…&genre[]=…`, cards are
 *                 `article.novel-card`.
 * - Search:       `/page/<n>/?s=<term>`, results in `#jt-search-results`.
 * - Novel page:   `/novel/<slug>/`. The table of contents shows 50 chapters
 *                 per page; further pages are plain links (`?toc_page=<n>`).
 * - Chapter page: `/novel/<slug>/<chapter-slug>/`, text in
 *                 `.chapter-content`. Premium chapters render a login overlay
 *                 instead, so they are listed as locked (🔒) and can be hidden
 *                 with the "Hide locked chapters" setting.
 */
class BaiLianTales implements Plugin.PluginBase {
  id = 'bailiantales';
  name = 'BaiLianTales';
  version = '2.3.0';
  icon = 'src/en/bailiantales/icon.png';
  site = 'https://bailiantales.com/';

  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  private async fetchPage(url: string): Promise<CheerioAPI | undefined> {
    const res = await fetchApi(url);
    // Paging past the last listing or search page is a 404, not an error.
    if (res.status === 404) return undefined;
    // Throw (carrying the HTTP status) so a runner-side block is reported
    // INCONCLUSIVE per docs/testing.md instead of an empty-result FAIL.
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return parseHTML(await res.text());
  }

  private toPath(href: string | undefined): string | undefined {
    if (!href?.startsWith(this.site)) return undefined;
    return href.slice(this.site.length);
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = [
      'orderby=' + (showLatestNovels ? 'updated' : filters.sort.value),
    ];
    if (filters.status.value) params.push('status=' + filters.status.value);
    for (const genre of filters.genres.value) {
      params.push('genre[]=' + genre);
    }

    const $ = await this.fetchPage(
      this.site + 'novel/page/' + pageNo + '/?' + params.join('&'),
    );
    if (!$) return [];

    const novels: Plugin.NovelItem[] = [];
    $('article.novel-card').each((_, el) => {
      const link = $(el).find('h3 a');
      const path = this.toPath(link.attr('href'));
      if (!path) return;
      novels.push({
        name: link.text().trim(),
        path,
        cover: $(el).find('img').attr('src') || defaultCover,
      });
    });
    return novels;
  }

  private parseChapters($: CheerioAPI): Plugin.ChapterItem[] {
    const hideLocked = storage.get('hideLocked');
    const chapters: Plugin.ChapterItem[] = [];
    $('#novel-toc .chapter-item-improved').each((_, el) => {
      const path = this.toPath($(el).find('a').first().attr('href'));
      if (!path) return;
      const locked = $(el).find('[data-jt-unlock]').length > 0;
      if (locked && hideLocked) return;
      const name = $(el).find('.jt-toc-title').text().trim();
      chapters.push({
        name: locked ? `🔒 ${name}` : name,
        path,
        releaseTime: $(el).find('.jt-toc-date').text().trim() || undefined,
      });
    });
    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.fetchPage(this.site + novelPath);
    if (!$) throw new Error('Novel not found');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.jt-novel-details h1').text().trim() || 'Untitled',
      cover: $('.novel-hero img.wp-post-image').attr('src') || defaultCover,
      summary: $('.jt-hero-synopsis p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(line => line && !/^synopsis:?$/i.test(line))
        .join('\n\n'),
      genres: $('.jt-novel-details a.genre-tag')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
    };

    switch ($('.jt-novel-details .status-badge').text().trim().toLowerCase()) {
      case 'ongoing':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'completed':
        novel.status = NovelStatus.Completed;
        break;
      case 'hiatus':
        novel.status = NovelStatus.OnHiatus;
        break;
    }

    const chapters = this.parseChapters($);
    const tocPages = $('#novel-toc .jt-page-jump option').length;
    for (let page = 2; page <= tocPages; page++) {
      const toc = await this.fetchPage(
        this.site + novelPath + '?toc_page=' + page,
      );
      if (toc) chapters.push(...this.parseChapters(toc));
    }
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.fetchPage(this.site + chapterPath);
    if (!$) throw new Error('Chapter not found');
    if ($('.locked-chapter-overlay').length) {
      throw new Error(
        'This chapter is locked. Unlock it on BaiLianTales to read it.',
      );
    }
    const content = $('.chapter-content').first();
    if (!content.length) throw new Error('Could not find the chapter text.');

    // Strip the hidden anti-copy watermarks (spans and HTML comments) the
    // site sprinkles through the text ("[bailiantales.com]", …).
    content
      .find(
        'script, style, .sr-only, .watermark-hidden, [data-watermark], [aria-hidden="true"]',
      )
      .remove();
    content.find('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      if (/display\s*:\s*none|font-size\s*:\s*0(?![.\d])/i.test(style)) {
        $(el).remove();
      }
    });
    content
      .find('*')
      .addBack()
      .contents()
      .filter((_, node) => node.type === 'comment')
      .remove();
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const $ = await this.fetchPage(
      this.site +
        'page/' +
        pageNo +
        '/?s=' +
        encodeURIComponent(searchTerm.trim()),
    );
    if (!$) return [];

    const novels: Plugin.NovelItem[] = [];
    $('#jt-search-results article').each((_, el) => {
      const link = $(el).find('h3 a');
      const path = this.toPath(link.attr('href'));
      // Only novel pages (`novel/<slug>/`), not chapters or other posts.
      if (!path || !/^novel\/[^/]+\/$/.test(path)) return;
      novels.push({
        name: link.text().trim(),
        path,
        cover: $(el).find('img').attr('src') || defaultCover,
      });
    });
    return novels;
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    sort: {
      label: 'Sort By',
      value: 'date',
      options: [
        { label: 'Recently Added', value: 'date' },
        { label: 'Recently Updated', value: 'updated' },
        // Only novels that have been rated are listed.
        { label: 'Highest Rated', value: 'rating' },
        { label: 'Most Chapters', value: 'chapters' },
        { label: 'A-Z', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: [],
      options: [
        { label: 'ABO', value: 'abo' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'BL', value: 'bl' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Modern Day', value: 'modern-day' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Transmigration', value: 'transmigration' },
        { label: 'Virtual Reality', value: 'virtual-reality' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new BaiLianTales();
