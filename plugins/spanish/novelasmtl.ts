import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const SITE = 'https://www.sinacortadores.com';
const SITE_HOST = /^(?:www\.)?sinacortadores\.com$/i;
// Pages that list the novels of the blog. The first one is the full list, the
// others hold a few extra series that are missing from it.
const INDEX_PAGES = [
  '/p/tabla-de-contenido.html',
  '/p/webtoon-manhwa.html',
  '/p/novelas-chinas-mtl.html',
  '/p/novelas-fanfic-mtl.html',
];
const NOVEL_PATH = /^\/p\/[^/]+\.html$/i;
// Chapters are regular blog posts: /2024/10/slug.html
const CHAPTER_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/i;
// "Sinopsis:", "Sinopsis Completa:", "Sinopsis de la Novela:", "Synopsis :"
const SYNOPSIS_START = /^(?:leer\s+)?(?:sinopsis|synopsis)\b[^.]{0,30}$/i;
const DIVIDER = /^[\s\-–—_=*.]+$/;
const MIN_UNTITLED_SYNOPSIS = 80;
const CHAPTER_LIST_START =
  /^(?:todos los\s+vol[uú]menes|vol[uú]menes completos|all volumes)\s*:?$/i;
const NAVIGATION =
  /^[\s\-–—]*(?:anterior|[ií]ndice|siguiente|previous|next|index)(?:[\s\-–—]+(?:anterior|[ií]ndice|siguiente|previous|next|index))*[\s\-–—]*$/i;
const SHARE_REQUEST = /^\s*si realmente te gust[oó] la novela/i;

class NovelasMTLPlugin implements Plugin.PluginBase {
  id = 'novelasmtl';
  name = 'Novelas MTL';
  icon = 'src/es/novelasmtl/icon.png';
  site = SITE;
  version = '1.0.0';

  private async getHtml(path: string): Promise<string> {
    const response = await fetchApi(this.resolveUrl(path));
    if (!response.ok) {
      throw new Error(`Novelas MTL: HTTP ${response.status}.`);
    }
    return response.text();
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Site-relative path of a link on this blog, or undefined. */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
      const url = new URL(href, SITE);
      return SITE_HOST.test(url.hostname) ? url.pathname : undefined;
    } catch {
      return undefined;
    }
  }

  /** Blogger serves thumbnails; ask for a size that suits a cover. */
  private bigCover(src: string | undefined): string {
    if (!src) return defaultCover;
    return src.replace(/\/(?:w\d+-h\d+[^/]*|s\d+[^/]*)\/([^/]+)$/, '/s400/$1');
  }

  private async catalogue(): Promise<Plugin.NovelItem[]> {
    // A missing extra index page is tolerated, but if none loads the site is
    // unreachable and that must not look like an empty catalogue.
    const results = await Promise.allSettled(
      INDEX_PAGES.map(page => this.getHtml(page)),
    );
    const pages = results.map(result =>
      result.status === 'fulfilled' ? result.value : '',
    );
    if (!pages.some(Boolean)) {
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      throw failure?.reason instanceof Error
        ? failure.reason
        : new Error('Novelas MTL: no se pudo cargar el catálogo.');
    }
    const novels = new Map<string, Plugin.NovelItem>();
    for (const html of pages) {
      if (!html) continue;
      const $ = loadCheerio(html);
      $('.post-body a[href]').each((_, el) => {
        const link = $(el);
        const path = this.sitePath(link.attr('href'));
        if (!path || !NOVEL_PATH.test(path)) return;
        const name = this.cleanText(link.text());
        const cover = link.find('img[src]').first().attr('src');
        const known = novels.get(path);
        if (known) {
          if (known.cover === defaultCover && cover) {
            known.cover = this.bigCover(cover);
          }
          if (!known.name && name) known.name = name;
          return;
        }
        novels.set(path, {
          name,
          path,
          cover: cover ? this.bigCover(cover) : defaultCover,
        });
      });
    }
    return Array.from(novels.values()).filter(novel => novel.name);
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The catalogue is a handful of pages without pagination.
    if (pageNo > 1) return [];
    return this.catalogue();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The blog's own search only finds individual chapter posts, so the
    // catalogue titles are matched instead.
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length || pageNo > 1) return [];
    const novels = await this.catalogue();
    return novels.filter(novel => {
      const name = novel.name.toLowerCase();
      return tokens.every(token => name.includes(token));
    });
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(await this.getHtml(novelPath));
    const body = $('.post-body').first();
    body.find('script, style, ins, iframe, .adsbygoogle').remove();

    const name =
      this.cleanText($('h3.post-title').first().text()).replace(
        /\s+Espa[nñ]ol$/i,
        '',
      ) || 'Sin título';

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    body.find('a[href]').each((_, el) => {
      const link = $(el);
      const path = this.sitePath(link.attr('href'));
      if (!path || !CHAPTER_PATH.test(path) || seen.has(path)) return;
      // "Título (Novela) Capítulo 1" -> "Capítulo 1"
      const label = this.cleanText(link.text())
        .replace(/^.*?\(novela\)\s*/i, '')
        .replace(/[\s\-–&,]+$/, '');
      if (!label) return;
      seen.add(path);
      const number = /\d+(?:\.\d+)?/.exec(label)?.[0];
      let chapterName = label;
      if (/^[\d\s\-–.,&]+$/.test(label)) {
        chapterName = `${/\d\s*[-–,&]\s*\d/.test(label) ? 'Capítulos' : 'Capítulo'} ${label}`;
      } else if (/^\d/.test(label)) {
        chapterName = `Capítulo ${label}`;
      }
      chapters.push({
        name: chapterName,
        path,
        chapterNumber: number ? Number(number) : undefined,
      });
    });
    if (!chapters.length) {
      // Some series were moved to another site and only link there.
      const moved = body
        .find('a[href]')
        .toArray()
        .map(a => {
          try {
            return new URL($(a).attr('href') || '', SITE).hostname;
          } catch {
            return '';
          }
        })
        .find(
          host =>
            host && !SITE_HOST.test(host) && !/google|blogger/i.test(host),
        );
      throw new Error(
        moved
          ? `Novelas MTL: los capítulos de esta novela ahora están en ${moved}.`
          : 'Novelas MTL: esta novela no tiene capítulos disponibles.',
      );
    }

    // One text line per block, to find the synopsis between its heading and
    // the list of chapters.
    const lines = loadCheerio(
      (body.html() || '').replace(/<br\s*\/?>|<\/(?:div|p)>/gi, '\n'),
    )
      .text()
      .split('\n')
      .map(line => this.cleanText(line))
      .filter(Boolean);
    let listAt = lines.findIndex(line => CHAPTER_LIST_START.test(line));
    if (listAt < 0) {
      // No heading: the list starts at the first chapter link.
      const firstLabel = this.cleanText(
        $(`a[href$="${chapters[0].path}"]`).first().text(),
      );
      listAt = firstLabel
        ? lines.findIndex(line => line.startsWith(firstLabel))
        : -1;
    }
    const synopsisAt = lines.findIndex(line => SYNOPSIS_START.test(line));
    const intro = lines.slice(0, listAt >= 0 ? listAt : undefined);
    // Without a heading the synopsis is the long paragraphs before the list.
    const summary = (
      synopsisAt >= 0
        ? lines.slice(synopsisAt + 1, listAt > synopsisAt ? listAt : undefined)
        : intro.filter(line => line.length >= MIN_UNTITLED_SYNOPSIS)
    )
      .filter(line => !DIVIDER.test(line))
      .join('\n\n');

    const cover = body.find('img[src]').first().attr('src');

    return {
      path: novelPath,
      name,
      cover: this.bigCover(cover),
      summary: summary || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(await this.getHtml(chapterPath));
    const body = $('.post-body').first();
    body.find('script, style, ins, iframe, noscript, .adsbygoogle').remove();
    // Cover banner at the top of every post.
    body.find('img').each((_, img) => {
      const holder = $(img).closest('.separator, a');
      (holder.length ? holder : $(img)).remove();
    });
    // "Anterior - Índice - Siguiente" and the closing share request.
    body.find('div, p, span').each((_, el) => {
      if ($(el).children('div, p').length) return;
      const text = this.cleanText($(el).text());
      if (text && (NAVIGATION.test(text) || SHARE_REQUEST.test(text))) {
        $(el).remove();
      }
    });

    const chapter = body.html()?.trim() || '';
    if (this.cleanText(loadCheerio(chapter).text()).length < 100) {
      throw new Error('Novelas MTL: no se encontró el texto del capítulo.');
    }
    return chapter;
  }

  resolveUrl = (path: string) => new URL(path, SITE).href;
}

export default new NovelasMTLPlugin();
