import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

const API = 'https://api.wetriedtls.com';

/**
 * Build the catalog browse URL for a page. The API honors the `status`
 * query param (Ongoing / Completed / Dropped / Canceled) but ignores
 * `tags` and `sort` params, so status is the only exposed filter.
 * 'all' (or empty) means no status filtering.
 */
function catalogUrl(pageNo: number, status?: string): string {
  let url = API + '/query?adult=true&query_string=&page=' + pageNo;
  const s = (status || '').trim();
  if (s && s !== 'all') url += '&status=' + encodeURIComponent(s);
  return url;
}
const SITE = 'https://wetriedtls.com';

type NovelCard = {
  slug: string;
  title: string;
  cover: string;
};

type NovelDetails = {
  id: number;
  name: string;
  author: string;
  genres: string[];
  status: string;
  cover: string;
  summary: string;
};

type ChapterInfo = {
  slug: string;
  name: string;
  number: number;
  publishedAt: string;
  /** True for chapters behind the site's paywall (from the /paid endpoint). */
  locked: boolean;
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Decode a handful of HTML entities; the site uses a small set. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/** Strip tags, collapse whitespace. */
function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\xa0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Next.js app-router pages embed their data in
 *   self.__next_f.push([1,"<escaped payload>"])</script>
 * scripts. Decode every payload into one searchable text blob.
 * The closing tag match tolerates an optional semicolon / whitespace
 * (some Next.js versions emit `);</script>`), so chunks are never
 * silently skipped due to formatting.
 */
function extractFlightText(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)\s*;?\s*<\/script>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch {
      /* skip malformed chunk */
    }
  }
  return out;
}

/**
 * Slice a JS string by UTF-8 byte offsets (the flight protocol's `T<hex>`
 * length prefix counts UTF-8 bytes of the row payload, not UTF-16 chars).
 */
function sliceUtf8Bytes(s: string, start: number, byteLen: number): string {
  let bytes = 0;
  let i = start;
  while (i < s.length && bytes < byteLen) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 2;
        bytes += 4;
        continue;
      }
    }
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    i++;
  }
  return s.slice(start, i);
}

/** Inner text of one <p>...</p> block, tags stripped. */
function paragraphText(p: string): string {
  return decodeEntities(p.replace(/<[^>]+>/g, '')).trim();
}

function isTitleRepeat(p: string, knownTitles?: string[]): boolean {
  // A paragraph that is nothing but bold text is the site's repeated
  // series / chapter title header — but only when it actually matches a
  // title the caller knows. A genuine bold-only content line (a scene
  // label, a POV header) must never be stripped, so without a matching
  // known title nothing is treated as a repeat.
  const inner = p
    .replace(/^<p[^>]*>/i, '')
    .replace(/<\/p>$/i, '')
    .trim();
  if (!/^<strong>[\s\S]*<\/strong>$/.test(inner)) return false;
  if (!knownTitles || knownTitles.length === 0) return false;
  const text = decodeEntities(inner.replace(/<[^>]+>/g, ''))
    .trim()
    .toLowerCase();
  return knownTitles.some(t => t.trim().toLowerCase() === text);
}

/**
 * Translation credits ("Translator: X", "Editor: Y") are site chrome, not
 * story content — the site puts them in the chapter header next to the
 * banner. Stripped with the rest of the header so the reader starts at
 * the story. Narrow on purpose: a genuine bold content line never looks
 * like this.
 */
function isCreditLine(p: string): boolean {
  const t = paragraphText(p);
  return /^(translator|editor|proofreader|typesetter)\s*:/i.test(t);
}

function isPromoParagraph(p: string): boolean {
  // A block that carries an illustration is content, never promo — even
  // when it has no text of its own (e.g. <p><div><img></div></p>).
  if (/<img[\s>]/i.test(p)) return false;
  const t = paragraphText(p).toLowerCase();
  if (!t || t === '= = =') return true;
  if (t.indexOf('we tried translations') !== -1) return true;
  if (t.indexOf('dsc.gg') !== -1 || t.indexOf('join our discord') !== -1)
    return true;
  return false;
}

/**
 * Decode the HTML entities that can appear inside an attribute value —
 * decimal (&#106;), hex (&#x6A;), and the named entities used to smuggle a
 * scheme past a naive prefix check (&colon;) — so the scheme test below
 * sees what the browser will actually navigate to.
 */
function decodeAttrEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&#(\d+);?/g, (_m, n: string) =>
      String.fromCharCode(parseInt(n, 10)),
    )
    .replace(/&colon;?/gi, ':')
    .replace(/&semi;?/gi, ';')
    .replace(/&amp;?/gi, '&')
    .replace(/&lt;?/gi, '<')
    .replace(/&gt;?/gi, '>')
    .replace(/&quot;?/gi, '"')
    .replace(/&#0?39;?/g, "'");
}

/**
 * True for URLs that would execute script when followed from the reader.
 * The value is entity-decoded and stripped of whitespace/control
 * characters first, so &#106;avascript:, javascript&colon;, and
 * java<TAB>script:-style smuggling are all caught.
 */
function isScriptUrl(url: string): boolean {
  const norm = decodeAttrEntities(url).replace(
    /[\s\u0000-\u001f\u007f]+/g,
    '',
  );
  return /^(javascript|vbscript):/i.test(norm);
}

/**
 * Strip anything that could execute code from chapter HTML before it
 * reaches the reader, which renders the HTML unsanitized: dangerous
 * elements (script/iframe/object/...), event handler attributes
 * (e.g. <img onerror=...>), and javascript: URLs. Everything else —
 * paragraphs, headings, figures, images, inline formatting — is
 * preserved as-is.
 */
function sanitizeHtml(html: string): string {
  let out = html;
  // Remove dangerous elements entirely, content included.
  out = out.replace(
    /<(script|iframe|object|embed|form|input|textarea|select|button|style|link|meta|base|noscript)[\s>][\s\S]*?<\/\1\s*>/gi,
    '',
  );
  out = out.replace(
    /<\/?(script|iframe|object|embed|form|input|textarea|select|button|style|link|meta|base|noscript)[^>]*>/gi,
    '',
  );
  // Strip event handler attributes (onclick, onerror, ...).
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, '');
  // Neutralize script URLs (href/src/action). The value is entity-decoded
  // before the scheme check so encoded variants can't slip through.
  out = out.replace(
    /\s(href|src|action)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi,
    (_m, _attr, val: string) => {
      const unquoted = val.replace(/^['"]|['"]$/g, '');
      return isScriptUrl(unquoted) ? '' : _m;
    },
  );
  return out;
}

/** Parse the /query API response (catalog + search share the shape). */
function parseQueryResults(jsonText: string): {
  items: NovelCard[];
  lastPage: number;
} {
  const root = safeJson(jsonText);
  const items: NovelCard[] = [];
  let lastPage = 1;
  if (isRecord(root)) {
    const meta = root.meta;
    if (isRecord(meta) && typeof meta.last_page === 'number')
      lastPage = meta.last_page;
    const data = Array.isArray(root.data) ? root.data : [];
    for (const it of data) {
      if (!isRecord(it)) continue;
      if (it.series_type && it.series_type !== 'Novel') continue;
      const slug = str(it.series_slug).trim();
      const title = str(it.title).trim();
      if (!slug || !title) continue;
      items.push({
        slug,
        title: decodeEntities(title),
        cover: str(it.thumbnail),
      });
    }
  }
  return { items, lastPage };
}

/** Parse the /series/{slug} API response. */
function parseSeriesDetail(jsonText: string): NovelDetails | null {
  const s = safeJson(jsonText);
  if (!isRecord(s) || typeof s.id !== 'number') return null;
  const tags = Array.isArray(s.tags) ? s.tags : [];
  return {
    id: s.id,
    name: decodeEntities(str(s.title)),
    author: decodeEntities(str(s.author)),
    genres: tags
      .map(t => (isRecord(t) ? decodeEntities(str(t.name)) : ''))
      .filter(g => g.length > 0),
    status: str(s.status),
    cover: str(s.thumbnail),
    summary: stripHtml(str(s.description)),
  };
}

/**
 * Parse one page of the /chapters/{seriesId} API response.
 * Pass locked=true for pages from the /paid endpoint.
 */
function parseChapterList(
  jsonText: string,
  locked = false,
): { items: ChapterInfo[]; lastPage: number } {
  // A blank response means the request itself failed — it must never be
  // treated as a valid (empty) page, or callers would mistake a failed
  // fetch for the end of the list and return an incomplete chapter list
  // as though it were complete. Throw so the failure is loud, not silent.
  if (!jsonText || !jsonText.trim()) {
    throw new Error('Empty response while fetching the chapter list');
  }
  const root = safeJson(jsonText);
  // A non-blank but unusable response (an error page, a proxy block page,
  // truncated JSON) must fail loudly too: silently returning an empty page
  // here would make parseNovel stop fetching and present an incomplete
  // chapter list as though it were complete.
  if (!isRecord(root) || !Array.isArray(root.data)) {
    throw new Error('Invalid chapter-list response (not the expected JSON)');
  }
  const items: ChapterInfo[] = [];
  let lastPage = 1;
  const meta = root.meta;
  if (isRecord(meta) && typeof meta.last_page === 'number')
    lastPage = meta.last_page;
  for (const c of root.data) {
    if (!isRecord(c)) continue;
    const slug = str(c.chapter_slug).trim();
    const name = str(c.chapter_name).trim();
    if (!slug || !name) continue;
    const title = str(c.chapter_title).trim();
    const idx = parseFloat(str(c.index));
    items.push({
      slug,
      name: title ? name + ': ' + decodeEntities(title) : name,
      number: isNaN(idx) ? 0 : idx,
      publishedAt: str(c.created_at),
      locked,
    });
  }
  return { items, lastPage };
}

/**
 * The display name for a chapter in the app. Locked (paywalled) chapters
 * get a lock prefix so readers can see which ones are premium before
 * tapping them. LNReader sorts by chapterNumber, so the prefix never
 * affects chapter order.
 */
function chapterDisplayName(c: ChapterInfo): string {
  return c.locked ? '🔒 ' + c.name : c.name;
}

function proxiedImageUrl(url: string, width: number): string {
  const bare = url.replace(/^https?:\/\//i, '');
  return (
    'https://images.weserv.nl/?url=' +
    encodeURIComponent(bare) +
    '&w=' +
    width +
    '&q=80&output=webp'
  );
}

function shrinkIllustrations(html: string): string {
  return html.replace(
    /<img\b([^>]*?)\bsrc="(https?:\/\/media\.reaperscans\.net\/[^"]+)"([^>]*?)>/gi,
    (_m, pre, src, post) =>
      '<img' + pre + ' src="' + proxiedImageUrl(src, 800) + '"' + post + '>',
  );
}

/**
 * Covers are served directly from the site's CDN. An earlier version
 * routed them through the images.weserv.nl proxy for smaller list
 * thumbnails, but a single URL field cannot carry a fallback: if the
 * proxy is blocked or down, every cover breaks while the site's own CDN
 * still works. The direct URL avoids that external dependency.
 * Non-URL values pass through.
 */
function coverUrl(thumbnail: string): string {
  const t = (thumbnail || '').trim();
  if (!/^https?:\/\//i.test(t)) return t;
  return t;
}

type ChapterContentResult =
  | { status: 'ok'; html: string }
  | { status: 'premium' | 'notfound' | 'empty' };

/**
 * Extract the chapter body from a chapter page's HTML.
 *
 * The page is a Next.js app-router page: the chapter record carries
 * `"chapter_content":"$<rowId>"` and the body HTML lives in the flight
 * row `<rowId>:T<hex>,` that follows, where <hex> is the exact UTF-8 byte
 * length of the payload. Slicing by that byte count is required — a
 * "next row" lookahead overshoots into flight metadata and corrupts the
 * HTML.
 *
 * `knownTitles` (the novel title and this chapter's display name) lets the
 * parser tell the site's repeated title header apart from a genuine
 * bold-only content line, which must be kept. Returns the cleaned HTML,
 * or a non-ok status for locked / missing / unparseable chapters.
 */
function parseChapterContent(
  html: string,
  knownTitles?: string[],
): ChapterContentResult {
  if (/this chapter is premium!/i.test(html)) return { status: 'premium' };
  // Only the real <title> element counts for the 404 check: Next.js flight
  // data always embeds a notFound template containing similar wording.
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title && /^\s*404/i.test(title[1])) return { status: 'notfound' };

  const flight = extractFlightText(html);
  // chapter_content is either a flight-row reference ("$<rowId>") or the
  // chapter HTML inline (gallery/illustration chapters). The value is a
  // JSON string, so internal quotes arrive escaped.
  const contentM = /"chapter_content":"((?:[^"\\]|\\.)*)"/.exec(flight);
  if (!contentM) return { status: 'empty' };
  let raw: string;
  try {
    raw = JSON.parse('"' + contentM[1] + '"');
  } catch {
    return { status: 'empty' };
  }

  let payload: string;
  const rowRef = /^\$([0-9a-z]{1,4})$/.exec(raw);
  if (rowRef) {
    // The row looks like `<rowId>:T<hex>,<payload>` where <hex> is the exact
    // UTF-8 byte length of the payload. Respecting it is the only reliable
    // end boundary: flight metadata follows the payload on the same line,
    // so a "next row" lookahead overshoots.
    const rowRe = new RegExp(
      '\\n' +
        rowRef[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        ':T([0-9a-f]+),',
    );
    const row = rowRe.exec(flight);
    if (!row) return { status: 'empty' };
    const byteLen = parseInt(row[1], 16);
    if (!(byteLen > 0)) return { status: 'empty' };
    const payloadStart = row.index + row[0].length;
    payload = sliceUtf8Bytes(flight, payloadStart, byteLen);
  } else if (/^\s*</.test(raw)) {
    payload = raw;
  } else {
    return { status: 'empty' };
  }
  if (!payload) return { status: 'empty' };

  // Paragraph breaks inside the payload are literal \r\n / \n sequences.
  const body = payload
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .trim();
  if (!body) return { status: 'empty' };

  // Split into top-level blocks in document order. Paragraphs, headings,
  // figures and standalone images are recognized; anything else that
  // carries text (lists, tables, blockquotes, divs) is kept too — dropping
  // it would silently lose chapter content. Only the site's promo header /
  // footer (banner, credits, title repeats, discord plug) is trimmed from
  // the edges.
  const blocks: string[] = [];
  const blockRe =
    /<p[\s\S]*?<\/p>|<h[1-6][\s\S]*?<\/h[1-6]>|<figure[\s\S]*?<\/figure>|<img[^>]*>/gi;
  let last = 0;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(body)) !== null) {
    const gap = body.slice(last, bm.index);
    if (gap.replace(/<[^>]+>/g, '').trim()) blocks.push(gap.trim());
    blocks.push(bm[0]);
    last = bm.index + bm[0].length;
  }
  const tail = body.slice(last);
  if (tail.replace(/<[^>]+>/g, '').trim()) blocks.push(tail.trim());
  if (blocks.length === 0) blocks.push(body);

  let start = 0;
  let end = blocks.length;
  const isEdgeJunk = (p: string) =>
    isPromoParagraph(p) || isCreditLine(p) || isTitleRepeat(p, knownTitles);
  while (start < end && isEdgeJunk(blocks[start])) start++;
  while (end > start && isEdgeJunk(blocks[end - 1])) end--;
  const cleaned = blocks.slice(start, end).join('\n');
  // An image-only chapter (illustrations with no text) is still real
  // content — it must not be reported as empty.
  if (!paragraphText(cleaned) && !/<img[\s>]/i.test(cleaned))
    return { status: 'empty' };
  // The reader renders this HTML unsanitized, so strip anything that
  // could run code (event handlers, scripts, javascript: URLs) first.
  return { status: 'ok', html: sanitizeHtml(shrinkIllustrations(cleaned)) };
}

function mapStatus(s: string): string {
  if (s === 'Ongoing') return NovelStatus.Ongoing;
  if (s === 'Completed') return NovelStatus.Completed;
  if (s === 'Hiatus' || s === 'On Hiatus') return NovelStatus.OnHiatus;
  if (s === 'Cancelled' || s === 'Dropped') return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}

// --- Catalog filters ----------------------------------------------------
// The API honors `status` but ignores `tags` and `sort`, so the filter
// menu offers status only.
const STATUS_FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Ongoing', value: 'Ongoing' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Dropped', value: 'Dropped' },
  { label: 'Canceled', value: 'Canceled' },
] as const;

/**
 * Pull a plain string value out of the app's filter payload, which may be
 * the raw string or a { type, value } wrapper object.
 */
function extractFilterValue(filters: unknown, key: string): string {
  if (!filters || typeof filters !== 'object') return '';
  const f = (filters as Record<string, unknown>)[key];
  if (f === null || f === undefined) return '';
  const v =
    typeof f === 'object' && 'value' in f ? (f as { value: unknown }).value : f;
  return typeof v === 'string' ? v : '';
}

class WeTriedTLS implements Plugin.PluginBase {
  id = 'wetriedtls';
  name = 'We Tried TLS';
  icon = 'src/en/wetriedtls/icon.png';
  site = SITE;
  version = '1.0.6';

  // Novel/chapter titles behind each chapter path, recorded by parseNovel.
  // parseChapter passes them to parseChapterContent so the site's repeated
  // title header can be told apart from a genuine bold-only content line
  // (which must be kept).
  private chapterTitles: Record<string, string[]> = {};

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: 'all',
      options: STATUS_FILTER_OPTIONS,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const status = extractFilterValue(filters, 'status');
    const page = parseQueryResults(await fetchText(catalogUrl(pageNo, status)));
    if (pageNo > page.lastPage) return [];
    return page.items.map(n => ({
      name: n.title,
      path: n.slug,
      cover: coverUrl(n.cover),
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').filter(Boolean).pop() || '';
    const detail = parseSeriesDetail(await fetchText(API + '/series/' + slug));
    if (!detail) throw new Error('Could not load novel details');

    // The chapter list is paginated (500 per page keeps it to ~2
    // requests even for the longest series). Free chapters come from
    // /chapters/{id} and paywalled chapters from /chapters/{id}/paid;
    // the two are merged so locked chapters show up with a lock prefix.
    // Opening a locked chapter shows a notice: it needs a paid
    // subscription on the website and cannot be read here.
    const all: ChapterInfo[] = [];
    let pageNo = 1;
    let lastPage = 1;
    do {
      const json = await fetchText(
        API +
          '/chapters/' +
          detail.id +
          '?page=' +
          pageNo +
          '&perPage=500&order=asc',
      );
      // The official fetchText returns '' when the request fails. That must
      // never be treated as a valid page: parseChapterList would default
      // lastPage to 1 and parseNovel would return an incomplete chapter
      // list as though it were complete. Fail loudly instead.
      if (!json || !json.trim())
        throw new Error('Failed to load the chapter list (page ' + pageNo + ')');
      const page = parseChapterList(json);
      lastPage = page.lastPage;
      for (const c of page.items) all.push(c);
      pageNo++;
    } while (pageNo <= lastPage);

    // Paid chapters are a bonus, not a requirement: if this endpoint
    // ever fails, the novel still loads with its free chapters.
    try {
      let paidPageNo = 1;
      let paidLastPage = 1;
      do {
        const page = parseChapterList(
          await fetchText(
            API +
              '/chapters/' +
              detail.id +
              '/paid?query=&page=' +
              paidPageNo +
              '&perPage=1000&order=asc',
          ),
          true,
        );
        paidLastPage = page.lastPage;
        for (const c of page.items) all.push(c);
        paidPageNo++;
      } while (paidPageNo <= paidLastPage);
    } catch {
      // ignore: free chapters are already collected above
    }

    const seen: Record<string, boolean> = {};
    const chapters: Plugin.ChapterItem[] = [];
    all
      .filter(c => {
        if (!c.slug || seen[c.slug]) return false;
        seen[c.slug] = true;
        return true;
      })
      .sort((a, b) => a.number - b.number)
      .forEach(c => {
        const displayName = chapterDisplayName(c);
        const chapterPath = slug + '/' + c.slug;
        chapters.push({
          name: displayName,
          path: chapterPath,
          releaseTime: c.publishedAt,
          chapterNumber: c.number,
        });
        this.chapterTitles[chapterPath] = [
          detail.name,
          displayName.replace(/^🔒\s*/, ''),
        ];
      });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.name,
      status: mapStatus(detail.status),
    };
    if (detail.cover) novel.cover = coverUrl(detail.cover);
    if (detail.author) novel.author = detail.author;
    if (detail.genres.length) novel.genres = detail.genres.join(', ');
    if (detail.summary) novel.summary = detail.summary;
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = parseChapterContent(
      await fetchText(SITE + '/series/' + chapterPath),
      this.chapterTitles[chapterPath],
    );
    if (result.status === 'ok') return result.html;
    if (result.status === 'premium') {
      return (
        '<p><strong>This chapter is premium on We Tried TLS.</strong></p>' +
        '<p>It requires a paid subscription on the website and cannot be read here. ' +
        'Free chapters of this novel still work.</p>'
      );
    }
    if (result.status === 'notfound') {
      return (
        '<p><strong>This chapter is no longer available on We Tried TLS.</strong></p>' +
        '<p>It may have been removed or moved. Refresh the novel to update the chapter list.</p>'
      );
    }
    return (
      '<p><strong>Could not load this chapter.</strong></p>' +
      '<p>It may be temporarily unavailable on We Tried TLS.</p>'
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const page = parseQueryResults(
      await fetchText(
        API +
          '/query?adult=true&query_string=' +
          encodeURIComponent(searchTerm) +
          '&page=' +
          pageNo,
      ),
    );
    if (pageNo > page.lastPage) return [];
    return page.items.map(n => ({
      name: n.title,
      path: n.slug,
      cover: coverUrl(n.cover),
    }));
  }

  resolveUrl = (path: string, _isNovel?: boolean): string =>
    SITE + '/series/' + path;
}

export default new WeTriedTLS();
