import { fetchText } from "@libs/fetch";
import { Plugin } from "@/types/plugin";
import { NovelStatus } from "@libs/novelStatus";

type NovelCard = {
  slug: string;
  title: string;
  author: string;
  genres: string[];
  coverUrl: string;
  chapterCount: number;
  status: string;
};

type ChapterInfo = {
  number: number;
  title: string;
  publishedAt: string;
  tier: string;
};

type NovelDetails = {
  name: string;
  author: string;
  genres: string[];
  status: string;
  cover: string;
  summary: string;
  chapters: ChapterInfo[];
};

/** Matches a JSON string body with escaped quotes, e.g. "a \"quoted\" title". */
const JSON_STR = '((?:[^"\\\\]|\\\\.)*)';

/**
 * Upper bound on a page this plugin will parse. Site pages are orders
 * of magnitude smaller; anything bigger is a broken or hostile
 * response, and regex-scanning / JSON-parsing it would bill the
 * reader's phone, not the site. Enforced before any parsing happens.
 */
const MAX_PAGE_CHARS = 10000000;

/**
 * Decode one flight string field. The field is a JSON string body, so
 * decode it as JSON — that handles every escape (\", \\, \n, \uXXXX)
 * exactly the way the site encoded it. A hand-rolled unescaper only
 * ever covers the escapes its author remembered. If the body is not
 * valid JSON (site changed shape), fall back to the two common escapes
 * rather than losing the field entirely.
 */
function unescapeFlight(s: string): string {
  try {
    return JSON.parse('"' + s + '"');
  } catch {
    return s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
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
  if (html.length > MAX_PAGE_CHARS)
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
 * The novel-card pattern, built once and shared: parseNovelEntries
 * captures the slug (pass a capture group), findIndexEntry looks up one
 * known slug (pass the escaped literal — no group, so field numbering
 * shifts by one; both callers index accordingly). The card shape must
 * only ever be edited here: two hand-written copies of this pattern
 * are how the parsers drift apart.
 */
function entryPattern(slugPattern: string): string {
  return (
    '"slug":"' +
    slugPattern +
    '","title":"' +
    JSON_STR +
    '","author":"' +
    JSON_STR +
    '","genres":(\\[[^\\]]*\\]),"glyph":"[^"]*","cover":\\[[^\\]]*\\],"coverUrl":"([^"]*)","chapters":(\\d+),"status":"([^"]*)"'
  );
}

const ENTRY_RE = new RegExp(entryPattern("([a-z0-9-]+)"), "g");

/** Parse every novel card object embedded in flight data (browse/search pages). */
function parseNovelEntries(flight: string): NovelCard[] {
  const out: NovelCard[] = [];
  const seen = new Set<string>();
  ENTRY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTRY_RE.exec(flight)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    let genres: string[] = [];
    try {
      genres = JSON.parse(m[4]);
    } catch {
      /* keep empty */
    }
    out.push({
      slug: m[1],
      title: unescapeFlight(m[2]),
      author: unescapeFlight(m[3]),
      genres,
      coverUrl: m[5],
      chapterCount: parseInt(m[6], 10),
      status: m[7],
    });
  }
  return out;
}

/** Find the novel's own card in the page's embedded novel index (header data). */
function findIndexEntry(flight: string, slug: string): NovelCard | null {
  const re = new RegExp(
    entryPattern(slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  const m = re.exec(flight);
  if (!m) return null;
  let genres: string[] = [];
  try {
    genres = JSON.parse(m[3]);
  } catch {
    /* keep empty */
  }
  return {
    slug,
    title: unescapeFlight(m[1]),
    author: unescapeFlight(m[2]),
    genres,
    coverUrl: m[4],
    chapterCount: parseInt(m[5], 10),
    status: m[6],
  };
}

const HTML_ENTITY_CHARS: Record<string, string> = {
  amp: "&",
  quot: '"',
  "#39": "'",
  apos: "'",
  lt: "<",
  gt: ">",
};

function decodeHtmlEntities(s: string): string {
  // Single pass, one regex: a chain of sequential .replace() calls decodes
  // twice, turning a literal "&amp;lt;" in the source into "<". The
  // alternation also bounds the map lookup to exactly these keys.
  return s.replace(
    /&(amp|quot|#39|apos|lt|gt);/g,
    (m, e: string) => HTML_ENTITY_CHARS[e] ?? m,
  );
}

/** Title from the rendered <h1> (in the flight data). */
const TITLE_RE = new RegExp(
  '"\\$","h1",null,\\{"className":"text-3xl[^"]*","children":"' +
    JSON_STR +
    '"\\}',
);

/** Author: the <dd> right after the "Author" <dt>. */
const AUTHOR_RE = new RegExp(
  '"children":"Author"\\}\\],\\["\\$","dd",null,\\{"className":"mt-0\\.5 text-sm font-medium","children":"' +
    JSON_STR +
    '"\\}',
);

/** Chapter list entries: flat {number,title,publishedAt,words,tier} objects. */
const CHAPTER_RE = new RegExp(
  '"number":(\\d+(?:\\.\\d+)?),"title":"' +
    JSON_STR +
    '","publishedAt":"([^"]*)","words":(\\d+),"tier":"([^"]*)"',
  "g",
);

/** Parse a /novel/<slug> page into its details + full chapter list. */
function parseNovelPage(
  html: string,
  flight: string,
  slug: string,
): NovelDetails {
  const details: NovelDetails = {
    name: slug,
    author: "",
    genres: [],
    status: "",
    cover: "",
    summary: "",
    chapters: [],
  };

  let m: RegExpExecArray | null;

  // Title from the rendered <h1>.
  m = TITLE_RE.exec(flight);
  if (m) details.name = unescapeFlight(m[1]);

  // Author: the <dd> right after the "Author" <dt>.
  m = AUTHOR_RE.exec(flight);
  if (m) details.author = unescapeFlight(m[1]);

  // Genres: prefer the novel's own entry in the embedded novel index;
  // fall back to the "#Tag" chips in the tag row under the header.
  const indexEntry = findIndexEntry(flight, slug);
  if (indexEntry && indexEntry.genres.length > 0) {
    details.genres = indexEntry.genres;
  } else {
    const chipRow = flight.indexOf("mt-3 flex flex-wrap gap-1.5");
    if (chipRow >= 0) {
      const chipRe = /"children":\["#","([^"]*)"\]/g;
      chipRe.lastIndex = chipRow;
      let cm: RegExpExecArray | null;
      let count = 0;
      while (
        (cm = chipRe.exec(flight)) !== null &&
        cm.index < chipRow + 6000 &&
        count < 40
      ) {
        details.genres.push(cm[1]);
        count++;
      }
    }
  }

  // Fill any gaps from the index entry.
  if (indexEntry) {
    if (!details.author && indexEntry.author)
      details.author = indexEntry.author;
    if (!details.status && indexEntry.status)
      details.status = indexEntry.status;
    if (!details.cover && indexEntry.coverUrl)
      details.cover = indexEntry.coverUrl;
    if (details.name === slug && indexEntry.title)
      details.name = indexEntry.title;
  }

  // Status chip (Ongoing / Completed / ...).
  m =
    /"className":"chip"[\s\S]{0,150}?"children":"(Ongoing|Completed|Hiatus|Dropped|On Hiatus|Cancelled)"/.exec(
      flight,
    );
  if (m) details.status = m[1];

  // Cover: first supabase-hosted cover image on the page is the novel's own.
  m = /"src":"(https:\/\/[^"]*?supabase[^"]*?covers[^"]*?)"/.exec(flight);
  if (m) details.cover = m[1];

  // Synopsis from the meta description tag.
  m = /<meta name="description" content="([\s\S]*?)"/.exec(html);
  if (m) details.summary = decodeHtmlEntities(m[1]).replace(/\\n/g, "\n");

  // Chapter list: flat {number,title,publishedAt,words,tier} objects.
  const seenCh = new Set<number>();
  CHAPTER_RE.lastIndex = 0;
  let chm: RegExpExecArray | null;
  while ((chm = CHAPTER_RE.exec(flight)) !== null) {
    const num = parseFloat(chm[1]);
    if (seenCh.has(num)) continue;
    seenCh.add(num);
    details.chapters.push({
      number: num,
      title: unescapeFlight(chm[2]),
      publishedAt: chm[3],
      tier: chm[5],
    });
  }
  details.chapters.sort((a, b) => a.number - b.number);

  return details;
}

const LOCKED_MESSAGE =
  "<p><strong>This chapter is locked on Nightjar Reads.</strong></p>" +
  "<p>It is a premium chapter — unlock it on nightjarreads.com to read it here.</p>";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The chapter body: a JSON string array followed by translatorNotes. */
const BODY_RE = /"body":\[\"([\s\S]*?)\"\],\"translatorNotes\"/;

/**
 * True when THIS chapter's record says the chapter is locked. The flag
 * is looked up only where the site puts it: in the record fields right
 * AFTER the chapter's "body" value — never across the whole page, and
 * never inside the body text itself. An unscoped test over the entire
 * blob would let any unrelated record containing "locked":true
 * (another novel's data, a recommendation payload) mislabel a free
 * chapter as locked. (A locked chapter's body is null, so for that
 * case the window starts at the "body" key itself.)
 */
function isLockedChapter(
  flight: string,
  bodyMatch: RegExpExecArray | null,
): boolean {
  const from = bodyMatch
    ? bodyMatch.index + bodyMatch[0].length
    : flight.indexOf('"body":');
  if (from < 0) return false;
  return /"locked":true/.test(flight.slice(from, from + 400));
}

/**
 * Parse a /novel/<slug>/<n> chapter page.
 * Returns the chapter HTML, or LOCKED_MESSAGE when the chapter is premium.
 * Returns null when the page has no readable content at all.
 */
function parseChapterPage(flight: string): string | null {
  const m = BODY_RE.exec(flight);
  if (isLockedChapter(flight, m)) return LOCKED_MESSAGE;
  if (!m) return null;
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse('["' + m[1] + '"]');
  } catch {
    return null;
  }
  if (!Array.isArray(parsedBody)) return null;
  // Body members are strings by contract, but the array comes from the
  // page: one non-string member used to throw out of the .map below
  // (p.trim is not a function) and crash the chapter load, instead of
  // returning null as this function documents. Non-strings are dropped.
  const paras = parsedBody
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter(
      (p) => p.length > 0 && !/Advance chapters at Nightjar Reads/.test(p),
    );
  if (paras.length === 0) return null;
  return paras.map((p) => "<p>" + escapeHtml(p) + "</p>").join("\n");
}

/**
 * How far past the search marker the results section can run. On real
 * pages the result links sit within a few hundred characters of the
 * marker; the bound exists so links from unrelated later sections
 * (recommendations, rails) can never be collected as results.
 */
const SEARCH_SECTION_MAX_CHARS = 200000;

/**
 * Parse a /search?q=... page: result slugs in order, looked up in the index.
 *
 * The marker is built from the query as the site stores it — JSON-escaped
 * inside the flight payload. Searching for the RAW query meant any
 * query containing a quote never matched its marker (the site stores
 * \"), and the fallback then scanned the whole page, returning whatever
 * links it found in whatever order. The scan is also bounded to the
 * results section: from the marker to the next section's marker or
 * SEARCH_SECTION_MAX_CHARS, whichever comes first.
 */
function parseSearchResults(flight: string, query: string): NovelCard[] {
  const marker =
    '"initial":"' + query.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const start = flight.indexOf(marker);
  let section = flight;
  if (start >= 0) {
    let end = flight.indexOf('"initial":"', start + marker.length);
    if (end < 0 || end > start + SEARCH_SECTION_MAX_CHARS)
      end = Math.min(flight.length, start + SEARCH_SECTION_MAX_CHARS);
    section = flight.slice(start, end);
  }
  // The page itself states how many results it found, right after the
  // marker ("children":[N," ","result"," for ...). When that count is
  // readable, take exactly N links — a recommendation rail further down
  // the page can no longer leak in, however close it sits. When it
  // isn't (site changed the wording), the bounded scan above is the
  // fallback.
  let limit = Infinity;
  const countM = /\[(\d+)," ","result/.exec(section.slice(0, 2000));
  if (countM) limit = parseInt(countM[1], 10);
  const hrefRe = /"href":"\/novel\/([a-z0-9-]+)"/g;
  const order: string[] = [];
  const seen = new Set<string>();
  let hm: RegExpExecArray | null;
  while ((hm = hrefRe.exec(section)) !== null && order.length < limit) {
    if (!seen.has(hm[1])) {
      seen.add(hm[1]);
      order.push(hm[1]);
    }
  }
  const index = new Map(parseNovelEntries(flight).map((n) => [n.slug, n]));
  return order
    .map((slug) => index.get(slug))
    .filter((n): n is NovelCard => !!n);
}

class NightjarReads implements Plugin.PluginBase {
  id = "nightjarreads";
  name = "Nightjar Reads";
  icon = "src/en/nightjarreads/icon.png";
  site = "https://nightjarreads.com";
  version = "1.0.0";

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const html = await fetchText(this.site + "/browse?sort=popular");
    return parseNovelEntries(extractFlightText(html)).map((n) => ({
      name: n.title,
      path: "/novel/" + n.slug,
      cover: n.coverUrl,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split("/").filter(Boolean).pop() || "";
    const html = await fetchText(this.site + novelPath);
    const d = parseNovelPage(html, extractFlightText(html), slug);

    let status: string = NovelStatus.Unknown;
    if (d.status === "Ongoing") status = NovelStatus.Ongoing;
    else if (d.status === "Completed") status = NovelStatus.Completed;
    else if (d.status === "On Hiatus" || d.status === "Hiatus")
      status = NovelStatus.OnHiatus;
    else if (d.status === "Cancelled" || d.status === "Dropped")
      status = NovelStatus.Cancelled;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: d.name,
      status,
    };
    if (d.cover) novel.cover = d.cover;
    if (d.author) novel.author = d.author;
    if (d.genres.length) novel.genres = d.genres.join(", ");
    if (d.summary) novel.summary = d.summary;
    novel.chapters = d.chapters.map((c) => ({
      name: "Chapter " + c.number + ": " + c.title,
      path: "/novel/" + slug + "/" + c.number,
      releaseTime: c.publishedAt,
      chapterNumber: c.number,
    }));
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchText(this.site + chapterPath);
    const content = parseChapterPage(extractFlightText(html));
    if (content === null) {
      return (
        "<p><strong>Could not load this chapter.</strong></p>" +
        "<p>It may be locked or temporarily unavailable on Nightjar Reads.</p>"
      );
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const html = await fetchText(
      this.site + "/search?q=" + encodeURIComponent(searchTerm),
    );
    const flight = extractFlightText(html);
    return parseSearchResults(flight, searchTerm).map((n) => ({
      name: n.title,
      path: "/novel/" + n.slug,
      cover: n.coverUrl,
    }));
  }

  resolveUrl = (path: string): string => this.site + path;
}

export default new NightjarReads();
