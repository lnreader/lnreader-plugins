import { load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

class IndraTranslations implements Plugin.PluginBase {
  id = 'indratranslations';
  name = 'Indra Translations';
  site = 'https://indratranslations.com';
  version = '1.2.0';
  // icon = 'src/en/indratranslations/icon.png';
  // customCSS = 'src/en/indratranslations/customCSS.css';
  // (optional) Add these files to the repo and uncomment the lines above if you want an icon/custom CSS.

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
   * Indra can render results in different templates.
   * This tries multiple layouts and returns a single unified list.
   */
  private parseNovelCards($: ReturnType<typeof load>) {
    const out: { name: string; path: string; cover?: string }[] = [];
    const seen = new Set<string>();

    const push = (name?: string, path?: string, cover?: string) => {
      const cleanName = this.clean(name);
      const cleanPath = String(path || '')
        .replace(this.site, '')
        .trim();
      if (!cleanName || !cleanPath) return;
      if (!cleanPath.includes('/series/')) return;

      // Normalize trailing slash for consistency
      const normalized = cleanPath.endsWith('/') ? cleanPath : cleanPath + '/';
      if (seen.has(normalized)) return;

      seen.add(normalized);
      out.push({
        name: cleanName,
        path: normalized,
        cover: cover ? this.absolute(cover) : undefined,
      });
    };

    // -------- Layout A (Madara-style): .page-item-detail ----------
    $('.page-item-detail').each((_, el) => {
      const a = $(el).find('a[href*="/series/"]').first();
      const href = a.attr('href') || '';
      const title =
        this.clean(a.attr('title')) ||
        this.clean($(el).find('h3 a').text()) ||
        this.clean($(el).find('.post-title a').text());

      const img =
        $(el).find('img').attr('data-src') ||
        $(el).find('img').attr('data-lazy-src') ||
        $(el).find('img').attr('src');

      if (href) push(title, href, img || undefined);
    });

    // -------- Layout B (common search tabs): .c-tabs-item__content ----------
    $('.c-tabs-item__content').each((_, el) => {
      const a =
        $(el).find('a[href*="/series/"]').first() ||
        $(el).find('.tab-thumb a[href*="/series/"]').first();

      const href = (a as any).attr?.('href') || '';
      const title =
        this.clean($(el).find('.post-title a').text()) ||
        this.clean($(el).find('.tab-summary .post-title a').text()) ||
        this.clean((a as any).attr?.('title')) ||
        this.clean((a as any).text?.());

      const img =
        $(el).find('img').attr('data-src') ||
        $(el).find('img').attr('data-lazy-src') ||
        $(el).find('img').attr('src');

      if (href) push(title, href, img || undefined);
    });

    // -------- Layout C (sometimes search results are in .row or .col wrappers) ----------
    $('.row').each((_, el) => {
      const a = $(el).find('a[href*="/series/"]').first();
      const href = a.attr('href') || '';
      if (!href) return;

      const title =
        this.clean($(el).find('h3 a').text()) ||
        this.clean($(el).find('.post-title a').text()) ||
        this.clean(a.attr('title')) ||
        this.clean(a.text());

      const img =
        $(el).find('img').attr('data-src') ||
        $(el).find('img').attr('data-lazy-src') ||
        $(el).find('img').attr('src');

      push(title, href, img || undefined);
    });

    // -------- Layout D (fallback: any anchor to /series/) ----------
    // If everything else fails but links exist, still return something.
    if (out.length === 0) {
      $('a[href*="/series/"]').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        if (!href) return;

        const title =
          this.clean(a.attr('title')) || this.clean(a.text()) || 'Unknown';

        // Try to find an image near the link
        const img =
          a.find('img').attr('data-src') ||
          a.find('img').attr('data-lazy-src') ||
          a.find('img').attr('src') ||
          a.closest('*').find('img').first().attr('data-src') ||
          a.closest('*').find('img').first().attr('data-lazy-src') ||
          a.closest('*').find('img').first().attr('src');

        push(title, href, img || undefined);
      });
    }

    return out;
  }

  async popularNovels(pageNo: number) {
    if (pageNo !== 1) return [];
    const html = await this.fetchHtml(`${this.site}/series/`);
    const $ = load(html);
    const parsed = this.parseNovelCards($);

    return parsed.map(n => ({
      name: n.name,
      path: n.path,
      cover: n.cover,
    }));
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    if (pageNo !== 1) return [];
    const url = `${this.site}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
    const html = await this.fetchHtml(url);
    const $ = load(html);
    return this.parseNovelCards($);
  }

  async parseNovel(novelPath: string) {
    const url = novelPath.startsWith('http')
      ? novelPath
      : this.site + novelPath;
    const html = await this.fetchHtml(url);
    const $ = load(html);

    const title =
      this.clean($('h1.entry-title').text()) ||
      this.clean($('h1').first().text()) ||
      'Unknown';

    const cover = this.absolute(
      $('.summary_image img').attr('data-src') ||
        $('.summary_image img').attr('data-lazy-src') ||
        $('.summary_image img').attr('src'),
    );

    const summary =
      this.clean($('.summary__content').text()) ||
      this.clean($('.description-summary').text()) ||
      undefined;

    let statusText = '';
    $('.post-content_item').each((_, el) => {
      const label = this.clean(
        $(el).find('.summary-heading').text(),
      ).toLowerCase();
      if (label.includes('status')) {
        statusText = this.clean($(el).find('.summary-content').text());
      }
    });

    const chapters: { name: string; path: string; chapterNumber?: number }[] =
      [];

    $('li.wp-manga-chapter a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const name = this.clean($(el).text());
      chapters.push({
        name,
        path: href.replace(this.site, ''),
        chapterNumber: this.chapterNum(name),
      });
    });

    if (chapters.length === 0) {
      $('.wp-manga-chapter a').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const name = this.clean($(el).text());
        chapters.push({
          name,
          path: href.replace(this.site, ''),
          chapterNumber: this.chapterNum(name),
        });
      });
    }

    chapters.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));

    const statusLower = String(statusText).toLowerCase();
    const status =
      statusLower.includes('complete') || statusLower.includes('completed')
        ? NovelStatus.Completed
        : NovelStatus.Ongoing;

    return {
      name: title,
      path: novelPath.endsWith('/') ? novelPath : novelPath + '/',
      cover,
      summary,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string) {
    const url = chapterPath.startsWith('http')
      ? chapterPath
      : this.site + chapterPath;
    const html = await this.fetchHtml(url);
    const $ = load(html);

    const content = $('.reading-content').first().length
      ? $('.reading-content').first()
      : $('.text-left').first().length
        ? $('.text-left').first()
        : $('.entry-content').first();

    if (!content.length) {
      return `\nUnable to load chapter content.\n\n`;
    }

    content.find('script, style, ins, iframe, noscript').remove();

    return content.html() ?? '';
  }

  filters: Filters = {
    sort: {
      label: 'Sort',
      value: 'Latest',
      options: [{ label: 'Latest', value: 'Latest' }],
      type: FilterTypes.Picker,
    },
  };
}

export default new IndraTranslations();
