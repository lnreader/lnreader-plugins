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
const COVER_SIZE = 's400';
const VOLUME_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/;
const LABEL_PATTERN = /label_chapter\s*=\s*(['"])(.*?)\1/;

const postHref = (entry: FeedEntry): string | undefined =>
  entry.link?.find(link => link.rel === 'alternate')?.href;

class EightysixAR implements Plugin.PluginBase {
  id = 'eightysixar';
  name = 'EightysixAR';
  icon = 'src/ar/eightysixar/icon.png';
  site = 'https://eightysixar.blogspot.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(new Error(`EightysixAR: HTTP ${response.status}.`), {
        status: response.status,
      });
    }
    return response;
  }

  /** Every post of a label, newest first, with duplicates removed. */
  private async labelPosts(label: string): Promise<FeedEntry[]> {
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
          `${this.site}/feeds/posts/summary/-/${encodeURIComponent(
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

  /** Each volume of the novel is listed as a post carrying the Series label. */
  private async volumes(): Promise<Plugin.NovelItem[]> {
    const posts = await this.labelPosts(SERIES_LABEL);
    const volumes: Plugin.NovelItem[] = [];
    // Volumes are published in reading order; the feed lists newest first.
    for (const entry of posts.slice().reverse()) {
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
    const url = this.resolveUrl(novelPath, true);
    const html = await (await this.request(url)).text();
    const $ = loadCheerio(html);

    const label = LABEL_PATTERN.exec(html)?.[2].trim();
    if (!label) throw new Error('EightysixAR: volume label was not found.');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1.post-title').first().text().trim() || label,
      cover:
        $('.post-thumbnail1').first().attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        defaultCover,
    };

    const author = $('#sinopsis .author-name').first().text().trim();
    if (author) novel.author = author;
    const artist = $('#sinopsis .artist-name').first().text().trim();
    if (artist) novel.artist = artist;
    const summary = $('#sinopsis .descManga p')
      .first()
      .html()
      ?.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (summary) novel.summary = summary;

    const status = $('.bookmark-btn1').first().attr('data-status');
    if (status === 'Completed') novel.status = NovelStatus.Completed;
    else if (status === 'Ongoing') novel.status = NovelStatus.Ongoing;

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
    const url = this.resolveUrl(chapterPath);
    const $ = loadCheerio(await (await this.request(url)).text());
    const content = $('div.post-body').first();
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
