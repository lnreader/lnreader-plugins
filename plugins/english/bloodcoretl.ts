import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type Page = ReturnType<typeof loadCheerio>;

/** Every chapter lives at `/chapter/<slug>`. */
const CHAPTER_PATH = /^\/chapter\/[^/?#]+$/;

/**
 * BloodcoreTL (bloodcoretl.com) is a one-novel fan translation site built with
 * Next.js. It publishes a single series, "Infinite Bloodcore":
 *
 * - The home page is the novel page. It server-renders the title, author,
 *   synopsis and the full chapter list, split into "Book 1", "Book 2", ...
 *   sections, each chapter linking to `/chapter/<slug>`.
 * - A chapter page server-renders the translated text in a `div.hyphens-auto`
 *   below the chapter heading, followed by an optional "Show Notes" button.
 * - There is no browse listing beyond that novel and no site search, so the
 *   catalogue is the home page and search filters it by name.
 */
class BloodcoreTLPlugin implements Plugin.PluginBase {
  id = 'bloodcoretl';
  name = 'BloodcoreTL';
  icon = 'src/en/bloodcoretl/icon.png';
  site = 'https://bloodcoretl.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The site hosts exactly one novel, so there is no second page.
    if (pageNo > 1) {
      return [];
    }
    return [await this.fetchNovelItem()];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.toPath(novelPath);
    const $ = await this.loadPage(path);
    const chapters = this.novelChapters($);
    if (chapters.length === 0) {
      throw new Error(`BloodcoreTL: no chapters listed at ${path}`);
    }

    const novel: Plugin.SourceNovel = {
      path,
      name: this.novelName($),
      cover: this.novelCover($),
      chapters,
    };

    const author = this.novelAuthor($);
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
    const $ = await this.loadPage(path);
    const content = $('div.hyphens-auto').first();
    if (content.length === 0 || content.text().trim() === '') {
      throw new Error(`BloodcoreTL: no chapter text at ${path}`);
    }
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
    const novel = await this.fetchNovelItem();
    return novel.name.toLowerCase().indexOf(term) !== -1 ? [novel] : [];
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  private async fetchNovelItem(): Promise<Plugin.NovelItem> {
    const $ = await this.loadPage('/');
    return {
      name: this.novelName($),
      path: '/',
      cover: this.novelCover($),
    };
  }

  private novelName($: Page): string {
    return this.normalizeText($('h1').first().text());
  }

  /** The cover is served through `/_next/image?url=<encoded original>`. */
  private novelCover($: Page): string {
    const src = $('img[alt="Cover Image"]').first().attr('src') || '';
    const original = src.match(/[?&]url=([^&]+)/);
    if (original) {
      return this.site + decodeURIComponent(original[1]);
    }
    return src ? this.site + this.toPath(src) : defaultCover;
  }

  /** Value of the "Author:" line next to the cover. */
  private novelAuthor($: Page): string {
    let author = '';
    $('p').each((_, el) => {
      const label = this.normalizeText($(el).children('span').first().text());
      if (/^author:?$/i.test(label)) {
        author = this.normalizeText(
          $(el).clone().children('span').remove().end().text(),
        );
        return false;
      }
    });
    return author;
  }

  /** Synopsis paragraphs under the "Synopsis" heading. */
  private novelSummary($: Page): string {
    const heading = $('h3')
      .filter((_, el) => /^synopsis$/i.test(this.normalizeText($(el).text())))
      .first();
    const lines: string[] = [];
    heading
      .parent()
      .find('p')
      .each((_, el) => {
        const text = this.normalizeText($(el).text());
        if (text) {
          lines.push(text);
        }
      });
    return lines.join('\n');
  }

  /**
   * Chapter links in page order, labelled with the "Book N" heading they sit
   * under. The "Start Reading" button repeats the first link, so only anchors
   * wrapping the chapter title are used.
   */
  private novelChapters($: Page): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    let book = '';

    $('p.bg-gray-600, a[href^="/chapter/"]').each((_, el) => {
      const element = $(el);
      if (el.tagName === 'p') {
        book = this.normalizeText(element.text());
        return;
      }

      const path = this.toPath(element.attr('href') || '');
      const label = this.normalizeText(element.find('p').first().text());
      if (!CHAPTER_PATH.test(path) || !label || seen[path]) {
        return;
      }
      seen[path] = true;

      chapters.push({
        name: book ? `${book} - ${label}` : label,
        path,
        chapterNumber: chapters.length + 1,
      });
    });

    return chapters;
  }

  private async loadPage(path: string): Promise<Page> {
    const url = this.site + path;
    const res = await fetchApi(url);
    if (!res.ok) {
      // Carry the status so tooling can tell a refused/blocked request
      // (403/503) apart from a genuine parsing failure.
      throw Object.assign(
        new Error(`HTTP ${res.status} while fetching ${url}`),
        {
          status: res.status,
        },
      );
    }
    return loadCheerio(await res.text());
  }

  /** Normalize a URL or href to a site-relative path without query or hash. */
  private toPath(href: string): string {
    const raw = href
      .trim()
      .replace(/^https?:\/\/(www\.)?bloodcoretl\.com/i, '');
    const path = raw.split(/[?#]/)[0];
    return path.charAt(0) === '/' ? path : '/' + path;
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}

export default new BloodcoreTLPlugin();
