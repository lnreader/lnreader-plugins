import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type FeedLink = { rel: string; href: string };
type FeedEntry = {
  title: { $t: string };
  link: FeedLink[];
  published?: { $t: string };
  updated?: { $t: string };
  category?: { term: string }[];
  content?: { $t: string };
};
type FeedResponse = {
  feed?: {
    openSearch$totalResults?: { $t: string };
    entry?: FeedEntry[];
  };
};

const NOVEL_LABEL = 'Web Novel';
const PAGE_SIZE = 25;
const CHAPTER_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/;
const PLACEHOLDER_COVER = 'No_image_available';

class Toasteful implements Plugin.PluginBase {
  id = 'toasteful';
  name = 'Toasteful';
  site = 'https://www.toasteful.com';
  icon = 'src/en/toasteful/icon.png';
  version = '1.0.1';

  filters: Filters = {
    genres: {
      label: 'Genres',
      value: [],
      options: [
        'Action',
        'Adventure',
        'Comedy',
        'Drama',
        'Ecchi',
        'Fantasy',
        'Harem',
        'Isekai',
        'Reincarnation',
        'Romance',
        'Slice of Life',
        'Slow Life',
        'Supernatural',
        'Overpowered',
        'Villain',
      ].map(label => ({ label, value: label })),
      type: FilterTypes.CheckboxGroup,
    },
  };

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(new Error(`Toasteful: HTTP ${response.status}.`), {
        status: response.status,
      });
    }
    return response;
  }

  private feedUrl(labels: string[], params: Record<string, string>): string {
    const path = labels.map(label => encodeURIComponent(label)).join('/');
    const query = new URLSearchParams({
      'alt': 'json',
      ...params,
    }).toString();
    return `${this.site}/feeds/posts/default/-/${path}?${query}`;
  }

  private entryToNovel(entry: FeedEntry): Plugin.NovelItem | undefined {
    try {
      const href = entry.link?.find(link => link.rel === 'alternate')?.href;
      if (!href) return undefined;
      const name = entry.title?.$t?.replace(/^\(NEW!!!\)\s*/, '').trim();
      if (!name) return undefined;
      const resolved = this.resolveUrl(href);
      let cover: string | undefined;
      const html = entry.content?.$t;
      if (html) {
        const src = loadCheerio(html)('img').first().attr('src');
        if (src && !src.includes(PLACEHOLDER_COVER)) cover = src;
      }
      return {
        name,
        path: new URL(resolved).pathname,
        cover: cover || defaultCover,
      };
    } catch {
      return undefined;
    }
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const labels = [NOVEL_LABEL, ...(filters?.genres?.value || [])];
    const params: Record<string, string> = {
      'max-results': String(PAGE_SIZE),
      'start-index': String((pageNo - 1) * PAGE_SIZE + 1),
    };
    if (showLatestNovels) params['orderby'] = 'updated';
    const data: FeedResponse = await (
      await this.request(this.feedUrl(labels, params))
    ).json();
    const entries = data.feed?.entry || [];
    const novels: Plugin.NovelItem[] = [];
    for (const entry of entries) {
      const novel = this.entryToNovel(entry);
      if (novel) novels.push(novel);
    }
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.resolveUrl(novelPath);
    const $ = loadCheerio(await (await this.request(url)).text());
    const name =
      $('h3.post-title').text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      'Untitled';

    const coverSrc =
      $('link[rel="image_src"]').attr('href') ||
      $('.post-body img').first().attr('src');
    const cover =
      coverSrc && !coverSrc.includes(PLACEHOLDER_COVER)
        ? coverSrc
        : defaultCover;

    const labels = $('span.post-labels a[rel="tag"]')
      .toArray()
      .map(el => $(el).text().trim())
      .filter(Boolean);
    const statusLabel = labels
      .find(label => /completed|on-?going|dropped|hiatus/i.test(label))
      ?.toLowerCase();
    let status: string | undefined;
    if (statusLabel) {
      if (/completed/.test(statusLabel)) status = NovelStatus.Completed;
      else if (/on-?going/.test(statusLabel)) status = NovelStatus.Ongoing;
      else if (/dropped/.test(statusLabel)) status = NovelStatus.Cancelled;
      else if (/hiatus/.test(statusLabel)) status = NovelStatus.OnHiatus;
    }
    const normalize = (text: string) =>
      text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const novelLabel = normalize(name);
    const genres = labels
      .filter(
        label =>
          !/completed|on-?going|dropped|hiatus/i.test(label) &&
          label.toLowerCase() !== NOVEL_LABEL.toLowerCase() &&
          label.toLowerCase() !== 'light novel' &&
          normalize(label) !== novelLabel,
      )
      .join(', ');

    const authorText = $('.post-body')
      .find('b')
      .toArray()
      .map(el => $(el).parent().text())
      .find(text => /^author:/i.test(text.trim()));
    const author = authorText
      ? authorText
          .trim()
          .replace(/^author:\s*/i, '')
          .split(/\n|genre:|raw\s*source:|raw:|status:|synopsis:/i)[0]
          ?.trim() || undefined
      : undefined;

    const body = $('.post-body').first();
    let summary = '';
    const article = body.find('article').first();
    if (article.length) {
      const synopsis = article.clone();
      synopsis.find('b').each((_, el) => {
        if (/^synopsis:/i.test($(el).text().trim())) $(el).remove();
      });
      summary = synopsis.text().trim();
    } else {
      const paragraphs: string[] = [];
      let inChapters = false;
      body.find('p, a[href]').each((_, el) => {
        const node = $(el);
        if (node.is('a')) {
          if (this.isChapterLink(node.attr('href'), url, node.text()))
            inChapters = true;
          return;
        }
        if (inChapters) return;
        const text = node.text().trim();
        if (!text || /^genre:/i.test(text) || /raw source:/i.test(text)) return;
        paragraphs.push(text);
      });
      summary = paragraphs.join('\n\n');
    }

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    let volume: string | undefined;
    body.find('b, a[href]').each((_, el) => {
      const node = $(el);
      if (node.is('a')) {
        const href = node.attr('href');
        if (!this.isChapterLink(href, url, node.text())) return;
        const chapterPath = new URL(href!, this.site).pathname;
        if (seen.has(chapterPath)) return;
        seen.add(chapterPath);
        const chapterName = node.text().trim().replace(/\s+/g, ' ');
        if (!chapterName) return;
        const number = /chapter\s+(\d+(?:\.\d+)?)/i.exec(chapterName)?.[1];
        chapters.push({
          name: volume ? `${volume} - ${chapterName}` : chapterName,
          path: chapterPath,
          chapterNumber: number ? Number(number) : undefined,
        });
        return;
      }
      if (node.find('a[href]').length) return;
      const text = node.text().trim().replace(/\s+/g, ' ');
      if (/^(volume|afterstory)\b/i.test(text)) volume = text;
    });

    if (!chapters.length)
      throw new Error('Toasteful: no chapters were found on this page.');

    return {
      name,
      path: new URL(url).pathname,
      cover,
      summary: summary || undefined,
      author,
      genres: genres || undefined,
      status,
      chapters,
    };
  }

  private isChapterLink(
    href: string | undefined,
    pageUrl: string,
    linkText: string,
  ): boolean {
    if (!href) return false;
    let path: string;
    try {
      const parsed = new URL(href, this.site);
      if (parsed.origin !== this.site) return false;
      path = parsed.pathname;
    } catch {
      return false;
    }
    if (!CHAPTER_PATH.test(path)) return false;
    if (path === new URL(pageUrl).pathname) return false;
    // Side-story hubs are linked as bare "here" pointers, not chapters.
    if (linkText.trim().toLowerCase() === 'here') return false;
    if (
      !/\b(chapter|episode|part|prologue|epilogue|interlude|afterstory|volume)\b|\bside\s*story\b/i.test(
        linkText,
      )
    )
      return false;
    return true;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.resolveUrl(chapterPath);
    const $ = loadCheerio(await (await this.request(url)).text());
    const content = $('.content-post').first().length
      ? $('.content-post').first()
      : $('.post-body').first();
    content.find('script,style,iframe,form,noscript,.ChapterNav').remove();
    content
      .find(
        '.reader-toolbar,.js-notice,.adsbygoogle,.ad,.ads,[class^="ad-"],[class*=" ad-"]',
      )
      .remove();
    content.find('a[href*="docs.google.com/forms"]').remove();
    const junk =
      /hello,?\s+we have a (new|other)|we also have a similar genre|please bookmark this series|report error/i;
    content.find('div,p').each((_, el) => {
      const node = $(el);
      if (node.is('div') && node.find('p,div').length) return;
      if (junk.test(node.text().trim())) node.remove();
    });
    const chapter = content.html() || '';
    if (loadCheerio(chapter).text().trim().length < 200)
      throw new Error('Toasteful: no readable chapter text was found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const tokens = searchTerm
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (!tokens.length) return [];
    // Blogger ignores the /-/label path once q is present, so a q search
    // returns chapter posts that crowd novels out of the window. Search the
    // labeled novel list instead: one feed holds the whole catalogue, so
    // matching novels can never be crowded out and paging is exact.
    const novels: Plugin.NovelItem[] = [];
    let start = 1;
    for (let round = 0; round < 4; round++) {
      const data: FeedResponse = await (
        await this.request(
          this.feedUrl([NOVEL_LABEL], {
            'max-results': '150',
            'start-index': String(start),
          }),
        )
      ).json();
      const entries = data.feed?.entry || [];
      if (!entries.length) break;
      for (const entry of entries) {
        const novel = this.entryToNovel(entry);
        if (!novel || novels.some(item => item.path === novel.path)) continue;
        const name = novel.name.toLowerCase();
        if (tokens.every(token => name.includes(token))) novels.push(novel);
      }
      const total = Number(data.feed?.openSearch$totalResults?.$t || 0);
      start += entries.length;
      if (!total || start > total) break;
    }
    return novels.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.origin !== this.site)
      throw new Error('Toasteful: invalid page address.');
    return url.href;
  }
}

export default new Toasteful();
