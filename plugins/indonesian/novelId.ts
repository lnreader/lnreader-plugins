import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

const SITE = 'https://novelid.org';

class NovelIdPlugin implements Plugin.PagePlugin {
  id = 'novelId';
  name = 'NovelID';
  icon = 'src/id/novelId/icon.png';
  site = SITE;
  version = '1.0.1';

  private absolutePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
      const url = new URL(href, this.site);
      if (url.hostname !== new URL(this.site).hostname) return undefined;
      // NovelID's detail page emits a doubled slash before /bab/.
      // Normalize it to the canonical URL shape used by the site.
      return url.pathname.replace(/\/{2,}/g, '/') + url.search;
    } catch {
      return undefined;
    }
  }

  private parseNovelCards(
    $: ReturnType<typeof loadCheerio>,
  ): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, element) => {
      const anchor = $(element);
      const path = this.absolutePath(anchor.attr('href'));
      if (!path || !/^\/novel\/[^/]+\/?$/.test(path)) return;

      const slug = path.replace(/^\/novel\//, '').replace(/\/$/, '');
      if (!slug || seen.has(slug)) return;

      const card = anchor.closest(
        '.novel-item, .book-item, .search-item, .detail-item, .fiction-item, li, article',
      );
      const scope = card.length ? card : anchor;
      const image = scope.find('img').first();
      const coverRaw =
        image.attr('data-src') ||
        image.attr('data-original') ||
        image.attr('data-lazy-src') ||
        image.attr('src');

      const name =
        anchor.attr('title')?.trim() ||
        scope
          .find('.novel-title, .book-title, .title, h3, h4')
          .first()
          .text()
          .trim() ||
        anchor.text().trim();

      if (!name) return;
      seen.add(slug);
      novels.push({
        name,
        path,
        cover: coverRaw ? new URL(coverRaw, this.site).href : undefined,
      });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    _options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const page = Math.max(1, pageNo || 1);
    const url = page === 1 ? `${this.site}/` : `${this.site}/?page=${page}`;
    const response = await fetchApi(url);
    const $ = loadCheerio(await response.text());
    return this.parseNovelCards($);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const page = Math.max(1, pageNo || 1);
    const query = `s=${encodeURIComponent(searchTerm)}`;
    const url = `${this.site}/?${query}${page > 1 ? `&page=${page}` : ''}`;
    const response = await fetchApi(url);
    const $ = loadCheerio(await response.text());
    return this.parseNovelCards($);
  }

  private async parseChapterListPage(
    novelPath: string,
    page: string,
  ): Promise<Plugin.ChapterItem[]> {
    const url = new URL(novelPath, this.site);
    url.searchParams.set('page', page);
    const response = await fetchApi(url.href);
    const $ = loadCheerio(await response.text());
    const chapters: Plugin.ChapterItem[] = [];

    $('.episodes-info-a-item').each((_, element) => {
      const item = $(element);
      const href = this.absolutePath(item.attr('href'));
      const title = item.find('.episode-item-title').first().text().trim();
      const numberText = item.find('.episode-item-num').first().text().trim();
      const chapterNumber = Number(numberText);

      if (!href || !title) return;
      chapters.push({
        name: title,
        path: href,
        chapterNumber: Number.isFinite(chapterNumber)
          ? chapterNumber
          : undefined,
        releaseTime: '',
      });
    });

    return chapters;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const path = this.absolutePath(novelPath) ?? novelPath;
    const response = await fetchApi(new URL(path, this.site).href);
    const $ = loadCheerio(await response.text());

    const name = $('.detail-title').first().text().trim() || 'Untitled';
    const coverStyle = $('.detail-top').attr('style') ?? '';
    const coverMatch = coverStyle.match(
      /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i,
    );
    const coverFromImage =
      $('.detail-top img').first().attr('data-src') ||
      $('.detail-top img').first().attr('src');
    const coverRaw = coverMatch?.[2] || coverFromImage;

    const author =
      $('.detail-author.web-author')
        .first()
        .text()
        .replace(/^Nama Author\s*[:：]\s*/i, '')
        .trim() ||
      $('.detail-author.app-author')
        .first()
        .text()
        .replace(/^Author\s*:\s*/i, '')
        .trim();

    const tags = $('.detail-tag-item')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean);
    const statusText = tags.join(' ').toLowerCase();
    const status =
      statusText.includes('tamat') || statusText.includes('completed')
        ? NovelStatus.Completed
        : statusText.includes('ongoing') || statusText.includes('berjalan')
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown;
    const genres = tags
      .filter(tag => !/^(tamat|ongoing|berjalan|completed)$/i.test(tag))
      .join(', ');

    const summary = $('.detail-desc-info').first().text().trim();
    const scoreText = $('.detail-score').first().text().trim();
    const scoreMatch = scoreText.match(/(\d+(?:\.\d+)?)/);
    const score = scoreMatch ? Number(scoreMatch[1]) : undefined;

    const pageNumbers = $('.pagination-number')
      .map((_, element) => Number($(element).text().trim()))
      .get()
      .filter(number => Number.isFinite(number) && number > 0);
    const totalPages = pageNumbers.length ? Math.max(...pageNumbers) : 1;
    const chapters = await this.parseChapterListPage(path, '1');

    return {
      path,
      name,
      cover: coverRaw ? new URL(coverRaw, this.site).href : undefined,
      author,
      genres,
      summary,
      status,
      rating: score !== undefined ? Math.min(5, score / 2) : undefined,
      chapters,
      totalPages,
    };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    return {
      chapters: await this.parseChapterListPage(novelPath, page),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = this.absolutePath(chapterPath) ?? chapterPath;
    const response = await fetchApi(new URL(path, this.site).href);
    const $ = loadCheerio(await response.text());
    const content = $('.watch-chapter-detail').first();

    if (!content.length) {
      throw new Error(
        'NovelID: isi chapter tidak ditemukan (.watch-chapter-detail).',
      );
    }

    content.find('script, style, iframe, .adsbygoogle, ins').remove();
    return content.html()?.trim() ?? '';
  }

  resolveUrl = (path: string): string => new URL(path, this.site).href;
}

export default new NovelIdPlugin();
