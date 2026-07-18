import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

type WPPage = {
  title: { rendered: string };
  slug: string;
  date: string;
  featured_media: number;
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string }>;
  };
};

class RewayatFans implements Plugin.PluginBase {
  id = 'rewayatfans';
  name = 'روايات فانز';
  version = '3.2.0';
  icon = 'src/ar/rewayatfans/icon.png';
  site = 'https://rewayatfans.com/';

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

  private getCover(page: WPPage): string {
    return page._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  }

  async popularNovels(
    page: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const pages = await this.fetchJson<WPPage[]>(
      `${this.site}wp-json/wp/v2/pages?per_page=20&page=${page}&orderby=date&order=desc&_embed`,
    );

    const seen = new Set<string>();
    const novels: Plugin.NovelItem[] = [];

    for (const page of pages) {
      const novelName = this.extractNovelName(page.title.rendered);
      if (novelName && !seen.has(novelName)) {
        seen.add(novelName);
        novels.push({
          name: novelName,
          path: page.slug,
          cover: this.getCover(page),
        });
      }
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      chapters: [],
    };

    const slugBase = novelPath.replace(/\/$/, '').split('/').pop() || novelPath;
    const novelPrefix = slugBase.replace(/-\d+$/, '');

    let pg = 1;
    let hasMore = true;

    while (hasMore) {
      const pages = await this.fetchJson<WPPage[]>(
        `${this.site}wp-json/wp/v2/pages?search=${encodeURIComponent(novelPrefix.replace(/-/g, ' '))}&per_page=100&page=${pg}&_fields=slug,title,date`,
      );

      if (pages.length === 0) {
        hasMore = false;
        break;
      }

      for (const page of pages) {
        if (page.slug.startsWith(novelPrefix)) {
          if (!novel.name) {
            novel.name = this.extractNovelName(page.title.rendered);
          }
          const numMatch = page.slug.match(/(\d+)$/);
          const chapterNum = numMatch ? parseInt(numMatch[1], 10) : 0;

          novel.chapters!.push({
            name: page.title.rendered,
            path: page.slug,
            chapterNumber: chapterNum,
            releaseTime: page.date,
          });
        }
      }

      if (pages.length < 100) hasMore = false;
      pg++;
    }

    novel.chapters!.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

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
    const pages = await this.fetchJson<WPPage[]>(
      `${this.site}wp-json/wp/v2/pages?search=${encodeURIComponent(searchTerm)}&per_page=20&page=${page}&_embed`,
    );

    const seen = new Set<string>();
    const novels: Plugin.NovelItem[] = [];

    for (const page of pages) {
      const novelName = this.extractNovelName(page.title.rendered);
      if (novelName && !seen.has(novelName)) {
        seen.add(novelName);
        novels.push({
          name: novelName,
          path: page.slug,
          cover: this.getCover(page),
        });
      }
    }

    return novels;
  }

  private extractNovelName(title: string): string {
    const match = title.match(/^(.+?)\s+\d+$/);
    return match ? match[1].trim() : title.trim();
  }
}

export default new RewayatFans();
