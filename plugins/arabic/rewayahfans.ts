import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

type WPPage = {
  title: { rendered: string };
  slug: string;
  date: string;
  content?: { rendered: string };
  _embedded?: {
    'wp:featuredmedia'?: { source_url: string }[];
  };
};

class RewayahFans implements Plugin.PluginBase {
  id = 'rewayahfans';
  name = 'روايه فانز';
  version = '1.0.0';
  icon = 'src/ar/rewayahfans/icon.png';
  site = 'https://rewayahfans.net/';

  private allNovels: Plugin.NovelItem[] = [];

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.text();
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    const decoded = url
      .replace(/&amp;/g, '&')
      .replace(/&#038;/g, '&')
      .trim();
    if (decoded.startsWith('http')) return decoded;
    if (decoded.startsWith('//')) return `https:${decoded}`;
    if (decoded.startsWith('/'))
      return `${this.site}${decoded.replace(/^\//, '')}`;
    return `${this.site}${decoded}`;
  }

  private async loadAllNovels(): Promise<Plugin.NovelItem[]> {
    if (this.allNovels.length > 0) return this.allNovels;

    const html = await this.fetchHtml(
      `${this.site}%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%b1%d9%88%d8%a7%d9%8a%d8%a7%d8%aa/`,
    );
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('figure.wp-block-image').each((_, el) => {
      const fig = $(el);
      const linkEl = fig.find('figcaption a').first();
      const href =
        linkEl.attr('href') || fig.find('a').first().attr('href') || '';
      const name = linkEl.text().trim();
      const cover = this.normalizeUrl(
        fig.find('img').attr('data-src') ||
          fig.find('img').attr('data-lazy-src') ||
          fig.find('img').attr('src') ||
          '',
      );

      if (name && href) {
        const path = href.replace(this.site, '').replace(/\/$/, '');
        if (!seen.has(path)) {
          seen.add(path);
          novels.push({ name, path, cover });
        }
      }
    });

    this.allNovels = novels;
    return novels;
  }

  async popularNovels(
    page: number,
    _options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const allNovels = await this.loadAllNovels();
    if (page > 1) return [];
    return allNovels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      cover: '',
      summary: '',
      author: '',
      genres: '',
      status: '',
      chapters: [],
    };

    const html = await this.fetchHtml(`${this.site}${novelPath}`);
    const $ = parseHTML(html);

    const titleTag = $('title').text().trim();
    novel.name =
      titleTag.split(' - ')[0].trim() ||
      titleTag.split('\u2013')[0].trim() ||
      'بدون عنوان';

    novel.name = this.extractNovelName(novel.name);

    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    novel.cover = this.normalizeUrl(ogImage);

    if (!novel.cover) {
      const coverImg = $('img')
        .filter(function () {
          const src = $(this).attr('data-src') || $(this).attr('src') || '';
          return src.includes('wp-content/uploads');
        })
        .first();
      novel.cover = this.normalizeUrl(
        coverImg.attr('data-src') || coverImg.attr('src') || '',
      );
    }

    const summaryParts: string[] = [];
    let inStory = false;
    let inChapters = false;
    $('.entry-content > *').each((_, el) => {
      const $el = $(el);
      const tag = $el.prop('tagName')?.toLowerCase() || '';
      const text = $el.text().trim();

      if (tag === 'p' && text.startsWith('القصة')) {
        inStory = true;
        return;
      }
      if (inStory) {
        if (tag === 'p' && text.startsWith('الفصول')) {
          inChapters = true;
          return false;
        }
        if (tag === 'p' && text && !inChapters) {
          summaryParts.push(text);
        }
      }
    });
    novel.summary = summaryParts.join('\n') || '';

    const metadataMap: Record<string, string> = {};
    $('ul.wp-block-list li').each((_, el) => {
      const text = $(el).text().trim();
      const colonIdx = text.indexOf(':');
      if (colonIdx > 0) {
        const key = text.substring(0, colonIdx).trim();
        const value = text.substring(colonIdx + 1).trim();
        metadataMap[key] = value;
      }
    });

    novel.author = metadataMap['المؤلف'] || '';
    novel.genres = metadataMap['التصنيفات'] || '';
    novel.status = metadataMap['الحالة'] || '';

    const chapterSet = new Set<string>();

    const chapterSection = $(
      'p:contains("الفصول"), p:contains("Chapters"), p:contains("Fichier"), p:contains("Capitulos"), p:contains("Capítulos"), p:contains("Chapitres"), p:contains("Kapitel"), p:contains("Файл"), p:contains("Глава"), p:contains("章")',
    );

    if (chapterSection.length > 0) {
      chapterSection.nextAll().each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('wp-block-paragraph') || $el.is('p')) {
          $el.find('a').each((_, aEl) => {
            const href = $(aEl).attr('href') || '';
            const text = $(aEl).text().trim();
            if (!href || !text) return;
            if (!href.startsWith(this.site)) return;
            const chapterPath = href.replace(this.site, '').replace(/\/$/, '');
            if (chapterPath === novelPath) return;
            if (chapterSet.has(chapterPath)) return;
            const numMatch = text.match(/(\d+)/);
            if (!numMatch) return;
            const chapterNum = parseInt(numMatch[1], 10);
            if (chapterNum === 0) return;
            const cleanName = text.replace(/\bnew\b/i, '').trim();
            if (cleanName.includes('النهاية')) return;
            if (cleanName.includes('اضغط هنا')) return;
            if (cleanName.includes('Summary')) return;
            chapterSet.add(chapterPath);
            novel.chapters!.push({
              name: cleanName,
              path: chapterPath,
              chapterNumber: chapterNum,
            });
          });
        } else {
          return false;
        }
      });
    }

    novel.chapters!.sort(
      (a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0),
    );

    if (!novel.name && novel.chapters!.length > 0) {
      novel.name = this.extractNovelName(novel.chapters![0].name);
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const pages = await this.fetchJson<WPPage[]>(
      `${this.site}wp-json/wp/v2/pages?slug=${chapterPath}&_fields=content`,
    );

    const arr = Array.isArray(pages) ? pages : [pages];
    if (arr.length > 0 && arr[0].content?.rendered) {
      const $ = parseHTML(arr[0].content.rendered);
      $(
        'script, style, .sharedaddy, .jp-relatedposts, .wp-block-spacer, .simplefavorite-button, .wp-block-jetpack-rating-star',
      ).remove();
      return $.html();
    }

    const html = await this.fetchHtml(`${this.site}${chapterPath}/`);
    const $ = parseHTML(html);
    const content =
      $('article .entry-content, .post-content, .entry-content').html() || '';
    return content || '<p>المحتوى غير متاح.</p>';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const allNovels = await this.loadAllNovels();
    const lower = searchTerm.toLowerCase();
    const filtered = allNovels.filter(n =>
      n.name.toLowerCase().includes(lower),
    );
    const perPage = 20;
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }

  private extractNovelName(title: string): string {
    const match = title.match(/^(.+?)\s+\d+$/);
    return match ? match[1].trim() : title.trim();
  }
}

export default new RewayahFans();
