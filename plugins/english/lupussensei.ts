import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { defaultCover } from '@libs/defaultCover';

// Chapters of the oldest series live on the translator's earlier blog.
const CHAPTER_HOST =
  /^(?:(?:www\.)?lupus-sensei\.com|isekaimynoghra\.blogspot\.com)$/i;
const SITE_HOST = /^(?:www\.)?lupus-sensei\.com$/i;
// Blogger post URLs look like /2021/02/slug.html.
const POST_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/;
// Entries in a chapter list that are not chapters of the novel.
const NOT_CHAPTER = /^(?:spoilers?\b|synopsis$|.*\bchapters$)/i;
const KEEP_ATTRIBUTES = new Set(['src', 'href', 'alt', 'width', 'height']);
const CHAPTER_GROUP = /^\s*(Chapter\s+\d+)\b/i;

// Allows http(s) URLs and scheme-less (relative) ones; anything else, such as
// `javascript:` or `data:`, is rejected.
const isSafeUrl = (value: string): boolean =>
  /^\s*https?:/i.test(value) || !value.split(/[/?#]/)[0].includes(':');

type Novel = Plugin.NovelItem;

class LupusSenseiPlugin implements Plugin.PluginBase {
  id = 'lupussensei';
  name = 'Lupus-sensei Translations';
  site = 'https://www.lupus-sensei.com';
  icon = 'src/en/lupussensei/icon.png';
  version = '1.0.0';

  private async getHtml(url: string): Promise<string> {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`Lupus-sensei: HTTP ${response.status} for ${url}`);
    }
    return response.text();
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Site-relative path for the blog's own posts, an absolute URL for posts
   * that are hosted on the sibling blog, undefined for everything else.
   */
  private postPath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href.trim(), this.site);
    } catch {
      return undefined;
    }
    if (!CHAPTER_HOST.test(url.hostname) || !POST_PATH.test(url.pathname)) {
      return undefined;
    }
    return SITE_HOST.test(url.hostname)
      ? url.pathname
      : `https://${url.hostname}${url.pathname}`;
  }

  /**
   * The novels are the entries of the site's "Novels" menu: a title entry
   * followed by that novel's "Chapter List" page.
   */
  private async catalogue(): Promise<Novel[]> {
    const $ = loadCheerio(await this.getHtml(this.site));
    const novels: Novel[] = [];
    let title: string | undefined;
    $('#menu li a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = this.cleanText($(el).text());
      if (href === '#') {
        title = /^_(?!_)/.test(text)
          ? text.replace(/^_/, '').trim()
          : undefined;
        return;
      }
      if (!title || !/^__\s*chapter/i.test(text)) return;
      let path: string | undefined;
      try {
        const url = new URL(href, this.site);
        if (SITE_HOST.test(url.hostname)) path = url.pathname;
      } catch {
        // ignore malformed menu links
      }
      if (path && !novels.some(novel => novel.path === path)) {
        novels.push({ name: title, path, cover: defaultCover });
      }
      title = undefined;
    });
    return novels;
  }

  private findCover(
    $: ReturnType<typeof loadCheerio>,
    body: ReturnType<ReturnType<typeof loadCheerio>>,
  ): string | undefined {
    return body
      .find('img[src]')
      .toArray()
      .map(img => $(img).attr('src')!)
      .find(src => /^https?:\/\//.test(src));
  }

  /**
   * The menu has no images, so covers come from the blog's label feed: one
   * request lists every chapter-list post with its thumbnail. Any failure
   * leaves the default cover.
   */
  private async withCovers(novels: Novel[]): Promise<Novel[]> {
    const covers = new Map<string, string>();
    try {
      const response = await fetchApi(
        `${this.site}/feeds/posts/default/-/Chapterlist?alt=json&max-results=50`,
      );
      if (response.ok) {
        const json = await response.json();
        for (const entry of json?.feed?.entry || []) {
          const href = (entry.link || []).find(
            (link: { rel?: string; href?: string }) => link.rel === 'alternate',
          )?.href;
          const thumbnail = entry['media$thumbnail']?.url;
          if (!href || !thumbnail) continue;
          covers.set(
            new URL(href, this.site).pathname,
            thumbnail.replace('/s72-c/', '/s640/'),
          );
        }
      }
    } catch {
      // covers are optional
    }
    return novels.map(novel => ({
      ...novel,
      cover: covers.get(novel.path) || defaultCover,
    }));
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The menu lists every series on one page.
    if (pageNo > 1) return [];
    return this.withCovers(await this.catalogue());
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(await this.getHtml(this.resolveUrl(novelPath)));
    const body = $('.post-body').first();
    body.find('script, style').remove();

    const listed = await this.catalogue()
      .then(novels => novels.find(novel => novel.path === novelPath))
      .catch(() => undefined);
    const pageTitle = this.cleanText(
      $('h3.post-title, h1.post-title').first().text(),
    )
      .replace(/\s*[-–]?\s*Chapter List$/i, '')
      .trim();

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    let group = '';
    const walk = (node: AnyNode) => {
      if (node.type === 'text') {
        const match = CHAPTER_GROUP.exec(this.cleanText(node.data || ''));
        if (match) group = match[1];
        return;
      }
      if (node.type !== 'tag') return;
      if (node.name === 'a') {
        const path = this.postPath($(node).attr('href'));
        const name = this.cleanText($(node).text());
        if (!path || !name || NOT_CHAPTER.test(name) || seen.has(path)) return;
        seen.add(path);
        chapters.push({
          name: group && /^ep\b/i.test(name) ? `${group} - ${name}` : name,
          path,
        });
        return;
      }
      (node.children || []).forEach(walk);
    };
    body.contents().each((_, node) => walk(node));

    if (!chapters.length) {
      throw new Error('Lupus-sensei: no chapters were found for this novel.');
    }

    const cover = this.findCover($, body);

    return {
      path: novelPath,
      name: listed?.name || pageTitle || 'Untitled',
      cover: cover || defaultCover,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(await this.getHtml(this.resolveUrl(chapterPath)));
    const body = $('.post-body').first();
    body
      .find(
        'script, style, noscript, iframe, object, embed, form, svg, base, meta, .adsbygoogle',
      )
      .remove();
    // Word-export leftovers (conditional comments) sit inside the post.
    body
      .find('*')
      .addBack()
      .contents()
      .filter((_, node) => node.type === 'comment')
      .remove();
    // Pasted Word markup carries megabytes of inline styling: keep only the
    // attributes that matter for reading.
    body.find('span, font').each((_, el) => {
      $(el).replaceWith($(el).contents());
    });
    body.find('*').each((_, el) => {
      if (el.type !== 'tag') return;
      for (const [attr, value] of Object.entries(el.attribs)) {
        // Links and images must stay http(s) or relative: the HTML is shown
        // verbatim, so `javascript:` and similar schemes must not survive.
        if (
          !KEEP_ATTRIBUTES.has(attr) ||
          ((attr === 'href' || attr === 'src') && !isSafeUrl(value))
        ) {
          $(el).removeAttr(attr);
        }
      }
    });
    body.find('p, div').each((_, el) => {
      const node = $(el);
      if (
        !node.find('img, hr').length &&
        !this.cleanText(node.text()) &&
        !node.find('p, div').length
      ) {
        node.remove();
      }
    });

    // Posts often open with a few blank lines.
    for (let first = body.contents().first(); first.length; ) {
      const blank =
        first.is('br') ||
        (first[0].type === 'text' && !this.cleanText(first.text()));
      if (!blank) break;
      first.remove();
      first = body.contents().first();
    }

    const chapter = body.html()?.trim() || '';
    if (this.cleanText(loadCheerio(chapter).text()).length < 100) {
      throw new Error('Lupus-sensei: no readable chapter text found.');
    }
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The blog's own search only returns individual chapter posts, so the
    // series are matched against the titles in the menu instead.
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length || pageNo > 1) return [];
    const matches = (await this.catalogue()).filter(novel =>
      tokens.every(token => novel.name.toLowerCase().includes(token)),
    );
    return matches.length ? this.withCovers(matches) : [];
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new LupusSenseiPlugin();
