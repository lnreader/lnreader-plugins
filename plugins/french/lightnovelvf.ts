import { load } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';

type ChapterEntry = {
  number: string;
  slug: string;
  name_fr?: string | null;
  name?: string | null;
  created_at?: string | null;
};

type ChapterPage = {
  chapters: ChapterEntry[];
  current_page: number;
  last_page: number;
  total: number;
};

class LightNovelVFPlugin implements Plugin.PagePlugin {
  id = 'lightnovelvf';
  name = 'LightNovelVF';
  icon = 'src/fr/lightnovelvf/icon.png';
  site = 'https://www.lightnovelvf.com/';
  version = '1.0.4';

  resolveUrl(path: string, _isNovel = false): string {
    void _isNovel;
    const url = new URL(path, this.site);
    if (url.origin !== new URL(this.site).origin)
      throw new Error('Cannot resolve a foreign origin');
    const cleanPath = url.pathname
      .replace(/^\/+|\/+$/g, '')
      .replace(/^novel\//, '');
    return new URL(`/novel/${cleanPath}`, this.site).toString();
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetchApi(url);
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    return response.text();
  }

  private retryDelay(response: Response | null, attempt: number): number {
    const retryAfter = response?.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) return Math.max(date - Date.now(), 0);
    }
    return 1000 * 2 ** attempt;
  }

  private isChapterPageMetadata(
    value: unknown,
    requestedPage: number,
  ): value is Omit<ChapterPage, 'chapters'> & { chapters: unknown[] } {
    if (!value || typeof value !== 'object') return false;
    const page = value as Record<string, unknown>;
    return (
      Array.isArray(page.chapters) &&
      typeof page.current_page === 'number' &&
      Number.isInteger(page.current_page) &&
      page.current_page > 0 &&
      page.current_page === requestedPage &&
      typeof page.last_page === 'number' &&
      Number.isInteger(page.last_page) &&
      page.last_page >= page.current_page &&
      typeof page.total === 'number' &&
      Number.isInteger(page.total) &&
      page.total >= 0
    );
  }

  private isChapterEntry(value: unknown): value is ChapterEntry {
    if (!value || typeof value !== 'object') return false;
    const chapter = value as Record<string, unknown>;
    return (
      typeof chapter.number === 'string' &&
      chapter.number.trim().length > 0 &&
      Number.isFinite(Number(chapter.number)) &&
      typeof chapter.slug === 'string' &&
      chapter.slug.trim().length > 0 &&
      (chapter.name_fr === undefined ||
        chapter.name_fr === null ||
        typeof chapter.name_fr === 'string') &&
      (chapter.name === undefined ||
        chapter.name === null ||
        typeof chapter.name === 'string') &&
      (chapter.created_at === undefined ||
        chapter.created_at === null ||
        typeof chapter.created_at === 'string')
    );
  }

  private async fetchChapterPage(
    url: string,
    requestedPage: number,
  ): Promise<ChapterPage> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let response: Response;
      try {
        response = await fetchApi(url);
      } catch {
        if (attempt === 5) throw new Error(`Failed to load ${url}`);
        await new Promise(resolve =>
          setTimeout(resolve, this.retryDelay(null, attempt)),
        );
        continue;
      }
      if (
        (response.status === 429 ||
          (response.status >= 500 && response.status < 600)) &&
        attempt < 5
      ) {
        await new Promise(resolve =>
          setTimeout(resolve, this.retryDelay(response, attempt)),
        );
        continue;
      }
      if (!response.ok) throw new Error(`Failed to load ${url}`);
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error(`Expected JSON chapter page from ${url}`);
      const page: unknown = await response.json();
      if (!this.isChapterPageMetadata(page, requestedPage))
        throw new Error(`Invalid chapter page from ${url}`);
      if (!page.chapters.every(chapter => this.isChapterEntry(chapter)))
        throw new Error(`Invalid chapter entry from ${url}`);
      return page as ChapterPage;
    }
    throw new Error(`Failed to load ${url}`);
  }

  private parseCards(html: string): Plugin.NovelItem[] {
    const $ = load(html);
    const novels = new Map<string, Plugin.NovelItem>();
    $('a[href^="/novel/"]').each((_, element) => {
      const href = $(element).attr('href') || '';
      const match = href.match(/^\/novel\/([^/?#]+)\/?$/);
      if (!match) return;

      const card = $(element).clone();
      card.find('img').remove();
      card
        .find('*')
        .filter((_, child) => {
          const text = $(child).text().trim();
          return (
            /\b\d[\d\s,.]*\s*(?:chapitres?|chapters?|ch\.?)(?:\s|$)/i.test(
              text,
            ) ||
            /^(?:note|rating\s*:?)?\s*\d(?:[.,]\d+)?\s*(?:\/\s*5)?$/i.test(text)
          );
        })
        .remove();
      const name = card.text().replace(/\s+/g, ' ').trim();
      if (!name) return;

      const cover =
        $(element).find('img').first().attr('data-src') ||
        $(element).find('img').first().attr('src');
      novels.set(match[1], {
        name,
        path: match[1],
        cover: cover ? new URL(cover, this.site).toString() : defaultCover,
      });
    });
    return Array.from(novels.values());
  }

  private catalogueUrl(
    pageNo: number,
    searchTerm?: string,
    latest = false,
  ): string {
    const parts = [`page=${pageNo}`];
    if (searchTerm) parts.push(`search=${encodeURIComponent(searchTerm)}`);
    if (latest) parts.push('sort=update', 'sort_dir=desc');
    return new URL(`/novels-list?${parts.join('&')}`, this.site).toString();
  }

  private labelledValue(html: string, label: string): string | undefined {
    const $ = load(html);
    let value: string | undefined;
    $('dt, [class*="label" i]').each((_, element) => {
      if (value || $(element).text().trim().toLowerCase() !== label) return;
      value = $(element).next('dd').first().text().trim() || undefined;
    });
    return value;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    return this.parseCards(
      await this.fetchHtml(
        this.catalogueUrl(pageNo, undefined, Boolean(showLatestNovels)),
      ),
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const normalizedSearchTerm = searchTerm.replace(/\\(?=%)/g, '');
    return this.parseCards(
      await this.fetchHtml(this.catalogueUrl(pageNo, normalizedSearchTerm)),
    );
  }

  private chapterItems(page: ChapterPage, slug: string): Plugin.ChapterItem[] {
    const chapters = new Map<string, Plugin.ChapterItem>();
    for (const chapter of page.chapters) {
      const chapterNumber = Number(chapter.number);
      if (!chapter.slug || !Number.isFinite(chapterNumber)) continue;
      chapters.set(chapter.slug, {
        name: chapter.name_fr || chapter.name || `Chapitre ${chapter.number}`,
        path: `${slug}/${chapter.slug}`,
        chapterNumber,
        releaseTime: chapter.created_at || null,
      });
    }
    return Array.from(chapters.values()).sort(
      (left, right) => (left.chapterNumber || 0) - (right.chapterNumber || 0),
    );
  }

  private chapterPageUrl(slug: string, pageNo: number): string {
    return `${this.resolveUrl(`${slug}/chapitres`, true)}?p=${pageNo}&order=asc&q=`;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const novelUrl = this.resolveUrl(novelPath, true);
    const slug = new URL(novelUrl).pathname.replace(/^\/novel\//, '');
    const html = await this.fetchHtml(novelUrl);
    const $ = load(html);
    const statusText =
      this.labelledValue(html, 'statut') ||
      $('span')
        .filter((_, element) =>
          /^(?:en\s+cours|terminé|complete|hiatus|pause)$/i.test(
            $(element).text().trim(),
          ),
        )
        .first()
        .text()
        .trim();
    const firstPage = await this.fetchChapterPage(
      this.chapterPageUrl(slug, 1),
      1,
    );

    const cover =
      $('.lnv-novel-cover, .lnv-novel__cover, .lnv-hero img, .hero img')
        .first()
        .attr('src') || $('img').first().attr('src');
    return {
      path: slug,
      name: $('h1').first().text().trim(),
      cover: cover ? new URL(cover, this.site).toString() : defaultCover,
      summary: $('.lnv-synopsis__body').first().text().trim() || undefined,
      author:
        this.labelledValue(html, 'auteur') ||
        $('[itemprop="author"]').first().text().trim() ||
        undefined,
      genres:
        this.labelledValue(html, 'catégories') ||
        this.labelledValue(html, 'categories') ||
        $('[itemprop="genre"]')
          .map((_, element) => $(element).text().trim())
          .get()
          .filter(Boolean)
          .join(', ') ||
        undefined,
      status: /termin|complet/i.test(statusText)
        ? NovelStatus.Completed
        : /hiatus|pause/i.test(statusText)
          ? NovelStatus.OnHiatus
          : /cours|ongoing/i.test(statusText)
            ? NovelStatus.Ongoing
            : NovelStatus.Unknown,
      chapters: this.chapterItems(firstPage, slug),
      totalPages: Math.max(firstPage.last_page, 1),
    };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pageNo = Number(page);
    if (!Number.isInteger(pageNo) || pageNo < 1)
      throw new Error('Invalid page');
    const novelUrl = this.resolveUrl(novelPath, true);
    const slug = new URL(novelUrl).pathname.replace(/^\/novel\//, '');
    const pageData = await this.fetchChapterPage(
      this.chapterPageUrl(slug, pageNo),
      pageNo,
    );
    return { chapters: this.chapterItems(pageData, slug) };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(this.resolveUrl(chapterPath));
    const $ = load(html);
    const content = $('.lnv-reader-content').first();
    content
      .find(
        'script, style, header, footer, nav, form, [class*="nav" i], [id*="nav" i], [class*="advert" i], [id*="advert" i], [class*="share" i], [class*="control" i]',
      )
      .remove();
    const chapter = content.html()?.trim() || '';
    if (content.text().replace(/\s+/g, ' ').trim().length < 200)
      throw new Error('No readable chapter content found');
    return chapter;
  }
}

export default new LightNovelVFPlugin();
