import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

type IndraChapter = {
  num?: number | string;
  vip?: number | string;
  title?: string;
  date?: string;
  link?: string;
};

class IndraTranslations implements Plugin.PluginBase {
  id = 'indratranslations';
  name = 'Indra Translations';
  site = 'https://indratranslations.com';
  version = '1.3.0';
  icon = 'src/en/indratranslations/icon.png';

  // Browser-like headers (important for Cloudflare-y sites)
  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    Referer: this.site,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url, { headers: this.headers });
    return await res.text();
  }

  private absolute(url?: string): string | undefined {
    if (!url) return undefined;
    const u = String(url).trim();
    if (!u) return undefined;
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return this.site + u;
    return this.site + '/' + u;
  }

  private relative(url: string): string {
    return url.replace(
      /^https?:\/\/(www\.)?indratranslations\.com(?=[/?#]|$)/,
      '',
    );
  }

  private clean(text: unknown): string {
    return String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private chapterNum(name: string): number {
    const m = String(name).match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : 0;
  }

  /**
   * The series listing renders each novel as a clickable div
   * (`onclick="location.href='…'"`) rather than an anchor.
   */
  private parseNovelCards($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $('.series-grid .series-card').each((_, el) => {
      const card = $(el);
      const href =
        (card.attr('onclick') || '').match(
          /location\.href\s*=\s*'([^']+)'/,
        )?.[1] || card.find('a[href]').first().attr('href');
      if (!href) return;

      const name =
        this.clean(card.find('.series-card-title').attr('title')) ||
        this.clean(card.find('.series-card-title').text()) ||
        this.clean(card.find('img').attr('alt'));
      if (!name) return;

      const img = card.find('.series-card-cover img');
      const cover = this.absolute(
        img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src'),
      );

      novels.push({
        name,
        path: this.relative(href),
        cover: cover || defaultCover,
      });
    });

    return novels;
  }

  private seriesUrl(pageNo: number, params: Record<string, string>): string {
    const query = Object.keys(params)
      .filter(key => params[key])
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
    const base =
      pageNo > 1
        ? `${this.site}/series/page/${pageNo}/`
        : `${this.site}/series/`;
    return query ? `${base}?${query}` : base;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.seriesUrl(pageNo, {
      orderby: showLatestNovels ? 'update' : filters.orderby.value,
      genre: filters.genre.value,
      status: filters.status.value,
      type: filters.type.value,
    });
    const $ = load(await this.fetchHtml(url));
    return this.parseNovelCards($);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.seriesUrl(pageNo, { keyword: searchTerm });
    const $ = load(await this.fetchHtml(url));
    return this.parseNovelCards($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // Novels used to live under /series/<slug>/; that URL now redirects to
    // the first chapter, so map old library entries to /<slug>/.
    const sitePath = this.relative(novelPath).replace(
      /^\/series\/([^/?#]+)\/?(?:[?#].*)?$/,
      '/$1/',
    );
    const url = sitePath.startsWith('http') ? sitePath : this.site + sitePath;
    const html = await this.fetchHtml(url);
    const $ = load(html);

    const name =
      this.clean($('h1.story-main-title').text()) ||
      this.clean($('h1').first().text()) ||
      'Untitled';

    const img = $('.story-cover-card img').first();
    const cover =
      this.absolute(
        img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src'),
      ) || defaultCover;

    const summary = $('#story-synopsis p')
      .map((_, el) => this.clean($(el).text()))
      .get()
      .filter(Boolean)
      .join('\n\n');

    const genres = $('.story-meta-list a[href*="/series-genre/"]')
      .map((_, el) => this.clean($(el).text()))
      .get()
      .join(', ');

    const statusText = this.clean(
      $('.story-meta-list a[href*="/trang-thai/"]').first().text(),
    ).toLowerCase();
    let status: string = NovelStatus.Unknown;
    if (statusText.includes('complete')) status = NovelStatus.Completed;
    else if (statusText.includes('ongoing')) status = NovelStatus.Ongoing;
    else if (statusText.includes('drop')) status = NovelStatus.Cancelled;
    else if (statusText.includes('hiatus')) status = NovelStatus.OnHiatus;

    return {
      name,
      path:
        novelPath.endsWith('/') || /[?#]/.test(novelPath)
          ? novelPath
          : novelPath + '/',
      cover,
      summary: summary || this.clean($('#story-synopsis').text()) || undefined,
      genres: genres || undefined,
      status,
      chapters: this.parseChapterList($, html),
    };
  }

  /**
   * The page only renders the newest 100 chapters; the complete list
   * (oldest first) is embedded as the `TD_Story_Chapters` JSON array.
   */
  private parseChapterList($: CheerioAPI, html: string): Plugin.ChapterItem[] {
    const json = html.match(/TD_Story_Chapters\s*=\s*(\[.*\]);/)?.[1];
    if (json) {
      try {
        const list: IndraChapter[] = JSON.parse(json);
        return list
          .filter(chap => chap.link)
          .map(chap => {
            const title = this.clean(chap.title);
            return {
              name: (Number(chap.vip) === 1 ? '🔒 ' : '') + title,
              path: this.relative(String(chap.link)),
              releaseTime: chap.date || undefined,
              chapterNumber: Number(chap.num) || this.chapterNum(title),
            };
          });
      } catch {
        // fall back to the rendered list below
      }
    }

    const chapters: Plugin.ChapterItem[] = [];
    $('#chapter-list-container .chapter-item-wrapper a[href]').each((_, el) => {
      const name = this.clean($(el).find('.text-truncate').first().text());
      chapters.push({
        name: ($(el).find('.chap-price-badge').length ? '🔒 ' : '') + name,
        path: this.relative($(el).attr('href') || ''),
        chapterNumber: this.chapterNum(name),
      });
    });
    return chapters.reverse();
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = chapterPath.startsWith('http')
      ? chapterPath
      : this.site + chapterPath;
    const $ = load(await this.fetchHtml(url));

    const content = $('#chapter-content-text').first().length
      ? $('#chapter-content-text').first()
      : $('.chapter-content').first();

    if (!content.length) {
      return `\nUnable to load chapter content.\n\n`;
    }

    // Anti-scraping decoys that the site only hides with CSS.
    content
      .find(
        'script, style, ins, iframe, noscript, .td-copy-honeypot, .td-ad-container, ' +
          '.td-s-noise, .td-s-para-noise, .td-hidden-watermark, .td-canary-trap',
      )
      .remove();

    // Paragraphs are shuffled in the markup and put back in place with the
    // CSS `order` property; restore their reading order from `data-order`.
    const flow = content.find('.td-reading-flow').first();
    if (flow.length) {
      const paragraphs = flow
        .children()
        .toArray()
        .map((el, index) => ({
          el,
          index,
          order: parseFloat($(el).attr('data-order') || '') || 0,
        }))
        .sort((a, b) => a.order - b.order || a.index - b.index);
      return paragraphs
        .map(({ el }) => {
          $(el).removeAttr('style').removeAttr('data-order');
          return $.html(el);
        })
        .join('\n');
    }

    return content.html() ?? '';
  }

  filters = {
    orderby: {
      label: 'Sort',
      value: 'new',
      options: [
        { label: 'Newest', value: 'new' },
        { label: 'Recently Updated', value: 'update' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Highest Rated', value: 'rating' },
        { label: 'Most Chapters', value: 'chapters' },
        { label: 'Most Nominated', value: 'nominate' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Genre',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: '51' },
        { label: 'Adventure', value: '52' },
        { label: 'Fantasy', value: '10' },
        { label: 'Harem', value: '53' },
        { label: 'Horror', value: '16' },
        { label: 'Mature', value: '33' },
        { label: 'Martial Arts', value: '63' },
        { label: 'Mystery', value: '35' },
        { label: 'Psychological', value: '54' },
        { label: 'Romance', value: '74' },
        { label: 'School Life', value: '29' },
        { label: 'Sci-fi', value: '36' },
        { label: 'Shounen', value: '70' },
        { label: 'Slice of Life', value: '30' },
        { label: 'Supernatural', value: '55' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dropped', value: 'dropped' },
        { label: 'Ongoing', value: 'ongoing' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      label: 'Type',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Short Story', value: 'short' },
        { label: 'Long Story', value: 'long' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new IndraTranslations();
