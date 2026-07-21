import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

type WPPage = {
  title: { rendered: string };
  slug: string;
  date: string;
  content?: { rendered: string };
  featured_media: number;
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string }>;
  };
};

class RewayatFans implements Plugin.PluginBase {
  id = 'rewayatfans';
  name = 'روايات فانز';
  version = '4.0.0';
  icon = 'src/ar/rewayatfans/icon.png';
  site = 'https://rewayatfans.com/';

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
      const href = linkEl.attr('href') || fig.find('a').first().attr('href') || '';
      const name = linkEl.text().trim();
      const cover = fig.find('img').attr('src') || '';

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
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const allNovels = await this.loadAllNovels();
    if (page > 1) return [];
    return allNovels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      chapters: [],
    };

    const slugBase = novelPath.replace(/\/$/, '').split('/').pop() || novelPath;

    let pg = 1;
    let hasMore = true;

    while (hasMore) {
      const pages = await this.fetchJson<WPPage[]>(
        `${this.site}wp-json/wp/v2/pages?per_page=100&page=${pg}&orderby=title&order=asc&_fields=slug,title,date`,
      );

      if (pages.length === 0) {
        hasMore = false;
        break;
      }

      for (const page of pages) {
        if (!page.slug.startsWith(slugBase)) continue;

        const numMatch = page.slug.match(/(\d+)$/);
        if (numMatch) {
          const chapterNum = parseInt(numMatch[1], 10);

          if (!novel.chapters!.find(c => c.chapterNumber === chapterNum)) {
            if (!novel.name) {
              novel.name = this.extractNovelName(page.title.rendered);
            }
            novel.chapters!.push({
              name: this.extractChapterNumber(page.title.rendered),
              path: page.slug,
              chapterNumber: chapterNum,
              releaseTime: page.date,
            });
          }
        }
      }

      if (pages.length < 100) hasMore = false;
      pg++;
    }

    novel.chapters!.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const pages = await this.fetchJson<WPPage[]>(
      `${this.site}wp-json/wp/v2/pages?slug=${chapterPath}&_fields=content`,
    );

    const arr = Array.isArray(pages) ? pages : [pages];
    if (arr.length > 0 && arr[0].content?.rendered) {
      const $ = parseHTML(arr[0].content.rendered);
      $('script, style, .sharedaddy, .jp-relatedposts, .wp-block-spacer').remove();
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

  private extractChapterNumber(title: string): string {
    const match = title.match(/(\d+(?:-\d+)?)\s*$/);
    return match ? match[1] : title.trim();
  }
}

export default new RewayatFans();
