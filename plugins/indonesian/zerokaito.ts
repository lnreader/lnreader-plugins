import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { AnyNode } from 'domhandler';
import { defaultCover } from '@libs/defaultCover';

const SITE_HOST = /^(?:www\.)?zerokaito\.blogspot\.com$/i;

/** Hand-written index pages that list the novels, keyed by filter value. */
const LISTS = {
  ongoing: '/p/on-going.html',
  completed: '/p/novel-tamat.html',
  oneshot: '/p/oneshot.html',
  dropped: '/p/dropaxed.html',
} as const;
type ListKey = keyof typeof LISTS;
const LIST_KEYS = Object.keys(LISTS) as ListKey[];

// "Volume 01", "Volume 9.5 Ura Hanashi", "Jilid 3" headings on a novel page.
const VOLUME_HEADING = /^(?:volume|vol\.?|jilid)\s*\d+(?:\.\d+)?[^[\]]*/i;
// Index pages and the home page are linked from novel pages but are no chapters.
const INDEX_PAGE =
  /^\/p\/(?:on-going|novel-tamat|oneshot|dropaxed|donasi)\.html$/;
const SUMMARY_LIMIT = 2500;

/**
 * Kaito Novel (zerokaito.blogspot.com) is an Indonesian light-novel translation
 * blog on Blogger. Blogger exposes no novel or chapter entities, so the plugin
 * follows how the site itself is organised:
 *
 * - The menu pages "On-Going", "Tamat", "Oneshot" and "Drop/Axed" are hand-made
 *   catalogues: a cover image followed by a link to the novel's own page.
 * - A novel page (a post or a static page) holds the synopsis and the chapter
 *   links, grouped under "Volume N" headings. Each chapter is a separate post.
 * - A page with no chapter links is a single-post story (a oneshot) and is
 *   exposed as one chapter.
 * - The site's search returns chapter posts, not novels, so search filters the
 *   catalogues by title.
 */
class ZerokaitoPlugin implements Plugin.PluginBase {
  id = 'zerokaito';
  name = 'Kaito Novel';
  icon = 'src/id/zerokaito/icon.png';
  site = 'https://zerokaito.blogspot.com';
  version = '1.0.0';

  filters = {
    list: {
      label: 'Daftar',
      value: 'ongoing',
      options: [
        { label: 'On-Going', value: 'ongoing' },
        { label: 'Tamat', value: 'completed' },
        { label: 'Oneshot', value: 'oneshot' },
        { label: 'Drop / Axed', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      // Carry the status so tooling can tell a refused request (403/429/503)
      // apart from a genuine parsing failure.
      throw Object.assign(
        new Error(`Kaito Novel: HTTP ${response.status} for ${url}`),
        { status: response.status },
      );
    }
    return response;
  }

  /**
   * Site-relative path (`/2021/03/slug.html` or `/p/slug.html`) of a link to a
   * post or static page, or undefined for anything else (other hosts, the home
   * page, search/label pages, anchors).
   */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href, this.site);
    } catch {
      return undefined;
    }
    if (!SITE_HOST.test(url.hostname)) return undefined;
    if (!/^\/(?:\d{4}\/\d{2}|p)\/[^/]+\.html$/.test(url.pathname)) {
      return undefined;
    }
    return url.pathname;
  }

  private clean(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Novels listed on one catalogue page, in the order the site shows them. */
  private async catalogue(list: ListKey): Promise<Plugin.NovelItem[]> {
    const response = await this.request(this.site + LISTS[list]);
    const $ = loadCheerio(await response.text());
    const found = new Map<string, Plugin.NovelItem>();
    let lastCover: string | undefined;

    $('#post-body img, #post-body a').each((_, el) => {
      const node = $(el);
      if (el.tagName === 'img') {
        const src = node.attr('src');
        if (
          src &&
          /^https?:/.test(src) &&
          !/blogger_logo|blank\.gif/.test(src)
        ) {
          lastCover = src;
        }
        return;
      }
      const path = this.sitePath(node.attr('href'));
      if (!path || INDEX_PAGE.test(path)) return;
      const name = this.clean(node.text());
      let entry = found.get(path);
      if (!entry) {
        entry = { name: '', path, cover: lastCover || defaultCover };
        found.set(path, entry);
      }
      // Some entries are linked twice, once on a blank cover/label.
      if (!entry.name && name) entry.name = name;
      lastCover = undefined;
    });

    return Array.from(found.values()).filter(novel => novel.name);
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Each catalogue is a single page without pagination.
    if (pageNo > 1) return [];
    const list = (filters?.list?.value as ListKey | undefined) || 'ongoing';
    return this.catalogue(LISTS[list] ? list : 'ongoing');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const needle = this.clean(searchTerm).toLowerCase();
    const seen = new Set<string>();
    const results: Plugin.NovelItem[] = [];
    for (const list of LIST_KEYS) {
      for (const novel of await this.catalogue(list)) {
        if (seen.has(novel.path)) continue;
        seen.add(novel.path);
        if (novel.name.toLowerCase().indexOf(needle) !== -1) {
          results.push(novel);
        }
      }
    }
    return results;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await this.request(this.resolveUrl(novelPath));
    const $ = loadCheerio(await response.text());
    const body = $('#post-body').first();
    if (!body.length) {
      throw new Error(`Kaito Novel: no novel content at ${novelPath}`);
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: this.clean(
        (
          $('h1.entry-title').first().text() || $('title').first().text()
        ).replace(/\s*Bahasa Indonesia\s*$/i, ''),
      ),
      cover: defaultCover,
      chapters: [],
    };

    const cover = body.find('img').first().attr('src');
    if (cover && /^https?:/.test(cover)) novel.cover = cover;

    // Walk the page in document order so every chapter link is filed under the
    // most recent "Volume N" heading above it.
    let volume = '';
    const seen = new Set<string>([novelPath]);
    const walk = (nodes: AnyNode[]) => {
      for (const node of nodes) {
        if (node.type === 'text') {
          const text = this.clean(node.data || '');
          const heading = VOLUME_HEADING.exec(text);
          if (heading) volume = this.clean(heading[0]);
        } else if (node.type === 'tag') {
          if (node.tagName === 'a') {
            const path = this.sitePath($(node).attr('href'));
            const name = this.clean($(node).text());
            if (path && name && !INDEX_PAGE.test(path) && !seen.has(path)) {
              seen.add(path);
              novel.chapters!.push({
                name: volume ? `${volume} — ${name}` : name,
                path,
              });
            }
          } else if (node.tagName !== 'script' && node.tagName !== 'style') {
            walk(node.children as AnyNode[]);
          }
        }
      }
    };
    walk(body.contents().toArray() as AnyNode[]);

    // A story without chapter links is a single post.
    if (novel.chapters!.length === 0) {
      novel.chapters = [
        { name: novel.name, path: novelPath, chapterNumber: 1 },
      ];
    }
    // Chapter titles restart in every volume, so number them by position.
    novel.chapters!.forEach((chapter, index) => {
      chapter.chapterNumber = index + 1;
    });

    const text = this.clean(body.text());
    const author =
      /Authors?(?:\(s\))?\s*:?\s*(.+?)\s*(?:Illustrator|Ilustrator|Artists?(?:\(s\))?|Sinopsis|$)/i.exec(
        text,
      );
    if (author?.[1]) novel.author = author[1];
    const artist =
      /(?:Illustrator|Ilustrator|Artists?(?:\(s\))?)\s*:?\s*(.+?)\s*(?:Sinopsis|Volume|$)/i.exec(
        text,
      );
    if (artist?.[1]) novel.artist = artist[1];
    const summary =
      /Sinopsis\s*:?\s*(.+?)\s*(?:Daftar isi|Volume\s*\d|Jilid\s*\d|$)/i.exec(
        text,
      );
    if (summary?.[1]) novel.summary = summary[1].slice(0, SUMMARY_LIMIT);

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await this.request(this.resolveUrl(chapterPath));
    const $ = loadCheerio(await response.text());
    const body = $('#post-body').first();
    body.find('script, style, noscript, iframe, .ad, .adsbygoogle').remove();
    const html = (body.html() || '').trim();
    if (!html || !this.clean(body.text())) {
      // Illustration posts hold images only; keep them readable.
      if (body.find('img').length === 0) {
        throw new Error(`Kaito Novel: no chapter text at ${chapterPath}`);
      }
    }
    return html;
  }

  resolveUrl = (path: string) =>
    /^https?:/i.test(path) ? path : this.site + path;
}

export default new ZerokaitoPlugin();
