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

/** Chapters live directly under the site root, e.g. `/tcf-chapter-12/`. */
const CHAPTER_PATH = /^\/[^/]+\/$/;

/** Menu entries that are never a novel: bookmarks, info pages and the shop. */
const NOT_A_NOVEL =
  /^\/(?:mybookmarks|information|eap-merchandise-store|recruitment|wp-login\.php)(?:\/|$)|^\/originals\/$/i;

/** Previous / Index / Next navigation words at the end of a chapter. */
const NAV_WORDS = /(previous|next|index|toc|chapter)/gi;

/** Info lines on a novel page that are not part of the synopsis. */
const META_LINE =
  /^(author|translator|editor|artist|release rate|estimated chapter dates?|series logo|tcf subscriptions)\b/i;

/**
 * EatApplePies (eatapplepies.com) is a small WordPress fan-translation site
 * of Korean novels plus a few original works:
 *
 * - Every novel has a page linked from the main menu, with a cover, an
 *   optional synopsis and a "Table of Contents" link (several for a
 *   multi-volume series).
 * - A table-of-contents page is a hand-written list of links to chapter pages
 *   (`/<prefix>-<number>/`), often grouped in collapsible `<details>` blocks.
 * - Chapters keep their text in `.entry-content`, followed by an
 *   Index / Next Chapter line and a bookmark widget.
 * - The site only offers WordPress's own search, which finds chapter posts
 *   rather than novels, so searching filters the small menu catalogue by name.
 */
class EatApplePiesPlugin implements Plugin.PluginBase {
  id = 'eatapplepies';
  name = 'EatApplePies';
  icon = 'src/en/eatapplepies/icon.png';
  site = 'https://eatapplepies.com';
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
    const $ = await this.loadPage(path);
    const page = this.toNovelPage(path, $);
    const chapters = await this.novelChapters($);
    if (chapters.length === 0) {
      throw new Error(`EatApplePies: no chapters listed at ${path}`);
    }

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
      throw new Error(`EatApplePies: no chapter text at ${path}`);
    }

    content.find('script, style, .entry-meta, .sharedaddy').remove();
    // Bookmark widget with a hidden login form.
    content.find('[class*="cbxwpbkmark"]').remove();

    // Drop the "Previous | Index | Next Chapter" line, which holds nothing but
    // those words and their links.
    content.find('h3, p').each((_, el) => {
      const element = $(el);
      if (
        element.find('a[href]').length > 0 &&
        element
          .text()
          .replace(NAV_WORDS, '')
          .replace(/[|<>\s]/g, '') === ''
      ) {
        element.remove();
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

  /** Novels are the menu pages that link to a table of contents. */
  private async fetchCatalogue(): Promise<NovelPage[]> {
    const $ = loadCheerio(await this.fetchHtml(this.site + '/'));
    const paths: string[] = [];
    // Top-level menu entries plus the series nested under "Originals".
    $('.menu > li > a, .menu a[href*="/originals/"]').each((_, el) => {
      const path = this.toPath($(el).attr('href') || '');
      if (
        path.charAt(0) === '/' &&
        path !== '/' &&
        !NOT_A_NOVEL.test(path) &&
        paths.indexOf(path) === -1
      ) {
        paths.push(path);
      }
    });

    const pages: NovelPage[] = [];
    let failures = 0;
    for (const path of paths) {
      try {
        const novelPage = await this.loadPage(path);
        if (this.tocLinks(novelPage).length > 0) {
          pages.push(this.toNovelPage(path, novelPage));
        }
      } catch (error) {
        failures += 1;
      }
    }
    if (pages.length === 0 && failures > 0) {
      throw new Error('EatApplePies: could not load any novel page');
    }
    return pages;
  }

  private async loadPage(path: string): Promise<Page> {
    const $ = loadCheerio(await this.fetchHtml(this.site + path));
    $('script, style, [class*="cbxwpbkmark"]').remove();
    return $;
  }

  private toNovelPage(path: string, $: Page): NovelPage {
    const name = this.normalizeText($('h1.entry-title').first().text());
    // The first picture in the page content is the cover (or series logo).
    const image = this.entryContent($).find('img[src]').first().attr('src');
    return {
      path,
      name,
      cover: image && image.indexOf(this.site) === 0 ? image : defaultCover,
    };
  }

  /** Links to the table(s) of contents; one per volume for a series. */
  private tocLinks($: Page): { path: string; label: string }[] {
    const links: { path: string; label: string }[] = [];
    this.entryContent($)
      .find('a[href]')
      .each((_, el) => {
        const label = this.normalizeText($(el).text());
        if (!/table of contents/i.test(label)) {
          return;
        }
        const path = this.toPath($(el).attr('href') || '');
        if (path.charAt(0) === '/' && links.every(link => link.path !== path)) {
          links.push({ path, label });
        }
      });
    return links;
  }

  /** Chapters of every table of contents, in site order. */
  private async novelChapters($: Page): Promise<Plugin.ChapterItem[]> {
    const tocs = this.tocLinks($);
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};

    for (const toc of tocs) {
      const volume =
        tocs.length > 1 ? (toc.label.match(/^volume\s*\d+/i) || [''])[0] : '';
      const tocPage = await this.loadPage(toc.path);
      this.entryContent(tocPage)
        .find('a[href]')
        .each((_, el) => {
          const link = tocPage(el);
          const path = this.toPath(link.attr('href') || '');
          if (
            !CHAPTER_PATH.test(path) ||
            NOT_A_NOVEL.test(path) ||
            seen[path]
          ) {
            return;
          }
          seen[path] = true;

          let label = this.normalizeText(link.text()).replace(/^[-–—\s]+/, '');
          if (!label || /^chapter\s*\d*\s*:?$/i.test(label)) {
            const number = path.match(/(\d+)\/$/);
            label = number ? `Chapter ${number[1]}` : label || path;
          }
          chapters.push({
            name: volume ? `${volume} - ${label}` : label,
            path,
            chapterNumber: chapters.length + 1,
          });
        });
    }

    return chapters;
  }

  /** Value of an "Author:" line on the novel page. */
  private novelMeta($: Page, key: string): string {
    let value = '';
    this.entryContent($)
      .find('p')
      .each((_, el) => {
        const element = $(el);
        element.find('br').replaceWith('\n');
        for (const line of element.text().split('\n')) {
          const match = this.normalizeText(line).match(
            new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i'),
          );
          if (match) {
            value = match[1];
            return false;
          }
        }
      });
    return value;
  }

  /** Synopsis paragraphs: the text between the info lines and the contents. */
  private novelSummary($: Page): string {
    const lines: string[] = [];
    this.entryContent($)
      .find('p')
      .each((_, el) => {
        const element = $(el);
        if (element.find('img').length > 0 && element.text().trim() === '') {
          return;
        }
        element.find('br').replaceWith('\n');
        const text = element
          .text()
          .split('\n')
          .map(line => this.normalizeText(line))
          .filter(line => line && !META_LINE.test(line))
          .join('\n')
          .replace(/^(synopsis|summary|description)\s*:?\s*/i, '')
          .trim();
        if (/table of contents$/i.test(text) || /^begin reading$/i.test(text)) {
          return;
        }
        if (text && !/^[-—–_\s]+$/.test(text)) {
          lines.push(text);
        }
      });
    return lines.join('\n');
  }

  private entryContent($: Page) {
    return $('.entry-content').first();
  }

  /** Normalize a URL or href to a site-relative path with a trailing slash. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/(?:www\.)?eatapplepies\.com(\/.*)?$/i,
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

export default new EatApplePiesPlugin();
