import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type FeedLink = { rel: string; href: string };
type FeedEntry = {
  title: { $t: string };
  link: FeedLink[];
  published?: { $t: string };
  media$thumbnail?: { url: string };
};
type FeedResponse = {
  feed?: {
    openSearch$totalResults?: { $t: string };
    category?: { term: string }[];
    entry?: FeedEntry[];
  };
};

const PAGE_SIZE = 20;
const FEED_PAGE_SIZE = 150;
const COVER_SIZE = 's320';
const CHAPTER_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/;
const NOVEL_PATH = /^\/search\/label\/(.+)$/;
// Labels that are series names double as novels. The ones below group posts by
// genre or are not stories at all.
const EXCLUDED_LABELS = new Set([
  'ফ্যান্টাসি গল্প',
  'রোমান্টিক গল্প',
  'সামাজিক গল্প',
  'এসাইনমেন্ট',
  'Web Novel Link',
]);

const postHref = (entry: FeedEntry): string | undefined =>
  entry.link?.find(link => link.rel === 'alternate')?.href;

class GolperCity implements Plugin.PluginBase {
  id = 'golpercity';
  name = 'Golper City';
  icon = 'src/bn/golpercity/icon.png';
  site = 'https://golpercity.blogspot.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(new Error(`Golper City: HTTP ${response.status}.`), {
        status: response.status,
      });
    }
    return response;
  }

  private async getFeed(
    params: Record<string, string>,
    label?: string,
  ): Promise<FeedResponse['feed']> {
    const feed = label ? `summary/-/${encodeURIComponent(label)}` : 'summary';
    const query = new URLSearchParams({ alt: 'json', ...params }).toString();
    const data: FeedResponse = await (
      await this.request(`${this.site}/feeds/posts/${feed}?${query}`)
    ).json();
    return data.feed;
  }

  /** Blogger's label list is the blog's own grouping of novels. */
  private async novelLabels(): Promise<string[]> {
    const feed = await this.getFeed({ 'max-results': '1' });
    return (feed?.category || [])
      .map(category => category.term)
      .filter(label => !EXCLUDED_LABELS.has(label));
  }

  private novelPath(label: string): string {
    return `/search/label/${encodeURIComponent(label)}`;
  }

  private labelFromPath(novelPath: string): string {
    const match = NOVEL_PATH.exec(new URL(novelPath, this.site).pathname);
    if (!match) throw new Error('Golper City: invalid novel address.');
    return decodeURIComponent(match[1]);
  }

  private coverFrom(entry?: FeedEntry): string {
    const thumbnail = entry?.media$thumbnail?.url;
    if (!thumbnail) return defaultCover;
    return thumbnail.replace(/\/s\d+(-c)?\//, `/${COVER_SIZE}/`);
  }

  /** Each novel's cover is the thumbnail of its newest post, if any. */
  private async toNovelItems(labels: string[]): Promise<Plugin.NovelItem[]> {
    return Promise.all(
      labels.map(async label => {
        const feed = await this.getFeed({ 'max-results': '1' }, label).catch(
          () => undefined,
        );
        return {
          name: label,
          path: this.novelPath(label),
          cover: this.coverFrom(feed?.entry?.[0]),
        };
      }),
    );
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const labels = (await this.novelLabels()).slice(
      (pageNo - 1) * PAGE_SIZE,
      pageNo * PAGE_SIZE,
    );
    return this.toNovelItems(labels);
  }

  /** Every post of a label, newest first, with duplicates across pages removed. */
  private async labelPosts(label: string): Promise<FeedEntry[]> {
    const posts: FeedEntry[] = [];
    const seen = new Set<string>();
    let start = 1;
    let total = 1;
    while (start <= total) {
      const feed = await this.getFeed(
        {
          'max-results': String(FEED_PAGE_SIZE),
          'start-index': String(start),
        },
        label,
      );
      const entries = feed?.entry || [];
      if (!entries.length) break;
      for (const entry of entries) {
        const href = postHref(entry);
        if (!href || seen.has(href)) continue;
        seen.add(href);
        posts.push(entry);
      }
      // Blogger returns fewer posts than asked per page, so step by what came back.
      start += entries.length;
      total = Number(feed?.openSearch$totalResults?.$t || 0);
    }
    return posts;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const label = this.labelFromPath(novelPath);
    const posts = await this.labelPosts(label);

    const chapters: Plugin.ChapterItem[] = [];
    for (const entry of posts) {
      const href = postHref(entry);
      const name = entry.title?.$t?.trim();
      if (!href || !name) continue;
      const path = new URL(href).pathname;
      if (!CHAPTER_PATH.test(path)) continue;
      chapters.push({
        name,
        path,
        releaseTime: entry.published?.$t,
      });
    }
    if (!chapters.length)
      throw new Error('Golper City: no chapters were found.');

    // Blogger lists newest first; readers expect the series in publish order.
    chapters.reverse();

    return {
      name: label,
      path: this.novelPath(label),
      cover: this.coverFrom(posts[0]),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.resolveUrl(chapterPath);
    const $ = loadCheerio(await (await this.request(url)).text());
    const content = $('div.post-body').first();
    content
      .find(
        'script,style,iframe,noscript,form,.sharethis-inline-reaction-buttons',
      )
      .remove();
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // Searching the label catalogue finds novels by name. Blogger's post
    // search would return chapter posts instead, which crowd novels out.
    const labels = (await this.novelLabels()).filter(label =>
      terms.every(term => label.toLowerCase().includes(term)),
    );
    return this.toNovelItems(
      labels.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE),
    );
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.origin !== this.site)
      throw new Error('Golper City: invalid page address.');
    return url.href;
  }
}

export default new GolperCity();
