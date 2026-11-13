import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type Page = ReturnType<typeof loadCheerio>;

type NovelPage = {
  path: string;
  name: string;
  cover: string;
};

/** A project page: `/ongoing-projects/<slug>/` or `/dropped-projects/<slug>/`. */
const NOVEL_PATH = /^\/(ongoing|dropped)-projects\/[^/]+\/$/;

/** Previous / Table Of Contents / Next navigation words under a chapter. */
const NAV_WORDS = /(prev|previous|next|table of contents|toc|->|<-)/gi;

/**
 * Kakushi Translations (kakushitranslations.wordpress.com) is a small
 * WordPress.com fan translation blog:
 *
 * - Every project is a WordPress *page* below "Ongoing Projects" or "Dropped
 *   Projects" (both linked from the main menu). It holds the cover, an
 *   "Author: ... / Illustrator: ..." line, the description and a bullet list
 *   of links to the chapter pages, grouped under "Volume NN" headings.
 * - Chapters are child pages of the project
 *   (`/ongoing-projects/<slug>/volume-01-chapter-01/`) with the text in
 *   `.entry-content`, followed by a "Prev | Table Of Contents | Next" line.
 * - Projects whose chapters were taken down (licensed) list no chapter links
 *   and are left out of the catalogue.
 * - The blog's own `?s=` search only matches posts, not projects, so search
 *   filters the (few) projects by name.
 */
class KakushiTranslationsPlugin implements Plugin.PluginBase {
  id = 'kakushitranslations';
  name = 'Kakushi Translations';
  icon = 'src/en/kakushitranslations/icon.png';
  site = 'https://kakushitranslations.wordpress.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // Every project is linked from the main menu; there is no paginated browse.
    if (pageNo > 1) {
      return [];
    }
    const catalogue = await this.fetchCatalogue();
    return catalogue.map(this.toNovelItem);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.toPath(novelPath);
    const $ = await this.loadNovelPage(path);
    const chapters = this.novelChapters($, path);
    if (chapters.length === 0) {
      throw new Error(`Kakushi Translations: no chapters listed at ${path}`);
    }

    const page = this.toNovelPage(path, $);
    const novel: Plugin.SourceNovel = {
      path,
      name: page.name,
      cover: page.cover,
      status:
        path.indexOf('/dropped-projects/') === 0
          ? NovelStatus.Cancelled
          : NovelStatus.Ongoing,
      chapters,
    };

    const credits = this.novelCredits($);
    if (credits.author) {
      novel.author = credits.author;
    }
    if (credits.artist) {
      novel.artist = credits.artist;
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
      throw new Error(`Kakushi Translations: no chapter text at ${path}`);
    }

    content.find('script, style, .sharedaddy, .jp-relatedposts').remove();
    content.find('[id^="atatags"], #wordads-inline-marker').remove();
    content.find('.wp-block-spacer').remove();

    // Drop the Prev / Table Of Contents / Next paragraph, which holds nothing
    // but those words and their links, and the separator above it.
    content.find('p').each((_, el) => {
      const text = $(el).text();
      if (
        $(el).find('a[href]').length > 0 &&
        /\b(prev|previous|next)\b/i.test(text) &&
        text.replace(NAV_WORDS, '').replace(/[|\s]/g, '') === ''
      ) {
        $(el).prev('hr').remove();
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

  /** Projects are the menu pages that link to at least one chapter page. */
  private async fetchCatalogue(): Promise<NovelPage[]> {
    const $ = loadCheerio(await this.fetchHtml(this.site + '/'));
    const paths: string[] = [];
    $('li.menu-item > a').each((_, el) => {
      const path = this.toPath($(el).attr('href') || '');
      if (NOVEL_PATH.test(path) && paths.indexOf(path) === -1) {
        paths.push(path);
      }
    });

    const pages: NovelPage[] = [];
    for (const path of paths) {
      const $ = await this.loadNovelPage(path);
      if (this.novelChapters($, path).length > 0) {
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
    // The first image inside the page is the volume cover.
    const image = this.entryContent($).find('img[src]').first().attr('src');
    return { path, name, cover: image || defaultCover };
  }

  /** Chapter links in page order, labelled with their "Volume NN" heading. */
  private novelChapters($: Page, novelPath: string): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    let volume = '';

    this.entryContent($)
      .find('[id^="vol"], li > a[href]')
      .each((_, el) => {
        const element = $(el);
        if (el.tagName !== 'a') {
          volume = this.normalizeText(element.text());
          return;
        }

        const path = this.toPath(element.attr('href') || '');
        if (
          path === novelPath ||
          path.indexOf(novelPath) !== 0 ||
          path.charAt(0) !== '/' ||
          seen[path]
        ) {
          return;
        }
        seen[path] = true;

        const label = this.normalizeText(element.text());
        chapters.push({
          name: volume && label ? `${volume} - ${label}` : label || path,
          path,
          chapterNumber: chapters.length + 1,
        });
      });

    return chapters;
  }

  /** The "Author: ...<br>Illustrator: ..." line below the cover. */
  private novelCredits($: Page): { author: string; artist: string } {
    const credits = { author: '', artist: '' };
    this.entryContent($)
      .find('p')
      .each((_, el) => {
        const element = $(el);
        element.find('br').replaceWith('\n');
        for (const line of element.text().split('\n')) {
          const match = this.normalizeText(line).match(
            /^(author|illustrator)\s*:\s*(.+)$/i,
          );
          if (match) {
            credits[/^author/i.test(match[1]) ? 'author' : 'artist'] = match[2];
          }
        }
      });
    return credits;
  }

  /** Paragraphs after the "Description" heading, up to the first spacer. */
  private novelSummary($: Page): string {
    const lines: string[] = [];
    let inDescription = false;

    this.entryContent($)
      .children()
      .each((_, el) => {
        const element = $(el);
        const text = this.normalizeText(element.text());
        if (!inDescription) {
          inDescription = el.tagName === 'p' && /^Description\b/i.test(text);
          return;
        }
        if (el.tagName !== 'p') {
          return false;
        }
        if (text && !element.hasClass('has-text-color')) {
          lines.push(text);
        }
      });

    return lines.join('\n\n');
  }

  private entryContent($: Page) {
    return $('.entry-content').first();
  }

  /** Normalize a URL or href to a site-relative path with a trailing slash. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/kakushitranslations\.wordpress\.com(\/.*)?$/i,
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

export default new KakushiTranslationsPlugin();
