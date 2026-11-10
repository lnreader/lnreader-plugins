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

/** Dated permalink every chapter post uses, e.g. `/2022/02/25/<slug>/`. */
const CHAPTER_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/$/;

/** Previous / TOC / Next navigation words at the top or bottom of a chapter. */
const NAV_WORDS = /\[?\s*(previous|next|toc)\s*(chapter)?\s*\]?/gi;

/** Metadata lines in a novel page that are not part of the synopsis. */
const META_LINE = /^(raw title|author|artist|illustrations|manga)\s*:/i;

/**
 * First Try Translations (firsttrytranslations.wordpress.com) is a small
 * WordPress.com fan translation blog:
 *
 * - Each novel is a WordPress *page* ("<novel>: Table of Contents") linked
 *   from the main menu. Its content holds the synopsis and a hand-written
 *   list of links to the released chapter posts, grouped under headings such
 *   as "Prologue:" and "Volume One:".
 * - Chapters are dated posts (`/2022/02/25/<slug>/`) with the text in
 *   `.entry-content` followed by a "TOC | Next Chapter" line.
 * - Posts are not categorised per novel, so the blog's own `?s=` search
 *   cannot be mapped back to a novel; the three novels are filtered by name.
 */
class FirstTryTranslationsPlugin implements Plugin.PluginBase {
  id = 'firsttrytranslations';
  name = 'First Try Translations';
  icon = 'src/en/firsttrytranslations/icon.png';
  site = 'https://firsttrytranslations.wordpress.com';
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
      throw new Error(`First Try Translations: no chapters listed at ${path}`);
    }

    const page = this.toNovelPage(path, $);
    const novel: Plugin.SourceNovel = {
      path,
      name: page.name,
      cover: page.cover,
      chapters,
    };

    const author = this.novelMeta($, 'author');
    if (author) {
      novel.author = author;
    }
    const artist = this.novelMeta($, 'artist');
    if (artist) {
      novel.artist = artist;
    }
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
      throw new Error(`First Try Translations: no chapter text at ${path}`);
    }

    content.find('script, style, .sharedaddy, .jp-relatedposts').remove();

    // Drop the Previous / TOC / Next navigation paragraphs, which hold nothing
    // but those words and their links.
    content.find('p').each((_, el) => {
      const text = $(el).text();
      if (
        /\b(previous|next|toc)\b/i.test(text) &&
        text.replace(NAV_WORDS, '').replace(/[|\s]/g, '') === ''
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
    if (pageNo > 1) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    const catalogue = await this.fetchCatalogue();
    return catalogue
      .filter(novel => novel.name.toLowerCase().indexOf(term) !== -1)
      .map(this.toNovelItem);
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
        !CHAPTER_PATH.test(path) &&
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
    const name = this.normalizeText($('h1.entry-title').first().text()).replace(
      /:\s*Table of Contents$/i,
      '',
    );
    // The cover is the artwork inside the page; og:image falls back to the
    // blog logo for novels without any.
    const image = this.entryContent($).find('img[src]').first().attr('src');
    return { path, name, cover: image || defaultCover };
  }

  /** Chapter links in page order, labelled with their "Volume ..." heading. */
  private novelChapters($: Page): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    let volume = '';

    this.entryContent($)
      .find('p')
      .each((_, el) => {
        const element = $(el);
        const links = element.find('a[href]').toArray();
        const chapterLinks = links.filter(link =>
          CHAPTER_PATH.test(this.toPath($(link).attr('href') || '')),
        );

        if (chapterLinks.length === 0) {
          const heading = this.normalizeText(element.text());
          if (/^(prologue|volume\b|chapters?\b)[^.]{0,30}:$/i.test(heading)) {
            volume = /^volume/i.test(heading) ? heading.slice(0, -1) : '';
          }
          return;
        }

        for (const link of chapterLinks) {
          const path = this.toPath($(link).attr('href') || '');
          const match = CHAPTER_PATH.exec(path);
          if (!match || seen[path]) {
            continue;
          }
          seen[path] = true;

          const label = this.normalizeText($(link).text());
          chapters.push({
            name: volume && label ? `${volume} - ${label}` : label || path,
            path,
            releaseTime: `${match[1]}-${match[2]}-${match[3]}`,
            chapterNumber: chapters.length + 1,
          });
        }
      });

    return chapters;
  }

  /** Value of an "Author:" / "Artist:" line on the novel page. */
  private novelMeta($: Page, key: string): string {
    let value = '';
    this.entryContent($)
      .find('p')
      .each((_, el) => {
        const match = this.normalizeText($(el).text()).match(
          new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i'),
        );
        if (match) {
          value = match[1];
          return false;
        }
      });
    return value;
  }

  /** Synopsis paragraphs: the text between the metadata and the chapter list. */
  private novelSummary($: Page): string {
    const lines: string[] = [];
    const title = this.toNovelPage('', $).name.toLowerCase();
    this.entryContent($)
      .find('p')
      .each((_, el) => {
        const element = $(el);
        element.find('br').replaceWith('\n');
        const text = element
          .text()
          .split('\n')
          .map(line => this.normalizeText(line))
          .filter(line => line && !META_LINE.test(line))
          .join('\n')
          .replace(/^Description\s*:\s*/i, '')
          .trim();
        if (/^table of contents$/i.test(text)) {
          return false;
        }
        if (text && text.toLowerCase() !== title && !/^[-—–_\s]+$/.test(text)) {
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
      /^https?:\/\/firsttrytranslations\.wordpress\.com(\/.*)?$/i,
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

export default new FirstTryTranslationsPlugin();
