import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

type ApiTranslator = {
  name?: string;
};

type ApiSeries = {
  id: number | string;
  title: string;
  slug: string;
  synopsis?: string | null;
  description?: string | null;
  short_synopsis?: string | null;
  cover_image_url?: string | null;
  cover_thumb_url?: string | null;
  author_name?: string | null;
  original_author?: string | null;
  translator_name?: string | null;
  translator?: ApiTranslator | null;
  status?: string | null;
  story_status?: string | null;
  chapters_locked?: number | boolean | null;
  has_access_password?: number | boolean | null;
  library_count?: number | null;
  tracking_count?: number | null;
  updated_at?: string | null;
  last_release_at?: string | null;
  genres?: string[] | null;
  tags?: string[] | null;
};

type ApiSeriesListResponse =
  | ApiSeries[]
  | {
      rows?: ApiSeries[];
    };

type ApiChapter = {
  id: number | string;
  title?: string | null;
  slug?: string | null;
  chapter_number?: number | string | null;
  status?: string | null;
  price_type?: string | null;
  is_locked?: number | boolean | null;
  has_access_password?: number | boolean | null;
  published_at?: string | null;
  created_at?: string | null;
  content?: string | null;
  foreword?: string | null;
  afterword?: string | null;
  bodyWithheld?: boolean | null;
  revealTicket?: string | null;
  revealKey?: string | null;
};

type ApiChapterBySlug = {
  id: number | string;
};

type ApiRevealResponse = {
  content?: string | null;
  foreword?: string | null;
  afterword?: string | null;
};

const PAGE_SIZE = 24;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8;
  const padLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < padLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 =
        rotr32(w[j - 15], 7) ^ rotr32(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 =
        rotr32(w[j - 2], 17) ^ rotr32(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let j = 0; j < 64; j++) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[j] + w[j]) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function asciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function hmacSha256Hex(keyStr: string, msgStr: string): string {
  let keyBytes = asciiBytes(keyStr);
  if (keyBytes.length > 64) {
    keyBytes = sha256Bytes(keyBytes);
  }
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const b = i < keyBytes.length ? keyBytes[i] : 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  const msgBytes = asciiBytes(msgStr);
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(ipad);
  inner.set(msgBytes, 64);
  const innerHash = sha256Bytes(inner);

  const outer = new Uint8Array(64 + 32);
  outer.set(opad);
  outer.set(innerHash, 64);
  const digest = sha256Bytes(outer);

  let hex = '';
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64UrlAscii(input: string): string {
  const clean = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = BASE64_CHARS.indexOf(clean.charAt(i));
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >>> bits) & 0xff);
    }
  }
  return out;
}

function extractTicketJti(ticket: string): string | null {
  try {
    const parts = ticket.split('.');
    if (parts.length < 2 || !parts[1]) return null;
    const payload = JSON.parse(decodeBase64UrlAscii(parts[1])) as {
      jti?: unknown;
    };
    return typeof payload.jti === 'string' && payload.jti ? payload.jti : null;
  } catch {
    return null;
  }
}

const BLOCK_TAG_RE =
  /<(p|div|ul|ol|li|h[1-6]|blockquote|table|pre|figure|section|article|hr)[\s>/]/i;

function wrapPlainParagraphs(raw: string): string {
  if (!raw) return '';
  const blocks = raw
    .split(/\r?\n\s*\r?\n/)
    .map(part => part.trim())
    .filter(Boolean);
  if (blocks.length < 2) {
    return BLOCK_TAG_RE.test(raw)
      ? raw
      : `<p>${raw.replace(/\r?\n/g, '<br />')}</p>`;
  }
  return blocks
    .map(part =>
      BLOCK_TAG_RE.test(part)
        ? part
        : `<p>${part.replace(/\r?\n/g, '<br />')}</p>`,
    )
    .join('\n');
}

function cleanChapterHtml(raw: string): string {
  if (!raw) return '';
  const dewatermarked = raw
    .replace(/[\uFE00-\uFE0F\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\u00A0/g, ' ');

  const wrapped = wrapPlainParagraphs(dewatermarked);
  const loadedCheerio = loadCheerio(wrapped, null, false);

  loadedCheerio('script, style, iframe, ruby').remove();

  loadedCheerio('[data-fcnc-rev="1"]').each((_, el) => {
    const text = loadedCheerio(el).text().trim();
    if (text) {
      loadedCheerio(el).replaceWith([...text].reverse().join(''));
    }
  });

  loadedCheerio('span').each((_, el) => {
    const span = loadedCheerio(el);
    if (!span.text().trim() && span.find('img').length === 0) {
      span.remove();
    }
  });

  loadedCheerio('[class]').each((_, el) => {
    const node = loadedCheerio(el);
    const cls = (node.attr('class') || '')
      .split(/\s+/)
      .filter(c => c && !/^tx-[a-z2-7]+$/i.test(c))
      .join(' ');
    if (cls) {
      node.attr('class', cls);
    } else {
      node.removeAttr('class');
    }
  });

  loadedCheerio('p').each((_, el) => {
    const p = loadedCheerio(el);
    if (!p.text().trim() && p.find('img, hr').length === 0) {
      p.remove();
    }
  });

  return loadedCheerio.html().trim();
}

function cleanSummaryHtml(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.replace(/<!--[\s\S]*?-->/g, '');
  const loadedCheerio = loadCheerio(`<div>${cleaned}</div>`);
  loadedCheerio('p').after('\n\n');
  loadedCheerio('br').after('\n');
  return loadedCheerio('div')
    .text()
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapStatus(status?: string | null): string {
  switch ((status || '').toLowerCase().trim()) {
    case 'ongoing':
      return NovelStatus.Ongoing;
    case 'completed':
    case 'oneshot':
      return NovelStatus.Completed;
    case 'hiatus':
      return NovelStatus.OnHiatus;
    case 'dropped':
    case 'cancelled':
    case 'canceled':
      return NovelStatus.Cancelled;
    default:
      return NovelStatus.Unknown;
  }
}

function normalizePath(path: string): string {
  return path.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
}

function resolveCover(series: ApiSeries): string {
  return series.cover_image_url || series.cover_thumb_url || defaultCover;
}

class CherryMistCafePlugin implements Plugin.PluginBase {
  id = 'cherrymistcafe';
  name = 'Cherry Mist Cafe';
  icon = 'src/en/cherrymistcafe/icon.png';
  site = 'https://cherrymist.cafe/';
  version = '2.0.0';

  private apiBase = 'https://cherrymist.cafe/api';
  private chapterIds: Record<string, string> = {};
  private catalogueCache: Promise<ApiSeries[]> | null = null;

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: 'popular',
      options: [
        { label: 'Popularity', value: 'popular' },
        { label: 'Latest Update', value: 'latest' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Genre',
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'Action', value: 'Action' },
        { label: 'BG', value: 'BG' },
        { label: 'BL', value: 'BL' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Modern', value: 'Modern' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Rofan', value: 'Rofan' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Slice of Life', value: 'Slice of Life' },
      ],
    },
  } satisfies Filters;

  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      'Referer': this.site,
      'X-CM-Reader': '1',
      ...extra,
    };
  }

  private async requestJson<T>(
    endpoint: string,
    init?: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const url = `${this.apiBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetchApi(url, {
      method: init?.method || 'GET',
      body: init?.body,
      headers: this.getHeaders(init?.headers),
    });

    if (!res.ok) {
      const err = new Error(
        `Cherry Mist Cafe API ${endpoint} failed with status ${res.status}`,
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    return (await res.json()) as T;
  }

  private toNovelItem(series: ApiSeries): Plugin.NovelItem {
    const slug = series.slug || String(series.id);
    return {
      name: series.title,
      path: `story/${slug}`,
      cover: resolveCover(series),
    };
  }

  private extractSeriesRows(data: ApiSeriesListResponse): ApiSeries[] {
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.rows) ? data.rows : [];
  }

  private async fetchSeriesPage(
    pageNo: number,
    extraQuery = '',
  ): Promise<Plugin.NovelItem[]> {
    const data = await this.requestJson<ApiSeriesListResponse>(
      `/series?page=${pageNo}&limit=${PAGE_SIZE}${extraQuery}`,
    );
    return this.extractSeriesRows(data).map(item => this.toNovelItem(item));
  }

  private getCatalogue(): Promise<ApiSeries[]> {
    if (!this.catalogueCache) {
      this.catalogueCache = this.requestJson<ApiSeriesListResponse>('/series')
        .then(data => this.extractSeriesRows(data))
        .catch(err => {
          this.catalogueCache = null;
          throw err;
        });
    }
    return this.catalogueCache;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const genre = filters?.genre?.value || '';
    const status = (filters?.status?.value || '').toLowerCase();
    const sort = showLatestNovels
      ? 'latest'
      : filters?.sort?.value || 'popular';

    if (!genre && !status) {
      return this.fetchSeriesPage(
        pageNo,
        sort === 'popular' ? '&sort=popular' : '',
      );
    }

    const allSeries = await this.getCatalogue();
    const genreLower = genre.toLowerCase();
    const filtered = allSeries.filter(item => {
      if (
        status &&
        (item.story_status || item.status || '').toLowerCase() !== status
      ) {
        return false;
      }
      if (genreLower) {
        const allTags = [...(item.genres || []), ...(item.tags || [])].map(t =>
          t.toLowerCase(),
        );
        if (!allTags.includes(genreLower)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'latest') {
        const timeA = new Date(
          a.last_release_at || a.updated_at || 0,
        ).getTime();
        const timeB = new Date(
          b.last_release_at || b.updated_at || 0,
        ).getTime();
        return timeB - timeA;
      }
      const popA = (a.library_count || 0) + (a.tracking_count || 0);
      const popB = (b.library_count || 0) + (b.tracking_count || 0);
      return popB - popA;
    });

    const start = (pageNo - 1) * PAGE_SIZE;
    return sorted
      .slice(start, start + PAGE_SIZE)
      .map(item => this.toNovelItem(item));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = encodeURIComponent(searchTerm.trim());
    return this.fetchSeriesPage(pageNo, `&q=${query}`);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = normalizePath(novelPath).replace(/^story\//i, '');

    const series = await this.requestJson<ApiSeries>(
      `/series/${encodeURIComponent(slug)}`,
    );

    const genresList: string[] = [];
    for (const g of [...(series.genres || []), ...(series.tags || [])]) {
      const trimmed = g.trim();
      if (trimmed && !genresList.includes(trimmed)) {
        genresList.push(trimmed);
      }
    }

    const rawChapters = await this.requestJson<ApiChapter[]>(
      `/chapters?series_id=${encodeURIComponent(String(series.id))}`,
    );

    const seriesSlug = series.slug || String(series.id);
    const seriesPasswordLocked = Boolean(series.chapters_locked);
    const chapters: Plugin.ChapterItem[] = [];

    for (const ch of rawChapters || []) {
      if (ch.status !== 'published') continue;
      if (ch.price_type && ch.price_type !== 'free') continue;
      if (ch.has_access_password) continue;
      if (ch.is_locked && seriesPasswordLocked) continue;

      const chId = String(ch.id);
      const chSlug = ch.slug ? String(ch.slug).trim() : '';

      const rawNum = Number(ch.chapter_number);
      const chapterNumber =
        ch.chapter_number != null && Number.isFinite(rawNum) && rawNum >= 0
          ? rawNum
          : chapters.length + 1;

      const path = chSlug
        ? `chapter/${chSlug}`
        : `story/${seriesSlug}/chapter/${chapterNumber}`;

      this.chapterIds[path] = chId;
      if (chSlug) {
        this.chapterIds[chSlug] = chId;
      }

      chapters.push({
        name: (ch.title || '').trim() || `Chapter ${chapterNumber}`,
        path,
        releaseTime: ch.published_at || ch.created_at || null,
        chapterNumber,
      });
    }

    return {
      path: novelPath,
      name: series.title,
      cover: resolveCover(series),
      author:
        series.original_author ||
        series.author_name ||
        series.translator?.name ||
        series.translator_name ||
        undefined,
      status: mapStatus(series.story_status || series.status),
      genres: genresList.length ? genresList.join(', ') : undefined,
      summary:
        cleanSummaryHtml(
          series.synopsis || series.description || series.short_synopsis,
        ) || undefined,
      chapters,
    };
  }

  private async resolveChapterId(chapterPath: string): Promise<string> {
    const cleaned = normalizePath(chapterPath);
    if (this.chapterIds[cleaned]) {
      return this.chapterIds[cleaned];
    }

    const storyChapterMatch = cleaned.match(
      /^story\/([^/]+)\/chapter\/([^/]+)$/i,
    );
    if (storyChapterMatch) {
      const [, seriesSlug, chapterKey] = storyChapterMatch;
      const series = await this.requestJson<ApiSeries>(
        `/series/${encodeURIComponent(seriesSlug)}`,
      );
      const chapters = await this.requestJson<ApiChapter[]>(
        `/chapters?series_id=${encodeURIComponent(String(series.id))}`,
      );
      const found = (chapters || []).find(
        c =>
          String(c.chapter_number) === chapterKey ||
          c.slug === chapterKey ||
          String(c.id) === chapterKey,
      );
      if (found) {
        const id = String(found.id);
        this.chapterIds[cleaned] = id;
        return id;
      }
    }

    const slug = cleaned.replace(/^chapter\//i, '');
    if (this.chapterIds[slug]) {
      return this.chapterIds[slug];
    }

    const bySlug = await this.requestJson<ApiChapterBySlug>(
      `/chapters/by-slug/${encodeURIComponent(slug)}`,
    );
    const id = String(bySlug.id);
    this.chapterIds[slug] = id;
    return id;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId = await this.resolveChapterId(chapterPath);
    const chapter = await this.requestJson<ApiChapter>(
      `/chapters/${encodeURIComponent(chapterId)}`,
    );

    let rawContent = chapter.content || '';
    let rawForeword = chapter.foreword || '';
    let rawAfterword = chapter.afterword || '';

    if (
      (chapter.bodyWithheld || !rawContent.trim()) &&
      chapter.revealTicket &&
      chapter.revealKey
    ) {
      const jti = extractTicketJti(chapter.revealTicket);
      const proof = jti
        ? hmacSha256Hex(
            chapter.revealKey,
            `chapter-reveal.v2.${chapterId}.${jti}`,
          )
        : undefined;

      const payload: Record<string, unknown> = {
        ticket: chapter.revealTicket,
        frames: 25,
        elapsedMs: 650,
        visible: true,
        focused: true,
      };
      if (proof) {
        payload.proof = proof;
        payload.proofScheme = 'v2';
      }

      const revealed = await this.requestJson<ApiRevealResponse>(
        `/chapters/${encodeURIComponent(chapterId)}/reveal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      rawContent = revealed.content || rawContent;
      rawForeword = revealed.foreword || rawForeword;
      rawAfterword = revealed.afterword || rawAfterword;
    }

    const parts: string[] = [];
    const forewordHtml = cleanChapterHtml(rawForeword);
    const contentHtml = cleanChapterHtml(rawContent);
    const afterwordHtml = cleanChapterHtml(rawAfterword);

    if (forewordHtml) parts.push(forewordHtml);
    if (contentHtml) parts.push(contentHtml);
    if (afterwordHtml) parts.push(afterwordHtml);

    return parts.join('<hr />');
  }

  resolveUrl = (path: string) => this.site + normalizePath(path);
}

export default new CherryMistCafePlugin();
