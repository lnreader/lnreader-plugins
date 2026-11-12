import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

type NovelCard = {
  name: string;
  path: string;
  cover?: string;
};

type ChapterEntry = {
  slug: string;
  title: string;
  number: number;
  createdAt?: string;
};

type NovelDetails = {
  name: string;
  cover: string;
  summary: string;
  author: string;
  genres: string[];
  /** Raw schema.org creativeWorkStatus, e.g. "Completed" / "Incomplete". */
  statusRaw: string;
};

type LdBook = {
  name?: string;
  description?: string;
  image?: string;
  genre?: string[];
  author?: { name?: string }[];
  creativeWorkStatus?: string;
};

/**
 * Upper bound on a page this plugin will parse. Site pages are orders
 * of magnitude smaller; anything bigger is a broken or hostile
 * response, and regex-scanning it would bill the reader's phone, not
 * the site. Enforced before any parsing happens.
 */
const MAX_PAGE_CHARS = 10000000;

/**
 * Error with the HTTP status attached. Tooling (e.g. the repo's live
 * check) reads `error.status` to tell a site block or outage (403/503)
 * apart from a plugin bug, so always throw fetch failures this way.
 */
function httpError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

async function fetchPage(url: string, what: string): Promise<string> {
  const res = await fetchApi(url);
  if (!res.ok) {
    throw httpError(`${what}: HTTP ${res.status}`, res.status);
  }
  return res.text();
}

const HTML_ENTITY_CHARS: Record<string, string> = {
  amp: '&',
  quot: '"',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/** Encode one Unicode code point without String.fromCodePoint. */
function codePointToString(cp: number): string {
  if (cp < 0x10000) return String.fromCharCode(cp);
  const v = cp - 0x10000;
  return String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
}

function decodeHtmlEntities(s: string): string {
  // Named entities first (single pass so "&amp;lt;" stays literal),
  // then numeric entities (&#8217; / &#x2019;).
  return s
    .replace(
      /&(amp|quot|#39|apos|lt|gt|nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo);/g,
      (m, e: string) => HTML_ENTITY_CHARS[e] ?? m,
    )
    .replace(/&#(\d+);/g, (m, d: string) => {
      const cp = parseInt(d, 10);
      return cp > 0 && cp <= 0x10ffff ? codePointToString(cp) : m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h: string) => {
      const cp = parseInt(h, 16);
      return cp > 0 && cp <= 0x10ffff ? codePointToString(cp) : m;
    });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function cleanText(s: string): string {
  return decodeHtmlEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

function checkSize(html: string): void {
  if (html.length > MAX_PAGE_CHARS) throw new Error('Page too large to parse');
}

/**
 * Catalog / search cards: <a class="ln-ncard" href="/novel/<slug>">
 * wrapping a cover <img> and an <h3> title.
 */
function parseCatalogCards(html: string): NovelCard[] {
  checkSize(html);
  const cards: NovelCard[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/\bln-ncard\b/.test(attrs)) continue;
    const href = /\bhref="([^"]+)"/.exec(attrs);
    if (!href || !href[1].startsWith('/novel/')) continue;
    const path = href[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const body = m[2];
    let name = '';
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(body);
    if (h3) name = cleanText(h3[1]);
    let cover: string | undefined;
    const img = /<img\b([^>]*)>/.exec(body);
    if (img) {
      const src = /\bsrc="([^"]+)"/.exec(img[1]);
      if (src) cover = src[1];
      if (!name) {
        const alt = /\balt="([^"]*)"/.exec(img[1]);
        if (alt) name = cleanText(alt[1]);
      }
    }
    if (!name) continue;
    cards.push({ name, path, cover });
  }
  return cards;
}

function findLdBook(html: string): LdBook | null {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>;
      const graph: unknown[] = Array.isArray(data['@graph'])
        ? (data['@graph'] as unknown[])
        : [data];
      for (const node of graph) {
        const n = node as { '@type'?: string };
        if (n && n['@type'] === 'Book') return n as LdBook;
      }
    } catch (e) {
      // Not valid JSON — keep looking at the next block.
    }
  }
  return null;
}

/** Novel details from the novel page (JSON-LD, with DOM fallbacks). */
function parseNovelDetails(html: string): NovelDetails {
  checkSize(html);
  const book = findLdBook(html);
  let name = book && book.name ? cleanText(book.name) : '';
  if (!name) {
    const h1 =
      /<h1\b[^>]*class="[^"]*ln-dtitle[^"]*"[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    if (h1) name = cleanText(h1[1]);
  }
  let cover = book && book.image ? book.image : '';
  if (!cover) {
    const dc =
      /<div\b[^>]*class="[^"]*ln-dcv[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html);
    if (dc) {
      const img = /\bsrc="([^"]+)"/.exec(dc[1]);
      if (img) cover = img[1];
    }
  }
  const authorNames: string[] = [];
  if (book && Array.isArray(book.author)) {
    for (const a of book.author) {
      if (a && a.name) authorNames.push(cleanText(a.name));
    }
  }
  return {
    name,
    cover,
    summary: book && book.description ? cleanText(book.description) : '',
    author: authorNames.join(', '),
    genres:
      book && Array.isArray(book.genre)
        ? book.genre.map(g => cleanText(String(g))).filter(g => g.length > 0)
        : [],
    statusRaw: book && book.creativeWorkStatus ? book.creativeWorkStatus : '',
  };
}

/**
 * Chapter list from GET /api/novel-chapters?slug=<slug>.
 * The novel page itself only embeds the first few and latest few
 * chapters, so the full list has to come from this endpoint — the
 * same one the site's "Show all chapters" button uses.
 * Entries are sorted ascending by chapter number; the chapter's site
 * path is /novel/<novel slug>/<entry slug>.
 */
function parseChapterList(text: string): ChapterEntry[] {
  checkSize(text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Chapter list response was not valid JSON');
  }
  const raw: unknown[] = Array.isArray(data)
    ? data
    : (() => {
        if (data === null || typeof data !== 'object') {
          throw new Error('Chapter list response had an unexpected shape');
        }
        const chapters = (data as { chapters?: unknown }).chapters;
        if (!Array.isArray(chapters)) {
          // An error payload or a changed shape must surface as a
          // clear error — never as a novel that silently shows zero
          // chapters. A genuine empty array stays valid.
          throw new Error('Chapter list response had an unexpected shape');
        }
        return chapters;
      })();
  const entries: ChapterEntry[] = [];
  for (const item of raw) {
    const it = item as {
      slug?: string;
      title?: string;
      number?: number;
      createdAt?: string;
    };
    if (!it || typeof it.slug !== 'string' || !it.slug) continue;
    const number =
      typeof it.number === 'number'
        ? it.number
        : parseInt(String(it.slug).replace(/\D+/g, ''), 10) ||
          entries.length + 1;
    entries.push({
      slug: it.slug,
      title: it.title ? cleanText(it.title) : 'Chapter ' + number,
      number,
      createdAt: it.createdAt,
    });
  }
  entries.sort((a, b) => a.number - b.number);
  return entries;
}

/**
 * Chapter body: the inner HTML of <div class="ln-prose">. Scripts,
 * styles and comments are removed before locating the div, so a
 * `.ln-prose` CSS rule, a JS reference to the class, or a comment
 * earlier in the page can never mislocate the content; the div is
 * then matched to its closing tag by depth scan so nested markup
 * can never truncate the content.
 */
/**
 * Strip executable content from chapter HTML. Chapter bodies are
 * untrusted markup: scripts, frames, form elements, inline event
 * handlers and javascript:/vbscript: URLs must not reach the reader.
 * URL schemes are tested after stripping control characters and
 * lowercasing, so java<TAB>script: and mixed-case smuggling can't pass.
 */
/**
 * Strip executable content from chapter HTML before it reaches the
 * reader: scripts, frames, form elements, inline event handlers and
 * javascript:/vbscript:/data:text/html URLs. URL values are checked
 * regardless of quoting (double, single, or unquoted) and AFTER
 * decoding HTML entities, so 'javascript:...' and '&#106;avascript:...'
 * are caught equally; schemes are then tested after stripping control
 * characters and lowercasing, so mixed-case and control-character
 * smuggling fail too.
 */
/**
 * Strip executable content from chapter HTML before it reaches the
 * reader. Attribute cleaning runs TAG BY TAG (not over the whole
 * string), so story text is never touched: `<p>Set online=true</p>`
 * keeps its words, while a real `on*` attribute inside a tag dies.
 * Attribute separators are whitespace OR slash, so
 * `<img src="x"/onerror=...>` is caught too. URL values are checked
 * regardless of quoting (double, single, or unquoted) and AFTER
 * decoding HTML entities, so `javascript&colon;...`, `&#106;...`,
 * semicolon-less numerics, and mixed-case / control-character
 * smuggling are all caught; story markup (paragraphs, images, links,
 * tables) is kept.
 */
function sanitizeChapterHtml(html: string): string {
  const noExecutable = html
    .replace(
      /<(script|style|noscript|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi,
      '',
    )
    .replace(
      /<(script|style|noscript|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi,
      '',
    );
  return noExecutable.replace(/<[^>]*>/g, function (tag: string) {
    return tag
      .replace(/[\s/](on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/[\s/]style\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
      .replace(
        /[\s/](?:href|src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
        function (m: string) {
          return isSafeUrlValue(m) ? m : '';
        },
      );
  });
}

// Decode HTML character references the way a browser decodes an
// attribute value, then test the scheme. Numeric references (decimal
// and hex, either x case, with or without the semicolon) plus the
// scheme-relevant named references (`&colon;`, `&Tab;`, `&NewLine;`,
// `&sol;`) and the legacy semicolon-less named references; repeated so
// double-encoding can't smuggle a scheme past the check. Decoding only
// ever makes the check stricter, never looser.
function decodeEntities(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&#(\d+);?/g, function (_m: string, code: string) {
        const n = parseInt(code, 10);
        return !isNaN(n) && n >= 0 && n <= 0x10ffff
          ? String.fromCharCode(n)
          : _m;
      })
      .replace(/&#[xX]([0-9a-fA-F]+);?/g, function (_m: string, code: string) {
        const n = parseInt(code, 16);
        return !isNaN(n) && n >= 0 && n <= 0x10ffff
          ? String.fromCharCode(n)
          : _m;
      })
      .replace(/&colon;/g, ':')
      .replace(/&Tab;/g, '\t')
      .replace(/&NewLine;/g, '\n')
      .replace(/&sol;/g, '/')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp(?![a-zA-Z0-9=])/g, '&')
      .replace(/&lt(?![a-zA-Z0-9=])/g, '<')
      .replace(/&gt(?![a-zA-Z0-9=])/g, '>')
      .replace(/&quot(?![a-zA-Z0-9=])/g, '"');
    if (next === out) break;
    out = next;
  }
  return out;
}

// Read the attribute value from immediately after `=`: a quoted value
// is everything up to its matching quote, an unquoted value runs to the
// next whitespace or `>`. Never search for quotes anywhere in the
// match — for `href=javascript:alert('x')` the value is the whole
// `javascript:alert('x')`, not `'x'`.
function attrValue(attr: string): string {
  const eq = attr.indexOf('=');
  if (eq < 0) return '';
  const rest = attr.slice(eq + 1).replace(/^\s+/, '');
  if (rest.charAt(0) === '"') {
    const end = rest.indexOf('"', 1);
    return end < 0 ? rest.slice(1) : rest.slice(1, end);
  }
  if (rest.charAt(0) === "'") {
    const end = rest.indexOf("'", 1);
    return end < 0 ? rest.slice(1) : rest.slice(1, end);
  }
  const m = /^[^\s>]+/.exec(rest);
  return m ? m[0] : '';
}

function isSafeUrlValue(attr: string): boolean {
  const clean = decodeEntities(attrValue(attr))
    .split('')
    .filter(function (ch: string) {
      const code = ch.charCodeAt(0);
      return code > 32 && code !== 127;
    })
    .join('')
    .toLowerCase();
  if (/^(javascript|vbscript)\s*:/.test(clean)) return false;
  if (/^data\s*:\s*text\/html/.test(clean)) return false;
  return true;
}

function parseChapterContent(html: string): string {
  checkSize(html);
  const clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // Find the real opening tag whose class list contains ln-prose —
  // never a bare indexOf('ln-prose'), which can land inside a style
  // rule, a script, or a comment and grab the wrong div (or none).
  const openRe = /<div\b[^>]*>/g;
  let m: RegExpExecArray | null;
  let tagEnd = -1;
  while ((m = openRe.exec(clean)) !== null) {
    const cls = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(m[0]);
    const tokens = (cls && (cls[1] !== undefined ? cls[1] : cls[2])) || '';
    if (/(^|\s)ln-prose(\s|$)/.test(tokens)) {
      tagEnd = m.index + m[0].length;
      break;
    }
  }
  if (tagEnd < 0) return '';
  let depth = 1;
  const contentStart = tagEnd;
  const divRe = /<\/?div\b[^>]*>/g;
  divRe.lastIndex = contentStart;
  let contentEnd = -1;
  while ((m = divRe.exec(clean)) !== null) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0) {
        contentEnd = m.index;
        break;
      }
    } else if (!m[0].endsWith('/>')) {
      depth++;
    }
  }
  if (contentEnd < 0) return '';
  return sanitizeChapterHtml(clean.slice(contentStart, contentEnd).trim());
}

class LightNovelTo implements Plugin.PluginBase {
  id = 'lightnovelto';
  name = 'LightNovel.to';
  icon = 'src/en/lightnovelto/icon.png';
  site = 'https://lightnovel.to';
  version = '1.0.1';

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const sort = options && options.showLatestNovels ? 'latest' : 'popular';
    const html = await fetchPage(
      `${this.site}/novels?sort=${sort}&page=${pageNo}`,
      'Failed to load popular novels',
    );
    return parseCatalogCards(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/novel\//, '').replace(/\/+$/, '');
    const html = await fetchPage(
      this.site + novelPath,
      'Failed to load novel page',
    );
    const details = parseNovelDetails(html);
    if (!details.name) {
      throw new Error('Could not parse the novel page for ' + novelPath);
    }
    const listText = await fetchPage(
      `${this.site}/api/novel-chapters?slug=${encodeURIComponent(slug)}`,
      'Failed to load chapter list',
    );
    const entries = parseChapterList(listText);
    const chapters: Plugin.ChapterItem[] = entries.map(e => ({
      name: e.title,
      path: `/novel/${slug}/${e.slug}`,
      releaseTime: e.createdAt,
      chapterNumber: e.number,
    }));
    // schema.org creativeWorkStatus: "Completed" | "Incomplete" (ongoing).
    const status =
      details.statusRaw === 'Completed'
        ? NovelStatus.Completed
        : details.statusRaw === 'Incomplete'
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown;
    return {
      path: novelPath,
      name: details.name,
      cover: details.cover || undefined,
      summary: details.summary || undefined,
      author: details.author || undefined,
      genres: details.genres.length ? details.genres.join(', ') : undefined,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchPage(
      this.site + chapterPath,
      'Failed to load chapter',
    );
    const content = parseChapterContent(html);
    if (!content) {
      throw new Error('Chapter content not found on the page');
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const html = await fetchPage(
      `${this.site}/novels?search=${encodeURIComponent(searchTerm)}&page=${pageNo}`,
      'Failed to search novels',
    );
    return parseCatalogCards(html);
  }

  resolveUrl(path: string): string {
    // Absolute URLs (e.g. the cover image, which EPUB export passes
    // through here) must go out unchanged; protocol-relative URLs
    // upgrade to https.
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return this.site + path;
  }
}

export default new LightNovelTo();
