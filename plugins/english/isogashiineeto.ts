import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import type { Cheerio as CheerioSelection, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { defaultCover } from '@libs/defaultCover';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

type Selection = CheerioSelection<AnyNode>;

type CategoryPost = {
  path: string;
  title: string;
  /** "YYYY-MM-DD" from the post's `<time datetime>` */
  date: string;
};

/** Hosts that serve this site (custom domain + the wordpress.com mapping). */
const SITE_HOSTS = [
  'isogashiineeto.com',
  'www.isogashiineeto.com',
  'isogashiineeto.wordpress.com',
];

/**
 * Old ToC entries still point at `workingneet.com`, a domain the translator
 * no longer owns (it now shows a parking page). The same posts are still
 * served from the original wordpress.com blog.
 */
const DEAD_HOST = 'workingneet.com';
const DEAD_HOST_REPLACEMENT = 'workingneet.wordpress.com';

/**
 * Every series has a WordPress category that collects the posts published on
 * this domain. The series pages themselves do not link to it, so the mapping
 * is kept here (series page path -> category slug).
 */
const CATEGORY_BY_SERIES: Record<string, string> = {
  '/neet-hello-work/': 'neet-hello-work',
  '/although-im-a-wizard-with-a-dark-attribute-i-became-a-hero-somehow-i-think-ill-try-my-best-so-that-my-wives-can-live-a-good-life-anyways/':
    'dark-magician-hero',
  '/hatena%e2%98%86illusion/': 'hatena%e2%98%86illusion',
  '/kuzukoku/': 'kuzukoku',
};

/**
 * Working NEET Translation (isogashiineeto.com, "NEETO 2!") is a small
 * WordPress.com blog by a single translator. It has no novel database:
 *
 * - The novels are four hand-written *pages* listed in the "Series" menu.
 *   Each page holds the synopsis, author/illustrator and a hand-maintained
 *   table of contents per volume.
 * - The table of contents links across several of the translator's blogs
 *   (lazyneet.wordpress.com, firebirdsnest.org, workingneet.wordpress.com,
 *   isogashiineeto.com) because the project moved between them. Chapter
 *   paths are therefore either site-relative or absolute URLs.
 * - The ToC is not kept up to date (NEET Hello Work stops at volume 8
 *   chapter 5 while the site publishes up to chapter 8), so newer posts are
 *   appended from the series' category archive.
 * - Long chapters are split into numbered sub-pages (`/slug/2/`, `/slug/3/`)
 *   that are linked from a "Pages:" block under the first page.
 * - Search is native WordPress `/?s=term`, which returns posts; hits are
 *   mapped back to their series through the post category.
 */
class IsogashiiNeetPlugin implements Plugin.PluginBase {
  id = 'isogashiineeto';
  name = 'Working NEET Translation';
  icon = 'src/en/isogashiineeto/icon.png';
  site = 'https://isogashiineeto.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is the "Series" menu: there is no paginated browse.
    if (pageNo > 1) {
      return [];
    }
    return this.fetchCatalog();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.toPath(novelPath);
    const $ = loadCheerio(await this.fetchHtml(this.site + path));
    const content = this.entryContent($);
    if (content.length === 0) {
      throw new Error(`Working NEET Translation: no series page at ${path}`);
    }

    const name = this.normalizeText($('#main h1.entry-title').first().text());
    if (!name) {
      throw new Error(`Working NEET Translation: missing title at ${path}`);
    }

    const novel: Plugin.SourceNovel = {
      path,
      name,
      cover: this.firstImage(content) || defaultCover,
    };
    this.applyMetadata(content, $, novel);

    const chapters = this.parseToc(content, $);
    if (chapters.length === 0) {
      throw new Error(`Working NEET Translation: no chapters found at ${path}`);
    }

    const categorySlug = CATEGORY_BY_SERIES[path];
    if (categorySlug) {
      const newer = await this.fetchNewerPosts(categorySlug, chapters);
      for (const post of newer) {
        chapters.push({
          name: post.title,
          path: post.path,
          releaseTime: post.date,
        });
      }
    }

    chapters.forEach((chapter, index) => {
      chapter.chapterNumber = index + 1;
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.toUrl(chapterPath);
    const firstPage = loadCheerio(await this.fetchHtml(url));

    const pageUrls: string[] = [];
    firstPage('.page-links a').each((i, el) => {
      const href = firstPage(el).attr('href');
      if (href && pageUrls.indexOf(href) === -1) {
        pageUrls.push(href);
      }
    });

    const parts: string[] = [this.chapterHtml(firstPage, chapterPath)];
    for (const pageUrl of pageUrls) {
      const page = loadCheerio(await this.fetchHtml(pageUrl));
      parts.push(this.chapterHtml(page, chapterPath));
    }

    const html = parts.join('\n').trim();
    if (!html) {
      throw new Error(`Working NEET Translation: empty chapter ${url}`);
    }
    return html;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // Only four series exist, so every result is found on the first page.
    if (pageNo > 1) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return [];
    }

    const catalog = await this.fetchCatalog();
    const byPath: Record<string, Plugin.NovelItem> = {};
    for (const novel of catalog) {
      byPath[novel.path] = novel;
    }

    const results: Plugin.NovelItem[] = [];
    const seen: Record<string, boolean> = {};
    const add = (novel: Plugin.NovelItem | undefined) => {
      if (novel && !seen[novel.path]) {
        seen[novel.path] = true;
        results.push(novel);
      }
    };

    // The series' own titles are not part of WordPress search, so match them
    // directly first.
    for (const novel of catalog) {
      if (novel.name.toLowerCase().indexOf(term) !== -1) {
        add(novel);
      }
    }

    // Chapter posts that match the term point back to their series through
    // the post category.
    const html = await this.fetchHtml(
      `${this.site}/?s=${encodeURIComponent(searchTerm.trim())}`,
    );
    const $ = loadCheerio(html);
    $('#main article .cat-links a').each((i, el) => {
      const slug = this.categorySlug($(el).attr('href') || '');
      for (const seriesPath in CATEGORY_BY_SERIES) {
        if (CATEGORY_BY_SERIES[seriesPath] === slug) {
          add(byPath[seriesPath]);
        }
      }
    });
    return results;
  }

  resolveUrl = (path: string) => this.toUrl(path);

  /** Series from the "Series" sub-menu, each with the cover of its page. */
  private async fetchCatalog(): Promise<Plugin.NovelItem[]> {
    const $ = loadCheerio(await this.fetchHtml(this.site + '/'));
    const entries: { name: string; path: string }[] = [];
    const seen: Record<string, boolean> = {};
    $('#site-navigation .sub-menu a').each((i, el) => {
      const href = $(el).attr('href');
      const name = this.normalizeText($(el).text());
      if (!href || !name) {
        return;
      }
      const path = this.toPath(href);
      if (isUrlAbsolute(path) || seen[path]) {
        return;
      }
      seen[path] = true;
      entries.push({ name, path });
    });
    if (entries.length === 0) {
      throw new Error('Working NEET Translation: no series in the site menu');
    }

    return Promise.all(
      entries.map(async entry => {
        let cover = defaultCover;
        try {
          const page = loadCheerio(
            await this.fetchHtml(this.site + entry.path),
          );
          cover = this.firstImage(this.entryContent(page)) || cover;
        } catch (e) {
          // A missing cover must not hide the series.
        }
        return { name: entry.name, path: entry.path, cover };
      }),
    );
  }

  /** Author, illustrator and synopsis from the paragraphs above the ToC. */
  private applyMetadata(
    content: Selection,
    $: CheerioAPI,
    novel: Plugin.SourceNovel,
  ) {
    content.children('p').each((i, el) => {
      const text = this.normalizeText($(el).text());
      const synopsis = text.match(/^Synopsis\s*:\s*(.+)$/i);
      if (synopsis) {
        novel.summary = synopsis[1];
        return;
      }
      const author = text.match(/^Author\s*:\s*(.+)$/i);
      if (author) {
        novel.author = author[1];
        return;
      }
      const artist = text.match(/^Illustrators?\s*:\s*(.+)$/i);
      if (artist) {
        novel.artist = artist[1];
      }
    });
  }

  /**
   * Chapters from the volume lists. Every link inside a top-level list is a
   * chapter; the volume comes from the nearest "Volume N" heading above the
   * list and nested list labels ("Chapter 3") become part of the name.
   */
  private parseToc(content: Selection, $: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    content.children('ul').each((i, list) => {
      const volume = this.volumeLabel($(list), $);
      $(list)
        .find('a')
        .each((j, el) => {
          const anchor = $(el);
          const href = anchor.attr('href');
          if (!href) {
            return;
          }
          const path = this.toPath(href);
          if (!path || seen[path]) {
            return;
          }
          seen[path] = true;

          const labels: string[] = [];
          let linkText = this.normalizeText(anchor.text());
          anchor.parents('li').each((k, li) => {
            const raw = this.ownText($(li), $);
            const own = this.normalizeText(raw).replace(/[:：]$/, '');
            if (!own) {
              return;
            }
            // The site sometimes splits one word across the list item and
            // its link (`<li>C<a>hapter 15</a>`): glue those back together.
            if (k === 0 && /\S$/.test(raw) && /^[a-z]/.test(linkText)) {
              linkText = own + linkText;
              return;
            }
            labels.unshift(own);
          });
          if (linkText && labels[labels.length - 1] !== linkText) {
            labels.push(linkText);
          }
          if (volume) {
            labels.unshift(volume);
          }

          const chapter: Plugin.ChapterItem = {
            name: labels.join(' - ') || path,
            path,
          };
          const date = this.dateFromPath(path);
          if (date) {
            chapter.releaseTime = date;
          }
          chapters.push(chapter);
        });
    });
    return chapters;
  }

  /** "Vol N" from the closest "Volume N ..." element above the list. */
  private volumeLabel(list: Selection, $: CheerioAPI): string {
    let label = '';
    list.prevAll().each((i, el) => {
      if (label) {
        return;
      }
      const match = this.normalizeText($(el).text()).match(/^Volume\s*(\d+)/i);
      if (match) {
        label = `Vol ${match[1]}`;
      }
    });
    return label;
  }

  /** Raw text directly inside a list item, without nested lists and links. */
  private ownText(item: Selection, $: CheerioAPI): string {
    const clone = item.clone();
    clone.find('ul, a').remove();
    return $(clone).text();
  }

  /**
   * Posts of the series category that the ToC does not list and that are not
   * older than its latest entry (same-day posts count, since the ToC only
   * carries dates). The archive is newest first, so paging stops at the first
   * page that holds no such post.
   */
  private async fetchNewerPosts(
    categorySlug: string,
    known: Plugin.ChapterItem[],
  ): Promise<CategoryPost[]> {
    let since = '';
    const knownPaths: Record<string, boolean> = {};
    for (const chapter of known) {
      knownPaths[chapter.path] = true;
      if (chapter.releaseTime && chapter.releaseTime > since) {
        since = chapter.releaseTime;
      }
    }
    if (!since) {
      return [];
    }

    const newer: CategoryPost[] = [];
    for (let page = 1; page <= 20; page++) {
      const url =
        `${this.site}/category/${categorySlug}/` +
        (page > 1 ? `page/${page}/` : '');
      const res = await fetchApi(url);
      if (res.status === 404) {
        break;
      }
      if (!res.ok) {
        throw this.httpError(res.status, url);
      }
      const $ = loadCheerio(await res.text());
      let foundNewer = false;
      $('#main article').each((i, el) => {
        const link = $(el).find('h2.entry-title a').first();
        const href = link.attr('href');
        const datetime = $(el).find('time.entry-date').first().attr('datetime');
        if (!href || !datetime) {
          return;
        }
        const date = datetime.substring(0, 10);
        const path = this.toPath(href);
        if (date >= since && !knownPaths[path]) {
          foundNewer = true;
          knownPaths[path] = true;
          newer.push({ path, title: this.normalizeText(link.text()), date });
        }
      });
      if (!foundNewer || $('#main .nav-previous a').length === 0) {
        break;
      }
    }
    // The archive lists posts newest first (same-day posts included), so
    // reversing it yields publishing order without comparing bare dates.
    return newer.reverse();
  }

  /** Clean entry content of one chapter page. */
  private chapterHtml($: CheerioAPI, chapterPath: string): string {
    const content = this.entryContent($);
    if (content.length === 0) {
      throw new Error(`Working NEET Translation: no content at ${chapterPath}`);
    }
    content
      .find(
        'script, style, .sharedaddy, #jp-post-flair, .jp-relatedposts, .page-links, #wordads-inline-marker, [id^="atatags"]',
      )
      .remove();
    // "Previous | ToC | Next" bars, as a paragraph or a one-row table.
    content.find('p, table').each((i, el) => {
      const element = $(el);
      const text = this.normalizeText(element.text());
      if (
        text.length < 80 &&
        /\b(previous|prev)\b|\bnext\b/i.test(text) &&
        /\b(toc|contents)\b/i.test(text) &&
        element.find('a').length > 0
      ) {
        element.remove();
      }
    });
    return (content.html() || '').trim();
  }

  private firstImage(content: Selection): string | undefined {
    const src = content.find('img').first().attr('src');
    if (!src) {
      return undefined;
    }
    return isUrlAbsolute(src) ? src : this.site + src;
  }

  private entryContent($: CheerioAPI) {
    let content = $('#main .entry-content').first();
    if (content.length === 0) {
      content = $('.entry-content').first();
    }
    return content;
  }

  /**
   * Site-relative path for this site's own posts and absolute `https://` URL
   * for the translator's other blogs.
   */
  private toPath(href: string): string {
    let raw = href.trim();
    if (raw.indexOf('//') === 0) {
      raw = 'https:' + raw;
    }
    if (/^https?:\/\//i.test(raw)) {
      const match = raw.match(/^https?:\/\/([^/?#]+)([/?#].*)?$/i);
      if (!match) {
        return '';
      }
      let host = match[1].toLowerCase();
      const rest = (match[2] || '/').split('#')[0];
      if (SITE_HOSTS.indexOf(host) !== -1) {
        return rest;
      }
      if (host === DEAD_HOST || host === 'www.' + DEAD_HOST) {
        host = DEAD_HOST_REPLACEMENT;
      }
      return `https://${host}${rest}`;
    }
    const clean = raw.split('#')[0];
    return clean.charAt(0) === '/' ? clean : '/' + clean;
  }

  private toUrl(path: string): string {
    return isUrlAbsolute(path) ? path : this.site + path;
  }

  private categorySlug(href: string): string {
    const match = href.match(/\/category\/([^/]+)\/?/);
    return match ? match[1].toLowerCase() : '';
  }

  private dateFromPath(path: string): string | undefined {
    const match = path.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
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

export default new IsogashiiNeetPlugin();
