import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { load as loadCheerio } from 'cheerio';

type FeedLink = { rel: string; href: string };
type FeedEntry = {
  title: { $t: string };
  link: FeedLink[];
  published?: { $t: string };
  category?: { term: string }[];
  content?: { $t: string };
  media$thumbnail?: { url: string };
};
type FeedResponse = {
  feed?: {
    openSearch$totalResults?: { $t: string };
    entry?: FeedEntry[];
  };
};

const SERIES_LABEL = 'Series';
const FEED_PAGE_SIZE = 150;
const RETRY_DELAY_MS = 2000;
const CACHE_TTL_MS = 60000;
const COVER_SIZE = 's400';
const VOLUME_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/;
const VOLUME_LABEL = /^Volume \d+$/;

const postHref = (entry: FeedEntry): string | undefined =>
  entry.link?.find(link => link.rel === 'alternate')?.href;

class EightysixAR implements Plugin.PluginBase {
  id = 'eightysixar';
  name = 'EightysixAR';
  icon = 'src/ar/eightysixar/icon.png';
  site = 'https://eightysixar.blogspot.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  private volumeCache?: { at: number; entries: FeedEntry[] };

  private async request(url: string) {
    let response = await fetchApi(url);
    if (response.status === 429) {
      // Blogger rate-limits bursts; wait briefly and retry once.
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      response = await fetchApi(url);
    }
    if (!response.ok) {
      throw Object.assign(new Error(`EightysixAR: HTTP ${response.status}.`), {
        status: response.status,
      });
    }
    return response;
  }

  /** Every post of a label, newest first, with duplicates removed. */
  private async labelPosts(
    label: string,
    kind: 'summary' | 'default' = 'summary',
  ): Promise<FeedEntry[]> {
    const posts: FeedEntry[] = [];
    const seen = new Set<string>();
    let start = 1;
    let total = 1;
    while (start <= total) {
      const query = new URLSearchParams({
        alt: 'json',
        'max-results': String(FEED_PAGE_SIZE),
        'start-index': String(start),
      }).toString();
      const data: FeedResponse = await (
        await this.request(
          `${this.site}/feeds/posts/${kind}/-/${encodeURIComponent(
            label,
          )}?${query}`,
        )
      ).json();
      const entries = data.feed?.entry || [];
      if (!entries.length) break;
      for (const entry of entries) {
        const href = postHref(entry);
        if (!href || seen.has(href)) continue;
        seen.add(href);
        posts.push(entry);
      }
      // Blogger can return fewer posts than asked, so step by what came back.
      start += entries.length;
      total = Number(data.feed?.openSearch$totalResults?.$t || 0);
    }
    return posts;
  }

  private isVolume(entry: FeedEntry): boolean {
    return !!entry.category?.some(category => category.term === SERIES_LABEL);
  }

  private coverFrom(entry?: FeedEntry): string {
    const thumbnail = entry?.media$thumbnail?.url;
    if (!thumbnail) return defaultCover;
    return thumbnail.replace(/\/s\d+(-c)?\//, `/${COVER_SIZE}/`);
  }

  /** Full entries of the Series label, newest first; shared via a short cache. */
  private async seriesEntries(): Promise<FeedEntry[]> {
    if (this.volumeCache && Date.now() - this.volumeCache.at < CACHE_TTL_MS)
      return this.volumeCache.entries;
    const entries = await this.labelPosts(SERIES_LABEL, 'default');
    this.volumeCache = { at: Date.now(), entries };
    return entries;
  }

  /** Each volume of the novel is listed as a post carrying the Series label. */
  private async volumes(): Promise<Plugin.NovelItem[]> {
    const volumes: Plugin.NovelItem[] = [];
    // Volumes are published in reading order; the feed lists newest first.
    for (const entry of (await this.seriesEntries()).slice().reverse()) {
      const href = postHref(entry);
      const name = entry.title?.$t?.trim();
      if (!href || !name) continue;
      const path = new URL(href).pathname;
      if (!VOLUME_PATH.test(path)) continue;
      volumes.push({ name, path, cover: this.coverFrom(entry) });
    }
    return volumes;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue fits in one page.
    if (pageNo > 1) return [];
    return this.volumes();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = new URL(this.resolveUrl(novelPath, true)).pathname;
    const entry = (await this.seriesEntries()).find(item => {
      const href = postHref(item);
      return !!href && new URL(href).pathname === path;
    });
    if (!entry) throw new Error('EightysixAR: volume was not found.');
    const categories = entry.category?.map(category => category.term) || [];
    const label = categories.find(term => VOLUME_LABEL.test(term));
    if (!label) throw new Error('EightysixAR: volume label was not found.');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: entry.title?.$t?.trim() || label,
      cover: this.coverFrom(entry),
    };

    const $ = loadCheerio(entry.content?.$t || '');
    const author = $('.author-name').first().text().trim();
    if (author) novel.author = author;
    const artist = $('.artist-name').first().text().trim();
    if (artist) novel.artist = artist;
    const summary = $('.descManga p')
      .first()
      .html()
      ?.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (summary) novel.summary = summary;

    if (categories.includes('Completed')) novel.status = NovelStatus.Completed;
    else if (categories.includes('Ongoing')) novel.status = NovelStatus.Ongoing;

    const chapters: Plugin.ChapterItem[] = [];
    // The label feed also contains the volume's own page; skip it.
    for (const entry of (await this.labelPosts(label)).slice().reverse()) {
      const href = postHref(entry);
      const name = entry.title?.$t?.trim();
      if (!href || !name || this.isVolume(entry)) continue;
      const path = new URL(href).pathname;
      if (!VOLUME_PATH.test(path)) continue;
      chapters.push({ name, path, releaseTime: entry.published?.$t });
    }
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = new URL(this.resolveUrl(chapterPath)).pathname;
    if (!VOLUME_PATH.test(path))
      throw new Error('EightysixAR: invalid page address.');
    // Blogspot throttles post pages; the JSON feed serves the same body.
    const data: FeedResponse = await (
      await this.request(
        `${this.site}/feeds/posts/default?alt=json&path=${encodeURIComponent(
          path,
        )}`,
      )
    ).json();
    const html = data.feed?.entry?.[0]?.content?.$t;
    if (!html) throw new Error('EightysixAR: chapter not found.');
    const $ = loadCheerio(`<div>${html}</div>`);
    const content = $('div').first();
    content.find('script,style,iframe,noscript,form').remove();
    const chapter = content.html()?.trim() || '';
    const hasImages = content.find('img').length > 0;
    if (!hasImages && content.text().trim().length < 100)
      throw new Error('EightysixAR: no readable chapter text was found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site only has a handful of volumes, so filter them by title.
    return (await this.volumes()).filter(volume =>
      terms.every(term => volume.name.toLowerCase().includes(term)),
    );
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    void isNovel;
    const url = new URL(path, this.site);
    if (url.origin !== this.site)
      throw new Error('EightysixAR: invalid page address.');
    return url.href;
  }
}

export default new EightysixAR();
