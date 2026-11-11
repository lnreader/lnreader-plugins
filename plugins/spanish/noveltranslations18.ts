import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const BASE = 'https://noveltranslations18.blogspot.com';
const SERIES_URL = `${BASE}/search/label/Series?max-results=150`;
const SERIES_FEED_URL = `${BASE}/feeds/posts/default/-/Series?alt=json&max-results=150`;
const FEED_PAGE_SIZE = 150;
const MAX_FEED_PAGES = 10;

const STATUS: Record<string, string> = {
  ongoing: NovelStatus.Ongoing,
  completed: NovelStatus.Completed,
  hiatus: NovelStatus.OnHiatus,
  cancelled: NovelStatus.Cancelled,
  dropped: NovelStatus.Cancelled,
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '');

const toPath = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');

// Batch posts such as "Capitulo 1 a 25" only embed a Google Drive file.
const isBatchPost = (title: string) => /\d+\s+a\s+\d+/i.test(title);

// "Capítulo 12", "Capitulo 12.5" or "Chapter 12"; volume labels have no
// single chapter number.
const chapterNumberOf = (title: string) => {
  const match =
    /cap(?:[ií]tulo|\.)?\s*(\d+(?:\.\d+)?)|chapter\s*(\d+(?:\.\d+)?)/i.exec(
      title,
    );
  return match ? Number(match[1] || match[2]) : undefined;
};

type Series = { name: string; path: string; cover?: string; body?: string };
type FeedEntry = {
  title: { $t: string };
  content?: { $t: string };
  published: { $t: string };
  link: { rel: string; href: string }[];
  media$thumbnail?: { url: string };
};

class NovelTranslations18Plugin implements Plugin.PluginBase {
  id = 'noveltranslations18';
  name = 'Novel Translations';
  icon = 'src/es/noveltranslations18/icon.png';
  site = `${BASE}/`;
  version = '1.0.0';
  filters = undefined;

  private seriesCache?: Promise<Series[]>;

  // Blogger answers bursts with 429/503: wait once, then retry exactly once.
  private async request(url: string) {
    const response = await fetchApi(url);
    if (response.status !== 429 && response.status !== 503) return response;
    const retryAfter = Number(response.headers.get('Retry-After'));
    const seconds = retryAfter > 0 ? Math.min(retryAfter, 10) : 2;
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    return fetchApi(url);
  }

  private async getHtml(url: string) {
    const response = await this.request(url);
    if (!response.ok) {
      throw new Error(`No se pudo acceder al sitio (${response.status}).`);
    }
    return parseHTML(await response.text());
  }

  private async getSeriesFromFeed() {
    const response = await this.request(SERIES_FEED_URL);
    if (!response.ok) throw new Error(`Feed (${response.status}).`);
    const entries: FeedEntry[] = (await response.json())?.feed?.entry || [];
    const series: Series[] = [];
    entries.forEach(entry => {
      const link = entry.link.find(item => item.rel === 'alternate');
      const name = entry.title.$t.trim();
      if (!link || !name) return;
      series.push({
        name,
        path: toPath(link.href),
        cover: entry.media$thumbnail?.url.replace('/s72-c/', '/s400/'),
        body: entry.content?.$t,
      });
    });
    if (series.length === 0) throw new Error('Feed vacío.');
    return series;
  }

  private async getSeriesFromHtml() {
    const $ = await this.getHtml(SERIES_URL);
    const series: Series[] = [];
    $('a.clamp').each((_, el) => {
      const link = $(el);
      const href = link.attr('href');
      const name = link.text().trim();
      if (!href || !name) return;
      const cover = link.parent().find('img').first().attr('src');
      series.push({ name, path: toPath(href), cover });
    });
    return series;
  }

  // The whole catalogue is the "Series" label: read its feed, falling back to
  // the label page.
  private getSeries() {
    if (!this.seriesCache) {
      this.seriesCache = this.getSeriesFromFeed()
        .catch(() => this.getSeriesFromHtml())
        .catch(error => {
          // Let the next call retry instead of caching a failed request.
          this.seriesCache = undefined;
          throw error;
        });
    }
    return this.seriesCache;
  }

  private toItems(series: Series[]): Plugin.NovelItem[] {
    return series.map(item => ({
      name: item.name,
      path: item.path,
      cover: item.cover || defaultCover,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    return this.toItems(await this.getSeries());
  }

  // Some novels have no chapter index in their page (the site fills it in with
  // a script from the label feed), so the same feed is read here.
  private async getFeedChapters(label: string, novelPath: string) {
    const chapters: Plugin.ChapterItem[] = [];
    for (let page = 0; page < MAX_FEED_PAGES; page++) {
      const start = page * FEED_PAGE_SIZE + 1;
      const response = await this.request(
        `${BASE}/feeds/posts/default/-/${encodeURIComponent(label)}?alt=json&start-index=${start}&max-results=${FEED_PAGE_SIZE}`,
      );
      if (!response.ok) break;
      const entries: FeedEntry[] = (await response.json())?.feed?.entry || [];
      entries.forEach(entry => {
        const link = entry.link.find(item => item.rel === 'alternate');
        if (!link) return;
        const path = toPath(link.href);
        if (path === novelPath) return;
        const name = parseHTML(`<p>${entry.title.$t}</p>`).text().trim();
        if (isBatchPost(name)) return;
        chapters.push({
          name,
          path,
          releaseTime: entry.published.$t,
          chapterNumber: chapterNumberOf(name),
        });
      });
      if (entries.length < FEED_PAGE_SIZE) break;
    }
    return chapters.reverse();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await this.request(BASE + novelPath);
    let body: string;
    let fallbackCover: string | undefined;
    if (response.ok) {
      body = await response.text();
    } else {
      // Blogger may throttle novel pages; the series feed carries the same
      // post content (synopsis and chapter index).
      const entry = (await this.getSeries().catch(() => [])).find(
        item => item.path === novelPath && item.body,
      );
      if (!entry) {
        throw new Error(`No se pudo acceder a la novela (${response.status}).`);
      }
      body = `<h1>${entry.name}</h1>${entry.body}`;
      fallbackCover = entry.cover;
    }
    const $ = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Untitled',
      cover:
        $('meta[property="og:image"]').attr('content') ||
        fallbackCover ||
        defaultCover,
    };

    const summary = $('#synopsis').text().trim();
    if (summary) novel.summary = summary;

    const author = $('#extra-info .y6x11p')
      .filter((_, el) => /^(author|autor)\b/i.test($(el).text().trim()))
      .find('.dt')
      .text()
      .trim();
    if (author && author !== 'None') novel.author = author;

    const genres = $('a.label[rel="tag"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(', ');
    if (genres) novel.genres = genres;

    const status = $('aside .y6x11p')
      .filter((_, el) => /^estado/i.test($(el).text().trim()))
      .find('a')
      .text()
      .trim()
      .toLowerCase();
    novel.status = STATUS[status] || NovelStatus.Unknown;

    const chapters: Plugin.ChapterItem[] = [];
    $('#download .index-list a').each((_, el) => {
      const link = $(el);
      const href = link.attr('href') || '';
      // Download links (Google Drive, ...) are not readable chapters.
      if (href.indexOf(BASE) !== 0) return;
      const name = link.text().replace(/\s+/g, ' ').trim();
      if (!name || isBatchPost(name)) return;
      chapters.push({
        name,
        path: toPath(href),
        chapterNumber: chapterNumberOf(name),
      });
    });
    // The index lists the newest chapter first.
    chapters.reverse();

    if (chapters.length === 0) {
      const label = /clwd\.run\('((?:[^'\\]|\\.)*)'\)/.exec(body);
      if (label) {
        novel.chapters = await this.getFeedChapters(
          label[1].replace(/\\'/g, "'"),
          novelPath,
        );
        return novel;
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // Blogger throttles post pages but not the feed, which carries the same
    // post body.
    const response = await this.request(
      `${BASE}/feeds/posts/default?alt=json&path=${encodeURIComponent(chapterPath)}`,
    );
    if (!response.ok) {
      throw new Error(`No se pudo acceder al sitio (${response.status}).`);
    }
    const entry: FeedEntry | undefined = (await response.json())?.feed
      ?.entry?.[0];
    if (!entry?.content) throw new Error('Capítulo no encontrado.');
    const $ = parseHTML(`<div class="check-box">${entry.content.$t}</div>`);
    const content = $('.check-box').first();
    content.find('script, style, ins, iframe').remove();
    // Text pasted from Google Docs carries inline styles and spacer breaks.
    content.find('[style]').removeAttr('style');
    content.find('br').remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.text().trim() && !paragraph.find('img').length) {
        paragraph.remove();
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's search also matches chapter posts, so the catalogue is
    // filtered by title instead.
    if (pageNo > 1) return [];
    const term = normalize(searchTerm);
    const series = await this.getSeries();
    return this.toItems(
      series.filter(item => normalize(item.name).indexOf(term) >= 0),
    );
  }
}

export default new NovelTranslations18Plugin();
