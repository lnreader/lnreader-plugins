import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SERIES_PREFIX = '/series/';
// The listing cuts every title to this many characters and appends "...".
const LISTING_TITLE_LIMIT = 40;

// The site randomises its class names on every request (and sprinkles hidden
// decoy paragraphs through the pages), so the parsers below rely on URL shapes
// and page structure instead of class names wherever they can.
class ReadingPiaPlugin implements Plugin.PluginBase {
  id = 'readingpia';
  name = 'ReadingPia';
  icon = 'src/en/readingpia/icon.png';
  site = 'https://www.readingpia.me';
  version = '1.0.0';

  filters = {
    sort: {
      label: 'Sort by',
      type: FilterTypes.Picker,
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Recent', value: 'recent' },
        { label: 'Chapters', value: 'chaptes' },
        { label: 'Views', value: 'views' },
      ],
    },
    order: {
      label: 'Order',
      type: FilterTypes.Picker,
      value: 'desc',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
    },
    status: {
      label: 'Status',
      type: FilterTypes.Picker,
      value: 'all',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
    },
    genres: {
      label: 'Genres',
      type: FilterTypes.CheckboxGroup,
      value: [] as string[],
      options: [
        { label: 'Academy', value: '1' },
        { label: 'Harem', value: '2' },
        { label: 'Fantasy', value: '3' },
        { label: 'Romance', value: '4' },
        { label: 'Transmigration', value: '5' },
        { label: 'Reincarnation', value: '6' },
        { label: 'Action', value: '7' },
        { label: 'Comedy', value: '8' },
        { label: 'Drama', value: '9' },
        { label: 'Regression', value: '10' },
        { label: 'Revenge', value: '11' },
        { label: 'Mystery', value: '12' },
        { label: 'Sci-fi', value: '13' },
        { label: 'Slice of Life', value: '14' },
        { label: 'Supernatural', value: '15' },
        { label: 'Martial Arts', value: '16' },
        { label: 'Wuxia', value: '17' },
        { label: 'Shounen', value: '18' },
      ],
    },
  } satisfies Filters;

  private async getHtml(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`ReadingPia: HTTP ${response.status} for ${url}`);
    }
    return response.text();
  }

  private clean(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private fullNames = new Map<string, string>();

  /**
   * The listing shortens long titles ("The Third-Rate Martial Arts Family
   * Becom..."), so the series page supplies the real name when needed.
   */
  private async fullName(path: string, listed: string) {
    const name = listed.replace(/\.{3}$/, '').trim();
    if (name.length < LISTING_TITLE_LIMIT) return name;
    const known = this.fullNames.get(path);
    if (known) return known;
    try {
      const $ = loadCheerio(await this.getHtml(this.site + path));
      const title = this.clean($('.novel-title').first().text());
      if (title) {
        this.fullNames.set(path, title);
        return title;
      }
    } catch {
      // Keep the shortened title; the novel itself still opens.
    }
    return name;
  }

  private absolute(src: string | undefined) {
    return src ? new URL(src, this.site).href : defaultCover;
  }

  private async listNovels(
    pageNo: number,
    params: {
      search: string;
      sort: string;
      order: string;
      status: string;
      genres: string[];
    },
  ): Promise<Plugin.NovelItem[]> {
    const query = [
      `search=${encodeURIComponent(params.search)}`,
      `sort=${params.sort}`,
      `order_by=${params.order}`,
      `status=${params.status}`,
      ...params.genres.map(id => `genres[]=${encodeURIComponent(id)}`),
      `page=${pageNo}`,
    ].join('&');
    const $ = loadCheerio(await this.getHtml(`${this.site}/series?${query}`));

    const listed: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('.chapter-collection a[href]').each((_, el) => {
      const link = $(el);
      const path = new URL(link.attr('href') || '', this.site).pathname;
      if (!path.startsWith(SERIES_PREFIX) || seen.has(path)) return;
      const name = this.clean(link.find('.chapter-novel-title').text());
      if (!name) return;
      seen.add(path);
      listed.push({
        name,
        path,
        cover: this.absolute(link.find('img').attr('src')),
      });
    });
    return Promise.all(
      listed.map(async novel => ({
        ...novel,
        name: await this.fullName(novel.path, novel.name),
      })),
    );
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    return this.listNovels(pageNo, {
      search: '',
      sort: showLatestNovels ? 'recent' : filters.sort.value,
      order: filters.order.value,
      status: filters.status.value,
      genres: filters.genres.value,
    });
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.listNovels(pageNo, {
      search: searchTerm.trim(),
      sort: 'popular',
      order: 'desc',
      status: 'all',
      genres: [],
    });
  }

  /** The synopsis is injected by a script as a template literal. */
  private parseSynopsis(html: string) {
    const match = /fullSynopsis\s*=\s*`([\s\S]*?)`\s*;/.exec(html);
    if (!match) return undefined;
    const raw = match[1].replace(/\\(.)/g, '$1');
    const $ = loadCheerio(`<div>${raw}</div>`);
    const paragraphs = $('p')
      .toArray()
      .map(p => this.clean($(p).text()))
      .filter(Boolean);
    const text = paragraphs.length
      ? paragraphs.join('\n\n')
      : this.clean($('div').text());
    return text || undefined;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await this.getHtml(this.site + novelPath);
    const $ = loadCheerio(html);
    const slug = novelPath.slice(SERIES_PREFIX.length).replace(/\/+$/, '');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: this.clean($('.novel-title').first().text()) || 'Untitled',
      cover: this.absolute($('.novel-cover img').first().attr('src')),
    };

    const author = this.clean($('.novel-info .text-secondary').first().text())
      .replace(/^by\s+/i, '')
      .trim();
    if (author) novel.author = author;

    const statusText = this.clean(
      $('.novel-info .badge').first().text(),
    ).toLowerCase();
    if (statusText === 'ongoing') novel.status = NovelStatus.Ongoing;
    else if (statusText === 'completed') novel.status = NovelStatus.Completed;
    else if (statusText === 'hiatus') novel.status = NovelStatus.OnHiatus;
    else novel.status = NovelStatus.Unknown;

    const genres = $('.novel-tags a[href]')
      .toArray()
      .map(a => this.clean($(a).text()))
      .filter(Boolean);
    if (genres.length) novel.genres = Array.from(new Set(genres)).join(', ');

    const summary = this.parseSynopsis(html);
    if (summary) novel.summary = summary;

    // Chapter links look like /<slug>-chapter-<n>; the page lists every
    // chapter (newest first) and repeats the first and latest in buttons.
    const chapterPath = new RegExp(`^/${slug}-chapter-(\\d+)$`);
    const chapters = new Map<string, Plugin.ChapterItem>();
    $('a[href]').each((_, el) => {
      const link = $(el);
      const path = new URL(link.attr('href') || '', this.site).pathname;
      const match = chapterPath.exec(path);
      if (!match || chapters.has(path)) return;
      const chapterNumber = Number(match[1]);
      const label = this.clean(link.find('span').first().text());
      if (!/^chapter\s+\d+/i.test(label)) return;
      chapters.set(path, { name: label, path, chapterNumber });
    });
    novel.chapters = Array.from(chapters.values()).sort(
      (a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0),
    );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(await this.getHtml(this.site + chapterPath));

    // Hidden decoy paragraphs, ads and promo blocks surround the real text.
    $('script, style, noscript, ins, iframe').remove();
    $('[style*="display:none"], [style*="display: none"]').remove();
    $(
      '.advertisement, .advertisement_warpper, .novel-promo-card, .promo-container, .comments',
    ).remove();

    const container = $('main > div')
      .toArray()
      .map(el => $(el))
      .sort((a, b) => b.find('p').length - a.find('p').length)[0];
    if (!container || !container.find('p').length) {
      throw new Error('ReadingPia: chapter text not found');
    }
    // Links left empty once their promo card was removed.
    container.find('a').each((_, el) => {
      if (!this.clean($(el).text())) $(el).remove();
    });
    return container.html() || '';
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new ReadingPiaPlugin();
