import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

type WpEntry = {
  id: number;
  slug: string;
  link: string;
  date?: string;
  title: { rendered: string };
  content?: { rendered: string };
};

type TocLink = {
  title: string;
  path: string;
};

/** Pages of the site menu that are not novels. */
const NON_NOVEL_SLUGS = ['ongoing', 'finished', 'oneshots', 'about', 'contact'];

/** Matches `/YYYY/MM/DD/slug/`, the permalink form of every chapter post. */
const POST_PATH = /^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/$/;

/**
 * Experimental Translations (experimentaltranslations.com) is a WordPress.com
 * translation blog. Its theme has no stable markup, so this plugin reads the
 * public WordPress.com REST API that the site advertises in its `Link` header
 * (`public-api.wordpress.com/wp/v2/sites/<site>`):
 *
 * - A novel is a WordPress page whose body holds the synopsis and a table of
 *   contents (a few older series are dated posts with the same layout). The
 *   `Finished` and `Oneshots` pages list the series that are not pages.
 * - Chapters are dated posts, listed in order by the novel's table of
 *   contents. A oneshot has no table of contents and is its own only chapter.
 * - The site has no search, so search filters the (few) novel titles.
 */
class ExperimentalTranslationsPlugin implements Plugin.PluginBase {
  id = 'experimentaltranslations';
  name = 'Experimental Translations';
  icon = 'src/en/experimentaltranslations/icon.png';
  site = 'https://experimentaltranslations.com';
  version = '1.0.0';

  filters: Filters | undefined = undefined;

  private api =
    'https://public-api.wordpress.com/wp/v2/sites/experimentaltranslations.com';

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The whole catalogue is returned on the first page.
    if (pageNo > 1) {
      return [];
    }
    return this.listNovels('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    return this.listNovels(searchTerm);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const entry = await this.findEntry(novelPath);
    if (!entry) {
      throw new Error(`Experimental Translations: no novel at ${novelPath}`);
    }

    const path = this.toPath(entry.link);
    const name = this.decode(entry.title.rendered);
    const novel: Plugin.SourceNovel = {
      path,
      name,
      cover: defaultCover,
      chapters: [],
    };

    const $ = loadCheerio(`<div id="novel">${entry.content?.rendered}</div>`);
    const root = $('#novel');

    // The series header: author line(s), then the synopsis, up to the table
    // of contents.
    const synopsis: string[] = [];
    let header = true;
    root.children().each((_, el) => {
      const node = $(el);
      if (!header) {
        return;
      }
      if (/^h[1-6]$/i.test(el.tagName || '')) {
        if (/table of contents|contents/i.test(node.text())) {
          header = false;
        }
        return;
      }
      if (el.tagName !== 'p' && el.tagName !== 'blockquote') {
        return;
      }
      node.find('br').replaceWith('\n');
      const text = node.text().trim();
      if (!text || /^[―\-–—\s]+$/.test(text)) {
        return;
      }
      const author = text.match(/^By:\s*([^\n]+)/i);
      if (author) {
        novel.author = this.normalizeText(author[1]);
        return;
      }
      // The raw-source link paragraph is not part of the synopsis.
      if (!text.replace(/https?:\/\/\S+/g, '').trim()) {
        return;
      }
      synopsis.push(text.replace(/[ \t]*\n[ \t]*/g, '\n'));
    });

    const finished = await this.finishedPaths();
    novel.status = finished.has(path)
      ? NovelStatus.Completed
      : NovelStatus.Unknown;

    novel.chapters = this.parseToc(entry.content?.rendered || '').map(
      (link, index) => ({
        name: link.title,
        path: link.path,
        releaseTime: this.dateOfPath(link.path),
        chapterNumber: index + 1,
      }),
    );
    if (novel.chapters.length > 0) {
      if (synopsis.length > 0) {
        novel.summary = synopsis.join('\n\n');
      }
    } else if (POST_PATH.test(path)) {
      // A oneshot has no table of contents and no synopsis (its opening note
      // is part of the chapter): the post itself is the only chapter.
      novel.chapters = [
        {
          name,
          path,
          releaseTime: entry.date,
          chapterNumber: 1,
        },
      ];
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const entry = await this.findEntry(chapterPath, 'posts');
    const html = entry?.content?.rendered || '';
    if (!entry || !html.trim()) {
      throw new Error(
        `Experimental Translations: no chapter text at ${chapterPath}`,
      );
    }

    const $ = loadCheerio(`<div id="chapter">${html}</div>`);
    const root = $('#chapter');
    root.find('script, style, .sharedaddy, .jp-relatedposts').remove();
    // Posts open with a bare link to the raw source; it is not story text.
    const first = root.children().first();
    if (
      first.is('p') &&
      first.find('a').length > 0 &&
      !first
        .text()
        .replace(/https?:\/\/\S+/g, '')
        .trim()
    ) {
      first.remove();
    }
    return root.html() || '';
  }

  resolveUrl = (path: string) => this.site + this.toPath(path);

  /**
   * Every novel: the site's pages that are not menu/utility pages, followed by
   * the series from the `Finished` and `Oneshots` pages that are plain posts.
   */
  private async listNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const pages = await this.fetchList<WpEntry>(
      '/pages?per_page=100&orderby=date&order=desc&_fields=id,slug,link,title',
    );
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    const add = (name: string, path: string) => {
      if (name && !seen.has(path)) {
        seen.add(path);
        novels.push({ name, path, cover: defaultCover });
      }
    };

    for (const page of pages) {
      if (
        NON_NOVEL_SLUGS.indexOf(page.slug) === -1 &&
        !/-images$/.test(page.slug)
      ) {
        add(this.decode(page.title.rendered), this.toPath(page.link));
      }
    }
    for (const link of await this.seriesLinks()) {
      add(link.title, link.path);
    }

    const needle = this.searchKey(searchTerm);
    return novels.filter(
      novel => this.searchKey(novel.name).indexOf(needle) !== -1,
    );
  }

  /** Series linked from the `Finished` and `Oneshots` pages. */
  private async seriesLinks(): Promise<TocLink[]> {
    const pages = await this.fetchList<WpEntry>(
      '/pages?slug=finished,oneshots&_fields=id,slug,link,title,content',
    );
    const links: TocLink[] = [];
    for (const page of pages) {
      const $ = loadCheerio(`<div id="list">${page.content?.rendered}</div>`);
      $('#list a').each((_, el) => {
        const path = this.sitePath($(el).attr('href') || '');
        const title = this.normalizeText($(el).text());
        if (path && title) {
          links.push({ title, path });
        }
      });
    }
    return links;
  }

  private async finishedPaths(): Promise<Set<string>> {
    const pages = await this.fetchList<WpEntry>(
      '/pages?slug=finished&_fields=id,slug,link,title,content',
    );
    const paths = new Set<string>();
    const $ = loadCheerio(
      `<div id="list">${pages[0]?.content?.rendered || ''}</div>`,
    );
    $('#list a').each((_, el) => {
      const path = this.sitePath($(el).attr('href') || '');
      if (path) {
        paths.add(path);
      }
    });
    return paths;
  }

  /** Chapter links of a table of contents, in site order. */
  private parseToc(html: string): TocLink[] {
    const $ = loadCheerio(`<div id="toc">${html}</div>`);
    const links: TocLink[] = [];
    const seen = new Set<string>();
    $('#toc a').each((_, el) => {
      const link = $(el);
      const path = this.sitePath(link.attr('href') || '');
      const title = this.normalizeText(link.text());
      const post = path.match(POST_PATH);
      // Image galleries are attachment pages or "…-images" posts, not text.
      if (!post || !title || /-images$/.test(post[4]) || seen.has(path)) {
        return;
      }
      seen.add(path);
      links.push({ title, path });
    });
    return links;
  }

  /** The page or post that lives at `path`. */
  private async findEntry(
    path: string,
    kind?: 'posts',
  ): Promise<WpEntry | undefined> {
    const wanted = this.toPath(path);
    const slug = wanted.split('/').filter(Boolean).pop() || '';
    const fields = '&_fields=id,slug,link,date,title,content';
    const kinds = kind ? [kind] : ['pages', 'posts'];
    for (const type of kinds) {
      const found = await this.fetchList<WpEntry>(
        `/${type}?slug=${slug}${fields}`,
      );
      const entry =
        found.find(item => this.toPath(item.link) === wanted) || found[0];
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  /** Fetch a REST collection; WordPress answers 400/404 for a missing page. */
  private async fetchList<T>(route: string): Promise<T[]> {
    const url = this.api + route;
    const res = await fetchApi(url);
    if (res.status === 400 || res.status === 404) {
      return [];
    }
    if (!res.ok) {
      // Carry the status so tooling can tell a refused/blocked request
      // (403/503) apart from a genuine parsing failure.
      throw Object.assign(
        new Error(`HTTP ${res.status} while fetching ${url}`),
        { status: res.status },
      );
    }
    return res.json();
  }

  /**
   * Site-relative path with a trailing slash for a link on this site (either
   * the custom domain or the original `.wordpress.com` address), or an empty
   * string for any other host.
   */
  private sitePath(href: string): string {
    const raw = href.trim();
    if (/^https?:\/\//i.test(raw) && !this.isSiteUrl(raw)) {
      return '';
    }
    return this.toPath(raw);
  }

  private isSiteUrl(url: string): boolean {
    return /^https?:\/\/(?:www\.)?experimentaltranslations\.(?:com|wordpress\.com)(?:[/?#]|$)/i.test(
      url,
    );
  }

  /** Site-relative path with a trailing slash, e.g. `/2020/12/25/slug/`. */
  private toPath(href: string): string {
    const raw = href.trim();
    const sameSite = raw.match(
      /^https?:\/\/(?:www\.)?experimentaltranslations\.(?:com|wordpress\.com)(\/.*)?$/i,
    );
    const clean = (sameSite ? sameSite[1] || '/' : raw).split(/[?#]/)[0];
    const path = clean.charAt(0) === '/' ? clean : '/' + clean;
    return path.charAt(path.length - 1) === '/' ? path : path + '/';
  }

  /** ISO date taken from a dated chapter permalink. */
  private dateOfPath(path: string): string | undefined {
    const post = path.match(POST_PATH);
    return post ? `${post[1]}-${post[2]}-${post[3]}T00:00:00` : undefined;
  }

  /** Lowercase with typographic quotes flattened so "Parent's" matches. */
  private searchKey(text: string): string {
    return this.normalizeText(text)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"');
  }

  private decode(html: string): string {
    return this.normalizeText(loadCheerio(`<p>${html}</p>`)('p').text());
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}

export default new ExperimentalTranslationsPlugin();
