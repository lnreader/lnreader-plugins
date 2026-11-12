import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type NovelEntry = Plugin.NovelItem & {
  status: string;
  chapters: Plugin.ChapterItem[];
  summary?: string;
  author?: string;
};

// Top menu entries that group novels by state; each one links to an index page.
const STATUS_BY_GROUP: Record<string, string> = {
  '/ongoing-projects': NovelStatus.Ongoing,
  '/completed-series': NovelStatus.Completed,
  '/dropped': NovelStatus.Cancelled,
};
const NON_CHAPTER_ROOTS = new Set(['category', 'tag', 'author', 'wp-content']);
const SUMMARY_LABEL = /^(summary|description|synopsis)\s*:?$/i;
const SUMMARY_END = /^(chapters?|toc|table of contents?)\s*:?$/i;
const FETCH_BATCH_SIZE = 4;
const PAGE_SIZE = 20;

class ItsAMeTranslations implements Plugin.PluginBase {
  id = 'itsametranslations';
  name = 'Its A Me Translations';
  icon = 'src/en/itsametranslations/icon.png';
  site = 'https://itsame-translations.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private novels?: Promise<NovelEntry[]>;

  private async loadPage(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`Its A Me Translations: HTTP ${response.status}.`);
    }
    return loadCheerio(await response.text());
  }

  private pathOf(href: string): string | undefined {
    try {
      const url = new URL(href, this.site);
      if (url.hostname.replace(/^www\./, '') !== 'itsame-translations.com')
        return undefined;
      return url.pathname.replace(/\/+$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  private imageOf(img: ReturnType<ReturnType<typeof loadCheerio>>) {
    const src = img.attr('data-src') || img.attr('src') || '';
    return /^https?:/.test(src) ? src : undefined;
  }

  /** Reads the cover, summary, author and chapter list of one project page. */
  private async loadNovel(
    path: string,
    name: string,
    status: string,
  ): Promise<NovelEntry> {
    const $ = await this.loadPage(this.resolveUrl(path));
    const content = $('article .entry-content').first();

    const cover =
      this.imageOf($('article img.wp-post-image').first()) ||
      this.imageOf(content.find('img').first()) ||
      defaultCover;

    // Chapters are posts at /<category>/<slug>. Anything else (other project
    // pages, the old wordpress.com blog, Syosetu raws) is not a chapter.
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    content.find('a[href]').each((_, el) => {
      const anchor = $(el);
      const chapterPath = this.pathOf(anchor.attr('href') || '');
      if (!chapterPath || seen.has(chapterPath)) return;
      const parts = chapterPath.split('/');
      if (parts.length !== 3 || NON_CHAPTER_ROOTS.has(parts[1])) return;
      let chapterName = anchor.text().replace(/\s+/g, ' ').trim();
      if (!chapterName) return;
      // "Part I" only makes sense with the chapter it belongs to.
      if (/^part\b/i.test(chapterName)) {
        const parent = anchor
          .closest('ul')
          .parent('li')
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        if (parent) chapterName = `${parent} - ${chapterName}`;
      }
      seen.add(chapterPath);
      chapters.push({ name: chapterName, path: chapterPath });
    });

    // Volume illustrations, afterwords and similar entries repeat across
    // volumes; tell them apart by the volume number in their address.
    const nameCount = new Map<string, number>();
    chapters.forEach(chapter =>
      nameCount.set(chapter.name, (nameCount.get(chapter.name) || 0) + 1),
    );
    chapters.forEach(chapter => {
      if ((nameCount.get(chapter.name) || 0) < 2) return;
      const volume = /[-/]v(?:ol(?:ume)?)?-?(\d+)(?:-|$)/i.exec(chapter.path);
      if (volume) chapter.name = `${chapter.name} (Vol ${volume[1]})`;
    });

    let author: string | undefined;
    const summary: string[] = [];
    let inSummary = false;
    content.children().each((_, el) => {
      const block = $(el);
      const text = block.text().replace(/\s+/g, ' ').trim();
      const authorMatch = /^Author\s*:\s*(.+)$/i.exec(text);
      if (authorMatch) author = authorMatch[1].trim();
      if (el.tagName === 'ul' || el.tagName === 'ol') {
        inSummary = false;
        return;
      }
      if (SUMMARY_LABEL.test(text)) {
        inSummary = true;
        return;
      }
      if (SUMMARY_END.test(text)) inSummary = false;
      if (inSummary && el.tagName === 'p' && text && !block.find('a').length)
        summary.push(text);
    });

    return {
      name,
      path,
      cover,
      status,
      chapters,
      author,
      summary: summary.join('\n\n') || undefined,
    };
  }

  /** The novels are the project pages linked from the site's top menu. */
  private novelList(): Promise<NovelEntry[]> {
    if (!this.novels) {
      const pending = this.fetchNovelList().then(({ novels, complete }) => {
        if (!complete && this.novels === pending) this.novels = undefined;
        return novels;
      });
      this.novels = pending;
      pending.catch(() => {
        if (this.novels === pending) this.novels = undefined;
      });
    }
    return this.novels;
  }

  private async fetchNovelList(): Promise<{
    novels: NovelEntry[];
    complete: boolean;
  }> {
    const $ = await this.loadPage(this.site);
    const found: { name: string; path: string; status: string }[] = [];
    const seen = new Set<string>();
    $('#primary-menu > li').each((_, group) => {
      const groupEl = $(group);
      const groupPath = this.pathOf(groupEl.children('a').attr('href') || '');
      const status = STATUS_BY_GROUP[groupPath || ''];
      if (!status) return;
      groupEl.find('ul.sub-menu a').each((__, el) => {
        const anchor = $(el);
        const path = this.pathOf(anchor.attr('href') || '');
        const name = anchor.text().replace(/\s+/g, ' ').trim();
        // Novel pages sit at a single-segment address; announcement posts do not.
        if (!path || !name || path.split('/').length !== 2 || seen.has(path))
          return;
        seen.add(path);
        found.push({ name, path, status });
      });
    });

    const loaded: (NovelEntry | undefined)[] = [];
    let complete = true;
    for (let i = 0; i < found.length; i += FETCH_BATCH_SIZE) {
      const batch = await Promise.all(
        found.slice(i, i + FETCH_BATCH_SIZE).map(item =>
          this.loadNovel(item.path, item.name, item.status).catch(() => {
            complete = false;
            return undefined;
          }),
        ),
      );
      loaded.push(...batch);
    }
    // Every project failing to load is a fetch problem, not an empty source.
    if (found.length && loaded.every(novel => !novel))
      throw new Error('Its A Me Translations: could not load any novel.');
    // Dropped projects whose chapters only exist on the old blog have nothing
    // to read here.
    const novels = loaded.filter(
      (novel): novel is NovelEntry => !!novel && novel.chapters.length > 0,
    );
    return { novels, complete };
  }

  private toItems(novels: NovelEntry[], pageNo: number): Plugin.NovelItem[] {
    return novels
      .slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE)
      .map(({ name, path, cover }) => ({ name, path, cover }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    return this.toItems(await this.novelList(), pageNo);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const listed = (await this.novelList()).find(
      item => item.path === novelPath,
    );
    if (!listed) throw new Error('Its A Me Translations: novel not found.');
    // The catalog is cached, but the chapter list must be current when a
    // novel is opened or refreshed, so read its project page again.
    const novel = await this.loadNovel(listed.path, listed.name, listed.status);
    return {
      path: novel.path,
      name: novel.name,
      cover: novel.cover,
      author: novel.author,
      summary: novel.summary,
      status: novel.status,
      chapters: novel.chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(this.resolveUrl(chapterPath));
    const content = $('article .entry-content').first();
    content
      .find(
        'script,style,iframe,noscript,form,.sharedaddy,.jetpack-likes-widget-wrapper',
      )
      .remove();
    content.find('p,figure').each((_, el) => {
      const block = $(el);
      const text = block.text().replace(/\s+/g, ' ').trim();
      const isNavigation = /\bToC\b/.test(text) && text.length < 60;
      const isDonation = block.find('a[href*="ko-fi.com"]').length > 0;
      const isEmpty = !text && !block.find('img').length;
      if (isNavigation || (isDonation && text.length < 160) || isEmpty)
        block.remove();
    });
    // Lazy-loaded images keep their real address in data-src.
    content.find('img[data-src]').each((_, el) => {
      $(el).attr('src', $(el).attr('data-src') || '');
    });
    const chapter = content.html() || '';
    if (!content.find('img').length && content.text().trim().length < 100)
      throw new Error('Its A Me Translations: no readable chapter text found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    // The site's own search returns chapter posts rather than novels, so match
    // the project titles instead.
    const novels = (await this.novelList()).filter(novel =>
      terms.every(term => novel.name.toLowerCase().includes(term)),
    );
    return this.toItems(novels, pageNo);
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.hostname.replace(/^www\./, '') !== 'itsame-translations.com')
      throw new Error('Its A Me Translations: invalid page address.');
    const pathname = url.pathname.endsWith('/')
      ? url.pathname
      : `${url.pathname}/`;
    return `${this.site}${pathname}${url.search}`;
  }
}

export default new ItsAMeTranslations();
