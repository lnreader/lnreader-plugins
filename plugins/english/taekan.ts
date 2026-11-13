import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = { name: string; path: string; status: string };

// Menu pages that are not light-novel series.
const NON_NOVEL_PATHS = new Set([
  '/dropped-series',
  '/commission-a-translation',
  '/megane-no-kanojo-chapters-3-to-8',
]);
// Illustration galleries are image-only pages, and the manga links on the
// Hundred page are image chapters, not text.
const NON_CHAPTER_PATH = /ill+ustration/i;
const NON_CHAPTER_NAME = /^Read Chapter/i;
const NON_SUMMARY_TEXT =
  /^(\*|Volume|Description|Synopsis:?$|\(Extracted|Read online|I.ve dropped|I.m afraid|As of|These two links)/i;
const PAGE_SIZE = 20;

class Taekan implements Plugin.PluginBase {
  id = 'taekan';
  name = 'Taekan';
  icon = 'src/en/taekan/icon.png';
  site = 'https://taekan.wordpress.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`Taekan: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (url.hostname !== 'taekan.wordpress.com') return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** The site's series are the pages linked from its top menu. */
  private async novelList(): Promise<NovelEntry[]> {
    const $ = await this.loadPage(this.site);
    const novels: NovelEntry[] = [];
    const seen = new Set<string>();
    $('#primary-menu a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      // Series pages live at a single-segment address, e.g. /dragon-crisis.
      if (!path || path.split('/').length !== 2) return;
      if (NON_NOVEL_PATHS.has(path) || seen.has(path)) return;
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!name) return;
      seen.add(path);
      // The menu nests finished series under "Completed / Dropped Series"
      // and abandoned ones under "Dropped Series"; anything outside that
      // group is still being translated.
      const parents = anchor
        .parents('li')
        .toArray()
        .map(li => this.pathOf($(li).children('a').first().attr('href') || ''));
      const dropped = parents.includes('/dropped-series');
      const grouped = anchor.parents('ul.sub-menu').length > 0;
      novels.push({
        name,
        path,
        status: dropped
          ? NovelStatus.Cancelled
          : grouped
            ? NovelStatus.Completed
            : NovelStatus.Ongoing,
      });
    });
    // Series still being translated come first.
    const ongoing = novels.filter(n => n.status === NovelStatus.Ongoing);
    return ongoing.concat(novels.filter(n => n.status !== NovelStatus.Ongoing));
  }

  private coverOf($: ReturnType<typeof loadCheerio>): string {
    const src = $('.entry-content img').first().attr('src') || '';
    return src.startsWith('http') ? src : defaultCover;
  }

  private async toNovelItems(
    novels: NovelEntry[],
  ): Promise<Plugin.NovelItem[]> {
    return Promise.all(
      novels.map(async novel => {
        const $ = await this.loadPage(this.resolveUrl(novel.path)).catch(
          () => undefined,
        );
        return {
          name: novel.name,
          path: novel.path,
          cover: $ ? this.coverOf($) : defaultCover,
        };
      }),
    );
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const novels = (await this.novelList()).slice(
      (pageNo - 1) * PAGE_SIZE,
      pageNo * PAGE_SIZE,
    );
    return this.toNovelItems(novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [$, entries] = await Promise.all([
      this.loadPage(this.resolveUrl(novelPath)),
      this.novelList(),
    ]);
    const entry = entries.find(item => item.path === novelPath);
    const content = $('.entry-content').first();
    content.find('script,style,noscript,.sharedaddy,#jp-post-flair').remove();

    // Chapters are single-segment pages linked from the series page, in
    // reading order. Links to other hosts (Google Drive, Baka-Tsuki, ...)
    // and download-only entries are skipped.
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    content.find('a').each((_, el) => {
      const anchor = $(el);
      const path = this.pathOf(anchor.attr('href') || '');
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!path || !name || seen.has(path)) return;
      if (!/^\/[^/]+$/.test(path) || path === novelPath) return;
      if (NON_CHAPTER_PATH.test(path) || NON_CHAPTER_NAME.test(name)) return;
      if (NON_NOVEL_PATHS.has(path)) return;
      if (entries.some(item => item.path === path)) return;
      seen.add(path);
      chapters.push({ name, path });
    });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        entry?.name ||
        $('.entry-title').first().text().replace(/\s+/g, ' ').trim(),
      cover: this.coverOf($),
      chapters,
      status: entry?.status || NovelStatus.Unknown,
    };

    // The synopsis is the run of plain paragraphs before the first chapter
    // link.
    const summary: string[] = [];
    let reachedChapters = false;
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (reachedChapters) return;
      const linksChapter = paragraph
        .find('a[href]')
        .toArray()
        .some(a => seen.has(this.pathOf($(a).attr('href') || '') || ''));
      if (linksChapter) {
        reachedChapters = true;
        return;
      }
      if (paragraph.find('a[href]').length) return;
      const text = paragraph.text().replace(/\s+/g, ' ').trim();
      if (text.length < 40 || NON_SUMMARY_TEXT.test(text)) return;
      summary.push(text);
    });
    novel.summary = summary.join('\n\n') || undefined;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('.entry-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,.sharedaddy,#jp-post-flair,[id^="more-"]',
      )
      .remove();
    content.find('p').each((_, el) => {
      const paragraph = $(el);
      if (!paragraph.text().trim() && !paragraph.find('img').length)
        paragraph.remove();
    });
    const chapter = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 200)
      throw new Error('Taekan: no readable chapter text found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site's own search returns chapter posts, so match series titles
    // against the menu instead.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toNovelItems(
      novels.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE),
    );
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.hostname !== 'taekan.wordpress.com')
      throw new Error('Taekan: invalid page address.');
    return `${this.site}${url.pathname}${url.search}`;
  }
}

export default new Taekan();
