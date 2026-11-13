import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type Page = ReturnType<typeof loadCheerio>;

type NovelPage = {
  path: string;
  name: string;
  cover: string;
};

/** Dated permalink every chapter post uses, e.g. `/2022/01/26/<slug>/`. */
const CHAPTER_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/$/;

/** Headings that open a new section inside a novel page's chapter list. */
const SECTION_HEADING = /^(chapters|part\s*\d+)$/i;

/** Previous / TOC / Next navigation words at the top or bottom of a chapter. */
const NAV_WORDS = /\[?\s*(previous|next|toc)\s*\]?/gi;

/**
 * Mizupan's Archives (mizupanshoko.wordpress.com) is a WordPress.com fan
 * translation blog with a plain, theme-driven structure:
 *
 * - Each novel is a WordPress *page* (`/shisha-sosei/`) linked from the
 *   main menu. Its entry content holds the synopsis and a hand-maintained
 *   chapter list that links to each released chapter post. Chapters that are
 *   not out yet appear as plain bracketed text and are not listed.
 * - Chapters are dated posts (`/2020/07/24/shisha-sosei-chapter-1-.../`) that
 *   sit in a per-novel category sharing the novel's slug.
 * - The REST API is not exposed on this site, so everything is scraped from
 *   the HTML pages.
 * - Search is native WordPress `/?s=term`; chapter hits are mapped back to
 *   their novel through the category slug on each result.
 */
class MizupanPlugin implements Plugin.PluginBase {
  id = 'mizupanshoko';
  name = "Mizupan's Archives";
  icon = 'src/en/mizupanshoko/icon.png';
  site = 'https://mizupanshoko.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // Every novel is linked from the main menu; there is no paginated browse.
    if (pageNo > 1) {
      return [];
    }
    const catalogue = await this.fetchCatalogue();
    return catalogue.map(this.toNovelItem);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.toPath(novelPath);
    const $ = await this.loadNovelPage(path);
    const chapters = this.novelChapters($);
    if (chapters.length === 0) {
      throw new Error(`Mizupan's Archives: no chapters listed at ${path}`);
    }

    const page = this.toNovelPage(path, $);
    const novel: Plugin.SourceNovel = {
      path,
      name: page.name,
      cover: page.cover,
      chapters,
    };

    const summary = this.novelSummary($);
    if (summary) {
      novel.summary = summary;
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = this.toPath(chapterPath);
    const $ = loadCheerio(await this.fetchHtml(this.site + path));
    const content = this.entryContent($);
    if (content.length === 0) {
      throw new Error(`Mizupan's Archives: no chapter text at ${path}`);
    }

    content.find('script, style, .sharedaddy, .jp-relatedposts').remove();

    // Drop the Previous / TOC / Next navigation paragraphs, which hold nothing
    // but those words and their links.
    content.find('p').each((_, el) => {
      const text = $(el).text();
      if (
        /\b(previous|next|toc)\b/i.test(text) &&
        text.replace(NAV_WORDS, '').trim() === ''
      ) {
        $(el).remove();
      }
    });

    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const base = pageNo > 1 ? `${this.site}/page/${pageNo}/` : `${this.site}/`;
    const url = `${base}?s=${encodeURIComponent(searchTerm)}`;
    const res = await fetchApi(url);
    if (res.status === 404) {
      return [];
    }
    if (!res.ok) {
      throw this.httpError(res.status, url);
    }
    const $ = loadCheerio(await res.text());

    const catalogue = await this.fetchCatalogue();
    const byPath: Record<string, NovelPage> = {};
    for (const novel of catalogue) {
      byPath[novel.path] = novel;
    }

    const found: NovelPage[] = [];
    const seen: Record<string, boolean> = {};
    $('article').each((_, el) => {
      const article = $(el);
      const classes = article.attr('class') || '';
      let paths: string[];
      if (classes.indexOf('type-page') !== -1) {
        // A novel page itself matched.
        paths = [
          this.toPath(
            article.find('.entry-title a').first().attr('href') || '',
          ),
        ];
      } else {
        // A chapter post: its category slug is the novel's slug.
        const categories = classes.match(/\bcategory-[\w-]+/g) || [];
        paths = categories.map(category => `/${category.slice(9)}/`);
      }
      for (const path of paths) {
        if (byPath[path] && !seen[path]) {
          seen[path] = true;
          found.push(byPath[path]);
        }
      }
    });

    return found.map(this.toNovelItem);
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  private toNovelItem = (novel: NovelPage): Plugin.NovelItem => ({
    name: novel.name,
    path: novel.path,
    cover: novel.cover,
  });

  /** Novels are the menu pages whose content links to chapter posts. */
  private async fetchCatalogue(): Promise<NovelPage[]> {
    const $ = loadCheerio(await this.fetchHtml(this.site + '/'));
    const paths: string[] = [];
    $('li.menu-item > a').each((_, el) => {
      const path = this.toPath($(el).attr('href') || '');
      if (
        path.charAt(0) === '/' &&
        path !== '/' &&
        paths.indexOf(path) === -1
      ) {
        paths.push(path);
      }
    });

    const pages: NovelPage[] = [];
    for (const path of paths) {
      const $ = await this.loadNovelPage(path);
      if (this.novelChapters($).length > 0) {
        pages.push(this.toNovelPage(path, $));
      }
    }
    return pages;
  }

  private async loadNovelPage(path: string): Promise<Page> {
    const $ = loadCheerio(await this.fetchHtml(this.site + path));
    $('.jp-relatedposts, .sharedaddy, script, style').remove();
    return $;
  }

  private toNovelPage(path: string, $: Page): NovelPage {
    const name = this.normalizeText($('h1.entry-title').first().text());
    // Novels without artwork fall back to WordPress's blank placeholder image.
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const cover =
      ogImage && ogImage.indexOf('/i/blank.jpg') === -1
        ? ogImage
        : defaultCover;
    return { path, name, cover };
  }

  private novelChapters($: Page): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};

    this.entryContent($)
      .find('a[href]')
      .each((_, el) => {
        const path = this.toPath($(el).attr('href') || '');
        const match = CHAPTER_PATH.exec(path);
        if (!match || seen[path]) {
          return;
        }
        seen[path] = true;

        const name = this.normalizeText($(el).text());
        const numbered = name.match(/\b(?:Ch\.?|Chapter)\s*(\d+)/i);
        chapters.push({
          name,
          path,
          releaseTime: `${match[1]}-${match[2]}-${match[3]}`,
          chapterNumber: numbered ? Number(numbered[1]) : chapters.length + 1,
        });
      });

    return chapters;
  }

  /** Synopsis paragraphs: everything before the chapter list begins. */
  private novelSummary($: Page): string {
    const lines: string[] = [];
    this.entryContent($)
      .find('p, h4')
      .each((_, el) => {
        const element = $(el);
        const text = this.normalizeText(element.text());
        const hasChapterLink = element
          .find('a[href]')
          .toArray()
          .some(link =>
            CHAPTER_PATH.test(this.toPath($(link).attr('href') || '')),
          );
        if (SECTION_HEADING.test(text) || hasChapterLink) {
          return false;
        }
        if (text) {
          lines.push(text);
        }
      });
    return lines.join('\n');
  }

  private entryContent($: Page) {
    let content = $('.entry-content').first();
    if (content.length === 0) {
      content = $('article .entry-content').first();
    }
    return content;
  }

  /** Normalize a URL or href to a site-relative path with a trailing slash. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/mizupanshoko\.wordpress\.com(\/.*)?$/i,
    );
    if (/^https?:\/\//i.test(raw) && !sameSite) {
      return raw;
    }
    const clean = (sameSite ? sameSite[1] || '/' : raw).split(/[?#]/)[0];
    const path = clean.charAt(0) === '/' ? clean : '/' + clean;
    return path.charAt(path.length - 1) === '/' ? path : path + '/';
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw this.httpError(res.status, url);
    }
    return res.text();
  }

  private httpError(status: number, url: string): Error {
    // Carry the status so tooling can tell a refused/blocked request
    // (403/503) apart from a genuine parsing failure.
    return Object.assign(new Error(`HTTP ${status} while fetching ${url}`), {
      status,
    });
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}

export default new MizupanPlugin();
