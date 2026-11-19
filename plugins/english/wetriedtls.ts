import { fetchText } from "@libs/fetch";
import { Plugin } from "@/types/plugin";
import { NovelStatus } from "@libs/novelStatus";
import { Filters, FilterTypes } from "@libs/filterInputs";

const API = "https://api.wetriedtls.com";

/** Cap for the chapterTitles cache (see the field's comment). */
const MAX_TITLE_CACHE_ENTRIES = 4000;

/**
 * Sanity bound on chapter-list pagination. Real series need a handful
 * of pages (500 chapters per page); a response claiming hundreds of
 * pages is broken or hostile, and following it would loop fetches for
 * as long as the app lets it. Fail loudly instead.
 */
const MAX_LIST_PAGES = 200;

/**
 * Upper bound on any single response this plugin will parse. Chapter
 * pages and API responses from this site are orders of magnitude
 * smaller; anything bigger is a broken or hostile response, and
 * regex-scanning / JSON-parsing it would bill the reader's phone, not
 * the site. Enforced before any parsing happens.
 */
const MAX_RESPONSE_CHARS = 10000000;

/** fetchText with the size cap applied — used for every API call. */
async function fetchApiText(url: string): Promise<string> {
  const text = await fetchText(url);
  if (text.length > MAX_RESPONSE_CHARS)
    throw new Error("Response too large to parse safely");
  return text;
}

/**
 * Build the catalog browse URL for a page. The API honors the `status`
 * query param (Ongoing / Completed / Dropped / Canceled) but ignores
 * `tags` and `sort` params, so status is the only exposed filter.
 * 'all' (or empty) means no status filtering.
 */
function catalogUrl(pageNo: number, status?: string): string {
  let url = API + "/query?adult=true&query_string=&page=" + pageNo;
  const s = (status || "").trim();
  if (s && s !== "all") url += "&status=" + encodeURIComponent(s);
  return url;
}
const SITE = "https://wetriedtls.com";

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
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Decode HTML entities in display text (titles, names, summaries).
 * Delegates to the single-pass decoder: the previous chain of sequential
 * .replace() passes decoded twice ("&amp;lt;" -> "<"), and its numeric
 * pass wrapped code points above 0xffff through String.fromCharCode.
 * One visible difference: &nbsp; now yields U+00A0 (as browsers render it)
 * instead of a plain space; stripHtml already collapses U+00A0.
 */
function decodeEntities(s: string): string {
  return decodeEntitiesOnce(s);
}

/** Strip tags, collapse whitespace. */
function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/[ \t\xa0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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
  if (html.length > MAX_RESPONSE_CHARS)
    throw new Error("Page too large to parse safely");
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)\s*;?\s*<\/script>/g;
  let out = "";
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
  return decodeEntities(p.replace(/<[^>]+>/g, "")).trim();
}

function isTitleRepeat(p: string, knownTitles?: string[]): boolean {
  // A paragraph that is nothing but bold text is the site's repeated
  // series / chapter title header — but only when it actually matches a
  // title the caller knows. A genuine bold-only content line (a scene
  // label, a POV header) must never be stripped, so without a matching
  // known title nothing is treated as a repeat.
  const inner = p
    .replace(/^<p[^>]*>/i, "")
    .replace(/<\/p>$/i, "")
    .trim();
  if (!/^<strong>[\s\S]*<\/strong>$/.test(inner)) return false;
  if (!knownTitles || knownTitles.length === 0) return false;
  const text = decodeEntities(inner.replace(/<[^>]+>/g, ""))
    .trim()
    .toLowerCase();
  return knownTitles.some((t) => t.trim().toLowerCase() === text);
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
  if (!t || t === "= = =") return true;
  if (t.indexOf("we tried translations") !== -1) return true;
  if (t.indexOf("dsc.gg") !== -1 || t.indexOf("join our discord") !== -1)
    return true;
  return false;
}

/**
 * Decode HTML entities in ONE pass, the way a browser decodes an
 * attribute value: numeric references (decimal/hex, semicolon optional)
 * and named references (semicolon required, except the legacy set —
 * amp/lt/gt/quot — when not followed by a letter, digit, or '=', which
 * is the HTML attribute exception). A single pass matters: sequential
 * replace passes can double-decode (`&amp;#106;` must stay the literal
 * text `&#106;`, exactly as a browser sees it), and this decoder's whole
 * job is to show the URL check the same string the browser will use.
 * The named table covers every reference that can produce an ASCII
 * letter, digit, punctuation mark, or whitespace — the only characters
 * that can take part in a URL scheme — plus common typographic ones.
 */
const NAMED_ENTITIES: Record<string, string> = {
  Tab: "\t",
  NewLine: "\n",
  colon: ":",
  semi: ";",
  comma: ",",
  period: ".",
  sol: "/",
  bsol: "\\",
  plus: "+",
  equals: "=",
  lpar: "(",
  rpar: ")",
  excl: "!",
  quest: "?",
  num: "#",
  percnt: "%",
  dollar: "$",
  ast: "*",
  commat: "@",
  Hat: "^",
  lowbar: "_",
  grave: "`",
  lcub: "{",
  rcub: "}",
  lsqb: "[",
  rsqb: "]",
  verbar: "|",
  tilde: "~",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  laquo: "\u00ab",
  raquo: "\u00bb",
  middot: "\u00b7",
  bull: "\u2022",
  dagger: "\u2020",
  deg: "\u00b0",
  plusmn: "\u00b1",
  times: "\u00d7",
  divide: "\u00f7",
  minus: "\u2212",
  infin: "\u221e",
  ne: "\u2260",
  le: "\u2264",
  ge: "\u2265",
};

function decodeEntitiesOnce(s: string): string {
  return s.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+)(;?)/gi,
    (m, body: string, semi: string, offset: number, whole: string) => {
      if (body.charAt(0) === "#") {
        const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
        const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (!isNaN(code) && code > 0 && code <= 0x10ffff)
          return String.fromCodePoint(code);
        return m;
      }
      const named = Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
        ? NAMED_ENTITIES[body]
        : undefined;
      if (named === undefined) return m;
      if (!semi) {
        // Legacy no-semicolon form: browsers only honor it in
        // attributes when the next character can't extend the name.
        const legacy =
          body === "amp" || body === "lt" || body === "gt" || body === "quot";
        const next = whole.charAt(offset + m.length);
        if (!legacy || /[0-9a-zA-Z=]/.test(next)) return m;
      }
      return named;
    },
  );
}

/**
 * Canonicalize a URL attribute value and return it if — and only if —
 * it cannot execute script: entity-decode once (above), remove the
 * tab/newline characters browsers strip from URLs, trim leading
 * control/space characters the way the URL parser does, and then
 * require any explicit scheme to be on the allowlist. Relative URLs,
 * fragments, and protocol-relative URLs have no scheme to abuse and
 * pass. Returns null for anything else (javascript:, data:, vbscript:,
 * file:, ...), and the caller drops the attribute.
 */
function safeUrl(rawValue: string, allowMailto: boolean): string | null {
  const decoded = decodeEntitiesOnce(rawValue).replace(/[\t\n\r]/g, "");
  const trimmed = decoded.replace(/^[\u0000-\u0020]+/, "");
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!m) return trimmed;
  const scheme = m[1].toLowerCase();
  if (scheme === "http" || scheme === "https") return trimmed;
  if (allowMailto && scheme === "mailto") return trimmed;
  return null;
}

function escapeAttrValue(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

type ParsedTag = {
  kind: "open" | "close" | "comment";
  name: string;
  attrs: { name: string; value: string | null }[];
  selfClosing: boolean;
  unterminated: boolean;
  end: number;
};

/** Parse the tag starting at html[lt] === '<'. Null = '<' is literal text. */
function parseTag(html: string, lt: number): ParsedTag | null {
  const n = html.length;
  const c1 = html.charAt(lt + 1);
  if (c1 === "!" || c1 === "?") {
    // Comment, doctype, or processing instruction: never emitted.
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      return {
        kind: "comment",
        name: "",
        attrs: [],
        selfClosing: false,
        unterminated: false,
        end: close === -1 ? n : close + 3,
      };
    }
    const gt = html.indexOf(">", lt + 2);
    return {
      kind: "comment",
      name: "",
      attrs: [],
      selfClosing: false,
      unterminated: false,
      end: gt === -1 ? n : gt + 1,
    };
  }
  let i = lt + 1;
  let kind: "open" | "close" = "open";
  if (c1 === "/") {
    kind = "close";
    i = lt + 2;
  }
  if (!/[a-zA-Z]/.test(html.charAt(i))) return null;
  let name = "";
  while (i < n && /[a-zA-Z0-9-]/.test(html.charAt(i))) {
    name += html.charAt(i).toLowerCase();
    i++;
  }
  if (kind === "close") {
    const gt = html.indexOf(">", i);
    return {
      kind,
      name,
      attrs: [],
      selfClosing: false,
      unterminated: gt === -1,
      end: gt === -1 ? n : gt + 1,
    };
  }
  const attrs: { name: string; value: string | null }[] = [];
  let selfClosing = false;
  let unterminated = true;
  while (i < n) {
    while (i < n && /\s/.test(html.charAt(i))) i++;
    if (i >= n) break;
    const ch = html.charAt(i);
    if (ch === ">") {
      unterminated = false;
      i++;
      break;
    }
    if (ch === "/") {
      if (html.charAt(i + 1) === ">") {
        selfClosing = true;
        unterminated = false;
        i += 2;
        break;
      }
      i++;
      continue;
    }
    let aname = "";
    while (i < n && !/[\s=/>]/.test(html.charAt(i))) {
      aname += html.charAt(i).toLowerCase();
      i++;
    }
    while (i < n && /\s/.test(html.charAt(i))) i++;
    let value: string | null = null;
    if (html.charAt(i) === "=") {
      i++;
      while (i < n && /\s/.test(html.charAt(i))) i++;
      const q = html.charAt(i);
      if (q === '"' || q === "'") {
        const start = ++i;
        while (i < n && html.charAt(i) !== q) i++;
        value = html.slice(start, i);
        if (i < n) i++;
      } else {
        const start = i;
        while (i < n && !/[\s>]/.test(html.charAt(i))) i++;
        value = html.slice(start, i);
      }
    }
    if (aname) attrs.push({ name: aname, value });
  }
  return { kind, name, attrs, selfClosing, unterminated, end: i };
}

/**
 * Elements whose content is raw text (script/style) or RCDATA
 * (textarea/title): no markup is recognized inside them, so the FIRST
 * matching close tag ends the element — nesting must not be counted.
 */
const SANITIZE_RAWTEXT = new Set(["script", "style", "textarea", "title"]);

/**
 * Skip a dropped element's content, through its matching close tag.
 * Container elements (svg, iframe, form, ...) nest, so same-name opens
 * are depth-counted; raw-text elements end at their first close tag.
 * Scanning uses parseTag rather than a `[^>]*>` regex, so a `>` inside
 * a quoted attribute of a nested tag cannot end that tag early and
 * desync the depth count.
 */
function skipElementContent(html: string, from: number, name: string): number {
  const rawText = SANITIZE_RAWTEXT.has(name);
  let depth = 1;
  let i = from;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) return html.length;
    const tag = parseTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (tag.name !== name || tag.kind === "comment") continue;
    if (tag.kind === "close") {
      depth--;
      if (depth === 0) return i;
    } else if (!rawText && !tag.selfClosing) {
      depth++;
    }
  }
  return html.length;
}

const SANITIZE_ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/** Elements removed together with everything inside them. */
const SANITIZE_DROP_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "button",
  "select",
  "textarea",
  "input",
  "link",
  "meta",
  "base",
  "noscript",
  "template",
  "svg",
  "math",
  "title",
  "frame",
  "frameset",
  "applet",
  "audio",
  "video",
  "source",
  "track",
]);

const SANITIZE_VOID = new Set([
  "br",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "base",
  "embed",
  "source",
  "track",
  "wbr",
  "col",
  // `frame` is void too (no closing tag exists): without it here, a stray
  // <frame> makes the drop-with-content skipper scan to end of input and
  // swallow the rest of the chapter.
  "frame",
]);

/** The only attributes ever emitted, per tag. Everything else is dropped. */
const SANITIZE_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  ol: new Set(["start"]),
  li: new Set(["value"]),
};

function sanitizeAttrs(tagName: string, tag: ParsedTag): string {
  const allowed = SANITIZE_ALLOWED_ATTRS[tagName];
  if (!allowed) return "";
  let out = "";
  const emitted = new Set<string>();
  for (const attr of tag.attrs) {
    // First occurrence wins, matching browser handling of duplicates;
    // a later duplicate can never replace a value we already emitted.
    if (!allowed.has(attr.name) || emitted.has(attr.name)) continue;
    emitted.add(attr.name);
    const value = attr.value === null ? "" : attr.value;
    if (attr.name === "href" || attr.name === "src") {
      const safe = safeUrl(value, attr.name === "href");
      if (safe === null) continue;
      out += " " + attr.name + '="' + escapeAttrValue(safe) + '"';
    } else {
      // Display text (alt/title/...): decode once, then re-escape, so
      // the reader shows exactly the text the site authored — emitting
      // the raw value escaped would double-encode its entities
      // (&amp; would display as the literal text "&amp;").
      out +=
        " " +
        attr.name +
        '="' +
        escapeAttrValue(decodeEntitiesOnce(value)) +
        '"';
    }
  }
  return out;
}

/**
 * Make chapter HTML safe for the reader, which renders it unsanitized.
 *
 * This is an ALLOWLIST rebuild, not another patch on the old denylist.
 * The previous sanitizer (remove dangerous tags, strip on* attributes,
 * block script schemes in href/src/action) was bypassed three times —
 * encoded schemes, then SVG xlink:href, then entity-smuggled schemes —
 * because a list of bad things is never complete. Here the HTML is
 * tokenized properly; only known-safe tags are emitted, with only
 * known-safe attributes (URLs canonicalized and scheme-checked);
 * dangerous elements are dropped with their content; unknown tags are
 * unwrapped (tag dropped, text kept), so new site markup degrades to
 * plain content instead of slipping through. Site chrome classes and
 * inline styles are not carried over — the reader applies its own
 * styling.
 */
function sanitizeHtml(html: string): string {
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const tag = parseTag(html, lt);
    if (!tag) {
      out += "<";
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (tag.kind === "comment" || tag.unterminated) continue;
    if (SANITIZE_DROP_CONTENT.has(tag.name)) {
      if (
        tag.kind === "open" &&
        !tag.selfClosing &&
        !SANITIZE_VOID.has(tag.name)
      ) {
        i = skipElementContent(html, i, tag.name);
      }
      continue;
    }
    if (!SANITIZE_ALLOWED_TAGS.has(tag.name)) continue;
    if (tag.kind === "close") {
      out += "</" + tag.name + ">";
    } else {
      out += "<" + tag.name + sanitizeAttrs(tag.name, tag) + ">";
    }
  }
  return out;
}

/**
 * Read the pagination total from an API response. A response with no
 * meta at all is a single page (return 1). But a meta that is PRESENT
 * and malformed — last_page as a string, zero, negative — means the
 * response is not the shape the API contract promises; defaulting to
 * 1 there silently truncates catalogs and chapter lists to their first
 * page, indistinguishable from a complete list. Fail loudly instead.
 */
function readLastPage(root: Record<string, unknown>): number {
  const meta = root.meta;
  if (meta === undefined || meta === null) return 1;
  if (!isRecord(meta)) throw new Error("Invalid API response (bad metadata)");
  const lp = meta.last_page;
  if (lp === undefined) return 1;
  if (typeof lp !== "number" || !(lp >= 1))
    throw new Error("Invalid API response (bad last_page)");
  return Math.floor(lp);
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
    lastPage = readLastPage(root);
    const data = Array.isArray(root.data) ? root.data : [];
    for (const it of data) {
      if (!isRecord(it)) continue;
      if (it.series_type && it.series_type !== "Novel") continue;
      const slug = str(it.series_slug).trim();
      const title = str(it.title).trim();
      if (!slug || !title) continue;
      items.push({
        slug,
        title: decodeEntities(title),
        cover: str(it.thumbnail).trim(),
      });
    }
  }
  return { items, lastPage };
}

/** Parse the /series/{slug} API response. */
function parseSeriesDetail(jsonText: string): NovelDetails | null {
  const s = safeJson(jsonText);
  if (!isRecord(s) || typeof s.id !== "number") return null;
  const tags = Array.isArray(s.tags) ? s.tags : [];
  return {
    id: s.id,
    name: decodeEntities(str(s.title)),
    author: decodeEntities(str(s.author)),
    genres: tags
      .map((t) => (isRecord(t) ? decodeEntities(str(t.name)) : ""))
      .filter((g) => g.length > 0),
    status: str(s.status),
    cover: str(s.thumbnail).trim(),
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
    throw new Error("Empty response while fetching the chapter list");
  }
  const root = safeJson(jsonText);
  // A non-blank but unusable response (an error page, a proxy block page,
  // truncated JSON) must fail loudly too: silently returning an empty page
  // here would make parseNovel stop fetching and present an incomplete
  // chapter list as though it were complete.
  if (!isRecord(root) || !Array.isArray(root.data)) {
    throw new Error("Invalid chapter-list response (not the expected JSON)");
  }
  const items: ChapterInfo[] = [];
  const lastPage = readLastPage(root);
  for (const c of root.data) {
    if (!isRecord(c)) continue;
    const slug = str(c.chapter_slug).trim();
    const name = str(c.chapter_name).trim();
    if (!slug || !name) continue;
    const title = str(c.chapter_title).trim();
    const idx = parseFloat(str(c.index));
    items.push({
      slug,
      name: title ? name + ": " + decodeEntities(title) : name,
      number: isNaN(idx) ? 0 : idx,
      publishedAt: str(c.created_at),
      locked,
    });
  }
  // A page that HAS entries but yields none usable is the same failure
  // as a malformed response: returning it would present an empty or
  // partial chapter list as though it were complete. (Individually
  // malformed entries alongside valid ones are still skipped — one bad
  // entry must not take the whole novel down with it.)
  if (root.data.length > 0 && items.length === 0) {
    throw new Error("Invalid chapter-list response (no usable entries)");
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
  return c.locked ? "🔒 " + c.name : c.name;
}

function proxiedImageUrl(url: string, width: number): string {
  const bare = url.replace(/^https?:\/\//i, "");
  return (
    "https://images.weserv.nl/?url=" +
    encodeURIComponent(bare) +
    "&w=" +
    width +
    "&q=80&output=webp"
  );
}

function shrinkIllustrations(html: string): string {
  return html.replace(
    /<img\b([^>]*?)\bsrc="(https?:\/\/media\.reaperscans\.net\/[^"]+)"([^>]*?)>/gi,
    (_m, pre, src, post) =>
      "<img" + pre + ' src="' + proxiedImageUrl(src, 800) + '"' + post + ">",
  );
}

type ChapterContentResult =
  | { status: "ok"; html: string }
  | { status: "premium" | "notfound" | "empty" };

/**
 * Status for a page whose flight data yielded no chapter body. Gated and
 * missing pages carry no body (the real premium page has no
 * chapter_content at all — its banner sits in the page markup), so the
 * page-level heuristics run only here, after extraction failed. Running
 * them on every page misfired: a free chapter whose story text quotes
 * "This chapter is premium!" was blocked as premium, and a novel titled
 * "404 ..." lost every chapter to the title check.
 */
function noBodyStatus(html: string): ChapterContentResult {
  if (/this chapter is premium!/i.test(html)) return { status: "premium" };
  // Only the real <title> element counts for the 404 check: Next.js flight
  // data always embeds a notFound template containing similar wording.
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title && /^\s*404/i.test(title[1])) return { status: "notfound" };
  return { status: "empty" };
}

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
  const flight = extractFlightText(html);
  // chapter_content is either a flight-row reference ("$<rowId>") or the
  // chapter HTML inline (gallery/illustration chapters). The value is a
  // JSON string, so internal quotes arrive escaped.
  const contentM = /"chapter_content":"((?:[^"\\]|\\.)*)"/.exec(flight);
  if (!contentM) return noBodyStatus(html);
  let raw: string;
  try {
    raw = JSON.parse('"' + contentM[1] + '"');
  } catch {
    return noBodyStatus(html);
  }

  let payload: string;
  const rowRef = /^\$([0-9a-z]{1,4})$/.exec(raw);
  if (rowRef) {
    // The row looks like `<rowId>:T<hex>,<payload>` where <hex> is the exact
    // UTF-8 byte length of the payload. Respecting it is the only reliable
    // end boundary: flight metadata follows the payload on the same line,
    // so a "next row" lookahead overshoots.
    const rowRe = new RegExp(
      "\\n" +
        rowRef[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        ":T([0-9a-f]+),",
    );
    const row = rowRe.exec(flight);
    if (!row) return noBodyStatus(html);
    const byteLen = parseInt(row[1], 16);
    if (!(byteLen > 0)) return noBodyStatus(html);
    const payloadStart = row.index + row[0].length;
    payload = sliceUtf8Bytes(flight, payloadStart, byteLen);
  } else if (/^\s*</.test(raw)) {
    payload = raw;
  } else {
    return noBodyStatus(html);
  }
  if (!payload) return { status: "empty" };

  // Paragraph breaks inside the payload are literal \r\n / \n sequences.
  const body = payload
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .trim();
  if (!body) return { status: "empty" };

  // Split into top-level blocks in document order. Paragraphs, headings,
  // figures and standalone images are recognized; container elements
  // (lists, tables, blockquotes, divs) are matched as whole blocks so
  // their inner paragraphs keep their structure, and anything else that
  // carries text is kept too — dropping it would silently lose chapter
  // content. Only the site's promo header / footer (banner, credits,
  // title repeats, discord plug) is trimmed from the edges.
  const blocks: string[] = [];
  const blockRe =
    /<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>|<table[\s\S]*?<\/table>|<blockquote[\s\S]*?<\/blockquote>|<div[\s\S]*?<\/div>|<p[\s\S]*?<\/p>|<h[1-6][\s\S]*?<\/h[1-6]>|<figure[\s\S]*?<\/figure>|<img[^>]*>/gi;
  let last = 0;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(body)) !== null) {
    const gap = body.slice(last, bm.index);
    if (gap.replace(/<[^>]+>/g, "").trim()) blocks.push(gap.trim());
    blocks.push(bm[0]);
    last = bm.index + bm[0].length;
  }
  const tail = body.slice(last);
  if (tail.replace(/<[^>]+>/g, "").trim()) blocks.push(tail.trim());
  if (blocks.length === 0) blocks.push(body);

  let start = 0;
  let end = blocks.length;
  const isEdgeJunk = (p: string) =>
    isPromoParagraph(p) || isCreditLine(p) || isTitleRepeat(p, knownTitles);
  while (start < end && isEdgeJunk(blocks[start])) start++;
  while (end > start && isEdgeJunk(blocks[end - 1])) end--;
  const cleaned = blocks.slice(start, end).join("\n");
  // An image-only chapter (illustrations with no text) is still real
  // content — it must not be reported as empty.
  if (!paragraphText(cleaned) && !/<img[\s>]/i.test(cleaned))
    return { status: "empty" };
  // The reader renders this HTML unsanitized, so strip anything that
  // could run code (event handlers, scripts, javascript: URLs) first.
  return { status: "ok", html: sanitizeHtml(shrinkIllustrations(cleaned)) };
}

function mapStatus(s: string): string {
  if (s === "Ongoing") return NovelStatus.Ongoing;
  if (s === "Completed") return NovelStatus.Completed;
  if (s === "Hiatus" || s === "On Hiatus") return NovelStatus.OnHiatus;
  if (s === "Cancelled" || s === "Dropped") return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}

// --- Catalog filters ----------------------------------------------------
// The API honors `status` but ignores `tags` and `sort`, so the filter
// menu offers status only.
const STATUS_FILTER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Ongoing", value: "Ongoing" },
  { label: "Completed", value: "Completed" },
  { label: "Dropped", value: "Dropped" },
  { label: "Canceled", value: "Canceled" },
] as const;

/**
 * Pull a plain string value out of the app's filter payload, which may be
 * the raw string or a { type, value } wrapper object.
 */
function extractFilterValue(filters: unknown, key: string): string {
  if (!filters || typeof filters !== "object") return "";
  const f = (filters as Record<string, unknown>)[key];
  if (f === null || f === undefined) return "";
  const v =
    typeof f === "object" && "value" in f ? (f as { value: unknown }).value : f;
  return typeof v === "string" ? v : "";
}

class WeTriedTLS implements Plugin.PluginBase {
  id = "wetriedtls";
  name = "We Tried TLS";
  icon = "src/en/wetriedtls/icon.png";
  site = SITE;
  version = "1.0.6";

  // Novel/chapter titles behind each chapter path, recorded by parseNovel.
  // parseChapter passes them to parseChapterContent so the site's repeated
  // title header can be told apart from a genuine bold-only content line
  // (which must be kept). Bounded: the plugin is a session singleton, so
  // without a cap this grows with every novel browsed — when the cap is
  // hit the oldest entries are evicted (a cold entry only means a title
  // header may be kept, the parser's safe default).
  private chapterTitles = new Map<string, string[]>();

  private rememberTitles(path: string, titles: string[]): void {
    this.chapterTitles.set(path, titles);
    while (this.chapterTitles.size > MAX_TITLE_CACHE_ENTRIES) {
      const oldest = this.chapterTitles.keys().next();
      if (oldest.done) break;
      this.chapterTitles.delete(oldest.value);
    }
  }

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: "Status",
      value: "all",
      options: STATUS_FILTER_OPTIONS,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const status = extractFilterValue(filters, "status");
    const page = parseQueryResults(
      await fetchApiText(catalogUrl(pageNo, status)),
    );
    if (pageNo > page.lastPage) return [];
    return page.items.map((n) => ({
      name: n.title,
      path: n.slug,
      cover: n.cover,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split("/").filter(Boolean).pop() || "";
    const detail = parseSeriesDetail(
      await fetchApiText(API + "/series/" + slug),
    );
    if (!detail) throw new Error("Could not load novel details");

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
      if (pageNo > MAX_LIST_PAGES)
        throw new Error("Chapter list pagination did not terminate");
      const json = await fetchApiText(
        API +
          "/chapters/" +
          detail.id +
          "?page=" +
          pageNo +
          "&perPage=500&order=asc",
      );
      // The official fetchText returns '' when the request fails. That must
      // never be treated as a valid page: parseChapterList would default
      // lastPage to 1 and parseNovel would return an incomplete chapter
      // list as though it were complete. Fail loudly instead.
      if (!json || !json.trim())
        throw new Error(
          "Failed to load the chapter list (page " + pageNo + ")",
        );
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
        if (paidPageNo > MAX_LIST_PAGES)
          throw new Error("Paid chapter list pagination did not terminate");
        const page = parseChapterList(
          await fetchApiText(
            API +
              "/chapters/" +
              detail.id +
              "/paid?query=&page=" +
              paidPageNo +
              "&perPage=1000&order=asc",
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

    // A Set, not a plain object: with Record<string, boolean>, slugs like
    // "constructor" or "toString" read inherited Object members as truthy
    // and those chapters would be silently dropped as false duplicates.
    const seen = new Set<string>();
    const chapters: Plugin.ChapterItem[] = [];
    all
      .filter((c) => {
        if (!c.slug || seen.has(c.slug)) return false;
        seen.add(c.slug);
        return true;
      })
      .sort((a, b) => a.number - b.number)
      .forEach((c) => {
        const displayName = chapterDisplayName(c);
        const chapterPath = slug + "/" + c.slug;
        chapters.push({
          name: displayName,
          path: chapterPath,
          releaseTime: c.publishedAt,
          chapterNumber: c.number,
        });
        this.rememberTitles(chapterPath, [
          detail.name,
          displayName.replace(/^🔒\s*/, ""),
        ]);
      });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.name,
      status: mapStatus(detail.status),
    };
    // Covers are served directly from the site's CDN: an earlier
    // version proxied them for smaller thumbnails, but a single URL
    // field cannot carry a fallback — if the proxy is blocked or down,
    // every cover breaks while the CDN still works.
    if (detail.cover) novel.cover = detail.cover;
    if (detail.author) novel.author = detail.author;
    if (detail.genres.length) novel.genres = detail.genres.join(", ");
    if (detail.summary) novel.summary = detail.summary;
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = parseChapterContent(
      await fetchText(SITE + "/series/" + chapterPath),
      this.chapterTitles.get(chapterPath),
    );
    if (result.status === "ok") return result.html;
    if (result.status === "premium") {
      return (
        "<p><strong>This chapter is premium on We Tried TLS.</strong></p>" +
        "<p>It requires a paid subscription on the website and cannot be read here. " +
        "Free chapters of this novel still work.</p>"
      );
    }
    if (result.status === "notfound") {
      return (
        "<p><strong>This chapter is no longer available on We Tried TLS.</strong></p>" +
        "<p>It may have been removed or moved. Refresh the novel to update the chapter list.</p>"
      );
    }
    return (
      "<p><strong>Could not load this chapter.</strong></p>" +
      "<p>It may be temporarily unavailable on We Tried TLS.</p>"
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const page = parseQueryResults(
      await fetchApiText(
        API +
          "/query?adult=true&query_string=" +
          encodeURIComponent(searchTerm) +
          "&page=" +
          pageNo,
      ),
    );
    if (pageNo > page.lastPage) return [];
    return page.items.map((n) => ({
      name: n.title,
      path: n.slug,
      cover: n.cover,
    }));
  }

  resolveUrl = (path: string, _isNovel?: boolean): string =>
    SITE + "/series/" + path;
}

export default new WeTriedTLS();
