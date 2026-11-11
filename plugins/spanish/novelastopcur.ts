import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// The site is a Blogger blog: the catalogue is a static page, every novel is a
// static page whose body holds the synopsis and the chapter links, and every
// chapter is a regular post (/YYYY/MM/slug.html).
const SITE_HOST = /^animeshoy12\.blogspot\./i;
const CATALOGUE_PATH = '/p/lista-de-novelas.html';
const NOVEL_PATH = /^\/p\/[^/]+\.html$/;
const CHAPTER_PATH = /^\/\d{4}\/\d{2}\/[^/]+\.html$/;
// Links to posts that are not chapters (power-level guides and the like) have
// no number in their text.
const CHAPTER_TEXT = /\d|pr[oó]logo|ep[ií]logo|extra|especial|prefacio/i;
// "Anterior - Índice - Siguiente" and the author's donation/sharing lines.
const NAVIGATION =
  /^[\s\-–—|]*(?:anterior|[ií]ndice|siguiente|volver)\b[\s\-–—|a-záéíóúñ]*$/i;
const PROMOTION =
  /patreon|esponsor|anslid|compart(?:an|ir)(?:lo)?\s+(?:la\s+)?(?:novela|p[aá]gina|esta)|ayudar[ií]a mucho|m[aá]s cap[ií]tulos\s+(?:gratis|en|:|\()|muchas gracias por todo/i;
const SEPARATOR = /^[\s\-–—_=.·|~*]*$/;
// Left over at the very end of a chapter once the links are gone.
const TRAILING = /^[\s\-–—_=.·|~*]*(?:tambi[eé]n\s*:?)?[\s\-–—_=.·|~*]*$/i;
const SYNOPSIS_START =
  /^(?:[^:]{0,40}?[-–]\s*)?(?:leer\s+)?sin[oó]psis\s*\d*\s*:?\s*(.*)$/i;
const SYNOPSIS_STOP =
  /^(?:t[ií]tulos?\b|otros\s+t[ií]tulos|nota\b|todos\s+los\s+vol|vol[uú]menes?\b|volumen\b|sin[oó]psis\s*\d|del mismo autor|g[eé]neros?\s*:|autor\s*:|estado\s*:|tipo\s*:)/i;
const LABEL = /^(autor|estado|g[eé]neros?|tipo)\s*:\s*(.*)$/i;
// Two or more consecutive empty blocks (spacing between paragraphs).
const BLANK_BLOCKS =
  /(?:<(?:div|p)[^>]*>(?:<(?:span|b|i|u)[^>]*>)*(?:<br\s*\/?>|&nbsp;|\s)*(?:<\/(?:span|b|i|u)>)*<\/(?:div|p)>\s*){2,}/gi;
const SUMMARY_LIMIT = 3000;
const COVER_SIZE = 's400';

class NovelasTopcur implements Plugin.PluginBase {
  id = 'novelastopcur';
  name = 'Novelas Topcur';
  site = 'https://animeshoy12.blogspot.com';
  icon = 'src/es/novelastopcur/icon.png';
  version = '1.0.0';

  private async request(path: string) {
    const response = await fetchApi(this.resolveUrl(path));
    if (!response.ok) {
      throw new Error(`Novelas Topcur: HTTP ${response.status}.`);
    }
    return response;
  }

  private clean(text: string): string {
    return text.replace(/[\s\u00a0]+/g, ' ').trim();
  }

  /** Turns an href into a site-relative path, or undefined for other sites. */
  private sitePath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
      const url = new URL(href, this.site);
      return SITE_HOST.test(url.hostname) ? url.pathname : undefined;
    } catch {
      return undefined;
    }
  }

  /** Blogger serves covers at any size: ask for a sharper one than the grid's. */
  private cover(src: string | undefined): string {
    if (!src || src.startsWith('data:') || /notavailable/i.test(src)) {
      return defaultCover;
    }
    return src
      .replace(/=(?:[ws]\d+(?:-h\d+)?)(?:-[a-z0-9]+)*$/i, `=${COVER_SIZE}`)
      .replace(/\/(?:w\d+-h\d+|s\d+)(?:-[a-z0-9]+)*\//i, `/${COVER_SIZE}/`);
  }

  /** "Nano Machine Novela Español" -> "Nano Machine" */
  private title(text: string): string {
    return this.clean(text)
      .replace(/^\d+\s*\.\s*/, '')
      .replace(/\s*\bnovela(?:\s+espa[ñn]ol)?\s*$/i, '')
      .replace(/^lista de cap[ií]tulos\s+mga\b/i, 'Martial God Asura')
      .trim();
  }

  /** "NANO MACHINE" -> "Nano Machine"; mixed-case titles are left alone. */
  private titleCase(text: string): string {
    if (text.length < 5 || text !== text.toUpperCase()) return text;
    return text
      .toLowerCase()
      .replace(
        /(^|\s)(\S)/g,
        (_, space, letter) => space + letter.toUpperCase(),
      );
  }

  private normalize(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * The catalogue is one page: every novel appears as a numbered link with its
   * cover image linked to the same novel page, in no fixed order.
   */
  private async catalogue(): Promise<Plugin.NovelItem[]> {
    const $ = loadCheerio(await (await this.request(CATALOGUE_PATH)).text());
    const entries = new Map<
      string,
      { parts: string[]; cover: string | undefined }
    >();
    $('.post-body a[href]').each((_, link) => {
      const path = this.sitePath($(link).attr('href'));
      if (!path || !NOVEL_PATH.test(path) || path === CATALOGUE_PATH) return;
      const entry = entries.get(path) || { parts: [], cover: undefined };
      const text = this.title($(link).text());
      if (text && !entry.parts.includes(text)) entry.parts.push(text);
      entry.cover ||= $(link).find('img').first().attr('src');
      entries.set(path, entry);
    });
    const novels: Plugin.NovelItem[] = [];
    entries.forEach((entry, path) => {
      const name = this.title(entry.parts.join(' '));
      if (!name) return;
      novels.push({ name, path, cover: this.cover(entry.cover) });
    });
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The catalogue is a single page without pagination.
    if (pageNo > 1) return [];
    return this.catalogue();
  }

  /** Plain-text lines of an HTML fragment, one per block or line break. */
  private lines(fragment: string): string[] {
    const text = loadCheerio(
      fragment
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|li|h\d|tr)>/gi, '\n'),
    ).text();
    return text
      .split('\n')
      .map(line => this.clean(line))
      .filter(Boolean);
  }

  private status(text: string | undefined): NovelStatus | undefined {
    if (!text) return undefined;
    if (/finaliz|complet|termin/i.test(text)) return NovelStatus.Completed;
    if (/paus|hiatus/i.test(text)) return NovelStatus.OnHiatus;
    if (/cancel|abandon/i.test(text)) return NovelStatus.Cancelled;
    if (/activ|en curso|emisi[oó]n|publicando/i.test(text)) {
      return NovelStatus.Ongoing;
    }
    return undefined;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(await (await this.request(novelPath)).text());
    const body = $('.post-body').first();
    if (!body.length) {
      throw new Error('Novelas Topcur: the novel page has no content.');
    }

    const isChapter = (link: ReturnType<typeof $>) => {
      const path = this.sitePath(link.attr('href'));
      return (
        !!path && CHAPTER_PATH.test(path) && CHAPTER_TEXT.test(link.text())
      );
    };

    const seen = new Set<string>();
    const listed: { name: string; path: string }[] = [];
    body.find('a[href]').each((_, el) => {
      const link = $(el);
      if (!isChapter(link)) return;
      const path = this.sitePath(link.attr('href'))!;
      const name = this.clean(link.text());
      if (!name || seen.has(path)) return;
      seen.add(path);
      listed.push({ name, path });
    });

    // Newer novels keep their chapters on other sites; the page only links to
    // them. Say so instead of presenting a truncated list as the whole novel.
    const elsewhere = new Set<string>();
    body.find('a[href]').each((_, el) => {
      try {
        const url = new URL($(el).attr('href') || '', this.site);
        if (
          !SITE_HOST.test(url.hostname) &&
          /^\/novela\/|^\/\d{4}\/\d{2}\//.test(url.pathname)
        ) {
          elsewhere.add(url.hostname.replace(/^www\./i, ''));
        }
      } catch {
        // Ignore malformed links.
      }
    });
    const hosts = Array.from(elsewhere).join(', ');
    if (!listed.length) {
      throw new Error(
        hosts
          ? `Novelas Topcur: los capítulos de esta novela están en ${hosts}, no en este blog.`
          : 'Novelas Topcur: no chapters were found.',
      );
    }

    // Every title repeats the novel's name ("Nano Machine (Novela) Capitulo
    // 1"): drop the prefix shared by most chapters, but keep distinguishing
    // ones such as "SPECIAL MGA (Qiang Xuantian) Capitulo 11".
    const prefixOf = (name: string) =>
      /^(.*?)\s*(?=\bcap[ií]tulo\b)/i.exec(name)?.[1] || '';
    const counts = new Map<string, number>();
    listed.forEach(({ name }) => {
      const prefix = prefixOf(name);
      if (prefix) counts.set(prefix, (counts.get(prefix) || 0) + 1);
    });
    let commonPrefix = '';
    counts.forEach((count, prefix) => {
      if (count > (counts.get(commonPrefix) || 0)) commonPrefix = prefix;
    });
    const stripPrefix = (counts.get(commonPrefix) || 0) * 2 >= listed.length;

    const chapters: Plugin.ChapterItem[] = listed.map(({ name, path }) => {
      let chapterName =
        stripPrefix && commonPrefix && prefixOf(name) === commonPrefix
          ? name.slice(commonPrefix.length).trim()
          : name;
      // Some lists only link the number.
      if (/^\d+(?:\.\d+)?$/.test(chapterName)) {
        chapterName = `Capítulo ${chapterName}`;
      }
      const number =
        /\bcap[ií]tulo\s*(\d+(?:\.\d+)?)/i.exec(name)?.[1] ||
        /\bC(\d+(?:\.\d+)?)\b/.exec(name)?.[1];
      return {
        name: chapterName,
        path,
        chapterNumber: number ? Number(number) : undefined,
      };
    });

    // Everything before the first chapter link is the novel's description.
    const bodyHtml = body.html() || '';
    const firstLink = /<a\b[^>]*href="[^"]*\/\d{4}\/\d{2}\/[^"]+"/i.exec(
      bodyHtml,
    );
    const header = this.lines(
      firstLink ? bodyHtml.slice(0, firstLink.index) : bodyHtml,
    );

    const labels: Record<string, string> = {};
    header.forEach((line, index) => {
      const match = LABEL.exec(line);
      if (!match) return;
      const key = match[1].toLowerCase().replace('é', 'e');
      const value =
        match[2] || (LABEL.test(header[index + 1]) ? '' : header[index + 1]);
      if (value && !labels[key]) labels[key] = value;
    });

    let summary = '';
    const start = header.findIndex(line => SYNOPSIS_START.test(line));
    if (start >= 0) {
      const parts = [SYNOPSIS_START.exec(header[start])![1]];
      for (const line of header.slice(start + 1)) {
        if (SYNOPSIS_STOP.test(line) || SEPARATOR.test(line)) break;
        parts.push(line);
      }
      summary = parts.filter(Boolean).join('\n').slice(0, SUMMARY_LIMIT).trim();
    }

    if (hosts) {
      summary += `${summary ? '\n\n' : ''}Nota: los capítulos que faltan están en ${hosts}.`;
    }

    const name =
      this.titleCase(
        this.title($('h3.post-title, h1.post-title').first().text()),
      ) ||
      this.title($('title').text()) ||
      'Untitled';
    const genres = labels.genero || labels.generos;

    return {
      path: novelPath,
      name,
      cover: this.cover(body.find('img[src]').first().attr('src')),
      author: labels.autor,
      genres: genres || undefined,
      status: this.status(labels.estado),
      summary: summary || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(await (await this.request(chapterPath)).text());
    const body = $('.post-body').first();
    body
      .find('script, style, noscript, iframe, ins, form, .adsbygoogle')
      .remove();
    // Drop the "Anterior - Índice - Siguiente" line and the author's sharing and
    // donation lines. Only short blocks are touched so that a wrapper around
    // the story text is never removed.
    body.find('div, p, span').each((_, el) => {
      const text = this.clean($(el).text());
      if (
        text.length < 250 &&
        (NAVIGATION.test(text) || PROMOTION.test(text))
      ) {
        $(el).remove();
      }
    });
    // Trim the empty and separator-only blocks left at the end, innermost first.
    for (let guard = 0; guard < 100; guard++) {
      const last = body
        .find('*')
        .filter(
          (_, el) =>
            !$(el).children().length && !$(el).is('img, br, hr, figure'),
        )
        .last();
      if (!last.length || !TRAILING.test(this.clean(last.text()))) break;
      last.remove();
    }

    // The text is spaced with runs of empty blocks: keep a single one.
    const chapter = (body.html()?.trim() || '').replace(
      BLANK_BLOCKS,
      '<div><br></div>',
    );
    if (this.clean(loadCheerio(chapter).text()).length < 100) {
      throw new Error('Novelas Topcur: no readable chapter text found.');
    }
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The blog's own search only finds individual chapter posts, so series are
    // matched against the catalogue's titles instead (a single page).
    const tokens = this.normalize(searchTerm).split(/\s+/).filter(Boolean);
    if (!tokens.length || pageNo > 1) return [];
    const novels = await this.catalogue();
    return novels.filter(novel => {
      const name = this.normalize(novel.name);
      return tokens.every(token => name.includes(token));
    });
  }

  resolveUrl = (path: string) => new URL(path, this.site).href;
}

export default new NovelasTopcur();
