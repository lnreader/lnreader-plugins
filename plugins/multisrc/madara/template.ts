import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { Cheerio, CheerioAPI, load as parseHTML } from 'cheerio';
import { AnyNode, Element } from 'domhandler';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';
import { storage } from '@libs/storage';

const SECOND_REGEX = /detik|segundo|second|วินาที/i;
const MINUTE_REGEX = /menit|dakika|min|minute|minuto|นาที|دقائق/i;
const HOUR_REGEX = /jam|saat|heure|hora|hour|ชั่วโมง|giờ|ore|ساعة|小时/i;
const DAY_REGEX = /hari|gün|jour|día|dia|day|วัน|ngày|giorni|أيام|天/i;
const WEEK_REGEX = /week|semana/i;
const MONTH_REGEX = /month|mes/i;
const YEAR_REGEX = /year|año/i;

const REVERSE_ALPHA = 'zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA';
const FORWARD_ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

type MadaraOptions = {
  useNewChapterEndpoint?: boolean;
  lang?: string;
  orderBy?: string;
  versionIncrements?: number;
  customJs?: string;
  hasLocked?: boolean;
  browserHeaders?: boolean;
  resolveCoverDataUri?: boolean;
};

export type MadaraMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: MadaraOptions;
  filters?: Filters;
};

export class MadaraPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options?: MadaraOptions;
  filters?: Filters | undefined;

  hideLocked = storage.get('hideLocked');
  pluginSettings?: Filters;

  private dateCache = new Map<string, string>();

  constructor(metadata: MadaraMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/madara/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const versionIncrements = metadata.options?.versionIncrements || 0;
    this.version = `2.3.${versionIncrements}`;
    this.options = metadata.options;
    this.filters = metadata.filters;

    if (this.options?.hasLocked) {
      this.pluginSettings = {
        hideLocked: {
          value: '',
          label: 'Hide locked chapters',
          type: 'Switch',
        },
      };
    }
  }

  // Opt-in for sites whose bot check rejects fetchApi's wildcard Accept
  // headers (e.g. lovelyblossoms.com, see #2599). The app's User-Agent is
  // left untouched so WebView clearance cookies still match.
  get requestHeaders(): Record<string, string> | undefined {
    if (!this.options?.browserHeaders) return undefined;
    return {
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  translateDragontea(text: Cheerio<AnyNode>): Cheerio<AnyNode> {
    if (this.id !== 'dragontea') return text;

    const $ = parseHTML(
      text
        .html()
        ?.replace('\n', '')
        .replace(/<br\s*\/?>/g, '\n') || '',
    );

    text.html($.html());
    text
      .find('*')
      .addBack()
      .contents()
      .filter((_, el) => el.nodeType === 3)
      .each((_, el) => {
        const $el = $(el);
        const translated = $el
          .text()
          .normalize('NFD')
          .split('')
          .map(char => {
            const base = char.normalize('NFC');
            const idx = FORWARD_ALPHA.indexOf(base);
            return idx >= 0
              ? REVERSE_ALPHA[idx] + char.slice(base.length)
              : char;
          })
          .join('');
        $el.replaceWith(translated.replace('\n', '<br>'));
      });

    return text;
  }

  getHostname(url: string): string {
    url = url.split('/')[2];
    const url_parts = url.split('.');
    url_parts.pop(); // remove TLD
    return url_parts.join('.');
  }

  async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url, { headers: this.requestHeaders });
    if (!r.ok && search != true)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const text = await r.text();
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (
      this.getHostname(url) != this.getHostname(r.url) ||
      title == 'Bot Verification' ||
      title == 'You are being redirected...' ||
      title == 'Un instant...' ||
      title == 'Just a moment...' ||
      title == 'Redirecting...'
    )
      throw new Error('Captcha error, please open in webview');
    return parseHTML(text);
  }

  extractCover(image: Cheerio<AnyNode>): string {
    const candidates = [
      image.attr('data-lazy-src'),
      image.attr('data-src'),
      image.attr('data-cfsrc'),
      image.attr('data-srcset')?.split(' ')[0],
      image.attr('data-lazy-srcset')?.split(' ')[0],
      image.attr('srcset')?.split(' ')[0],
      image.attr('src'),
    ];

    for (const candidate of candidates) {
      if (candidate && !candidate.includes('dflazy')) {
        return candidate;
      }
    }

    return defaultCover;
  }

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.manga-title-badges').remove();

    loadedCheerio('.page-item-detail, .c-tabs-item__content').each(
      (index, element) => {
        const $el = loadedCheerio(element);
        const $title = $el.find('.post-title');
        const novelName = $title.text().trim();
        const novelUrl = $title.find('a').attr('href') || '';
        if (!novelName || !novelUrl) return;
        const novelCover = this.extractCover($el.find('img'));

        const novel: Plugin.NovelItem = {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(/https?:\/\/.*?\//, ''),
        };
        novels.push(novel);
      },
    );

    return novels;
  }

  async resolveCoverAsDataUri(url: string): Promise<string> {
    if (!url || !url.startsWith('http') || url.startsWith('data:')) return url;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeout = controller ? setTimeout(() => controller.abort(), 4000) : null;
      const res = await fetchApi(url, {
        headers: this.requestHeaders,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) return url;
      const blob = await res.blob();
      return await new Promise<string>(resolve => {
        const FileReaderClass =
          typeof FileReader !== 'undefined'
            ? FileReader
            : (globalThis as unknown as { FileReader?: typeof FileReader })
                .FileReader;
        if (!FileReaderClass) return resolve(url);
        const fr = new FileReaderClass();
        fr.onloadend = () => {
          if (typeof fr.result === 'string') {
            resolve(fr.result);
          } else {
            resolve(url);
          }
        };
        fr.onerror = () => resolve(url);
        fr.readAsDataURL(blob);
      });
    } catch {
      return url;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async resolveNovelsCovers(
    novels: Plugin.NovelItem[],
  ): Promise<Plugin.NovelItem[]> {
    if (!this.options?.resolveCoverDataUri) return novels;
    await Promise.all(
      novels.map(async novel => {
        if (novel.cover && novel.cover.startsWith('http')) {
          novel.cover = await this.resolveCoverAsDataUri(novel.cover);
        }
      }),
    );
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const baseUrl = this.site.replace(/\/+$/, '');
    let url = `${baseUrl}/page/${pageNo}/?s=&post_type=wp-manga`;
    if (!filters) filters = this.filters || {};
    if (showLatestNovels) url += '&m_orderby=latest';
    for (const key in filters) {
      if (typeof filters[key].value === 'object')
        for (const value of filters[key].value as string[])
          url += `&${key}=${value}`;
      else if (filters[key].value) url += `&${key}=${filters[key].value}`;
    }
    const loadedCheerio = await this.getCheerio(url, pageNo != 1);
    const novels = this.parseNovels(loadedCheerio);
    return await this.resolveNovelsCovers(novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const baseUrl = this.site.replace(/\/+$/, '');
    const cleanPath = novelPath.replace(/^\/+/, '');
    const novelUrl = novelPath.startsWith('http')
      ? novelPath
      : `${baseUrl}/${cleanPath}`;

    let loadedCheerio: CheerioAPI;
    let initialChapterHtmlPromise: Promise<string> | null = null;
    const chapterEndpointUrl = `${novelUrl.replace(/\/+$/, '')}/ajax/chapters/`;

    if (this.options?.useNewChapterEndpoint) {
      initialChapterHtmlPromise = fetchApi(chapterEndpointUrl, {
        method: 'POST',
        headers: this.requestHeaders,
        referrer: novelUrl,
      })
        .then((res: Response) => res.text())
        .catch(() => '');

      [loadedCheerio] = await Promise.all([
        this.getCheerio(novelUrl, false),
        initialChapterHtmlPromise,
      ]);
    } else {
      loadedCheerio = await this.getCheerio(novelUrl, false);
    }

    loadedCheerio('.manga-title-badges, #manga-title span').remove();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        loadedCheerio('.post-title h1').text().trim() ||
        loadedCheerio('#manga-title h1').text().trim() ||
        loadedCheerio('.manga-title').text().trim() ||
        '',
    };

    novel.cover = this.extractCover(loadedCheerio('.summary_image > a > img'));

    loadedCheerio('.post-content_item, .post-content').each(function () {
      const detailName = loadedCheerio(this).find('h5').text().trim();
      const detail =
        loadedCheerio(this).find('.summary-content') ||
        loadedCheerio(this).find('.summary_content');

      switch (detailName) {
        case 'Genre(s)':
        case 'Genre':
        case 'Tags(s)':
        case 'Tag(s)':
        case 'Tags':
        case 'Género(s)':
        case 'Kategori':
        case 'التصنيفات':
          if (novel.genres)
            novel.genres +=
              ', ' +
              detail
                .find('a')
                .map((i, el) => loadedCheerio(el).text())
                .get()
                .join(', ');
          else
            novel.genres = detail
              .find('a')
              .map((i, el) => loadedCheerio(el).text())
              .get()
              .join(', ');
          break;
        case 'Author(s)':
        case 'Author':
        case 'Autor(es)':
        case 'المؤلف':
        case 'المؤلف (ين)':
          novel.author = detail.text().trim();
          break;
        case 'Translator(s)':
        case 'Translator':
        case 'Translators':
          if (!novel.author) novel.author = detail.text().trim();
          break;
        case 'Status':
        case 'Novel':
        case 'Estado':
        case 'Durum':
          novel.status =
            detail.text().trim().includes('OnGoing') ||
            detail.text().trim().includes('مستمرة')
              ? NovelStatus.Ongoing
              : NovelStatus.Completed;
          break;
        case 'Artist(s)':
          novel.artist = detail.text().trim();
          break;
      }
    });

    // Checks for "Madara NovelHub" version
    {
      if (!novel.genres)
        novel.genres = loadedCheerio('.genres-content').text().trim();
      if (!novel.status)
        novel.status = loadedCheerio('.manga-status')
          .text()
          .trim()
          .includes('OnGoing')
          ? NovelStatus.Ongoing
          : NovelStatus.Completed;
      if (!novel.author)
        novel.author = loadedCheerio('.manga-author a').text().trim();
      if (!novel.rating)
        novel.rating = parseFloat(
          loadedCheerio('.post-rating span').text().trim(),
        );
    }

    if (!novel.author)
      novel.author = loadedCheerio('.manga-authors').text().trim();

    loadedCheerio('div.summary__content .code-block,script,noscript').remove();
    novel.summary =
      this.translateDragontea(loadedCheerio('div.summary__content'))
        .text()
        .trim() ||
      loadedCheerio('#tab-manga-about').text().trim() ||
      loadedCheerio('.post-content_item h5:contains("Summary")')
        .next()
        .find('span')
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join('\n\n')
        .trim() ||
      loadedCheerio('.post-content_item h5:contains("Summary")')
        .next()
        .find('p')
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join('\n\n')
        .trim() ||
      loadedCheerio('.manga-summary p')
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join('\n\n')
        .trim() ||
      loadedCheerio('.manga-excerpt p')
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join('\n\n')
        .trim();
    const chapters: Plugin.ChapterItem[] = [];
    let html = '';

    if (this.options?.useNewChapterEndpoint) {
      html =
        (initialChapterHtmlPromise ? await initialChapterHtmlPromise : '') ||
        '';
      if (!html) {
        html = await fetchApi(chapterEndpointUrl, {
          method: 'POST',
          headers: this.requestHeaders,
          referrer: novelUrl,
        })
          .then((res: Response) => res.text())
          .catch(() => '');
      }

      const $firstPage = parseHTML(html);
      const pageLinks = $firstPage('.pagination a[data-page]');
      if (pageLinks.length > 0) {
        const maxPage = Math.max(
          ...pageLinks
            .map((_, el) =>
              parseInt($firstPage(el).attr('data-page') || '1', 10),
            )
            .get(),
        );
        const lastHref = pageLinks.last().attr('href') || '';
        const queryIndex = lastHref.indexOf('?');
        if (queryIndex !== -1) {
          const queryTemplate = lastHref.slice(queryIndex).replace(/\d+$/, '');
          const pageUrls: string[] = [];
          for (let page = 2; page <= maxPage; page++) {
            pageUrls.push(`${chapterEndpointUrl}${queryTemplate}${page}`);
          }

          const BATCH_SIZE = 6;
          for (let i = 0; i < pageUrls.length; i += BATCH_SIZE) {
            const batch = pageUrls.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
              batch.map(url =>
                fetchApi(url, {
                  method: 'POST',
                  headers: this.requestHeaders,
                  referrer: novelUrl,
                })
                  .then((res: Response) => res.text())
                  .catch(() => ''),
              ),
            );
            for (const pageHtml of batchResults) {
              if (pageHtml && pageHtml !== '0') html += pageHtml;
            }
          }
        }
      }
    } else {
      const novelId =
        loadedCheerio('.rating-post-id').attr('value') ||
        loadedCheerio('#manga-chapters-holder').attr('data-id') ||
        '';

      const formData = new FormData();
      formData.append('action', 'manga_get_chapters');
      formData.append('manga', novelId);

      html = await fetchApi(`${baseUrl}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: this.requestHeaders,
        body: formData,
      }).then((res: Response) => res.text());
    }

    if (html !== '0' && html) {
      loadedCheerio = parseHTML(html);
    }

    const chapterElements = loadedCheerio('.wp-manga-chapter');
    const totalChapters = chapterElements.length;
    const defaultDate = dayjs().format('LL');

    chapterElements.each((chapterIndex, element) => {
      const $el = loadedCheerio(element);
      const $a = $el.find('a');
      const chapterUrl = $a.attr('href') || '';

      if (!chapterUrl || chapterUrl === '#') return;

      const elementClass = (element as Element).attribs?.class || '';
      const locked = elementClass.includes('premium-block');
      if (locked && this.hideLocked) return;

      let chapterName = $a.text().trim();
      if (locked) {
        chapterName = '🔒 ' + chapterName;
      }

      const rawDate = $el.find('span.chapter-release-date').text().trim();
      const releaseDate = rawDate ? this.parseData(rawDate) : defaultDate;

      chapters.push({
        name: chapterName,
        path: chapterUrl.replace(/https?:\/\/.*?\//, ''),
        releaseTime: releaseDate || null,
        chapterNumber: totalChapters - chapterIndex,
      });
    });

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const baseUrl = this.site.replace(/\/+$/, '');
    const cleanPath = chapterPath.replace(/^\/+/, '');
    const loadedCheerio = await this.getCheerio(
      `${baseUrl}/${cleanPath}`,
      false,
    );
    let chapterText = loadedCheerio('.text-left');
    if (!chapterText.length) chapterText = loadedCheerio('.text-right');
    if (!chapterText.length) chapterText = loadedCheerio('.entry-content');
    if (!chapterText.length) {
      chapterText = loadedCheerio('.c-blog-post > div > div:nth-child(2)');
    }

    if (this.options?.customJs) {
      try {
        // CustomJS HERE
      } catch (error) {
        console.error('Error executing customJs:', error);
        throw error;
      }
    }

    return this.translateDragontea(chapterText).html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo?: number | undefined,
  ): Promise<Plugin.NovelItem[]> {
    const baseUrl = this.site.replace(/\/+$/, '');
    const url = `${baseUrl}/page/${pageNo ?? 1}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
    const loadedCheerio = await this.getCheerio(url, true);
    const novels = this.parseNovels(loadedCheerio);
    return await this.resolveNovelsCovers(novels);
  }

  parseData = (date: string): string => {
    const cached = this.dateCache.get(date);
    if (cached !== undefined) return cached;
    if (this.dateCache.size > 2000) this.dateCache.clear();

    const dayJSDate = dayjs(); // today
    const timeAgo = date.match(/\d+/)?.[0] || '';
    const timeAgoInt = parseInt(timeAgo, 10);

    if (!timeAgo) {
      this.dateCache.set(date, date);
      return date; // there is no number!
    }

    let result: string;
    if (SECOND_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'second').format('LL');
    } else if (MINUTE_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'minute').format('LL');
    } else if (HOUR_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'hours').format('LL');
    } else if (DAY_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'days').format('LL');
    } else if (WEEK_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'week').format('LL');
    } else if (MONTH_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'month').format('LL');
    } else if (YEAR_REGEX.test(date)) {
      result = dayJSDate.subtract(timeAgoInt, 'year').format('LL');
    } else {
      const parsed = dayjs(date);
      const formatted = parsed.format('LL');
      result = formatted !== 'Invalid Date' ? formatted : date;
    }

    this.dateCache.set(date, result);
    return result;
  };
}
