import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const BASE = 'https://lnmakineceviri.blogspot.com';
// Blogger label that marks the introduction post of every series.
const SERIES_LABEL = 'Seri';
const ONGOING_LABEL = 'Devam Ediyor';
const COMPLETED_LABEL = 'Tamamlandı';
// Labels that describe the post type or progress rather than the genre.
const NOT_GENRE = [SERIES_LABEL, 'Novel', ONGOING_LABEL, COMPLETED_LABEL];
// Blogger returns at most 50 posts per search page whatever max-results says,
// so a long series (about 2400 chapters) needs many pages.
const MAX_PAGES = 120;
const RETRIES = 2;

type Card = {
  name: string;
  path: string;
  cover?: string;
  published?: string;
  labels: string[];
};

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The Blogger label page of a series redirects to its introduction post, so
// the only complete listing is the search page with a label: query.
const labelSearchUrl = (labels: string[]) =>
  `${BASE}/search?q=${encodeURIComponent(
    labels.map(label => `label:"${label}"`).join(' '),
  )}&max-results=150&by-date=true`;

const toPath = (url: string) => url.replace(/^https?:\/\/[^/]+/i, '');

const chapterNumberOf = (title: string) => {
  const match =
    /(?:B[öo]l[üu]m|Fas[ıi]l|Chapter|Ch\.?)\s*(\d+(?:\.\d+)?)/i.exec(title);
  return match ? Number(match[1]) : undefined;
};

const seriesTitle = (title: string) =>
  title.replace(/\s*[-–]\s*Tan[ıi]t[ıi]m\s*$/i, '').trim();

class LnMakineCeviriPlugin implements Plugin.PluginBase {
  id = 'lnmakineceviri';
  name = 'Türkçe Novel Makine Çeviri';
  icon = 'src/tr/lnmakineceviri/icon.png';
  site = BASE;
  version = '1.0.0';

  filters = {
    status: {
      label: 'Durum',
      value: 'all',
      options: [
        { label: 'Tümü', value: 'all' },
        { label: ONGOING_LABEL, value: ONGOING_LABEL },
        { label: COMPLETED_LABEL, value: COMPLETED_LABEL },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Tür',
      value: 'all',
      options: [
        { label: 'Tümü', value: 'all' },
        { label: 'Aksiyon', value: 'Aksiyon' },
        { label: 'Bilim Kurgu', value: 'Bilim Kurgu' },
        { label: 'Doğaüstü', value: 'Doğaüstü' },
        { label: 'Dram', value: 'Dram' },
        { label: 'Dövüş Sanatları', value: 'Dövüş Sanatları' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Fantezi', value: 'Fantezi' },
        { label: 'Gizem', value: 'Gizem' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Komedi', value: 'Komedi' },
        { label: 'Korku', value: 'Korku' },
        { label: 'Macera', value: 'Macera' },
        { label: 'Okul', value: 'Okul' },
        { label: 'Olgun', value: 'Olgun' },
        { label: 'Psikolojik', value: 'Psikolojik' },
        { label: 'Romantizm', value: 'Romantizm' },
        { label: 'Sanal', value: 'Sanal' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Trajedi', value: 'Trajedi' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'Xuanhuan', value: 'Xuanhuan' },
        { label: 'Yaşamdan Kesitler', value: 'Yasamdan Kesitler' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private seriesCache?: Promise<Card[]>;

  private async request(url: string) {
    let response = await fetchApi(url);
    // Blogger answers 503 now and then when pages are requested in a row.
    for (
      let i = 0;
      !response.ok && response.status >= 500 && i < RETRIES;
      i++
    ) {
      response = await fetchApi(url);
    }
    // Rate limited: wait for Retry-After (default 1s, capped at 10s) and retry.
    for (let i = 0; response.status === 429 && i < RETRIES; i++) {
      const retryAfter = parseInt(
        response.headers.get('Retry-After') || '',
        10,
      );
      const waitMs = Math.min(
        isNaN(retryAfter) ? 1000 : retryAfter * 1000,
        10000,
      );
      await new Promise(resolve => setTimeout(resolve, waitMs));
      response = await fetchApi(url);
    }
    if (!response.ok) {
      throw Object.assign(
        new Error(`Türkçe Novel Makine Çeviri: HTTP ${response.status}.`),
        { status: response.status },
      );
    }
    return response;
  }

  /** Reads the post cards of a Blogger listing or search page. */
  private readCards(body: string) {
    const $ = loadCheerio(body);
    const cards: Card[] = [];
    $('article.post').each((i, el) => {
      const article = $(el);
      const link = article.find('h2.post-title a').first();
      const href = link.attr('href');
      const title = link.text().trim();
      if (!href || !title) return;
      const labels: string[] = [];
      article.find('a.label-block').each((j, a) => {
        const labelHref = $(a).attr('href') || '';
        const encoded = labelHref.split('/search/label/')[1];
        if (encoded) labels.push(decodeURIComponent(encoded.split('?')[0]));
      });
      cards.push({
        name: title,
        path: toPath(href),
        cover: article.find('meta[itemprop="image_url"]').attr('content'),
        published: article.find('abbr.published').attr('title'),
        labels,
      });
    });
    const older = $('a.blog-pager-older-link').attr('href');
    return { cards, older };
  }

  private async readAll(startUrl: string) {
    const cards: Card[] = [];
    const seen: Record<string, boolean> = {};
    let url: string | undefined = startUrl;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const result = this.readCards(await (await this.request(url)).text());
      result.cards.forEach(card => {
        if (seen[card.path]) return;
        seen[card.path] = true;
        cards.push(card);
      });
      url = result.older;
    }
    return cards;
  }

  // The introduction post of each series carries the Seri label.
  private getSeries() {
    if (!this.seriesCache) {
      this.seriesCache = this.readAll(labelSearchUrl([SERIES_LABEL]))
        .then(cards =>
          cards.filter(card => card.labels.indexOf(SERIES_LABEL) >= 0),
        )
        .catch(error => {
          // Let the next call retry instead of caching a failed request.
          this.seriesCache = undefined;
          throw error;
        });
    }
    return this.seriesCache;
  }

  private toNovelItem(card: Card): Plugin.NovelItem {
    return {
      name: seriesTitle(card.name),
      path: card.path,
      cover: card.cover || defaultCover,
    };
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Every series (about thirty) is listed on a single page.
    if (pageNo > 1) return [];
    const status = filters?.status?.value;
    const genre = filters?.genre?.value;
    const series = await this.getSeries();
    return series
      .filter(
        card =>
          (!status || status === 'all' || card.labels.indexOf(status) >= 0) &&
          (!genre || genre === 'all' || card.labels.indexOf(genre) >= 0),
      )
      .map(card => this.toNovelItem(card));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await (await this.request(this.resolveUrl(novelPath))).text();
    const $ = loadCheerio(body);

    const title = seriesTitle(
      $('h1.post-title, h3.post-title, .post-title').first().text() ||
        $('meta[property="og:title"]').attr('content') ||
        '',
    );
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title || 'Untitled',
      cover:
        $('#ceviri1 img').first().attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        defaultCover,
    };

    // The summary keeps its line breaks.
    const summary = $('#syn_bod');
    summary.find('br').replaceWith('\n');
    novel.summary =
      summary
        .text()
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() || undefined;

    const author = $('#tauther').text().trim();
    if (author && !/^n\/a$/i.test(author)) novel.author = author;
    const artist = $('#tartist').text().replace(/^>/, '').trim();
    if (artist && !/^n\/a$/i.test(artist)) novel.artist = artist;

    // The breadcrumbs list every label of the introduction post.
    const labels: string[] = [];
    $('.breadcrumbs a[href*="/search/label/"]').each((i, a) => {
      const encoded = ($(a).attr('href') || '').split('/search/label/')[1];
      if (encoded) labels.push(decodeURIComponent(encoded.split('?')[0]));
    });
    const seriesLabel =
      $('.chapter_get').first().attr('data-labelchapter') || title;
    novel.genres =
      labels
        .filter(
          label =>
            NOT_GENRE.indexOf(label) < 0 &&
            normalize(label) !== normalize(seriesLabel),
        )
        .join(', ') || undefined;
    if (labels.indexOf(COMPLETED_LABEL) >= 0) {
      novel.status = NovelStatus.Completed;
    } else if (labels.indexOf(ONGOING_LABEL) >= 0) {
      novel.status = NovelStatus.Ongoing;
    } else {
      novel.status = NovelStatus.Unknown;
    }

    // Every chapter is a post with the series label.
    const posts = await this.readAll(labelSearchUrl([seriesLabel]));
    const chapters = posts
      .filter(
        post =>
          post.path !== novelPath && post.labels.indexOf(SERIES_LABEL) < 0,
      )
      .map((post, index) => ({
        name: post.name,
        path: post.path,
        releaseTime: post.published
          ? new Date(post.published).toISOString()
          : undefined,
        chapterNumber: chapterNumberOf(post.name),
        index,
      }));
    // Oldest first. Posts only record the minute they were published, so
    // chapters published together fall back to their chapter number, then to
    // the reverse of the site's newest-first order.
    chapters.sort(
      (a, b) =>
        Date.parse(a.releaseTime || '') - Date.parse(b.releaseTime || '') ||
        (a.chapterNumber || 0) - (b.chapterNumber || 0) ||
        b.index - a.index,
    );
    novel.chapters = chapters.map(
      ({ name, path, releaseTime, chapterNumber }) => ({
        name,
        path,
        releaseTime,
        chapterNumber,
      }),
    );

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await (
      await this.request(this.resolveUrl(chapterPath))
    ).text();
    const $ = loadCheerio(body);
    const content = $('#ceviri').first();
    content.find('script, style, ins, iframe, a[name="more"]').remove();
    let html = (content.length ? content : $('.post-body').first()).html();
    html = (html || '').trim();
    // The text opens with the chapter heading, which the site repeats twice.
    html = html.replace(
      /^([^<]{3,200}?)(?:\s*<br\s*\/?>){2}\s*\1(?=\s*<br)/,
      '$1',
    );
    return html;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site only searches posts, so its series list is filtered by name.
    if (pageNo > 1) return [];
    const term = normalize(searchTerm);
    const series = await this.getSeries();
    return series
      .filter(card => normalize(seriesTitle(card.name)).indexOf(term) >= 0)
      .map(card => this.toNovelItem(card));
  }

  resolveUrl = (path: string) => `${BASE}${path}`;
}

export default new LnMakineCeviriPlugin();
