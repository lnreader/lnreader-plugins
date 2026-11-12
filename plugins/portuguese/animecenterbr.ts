import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SITE_HOST = /^(?:www\.)?animecenterbr\.com$/i;
// The A-Z index is one long page: it is split into pages of this size.
const PAGE_SIZE = 24;
// Index entries are followed by "(Finalizado)" when the translation is over.
const FINISHED = /\(\s*finalizado\s*\)/i;
// "Light Novel – Português (PT-BR)" and similar suffixes of the post titles.
const TITLE_SUFFIX =
  /\s+[–—-]\s+(?:(?:light |web )?novel\s+[–—-]\s+)?portugu[eê]s.*$/i;
const VOLUME = /^\s*(?:volume|vol\.?)\s*(\d+(?:[.,]\d+)?)/i;
const CHAPTER_NUMBER = /^\s*cap[ií]tulos?\s+(\d+(?:[.,]\d+)?)/i;
// Slugs of novel pages (the chapter lists link to other novels as well).
const NOVEL_PAGE_SLUG =
  /(?:^|-)(?:portugues-pt-br|pt-br-portugues|light-novel-pt-br|light-novel-portugues)$/;
const SUPPORT_NOTICE = /^\s*apoie o site/i;
const SINOPSE = /^\s*(?:sinopse|sobre)\s*:\s*/i;
const REST_LATEST =
  '/wp-json/wp/v2/posts?categories=26&orderby=date&order=desc&_embed=wp:featuredmedia&_fields=link,title,_embedded';

type RestPost = {
  link: string;
  title?: { rendered?: string };
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] };
};

type IndexNovel = Plugin.NovelItem & { finished: boolean };

class AnimeCenterBR implements Plugin.PluginBase {
  id = 'animecenterbr';
  name = 'Anime Center BR';
  site = 'https://animecenterbr.com';
  icon = 'src/pt-br/animecenterbr/icon.png';
  version = '1.0.0';

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(
        new Error(`Anime Center BR: HTTP ${response.status}.`),
        { status: response.status },
      );
    }
    return response;
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Converts a link into a site-relative path (`/slug/`). Returns undefined for
   * other sites, the home page, anchors and non-content areas of the site.
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
    const segments = url.pathname.split('/').filter(Boolean);
    if (
      segments.length !== 1 ||
      /^(?:category|tag|page|wp-)/.test(segments[0])
    ) {
      return undefined;
    }
    return `/${segments[0]}/`;
  }

  /**
   * The "LIGHT NOVELS" page is the site's catalogue: an A-Z index with one
   * list per initial letter.
   */
  private async catalogue(): Promise<IndexNovel[]> {
    const $ = loadCheerio(
      await (await this.request(`${this.site}/light-novels-2/`)).text(),
    );
    const novels: IndexNovel[] = [];
    const seen = new Set<string>();
    $('h1')
      .filter((_, el) => /^(?:0-9|[A-Z])$/i.test($(el).text().trim()))
      .next('ul')
      .children('li')
      .each((_, item) => {
        const link = $(item).find('a[href]').first();
        const path = this.sitePath(link.attr('href'));
        const name = this.cleanText(link.text());
        if (!path || !name || seen.has(path)) return;
        seen.add(path);
        novels.push({
          name,
          path,
          cover: defaultCover,
          finished: FINISHED.test($(item).text()),
        });
      });
    return novels;
  }

  private page(novels: IndexNovel[], pageNo: number): Plugin.NovelItem[] {
    const from = (Math.max(pageNo, 1) - 1) * PAGE_SIZE;
    return novels
      .slice(from, from + PAGE_SIZE)
      .map(({ name, path, cover }) => ({ name, path, cover }));
  }

  /** Novels in the "Light Novels" category, most recently added first. */
  private async latestNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const response = await fetchApi(
      `${this.site}${REST_LATEST}&per_page=${PAGE_SIZE}&page=${pageNo}`,
    );
    // WordPress answers a page past the last one with HTTP 400.
    if (response.status === 400 || response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Anime Center BR: HTTP ${response.status}.`);
    }
    const posts: RestPost[] = await response.json();
    const novels: Plugin.NovelItem[] = [];
    for (const post of posts) {
      const path = this.sitePath(post.link);
      const name = this.cleanText(
        loadCheerio(post.title?.rendered || '')
          .text()
          .replace(TITLE_SUFFIX, ''),
      );
      if (!path || !name) continue;
      novels.push({
        name,
        path,
        cover:
          post._embedded?.['wp:featuredmedia']?.[0]?.source_url || defaultCover,
      });
    }
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    // The site has no popularity ranking: browsing is its A-Z catalogue.
    if (showLatestNovels) return this.latestNovels(pageNo);
    return this.page(await this.catalogue(), pageNo);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's own search only finds individual chapter posts, so series are
    // matched against the titles of the catalogue instead.
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const novels = await this.catalogue();
    return this.page(
      novels.filter(novel => {
        const name = novel.name.toLowerCase();
        return tokens.every(token => name.includes(token));
      }),
      pageNo,
    );
  }

  /**
   * Returns the part of the page that belongs to the post itself: everything
   * before the share buttons (what follows is related posts and comments).
   */
  private postBody($: ReturnType<typeof loadCheerio>) {
    const article = $('article.single').first();
    const body = article.length ? article : $('article').first();
    const share = body.find('.post-share').first();
    share.nextAll().remove();
    share.remove();
    body.find('script, style, noscript, iframe, ins, form').remove();
    return body;
  }

  private async coverIfReachable(src: string | undefined): Promise<string> {
    // Most of the older uploads of the site were deleted: only use the
    // picture when it can still be loaded.
    if (!src || src.startsWith('data:')) return defaultCover;
    try {
      const url = new URL(src, this.site).href;
      const response = await fetchApi(url, { method: 'HEAD' });
      return response.ok ? url : defaultCover;
    } catch {
      return defaultCover;
    }
  }

  private status(label: string | undefined, finished?: boolean): string {
    const text = (label || '').toLowerCase();
    if (/finaliz|complet/.test(text)) return NovelStatus.Completed;
    if (/andamento|lançamento|ativo/.test(text)) return NovelStatus.Ongoing;
    if (/hiato|pausad/.test(text)) return NovelStatus.OnHiatus;
    if (/cancel|abandon|dropad/.test(text)) return NovelStatus.Cancelled;
    return finished ? NovelStatus.Completed : NovelStatus.Unknown;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(novelPath))).text(),
    );
    const body = this.postBody($);
    const selfPath = this.sitePath(novelPath) || novelPath;

    const name =
      this.cleanText($('h1.title').first().text()).replace(TITLE_SUFFIX, '') ||
      this.cleanText(body.find('h2, h3').first().text()) ||
      'Untitled';
    // The catalogue tells which links are other novels and which are finished.
    const catalogue = await this.catalogue().catch(() => [] as IndexNovel[]);
    const listed = catalogue.find(novel => novel.path === selfPath);
    const otherNovels = new Set(catalogue.map(novel => novel.path));

    const details: Record<string, string> = {};
    body.find('li').each((_, item) => {
      const label = this.cleanText($(item).children('strong').first().text());
      if (!label || !label.endsWith(':')) return;
      const value = this.cleanText(
        $(item).text().replace($(item).children('strong').first().text(), ''),
      );
      if (value) details[label.slice(0, -1).toLowerCase()] = value;
    });
    const genres = (details['gêneros'] || details['gênero'] || '')
      .replace(/\.$/, '')
      .trim();

    // The chapter links come in lists, grouped under "Volume N" lines.
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>([selfPath]);
    let volume = '';
    let hasVolumes = false;
    body.children().each((_, el) => {
      const block = $(el);
      const links = block.is('a') ? block : block.find('a[href]');
      if (!links.length) {
        const text = this.cleanText(block.text());
        const match = text.length < 250 ? VOLUME.exec(text) : null;
        if (match) {
          volume = `Volume ${match[1]}`;
          hasVolumes = true;
        }
        return;
      }
      links.each((_, link) => {
        const path = this.sitePath($(link).attr('href'));
        const text = this.cleanText($(link).text());
        if (!path || !text || seen.has(path)) return;
        if (otherNovels.has(path) || NOVEL_PAGE_SLUG.test(path.slice(1, -1))) {
          return;
        }
        seen.add(path);
        const number = CHAPTER_NUMBER.exec(text)?.[1];
        chapters.push({
          name: volume && !VOLUME.test(text) ? `${volume} – ${text}` : text,
          path,
          chapterNumber: number ? Number(number.replace(',', '.')) : undefined,
        });
      });
    });
    if (hasVolumes) {
      // Chapter numbers restart in every volume: keep the site's order.
      chapters.forEach(chapter => delete chapter.chapterNumber);
    }
    if (!chapters.length) {
      throw new Error(
        'Anime Center BR: no chapters are hosted on the site for this novel (it only links to downloads).',
      );
    }

    // The synopsis starts at the "Sinopse:" line and runs over the plain
    // paragraphs that follow it.
    const paragraphs: string[] = [];
    let inSynopsis = false;
    for (const el of body.children().toArray()) {
      const block = $(el);
      const text = this.cleanText(block.text());
      if (!inSynopsis) {
        if (block.is('p') && SINOPSE.test(text)) {
          inSynopsis = true;
          paragraphs.push(text.replace(SINOPSE, ''));
        }
        continue;
      }
      if (
        !block.is('p') ||
        !text ||
        SUPPORT_NOTICE.test(text) ||
        block.find('a[href], img').length
      ) {
        break;
      }
      paragraphs.push(text);
    }

    return {
      path: novelPath,
      name,
      cover: await this.coverIfReachable(body.find('img[src]').attr('src')),
      author: details['autor'],
      genres: genres || undefined,
      status: this.status(details['status'], listed?.finished),
      summary: paragraphs.filter(Boolean).join('\n\n') || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(chapterPath))).text(),
    );
    const body = this.postBody($);
    body
      .find('.adsbygoogle, [id^="denakop-ad"], nav, .post-navigation')
      .remove();
    // Ad slots leave empty wrappers behind.
    body.find('div').each((_, el) => {
      if (!$(el).text().trim() && !$(el).find('img').length) $(el).remove();
    });

    const chapter = body.html()?.trim() || '';
    // The illustration pages of a volume have pictures and almost no text.
    if (this.cleanText(body.text()).length < 100 && !body.find('img').length) {
      throw new Error('Anime Center BR: no readable chapter text found.');
    }
    return chapter;
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new AnimeCenterBR();
