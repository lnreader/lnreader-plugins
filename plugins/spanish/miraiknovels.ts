import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 100;
// WordPress categories used by the site.
const CATEGORY_LIGHT_NOVEL = 28;
const CATEGORY_WEB_NOVEL = 13;
// Only some novels can be read on the site; the others are PDF/EPUB downloads.
// Searching the post content for the chapter URLs finds the readable ones.
const READABLE_MARKER = 'capitulo-online';
// "Atelier Tanaka Novela ligera en Español", "Arioto - Novela Ligera +18 en Español"
const TITLE_SUFFIX =
  /\s*[-–—]?\s*Novela(?:\s+(?:ligera|web))?(?:\s*\+\s*18)?\s+en\s+espa[ñn]ol\s*$/i;
const SITE_NAME_SUFFIX = /\s*[-–—|]\s*MiraiK\s*$/i;

type RestPost = {
  link: string;
  title: { rendered: string };
  _embedded?: {
    'wp:featuredmedia'?: {
      source_url?: string;
      media_details?: { sizes?: { medium?: { source_url?: string } } };
    }[];
  };
};

class MiraiKNovelsPlugin implements Plugin.PluginBase {
  id = 'miraiknovels';
  name = 'MiraiK Novels';
  icon = 'src/es/miraiknovels/icon.png';
  site = 'https://miraik.nextnovels.com';
  version = '1.0.0';

  filters = {
    type: {
      label: 'Tipo',
      value: 'all',
      options: [
        { label: 'Todas', value: 'all' },
        { label: 'Novela ligera', value: String(CATEGORY_LIGHT_NOVEL) },
        { label: 'Novela web', value: String(CATEGORY_WEB_NOVEL) },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      label: 'Ordenar por',
      value: 'modified',
      options: [
        { label: 'Última actualización', value: 'modified' },
        { label: 'Más recientes', value: 'date' },
        { label: 'A-Z', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(
        new Error(`MiraiK Novels: HTTP ${response.status}.`),
        {
          status: response.status,
        },
      );
    }
    return response;
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private decode(html: string): string {
    return this.cleanText(loadCheerio(`<p>${html}</p>`).text());
  }

  private cleanTitle(title: string): string {
    return (
      this.decode(title)
        .replace(SITE_NAME_SUFFIX, '')
        .replace(TITLE_SUFFIX, '')
        .trim() || title
    );
  }

  private toPath(url: string): string {
    return new URL(url, this.site).pathname;
  }

  /**
   * Chapter links are normalised to `/capitulo-online/<slug>/`: some lists
   * carry tracking parameters, a missing or doubled trailing slash or a
   * mistyped folder ("/capitulo.../slug").
   */
  private chapterPath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href, this.site);
    } catch {
      return undefined;
    }
    if (url.origin !== this.site) return undefined;
    const segments = url.pathname.split('/').filter(Boolean);
    return segments.length > 1 && segments[0].startsWith('capitulo')
      ? `/${READABLE_MARKER}/${segments[segments.length - 1]}/`
      : undefined;
  }

  private toNovelItems(posts: RestPost[]): Plugin.NovelItem[] {
    return posts.map(post => {
      const media = post._embedded?.['wp:featuredmedia']?.[0];
      return {
        name: this.cleanTitle(post.title.rendered),
        path: this.toPath(post.link),
        cover:
          media?.media_details?.sizes?.medium?.source_url ||
          media?.source_url ||
          defaultCover,
      };
    });
  }

  /** Lists novel posts that have chapters on the site (WordPress REST API). */
  private async listNovels(query: string): Promise<RestPost[]> {
    const response = await fetchApi(
      `${this.site}/wp-json/wp/v2/posts?${query}&_embed=wp:featuredmedia&_fields=id,link,title,_links,_embedded`,
    );
    // WordPress answers 400 for a page number past the last one.
    if (response.status === 400) return [];
    if (!response.ok) {
      throw new Error(`MiraiK Novels: HTTP ${response.status}.`);
    }
    return response.json();
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const type = filters?.type?.value;
    const order = showLatestNovels ? 'modified' : filters?.order?.value;
    const categories =
      type && type !== 'all'
        ? type
        : `${CATEGORY_LIGHT_NOVEL},${CATEGORY_WEB_NOVEL}`;
    const orderby = order || 'modified';
    const direction = orderby === 'title' ? 'asc' : 'desc';
    const posts = await this.listNovels(
      `categories=${categories}&search=${READABLE_MARKER}&per_page=${PAGE_SIZE}&page=${pageNo}&orderby=${orderby}&order=${direction}`,
    );
    return this.toNovelItems(posts);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(novelPath))).text(),
    );
    const content = $('article .entry-content').first();

    const name =
      this.cleanTitle(
        $('meta[property="og:title"]').attr('content') || $('title').text(),
      ) || 'Sin título';

    const cover =
      $('meta[property="og:image"]').attr('content') ||
      content.find('.et_pb_image_0 img').first().attr('data-src') ||
      defaultCover;

    // The text module that follows a label ("Estado:", "Géneros:", "Sinópsis").
    const modules = content.find('.et_pb_text_inner').toArray();
    const afterLabel = (label: RegExp) => {
      const index = modules.findIndex(el =>
        label.test(this.cleanText($(el).text())),
      );
      return index >= 0 ? $(modules[index + 1]) : undefined;
    };

    const statusText = this.cleanText(
      afterLabel(/^Estado\s*:?\s*$/i)?.text() || '',
    );
    let status: string = NovelStatus.Unknown;
    if (/abandon|cancel|dropped/i.test(statusText)) {
      status = NovelStatus.Cancelled;
    } else if (/paus|hiato|hiatus/i.test(statusText)) {
      status = NovelStatus.OnHiatus;
    } else if (/finaliz|complet|terminad/i.test(statusText)) {
      status = NovelStatus.Completed;
    } else if (/progreso|curso/i.test(statusText)) {
      status = NovelStatus.Ongoing;
    }

    const genres = afterLabel(/^G[ée]neros\s*:?\s*$/i)
      ?.find('a')
      .map((_, a) => this.cleanText($(a).text()))
      .get()
      .filter(Boolean)
      .join(', ');

    const synopsis = afterLabel(/^Sin[óo]psis$/i);
    const summary = synopsis
      ? synopsis
          .find('p, li')
          .map((_, el) => this.cleanText($(el).text()))
          .get()
          .filter(Boolean)
          .join('\n\n') || this.cleanText(synopsis.text())
      : undefined;

    // "Autor: X" / "Ilustrador: Y" live in the (non-chapter) details tabs.
    const details = content
      .find('.et_pb_tab_content')
      .toArray()
      .map(el =>
        ($(el).html() || '')
          .replace(/<\/p>|<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ''),
      )
      .join('\n');
    const detail = (label: RegExp) =>
      this.decode(label.exec(details)?.[1] || '') || undefined;
    const author = detail(/^\s*Autor(?:es)?\s*:\s*(.+)$/im);
    const artist = detail(/^\s*Ilustrador(?:es)?\s*:\s*(.+)$/im);

    // The "Lectura online" block has one tab per volume with the chapter links.
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const readingTabs = content
      .find('.et_pb_tabs')
      .filter((_, el) => $(el).find('a[href*="/capitulo"]').length > 0)
      .first();
    const volumes = readingTabs
      .find('.et_pb_tabs_controls li')
      .map((_, li) => this.cleanText($(li).text()))
      .get();
    readingTabs.find('.et_pb_all_tabs > .et_pb_tab').each((index, pane) => {
      $(pane)
        .find('a[href*="/capitulo"]')
        .each((_, link) => {
          const path = this.chapterPath($(link).attr('href'));
          if (!path || seen.has(path)) return;
          seen.add(path);
          const title =
            this.cleanText($(link).text()) ||
            decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
          const volume = volumes.length > 1 ? volumes[index] : '';
          chapters.push({
            name: volume ? `${volume} - ${title}` : title,
            path,
          });
        });
    });

    if (!chapters.length) {
      throw new Error(
        'MiraiK Novels: esta novela no tiene capítulos para leer en línea (el sitio solo ofrece descargas o enlaces externos).',
      );
    }

    return {
      path: novelPath,
      name,
      cover,
      author,
      artist,
      genres: genres || undefined,
      status,
      summary,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(chapterPath))).text(),
    );
    // The first section holds the chapter; the second one is "related posts".
    const section = $('article .entry-content .et_pb_section').first();
    const modules = section.find('.et_pb_text_inner').toArray();
    // A short first module is only the chapter heading banner, which the
    // chapter text repeats (or replaces) in the next module.
    const body = modules.length > 1 ? modules.slice(1) : modules;

    const chapter = loadCheerio('<div></div>');
    const root = chapter('div');
    for (const el of body) root.append($(el).clone());

    root.find('script, style, noscript, iframe, form').remove();
    root.find('img').each((_, img) => {
      const image = chapter(img);
      const lazy = image.attr('data-src');
      if (lazy) image.attr('src', lazy);
      // Use the original upload instead of the generated "-201x300" thumbnail.
      const src = image.attr('src');
      if (src && /^https?:/.test(src)) {
        image.attr('src', src.replace(/-\d+x\d+(\.\w+)$/, '$1'));
      }
    });
    // Footnote markers link to anchors that do not exist in the app: unwrap
    // the links but keep their contents (text, formatting and linked images).
    root.find('a').each((_, link) => {
      chapter(link).replaceWith(chapter(link).contents());
    });
    root.find('*').each((_, el) => {
      const element = chapter(el);
      const keep = element.is('img') ? ['src', 'alt'] : [];
      for (const attr of Object.keys(el.attribs || {})) {
        if (!keep.includes(attr)) element.removeAttr(attr);
      }
    });
    root.find('p').each((_, p) => {
      const paragraph = chapter(p);
      if (!this.cleanText(paragraph.text()) && !paragraph.find('img').length) {
        paragraph.remove();
      }
    });

    const html = root.html()?.trim() || '';
    if (this.cleanText(loadCheerio(html).text()).length < 100) {
      throw new Error('MiraiK Novels: no se encontró el texto del capítulo.');
    }
    return html;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];
    const categories = `${CATEGORY_LIGHT_NOVEL},${CATEGORY_WEB_NOVEL}`;
    const found = await this.listNovels(
      `categories=${categories}&search=${encodeURIComponent(term)}&per_page=${SEARCH_PAGE_SIZE}&page=${pageNo}`,
    );
    // Only keep novels that can be read online (see READABLE_MARKER).
    let readable: Set<string> | undefined;
    try {
      const posts = await this.listNovels(
        `categories=${categories}&search=${READABLE_MARKER}&per_page=${SEARCH_PAGE_SIZE}`,
      );
      readable = new Set(posts.map(post => post.link));
    } catch {
      readable = undefined;
    }
    return this.toNovelItems(
      readable ? found.filter(post => readable!.has(post.link)) : found,
    );
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new MiraiKNovelsPlugin();
