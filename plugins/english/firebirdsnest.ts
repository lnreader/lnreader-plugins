import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

type TagPost = {
  /** Site-relative path of the announcement post, e.g. `/2024/03/25/heavy-knight-v3ch39/` */
  path: string;
  slug: string;
  title: string;
  /** "YYYY-MM-DD", taken from the post's dated permalink */
  date: string;
};

type TagArchive = {
  tagSlug: string;
  posts: TagPost[];
};

type TocEntry = {
  path: string;
  name: string;
};

type ChapterCandidate = {
  post: TagPost;
  path: string;
};

/** Non-novel pages that can sit next to novels in navigation menus. */
const NON_NOVEL_PATHS = ['/projects/', '/about/'];

/** Hosts that serve this same site (custom domain + wpcom mapped domain). */
const SAME_SITE_HOSTS = [
  'firebirdsnest.org',
  'www.firebirdsnest.org',
  'firebirdsnest.wordpress.com',
];

/**
 * Firebird's Nest (firebirdsnest.org) is a small WordPress.com-hosted fan
 * translation site. Its structure differs from the usual novel CMS themes:
 *
 * - Each novel is a WordPress *page* (`/heavy-knight/`) whose entry content
 *   holds the synopsis and a hand-maintained "Table of Contents".
 *   Chapters are child pages (`/heavy-knight/v1-ch1/`).
 * - The site's novel catalogue is the "Projects" sub-menu of the primary
 *   navigation; the homepage itself is a paginated feed of chapter
 *   *announcement posts* (`/2024/03/25/heavy-knight-v3ch39/`), not novels.
 * - Announcement posts are tagged per novel (`/tag/heavy-knight/`, paginated
 *   10 per page) and each announcement links to the real chapter page. The
 *   tag archives are the only complete index of chapters: the hand-written
 *   ToCs are stale (Heavy Knight's ToC stops at v2-ch19 while the site
 *   publishes up to v3-ch39). Pre-2017 announcement-style posts (e.g. the
 *   No Fatigue "ch-6" era) contain the chapter text directly instead of
 *   linking to a child page.
 * - Search is native WordPress `/?s=term&paged=N` and mixes chapter posts
 *   with chapter pages; results are mapped back to their novel.
 */
class FirebirdsNestPlugin implements Plugin.PluginBase {
  id = 'firebirdsnest';
  name = "Firebird's Nest";
  icon = 'src/en/firebirdsnest/icon.png';
  site = 'https://firebirdsnest.org';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The full catalogue lives in the site's "Projects" navigation sub-menu
    // and is a single page; there is no paginated novel browse on this site.
    if (pageNo > 1) {
      return [];
    }
    return this.fetchNovelCatalog();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.toPath(novelPath);
    const $ = loadCheerio(await this.fetchHtml(this.site + path));
    const content = this.entryContent($);
    if (content.length === 0) {
      throw new Error(`Firebird's Nest: no entry content at ${path}`);
    }

    const name = this.normalizeText($('#main h1.entry-title').first().text());
    if (!name) {
      throw new Error(`Firebird's Nest: missing novel title at ${path}`);
    }

    const novelSlug = this.lastSegment(path);

    const novel: Plugin.SourceNovel = {
      path,
      name,
      cover: defaultCover,
    };

    this.applyMetadata(content, $, novel);

    const tocEntries = this.parseToc(content, $);

    // The site's ToCs are hand-maintained and often stale; the per-novel tag
    // archive lists every chapter announcement. Merge both so no chapter the
    // site offers is left out, keeping the ToC's own order and titles first.
    const archive = await this.fetchTagArchive(novelSlug);
    const annDates: Record<string, string> = {};
    if (archive) {
      for (const post of archive.posts) {
        annDates[post.slug] = post.date;
      }
    }

    const chapters: Plugin.ChapterItem[] = [];
    const used: Record<string, boolean> = {};
    for (const entry of tocEntries) {
      if (used[entry.path]) {
        continue;
      }
      used[entry.path] = true;
      const chapter: Plugin.ChapterItem = {
        name: entry.name,
        path: entry.path,
      };
      const date = this.announcementDateFor(
        entry.path,
        novelSlug,
        archive,
        annDates,
      );
      if (date) {
        chapter.releaseTime = date;
      }
      chapters.push(chapter);
    }

    if (archive) {
      const extras = await this.resolveAnnouncementChapters(
        archive,
        novelSlug,
        path,
      );
      extras.sort((a, b) => {
        if (a.post.date !== b.post.date) {
          return a.post.date < b.post.date ? -1 : 1;
        }
        return this.lastNumber(a.post.slug) - this.lastNumber(b.post.slug);
      });
      for (const candidate of extras) {
        if (used[candidate.path]) {
          continue;
        }
        used[candidate.path] = true;
        chapters.push({
          name: candidate.post.title,
          path: candidate.path,
          releaseTime: candidate.post.date,
        });
      }
    }

    if (chapters.length === 0) {
      throw new Error(`Firebird's Nest: no chapters found for ${path}`);
    }
    chapters.forEach((chapter, index) => {
      chapter.chapterNumber = index + 1;
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = this.toPath(chapterPath);
    const url = isUrlAbsolute(path) ? path : this.site + path;
    const $ = loadCheerio(await this.fetchHtml(url));
    const content = this.entryContent($);
    if (content.length === 0) {
      throw new Error(`Firebird's Nest: no chapter content at ${path}`);
    }

    // Drop the "Previous | TOC | Next" navigation line and Jetpack widgets
    // (sharing/likes/rating) that live inside the entry content.
    content.find('#jp-post-flair, .sharedaddy, .jp-relatedposts').remove();
    content.find('p').each((i, el) => {
      const text = this.normalizeText($(el).text());
      if (
        text.length < 60 &&
        text.indexOf('|') !== -1 &&
        /(TOC|Contents)/i.test(text)
      ) {
        $(el).remove();
      }
    });

    const html = content.html();
    if (!html || html.trim().length === 0) {
      throw new Error(`Firebird's Nest: empty chapter content at ${path}`);
    }
    return html.trim();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const catalog = await this.fetchNovelCatalog();
    const query = encodeURIComponent(searchTerm);
    const paged = pageNo > 1 ? `&paged=${pageNo}` : '';
    const $ = loadCheerio(
      await this.fetchHtml(`${this.site}/?s=${query}${paged}`),
    );

    const slugByName: Record<string, string> = {};
    const novelSlugs: string[] = [];
    for (const novel of catalog) {
      const slug = this.lastSegment(novel.path);
      novelSlugs.push(slug);
      slugByName[slug] = novel.name;
    }

    const results: Plugin.NovelItem[] = [];
    const seen: Record<string, boolean> = {};
    $('h2.entry-title > a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      const slug = this.novelSlugForResult(this.toPath(href), novelSlugs);
      if (!slug || seen[slug]) {
        return;
      }
      seen[slug] = true;
      results.push({
        name: slugByName[slug],
        path: `/${slug}/`,
        cover: defaultCover,
      });
    });
    return results;
  }

  resolveUrl = (path: string) =>
    isUrlAbsolute(path) ? path : this.site + this.toPath(path);

  /**
   * The site's novel catalogue: the "Projects" sub-menus of the primary
   * navigation, which list every live novel page with its real title.
   */
  private async fetchNovelCatalog(): Promise<Plugin.NovelItem[]> {
    const $ = loadCheerio(await this.fetchHtml(this.site + '/'));
    const novels: Plugin.NovelItem[] = [];
    const seen: Record<string, boolean> = {};
    $('#site-navigation .sub-menu a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      const path = this.toPath(href);
      if (!path || NON_NOVEL_PATHS.indexOf(path) !== -1 || seen[path]) {
        return;
      }
      const name = this.normalizeText($(el).text());
      if (!name) {
        return;
      }
      seen[path] = true;
      novels.push({ name, path, cover: defaultCover });
    });
    if (novels.length === 0) {
      throw new Error("Firebird's Nest: no novels found in the site menu");
    }
    return novels;
  }

  /** Author/status/synopsis from the info block above the ToC. */
  private applyMetadata(
    content: ReturnType<typeof loadCheerio>,
    $: ReturnType<typeof loadCheerio>,
    novel: Plugin.SourceNovel,
  ): void {
    // Flatten the info block into lines so "Author: ..." / "Status: ..."
    // (separated by <br>) can be picked up regardless of markup.
    const raw = (content.html() || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n');
    const flattened = loadCheerio(`<div>${raw}</div>`)('div').text();
    const lines = flattened
      .split('\n')
      .map(line => this.normalizeText(line))
      .filter(line => line);
    for (const line of lines) {
      const authorMatch = line.match(/^Author:\s*(.+)$/i);
      if (authorMatch) {
        novel.author = this.normalizeText(authorMatch[1]);
        continue;
      }
      const statusMatch = line.match(/^Status:\s*(.+)$/i);
      if (statusMatch) {
        novel.status = this.parseStatus(statusMatch[1]);
      }
    }

    // The synopsis is every link-free paragraph above the ToC heading; the
    // info paragraph itself carries links (source novel, collaborator blogs)
    // and is skipped by the same rule.
    const paragraphs: string[] = [];
    let reachedToc = false;
    content.find('p, strong, h1, h2, h3, h4, h5, h6').each((i, el) => {
      if (reachedToc) {
        return;
      }
      const element = $(el);
      const text = this.normalizeText(element.text());
      if (this.isTocMarker(element, text)) {
        reachedToc = true;
        return;
      }
      if (!element.is('p')) {
        return;
      }
      if (
        element.find('a').length > 0 ||
        /^Author:/i.test(text) ||
        /^Status:/i.test(text) ||
        !text
      ) {
        return;
      }
      paragraphs.push(text);
    });
    if (paragraphs.length > 0) {
      novel.summary = paragraphs.join('\n\n');
    }
  }

  /** Detect the "Table of Contents" / "VOLUME 1 CONTENTS" heading. */
  private isTocMarker(
    element: { is: (selector: string) => boolean },
    text: string,
  ): boolean {
    if (element.is('p')) {
      return /^table of contents/i.test(text);
    }
    return /(table of )?contents$/i.test(text);
  }

  private parseStatus(value: string): NovelStatus {
    const normalized = value.toLowerCase();
    if (normalized.indexOf('ongoing') === 0) {
      return NovelStatus.Ongoing;
    }
    if (normalized.indexOf('completed') === 0) {
      return NovelStatus.Completed;
    }
    if (normalized.indexOf('hiatus') !== -1) {
      return NovelStatus.OnHiatus;
    }
    return NovelStatus.Unknown;
  }

  /**
   * Chapter links from the novel page's "Table of Contents" block: every
   * anchor after the ToC marker inside the entry content, in document order.
   */
  private parseToc(
    content: ReturnType<typeof loadCheerio>,
    $: ReturnType<typeof loadCheerio>,
  ): TocEntry[] {
    const entries: TocEntry[] = [];
    const seen: Record<string, boolean> = {};
    let reachedToc = false;
    content.find('a, p, strong, h1, h2, h3, h4, h5, h6').each((i, el) => {
      const element = $(el);
      if (!reachedToc) {
        if (element.is('a')) {
          return;
        }
        if (this.isTocMarker(element, this.normalizeText(element.text()))) {
          reachedToc = true;
        }
        return;
      }
      if (!element.is('a')) {
        return;
      }
      const href = element.attr('href');
      if (!href) {
        return;
      }
      const path = this.toPath(href);
      const name = this.normalizeText(element.text());
      if (!path || !name || seen[path] || path.indexOf('/feed') !== -1) {
        return;
      }
      seen[path] = true;
      entries.push({ path, name });
    });
    return entries;
  }

  /**
   * All chapter announcements for a novel from its paginated tag archive.
   * The tag slug is usually the novel slug; for novels whose tag was created
   * under a shorter name (e.g. `contractor`), fall back to the first word of
   * the novel slug. Returns null when the site has no tag archive at all.
   */
  private async fetchTagArchive(novelSlug: string): Promise<TagArchive | null> {
    const candidates = [novelSlug];
    const firstWord = novelSlug.split('-')[0];
    if (firstWord && firstWord !== novelSlug) {
      candidates.push(firstWord);
    }
    for (const tagSlug of candidates) {
      const url = `${this.site}/tag/${tagSlug}/`;
      const res = await fetchApi(url);
      if (res.status === 404) {
        continue;
      }
      if (!res.ok) {
        throw this.httpError(res.status, url);
      }
      const first = this.parseTagPage(await res.text());
      const pageNumbers: number[] = [];
      for (let n = 2; n <= first.maxPage; n++) {
        pageNumbers.push(n);
      }
      const restPages = await this.mapLimit(pageNumbers, 6, n =>
        this.parseTagPageAsync(n, tagSlug),
      );
      const posts = first.posts;
      for (const page of restPages) {
        for (const post of page.posts) {
          posts.push(post);
        }
      }
      return { tagSlug, posts };
    }
    return null;
  }

  private async parseTagPageAsync(
    pageNo: number,
    tagSlug: string,
  ): Promise<{ posts: TagPost[]; maxPage: number }> {
    return this.parseTagPage(
      await this.fetchHtml(`${this.site}/tag/${tagSlug}/page/${pageNo}/`),
    );
  }

  private parseTagPage(html: string): { posts: TagPost[]; maxPage: number } {
    const $ = loadCheerio(html);
    const posts: TagPost[] = [];
    $('#main h2.entry-title > a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      const path = this.toPath(href);
      const match = path.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/$/);
      if (!match) {
        return;
      }
      posts.push({
        path,
        slug: match[4],
        date: `${match[1]}-${match[2]}-${match[3]}`,
        title: this.normalizeText($(el).text()),
      });
    });
    let maxPage = 1;
    $('#main .nav-links a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/page\/(\d+)\//);
      if (match && Number(match[1]) > maxPage) {
        maxPage = Number(match[1]);
      }
    });
    return { posts, maxPage };
  }

  /**
   * Turn announcement posts into chapter paths the ToC does not already
   * cover. Most slugs map directly onto their child chapter page; unusual
   * slugs are resolved by reading the announcement's own chapter link, and
   * pre-2017 text posts (no child link) are chapters themselves.
   */
  private async resolveAnnouncementChapters(
    archive: TagArchive,
    novelSlug: string,
    novelPath: string,
  ): Promise<ChapterCandidate[]> {
    const prefix = archive.tagSlug + '-';
    const resolved: ChapterCandidate[] = [];
    const unresolved: TagPost[] = [];
    for (const post of archive.posts) {
      if (post.slug.indexOf(prefix) !== 0) {
        continue;
      }
      const rest = post.slug.slice(prefix.length);
      const direct = this.deriveChapterPath(rest, novelSlug, post.path);
      if (direct) {
        resolved.push({ post, path: direct });
      } else {
        unresolved.push(post);
      }
    }
    const fetched = await this.mapLimit(unresolved, 4, async post => {
      const path = await this.resolveAnnouncementPath(post, novelPath);
      return path ? { post, path } : null;
    });
    for (const candidate of fetched) {
      if (candidate) {
        resolved.push(candidate);
      }
    }
    return resolved;
  }

  /**
   * Known announcement-slug shapes. Returns the chapter path, the post's own
   * path when the post *is* the chapter (2015-era `ch-6` style posts), or
   * null when the slug is unknown and the announcement must be read.
   */
  private deriveChapterPath(
    rest: string,
    novelSlug: string,
    postPath: string,
  ): string | null {
    if (/^ch-\d+(-\d+)?$/.test(rest)) {
      return postPath;
    }
    const volume = rest.match(/^v(\d+)ch(\d+)$/);
    if (volume) {
      return `/${novelSlug}/v${volume[1]}-ch${volume[2]}/`;
    }
    if (/^(v\d+c\d+|ch\d+)(-\d+)?$/.test(rest)) {
      return `/${novelSlug}/${rest}/`;
    }
    return null;
  }

  /** Read an announcement and follow its "Chapter here." style link. */
  private async resolveAnnouncementPath(
    post: TagPost,
    novelPath: string,
  ): Promise<string | null> {
    const $ = loadCheerio(await this.fetchHtml(this.site + post.path));
    const content = this.entryContent($);
    if (content.length === 0) {
      return null;
    }
    const prefix =
      novelPath.charAt(novelPath.length - 1) === '/'
        ? novelPath
        : novelPath + '/';
    let found: string | null = null;
    content.find('a').each((i, el) => {
      if (found) {
        return;
      }
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      const path = this.toPath(href);
      if (
        path.indexOf(prefix) === 0 &&
        path !== novelPath &&
        path.indexOf('/feed') === -1
      ) {
        found = path;
      }
    });
    if (found) {
      return found;
    }
    // Old posts carry the chapter text itself; anything too short to be a
    // chapter (an announcement without a resolvable link) is skipped.
    const text = this.normalizeText(content.text());
    return text.length >= 200 ? post.path : null;
  }

  /** Release date of a ToC chapter, when the site announced it by date. */
  private announcementDateFor(
    chapterPath: string,
    novelSlug: string,
    archive: TagArchive | null,
    annDates: Record<string, string>,
  ): string | undefined {
    if (isUrlAbsolute(chapterPath) || !archive) {
      return undefined;
    }
    const base = this.lastSegment(chapterPath);
    const compact = base.replace(/^v(\d+)-ch/, 'v$1ch');
    const keys = [
      base,
      compact,
      `${novelSlug}-${base}`,
      `${novelSlug}-${compact}`,
      `${archive.tagSlug}-${base}`,
      `${archive.tagSlug}-${compact}`,
    ];
    for (const key of keys) {
      if (annDates[key]) {
        return annDates[key];
      }
    }
    return undefined;
  }

  /**
   * Map one search-result URL (dated announcement, chapter child page, or
   * top-level novel page) back to a novel slug from the site catalogue.
   */
  private novelSlugForResult(
    path: string,
    novelSlugs: string[],
  ): string | null {
    const segments = path.split('/').filter(segment => segment);
    if (segments.length === 0) {
      return null;
    }
    const isDatedPost = segments.length === 4 && /^\d{4}$/.test(segments[0]);
    if (isDatedPost) {
      const slug = segments[3];
      for (const novelSlug of novelSlugs) {
        if (slug.indexOf(novelSlug + '-') === 0) {
          return novelSlug;
        }
      }
      return null;
    }
    if (novelSlugs.indexOf(segments[0]) !== -1) {
      return segments[0];
    }
    if (segments.length > 1 && novelSlugs.indexOf(segments[1]) !== -1) {
      return segments[1];
    }
    return null;
  }

  private entryContent($: ReturnType<typeof loadCheerio>) {
    let content = $('#main .entry-content').first();
    if (content.length === 0) {
      content = $('.entry-content').first();
    }
    return content;
  }

  /** Normalize a URL or href to a site-relative path (or an external URL). */
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
      const host = match[1].toLowerCase();
      if (SAME_SITE_HOSTS.indexOf(host) === -1) {
        return raw.split('#')[0];
      }
      raw = match[2] || '/';
    }
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) {
      return '/';
    }
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

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    task: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers: Promise<void>[] = [];
    const count = Math.min(limit, items.length);
    for (let w = 0; w < count; w++) {
      workers.push(
        (async () => {
          while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await task(items[index]);
          }
        })(),
      );
    }
    await Promise.all(workers);
    return results;
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private lastSegment(path: string): string {
    const segments = path.split('/').filter(segment => segment);
    return segments.length > 0 ? segments[segments.length - 1] : '';
  }

  private lastNumber(value: string): number {
    const matches = value.match(/\d+/g);
    if (!matches) {
      return 0;
    }
    return Number(matches[matches.length - 1]);
  }
}

export default new FirebirdsNestPlugin();
