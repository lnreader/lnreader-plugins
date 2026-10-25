import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';
import { gcm } from '@libs/aes';

const CONTENT_SALT_V1 = 'fr-content-v1';
const FRAG_SALT_V1 = 'fr-frag-v1';
const CONTENT_SALT_V2 = 'fr-content-v2';
const FRAG_SALT_V2 = 'fr-frag-v2';
const AES_GCM_IV_LENGTH = 12;
const AES_GCM_TAG_LENGTH = 16;

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

function sha256Bytes(input: string): Uint8Array {
  const bytes = new TextEncoder().encode(input);
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
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[j] + w[j]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

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

function xorshift128Next(state: Uint32Array): number {
  const t = state[0];
  let r = (t ^ (t << 11)) >>> 0;
  r = (r ^ (r >>> 8)) >>> 0;
  const o = state[3];
  state[0] = state[1];
  state[1] = state[2];
  state[2] = o;
  const f = (o ^ (o >>> 19) ^ r) >>> 0;
  state[3] = f;
  return f;
}

function unshuffleFragments(fragments: string[], seedStr: string): string {
  const count = fragments.length;
  if (count < 2) return count === 1 ? fragments[0] : '';
  const digest = sha256Bytes(seedStr);
  const view = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength,
  );
  const state = new Uint32Array([
    view.getUint32(0, true),
    view.getUint32(4, true),
    view.getUint32(8, true),
    view.getUint32(12, true),
  ]);
  const perm = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    perm[i] = i;
  }
  for (let i = count - 1; i > 0; i--) {
    const j = xorshift128Next(state) % (i + 1);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  const restored = new Array<string>(count);
  for (let i = 0; i < count; i++) {
    restored[perm[i]] = fragments[i];
  }
  return restored.join('');
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

type ReadTokenPayload = {
  vid: string;
  cid: number | null;
  exp: number | null;
};

function parseReadTokenPayload(token: string): ReadTokenPayload {
  try {
    const payloadPart = token.split('.')[0] ?? '';
    if (!payloadPart) return { vid: '', cid: null, exp: null };
    const b64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded = new TextDecoder().decode(decodeBase64Bytes(padded));
    const parsed = JSON.parse(decoded);
    return {
      vid: typeof parsed?.vid === 'string' ? parsed.vid : '',
      cid:
        typeof parsed?.cid === 'number' && parsed.cid > 0 ? parsed.cid : null,
      exp:
        typeof parsed?.exp === 'number' && parsed.exp > 0 ? parsed.exp : null,
    };
  } catch {
    return { vid: '', cid: null, exp: null };
  }
}

function extractVidFromReadToken(token: string): string {
  return parseReadTokenPayload(token).vid;
}

type APINovel = {
  title: string;
  slug: string;
  cover: string;
  description: string;
  status: string;
  genres: { name: string }[];
  user?: {
    username?: string;
    name?: string;
  };
};

type APIChapter = {
  id: number;
  uuid?: string | null;
  locked: { price: number } | null;
  group: null | {
    index: number;
    slug: string;
  };
  title: string;
  slug: string;
  number: number;
  created_at: string;
};

type APIChapterData = {
  id: number;
  uuid?: string | null;
  slug?: string;
  name?: string;
  content: string | string[];
  content_format?: 'locked' | 'encrypted' | 'html' | 'text' | 'json' | null;
  content_scheme?: 'fragmented-v2' | 'fragmented-v1' | string | null;
  remint_chapter_id?: number | null;
  remint_chapter_uuid?: string | null;
  locked?: {
    price: number;
    unlocked_at?: string | null;
    is_read_only?: boolean;
  } | null;
  bought?: {
    wallet_type?: string | null;
    amount?: number;
    bought_at?: string | null;
  } | null;
  bypass?: boolean;
};

type CachedReadToken = {
  value: string;
  expiresAt: number;
  cid: number | null;
};

type ChapterInfo = {
  name: string;
  path: string;
  releaseTime: string;
  chapterNumber: number;
};

type Chapter = {
  type: string;
  content: {
    type: string;
    attrs?: Attrs;
    content: {
      type: string;
      text?: string;
      marks?: {
        type: string;
        attrs?: Attrs;
      }[];
    }[];
  }[];
};

type Attrs = {
  textAlign?: string;
  href?: string;
  level?: number;
};

type Nodes = {
  type: string;
  nodes?: {
    type: string;
    // couldnt find the sveltekit so disable eslint here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
  }[];
};

class FenrirRealmPlugin implements Plugin.PluginBase {
  id = 'fenrir';
  name = 'Fenrir Realm';
  icon = 'src/en/fenrirrealm/icon.png';
  site = 'https://fenrirealm.com';
  version = '1.1.4';
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  private cachedReadToken: CachedReadToken | null = null;

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  private setCachedReadToken(
    token: string,
    expiresAt?: number | null,
    cid?: number | null,
  ): void {
    if (!token) return;
    const parsed = parseReadTokenPayload(token);
    const resolvedExp =
      typeof expiresAt === 'number' && expiresAt > 0
        ? expiresAt
        : parsed.exp !== null
          ? parsed.exp
          : Math.floor(Date.now() / 1000) + 300;
    const resolvedCid =
      parsed.cid !== null
        ? parsed.cid
        : typeof cid === 'number' && cid > 0
          ? cid
          : null;
    this.cachedReadToken = {
      value: token,
      expiresAt: resolvedExp,
      cid: resolvedCid,
    };
  }

  private getActiveTokenValue(): string | null {
    if (!this.cachedReadToken) return null;
    if (this.cachedReadToken.expiresAt * 1000 - Date.now() < 5000) {
      this.cachedReadToken = null;
      return null;
    }
    return this.cachedReadToken.value;
  }

  private getCachedReadToken(chapterId?: number | null): string | null {
    const value = this.getActiveTokenValue();
    if (!value || !this.cachedReadToken) return null;
    if (
      chapterId != null &&
      this.cachedReadToken.cid !== null &&
      this.cachedReadToken.cid !== chapterId
    ) {
      return null;
    }
    return value;
  }

  private captureReadTokenHeader(res: Response, cid?: number | null): void {
    const issued = res.headers?.get?.('x-read-token-issued');
    if (!issued) return;
    const expHeader = res.headers?.get?.('x-read-token-expires-at');
    const parsedExp = expHeader ? parseInt(expHeader, 10) : NaN;
    this.setCachedReadToken(
      issued,
      Number.isFinite(parsedExp) ? parsedExp : null,
      cid,
    );
  }

  private resolveRemintTarget(
    data: APIChapterData,
    fallbackId?: string,
  ): string | number | null {
    return (
      data.remint_chapter_uuid ||
      data.remint_chapter_id ||
      data.uuid ||
      data.id ||
      fallbackId ||
      null
    );
  }

  private buildChapterHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Accepts-Encrypted-Content': '3',
    };
    const activeToken = this.getActiveTokenValue();
    if (activeToken) {
      headers['Cookie'] = `fr_read=${activeToken}`;
    }
    return headers;
  }

  private async mintReadToken(
    chapterTarget?: string | number | null,
    cid?: number | null,
  ): Promise<boolean> {
    try {
      const payload: Record<string, string> = {};
      if (
        chapterTarget !== null &&
        chapterTarget !== undefined &&
        chapterTarget !== ''
      ) {
        payload.chapter_id = String(chapterTarget);
      }
      const requestMint = async (cookieToken: string | null) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (cookieToken) {
          headers['Cookie'] = `fr_read=${cookieToken}`;
        }
        const res = await fetchApi(`${this.site}/api/read-token`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.active &&
          typeof data.token === 'string' &&
          data.token !== ''
          ? data
          : null;
      };

      const activeToken = this.getActiveTokenValue();
      let data = await requestMint(activeToken);
      if (!data && activeToken) {
        this.cachedReadToken = null;
        data = await requestMint(null);
      }
      if (data) {
        const numericId =
          typeof cid === 'number' && cid > 0
            ? cid
            : typeof chapterTarget === 'number'
              ? chapterTarget
              : null;
        this.setCachedReadToken(data.token, data.expires_at, numericId);
        return true;
      }
      this.cachedReadToken = null;
      return false;
    } catch {
      return false;
    }
  }

  private async getReadToken(
    chapterId?: number | null,
  ): Promise<string | null> {
    const cached = this.getCachedReadToken(chapterId);
    if (cached !== null) return cached;
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      const activeToken = this.getActiveTokenValue();
      if (activeToken) {
        headers['Cookie'] = `fr_read=${activeToken}`;
      }
      const res = await fetchApi(`${this.site}/api/read-token`, {
        method: 'GET',
        headers,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.active && typeof data.token === 'string' && data.token !== '') {
        this.setCachedReadToken(
          data.token,
          typeof data.expires_at === 'number' ? data.expires_at : null,
          chapterId ?? null,
        );
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }

  private decryptWithToken(
    chapterData: APIChapterData,
    token: string,
  ): string | null {
    try {
      const isV2 = chapterData.content_scheme === 'fragmented-v2';
      const vid = isV2 ? extractVidFromReadToken(token) : '';
      const b64Cipher = Array.isArray(chapterData.content)
        ? unshuffleFragments(
            chapterData.content,
            isV2
              ? `${token}:${vid}:${chapterData.id}:${FRAG_SALT_V2}`
              : `${token}:${chapterData.id}:${FRAG_SALT_V1}`,
          )
        : typeof chapterData.content === 'string'
          ? chapterData.content
          : '';
      if (!b64Cipher) return null;

      const raw = decodeBase64Bytes(b64Cipher);
      if (raw.length <= AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH) return null;

      const keySeed =
        isV2 && vid !== ''
          ? `${token}:${vid}:${chapterData.id}:${CONTENT_SALT_V2}`
          : `${token}:${chapterData.id}:${CONTENT_SALT_V1}`;
      const keyBytes = sha256Bytes(keySeed);
      const iv = raw.slice(0, AES_GCM_IV_LENGTH);
      const ciphertextWithTag = raw.slice(AES_GCM_IV_LENGTH);
      const decrypted = gcm(keyBytes, iv).decrypt(ciphertextWithTag);
      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  }

  private formatChapterContent(content: string): string {
    try {
      // Attempt 1: Handle legacy stringified TipTap JSON AST schema
      const parsedContent: Chapter = JSON.parse(content);
      if (
        parsedContent.type === 'doc' ||
        parsedContent.type === 'systemWindow'
      ) {
        return parsedContent.content
          .map(node => {
            if (node.type === 'paragraph') {
              const innerHtml =
                node.content
                  ?.map(c => {
                    if (c.type === 'text') {
                      let text = c.text;
                      if (c.marks) {
                        for (const mark of c.marks) {
                          if (mark.type === 'bold') text = `<b>${text}</b>`;
                          if (mark.type === 'italic') text = `<i>${text}</i>`;
                          if (mark.type === 'underline')
                            text = `<u>${text}</u>`;
                          if (mark.type === 'strike')
                            text = `<strike>${text}</strike>`;
                          if (mark.type === 'link')
                            text = `<a href="${mark.attrs?.href}">${text}</a>`;
                        }
                      }
                      return text;
                    }
                    if (c.type === 'hardBreak') return '<br>';
                    return '';
                  })
                  .join('') || '';
              return `<p>${innerHtml}</p>`;
            }
            if (node.type === 'heading') {
              const level = node.attrs?.level || 1;
              const innerHtml = node.content?.map(c => c.text).join('') || '';
              return `<h${level}>${innerHtml}</h${level}>`;
            }
            return '';
          })
          .join('\n')
          .replace(/[\u200B-\u200D\uFEFF]/g, '');
      }
    } catch {
      // Fall through to HTML cleaner
    }

    /**
     * HTML Response Cleaner:
     * Fenrir Realm inserts anti-scraping & watermark elements:
     * 1. Scramble hidden divs (`[aria-hidden="true"]`)
     * 2. Inline `<style>` blocks
     * 3. Reader attributions / Copy references (`.reader-attribution`, `[data-fr-attr]`)
     * 4. Zero-width characters (`\u200B-\u200D\uFEFF`)
     */
    const $ = loadCheerio(content);

    $('[aria-hidden="true"]').remove();
    $('.reader-attribution').remove();
    $('[data-fr-attr]').remove();
    $('style, script').remove();

    $('p, div, span, small').each((_, el) => {
      const text = $(el).text().trim();
      if (text.startsWith('Copy reference:') || text.startsWith('Bookmark:')) {
        $(el).remove();
      }
    });

    const cleanedHtml = $.html() || content;
    return cleanedHtml.replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: pageNo.toString(),
      per_page: '20',
      sort: showLatestNovels ? 'latest' : filters.sort.value,
    });
    if (filters.status.value) {
      params.append('statuses[]', filters.status.value);
    }
    filters.genres.value.forEach(g => params.append('genres[]', g));

    const res = await fetchApi(
      `${this.site}/api/new/v2/series?${params.toString()}`,
    ).then(r =>
      r.json().catch(() => {
        throw new Error(
          'There was an error fetching the data from the server. Please try to open it in WebView',
        );
      }),
    );

    return (res.data || []).map((r: APINovel) => this.parseNovelFromApi(r));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let cleanNovelPath = novelPath;
    let apiRes = await fetchApi(
      `${this.site}/api/new/v2/series/${novelPath}/chapters`,
      {},
    );

    if (!apiRes.ok) {
      const slugMatch = novelPath.match(/^\d+-(.+)$/);
      const searchSlug = slugMatch ? slugMatch[1] : novelPath;
      apiRes = await fetchApi(
        `${this.site}/api/new/v2/series/${searchSlug}/chapters`,
        {},
      );
      cleanNovelPath = searchSlug;

      if (!apiRes.ok) {
        const words = searchSlug.replace(/-/g, ' ').split(' ');
        const SearchStr = words.find(w => w.length > 3) || words[0];
        const searchRes = await fetchApi(
          `${this.site}/api/series/filter?page=1&per_page=20&search=${encodeURIComponent(SearchStr)}`,
        ).then(r => r.json());

        if (searchRes.data && searchRes.data.length > 0) {
          cleanNovelPath = searchRes.data[0].slug;
          apiRes = await fetchApi(
            `${this.site}/api/new/v2/series/${cleanNovelPath}/chapters`,
            {},
          );
        }
      }

      if (!apiRes.ok) {
        throw new Error(
          'Novel not found. It may have been removed or its URL changed significantly.',
        );
      }
    }

    const seriesData: APINovel = await fetchApi(
      `${this.site}/api/new/v2/series/${cleanNovelPath}`,
    ).then(r => r.json());
    const summaryCheerio = loadCheerio(seriesData.description || '');

    const novel: Plugin.SourceNovel = {
      path: cleanNovelPath,
      name: seriesData.title || '',
      summary:
        summaryCheerio('p').length > 0
          ? summaryCheerio('p')
              .map((_, el) => loadCheerio(el).text())
              .get()
              .join('\n\n')
          : summaryCheerio.text() || '',
      author: seriesData.user?.name || seriesData.user?.username || '',
      cover: seriesData.cover
        ? this.site + '/' + seriesData.cover
        : defaultCover,
      genres: (seriesData.genres || []).map(g => g.name).join(','),
      status: seriesData.status || 'Unknown',
    };

    let chapters = await apiRes.json();

    if (this.hideLocked) {
      chapters = chapters.filter((c: APIChapter) => !c.locked?.price);
    }

    novel.chapters = chapters
      .map((c: APIChapter) => ({
        name:
          (c.locked?.price ? '🔒 ' : '') +
          (c.group?.index == null ? '' : 'Vol ' + c.group?.index + ' ') +
          'Chapter ' +
          c.number +
          (c.title && c.title.trim() != 'Chapter ' + c.number
            ? ' - ' + c.title.replace(/^chapter [0-9]+ . /i, '')
            : ''),
        path:
          cleanNovelPath +
          (c.group?.index == null ? '' : '/' + c.group?.slug) +
          '/' +
          (c.slug || 'chapter-' + c.number) +
          '~~' +
          c.id,
        releaseTime: c.created_at,
        chapterNumber: c.number + (c.group?.index || 0) * 10000,
      }))
      .sort(
        (a: ChapterInfo, b: ChapterInfo) => a.chapterNumber - b.chapterNumber,
      );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [slugPath, chapterId] = chapterPath.split('~~');
    const apiUrl = chapterId
      ? `${this.site}/api/new/v2/chapters/${chapterId}`
      : `${this.site}/api/new/v2/series/${slugPath}`;
    const parsedCid = chapterId ? parseInt(chapterId, 10) : NaN;
    const initialCid = Number.isFinite(parsedCid) ? parsedCid : null;

    if (this.getCachedReadToken(initialCid) === null) {
      await this.mintReadToken(chapterId || null, initialCid);
    }

    let res = await fetchApi(apiUrl, { headers: this.buildChapterHeaders() });

    if (res.status === 429) {
      throw new Error(
        'Rate limited by Fenrir Realm (Too Many Attempts). Please wait a moment before loading more chapters.',
      );
    }

    this.captureReadTokenHeader(res, initialCid);

    if (res.status === 403) {
      const minted = await this.mintReadToken(chapterId || null, initialCid);
      if (minted) {
        res = await fetchApi(apiUrl, { headers: this.buildChapterHeaders() });
        if (res.status === 429) {
          throw new Error(
            'Rate limited by Fenrir Realm (Too Many Attempts). Please wait a moment before loading more chapters.',
          );
        }
        this.captureReadTokenHeader(res, initialCid);
      }
    }

    if (res.ok) {
      let json: APIChapterData = await res.json();
      this.captureReadTokenHeader(res, json.id);

      if (json.content_format === 'locked') {
        if (
          json.locked?.price &&
          json.locked.price > 0 &&
          !json.bought?.bought_at &&
          !json.bypass
        ) {
          throw new Error(
            'This chapter is locked (paid). Please unlock it on Fenrir Realm first.',
          );
        }

        const remintTarget = this.resolveRemintTarget(json, chapterId);
        const remintCid = json.remint_chapter_id || json.id || initialCid;

        const minted = await this.mintReadToken(remintTarget, remintCid);
        if (minted) {
          const retryRes = await fetchApi(apiUrl, {
            headers: this.buildChapterHeaders(),
          });
          if (retryRes.status === 429) {
            throw new Error(
              'Rate limited by Fenrir Realm (Too Many Attempts). Please wait a moment before loading more chapters.',
            );
          }
          if (retryRes.ok) {
            json = await retryRes.json();
            this.captureReadTokenHeader(retryRes, json.id);
          }
        }
      }

      if (json.content_format === 'encrypted') {
        const token = await this.getReadToken(json.id);
        let decrypted = token ? this.decryptWithToken(json, token) : null;

        if (!decrypted) {
          const remintTarget = this.resolveRemintTarget(json, chapterId);
          if (await this.mintReadToken(remintTarget, json.id)) {
            const retryRes = await fetchApi(apiUrl, {
              headers: this.buildChapterHeaders(),
            });
            if (retryRes.status === 429) {
              throw new Error(
                'Rate limited by Fenrir Realm (Too Many Attempts). Please wait a moment before loading more chapters.',
              );
            }
            if (retryRes.ok) {
              const retryJson: APIChapterData = await retryRes.json();
              this.captureReadTokenHeader(retryRes, retryJson.id);
              if (retryJson.content_format === 'encrypted') {
                const freshToken = await this.getReadToken(retryJson.id);
                decrypted = freshToken
                  ? this.decryptWithToken(retryJson, freshToken)
                  : null;
              } else if (
                retryJson.content_format !== 'locked' &&
                typeof retryJson.content === 'string' &&
                retryJson.content
              ) {
                decrypted = retryJson.content;
              }
            }
          }
        }

        if (decrypted) {
          return this.formatChapterContent(decrypted);
        }
        json = { ...json, content: '', content_format: 'locked' };
      }

      if (json.content_format === 'locked') {
        this.cachedReadToken = null;
        throw new Error(
          'Chapter is protected by Cloudflare Turnstile. Please open this chapter in WebView to verify and try again.',
        );
      }

      if (typeof json.content === 'string' && json.content) {
        return this.formatChapterContent(json.content);
      }
    }

    // Fallback or old method
    const url = `${this.site}/series/${slugPath}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = loadCheerio(body);

    // Clean up anti-scraping and watermark elements first
    loadedCheerio('[aria-hidden="true"]').remove();
    loadedCheerio('.reader-attribution').remove();
    loadedCheerio('[data-fr-attr]').remove();

    const chapterText = loadedCheerio(
      '.reader-area p, div.content-area p, [id^="reader-area"] p',
    )
      .map((_, el) => {
        const html = loadedCheerio(el).html()?.trim();
        return html ? `<p>${html}</p>` : '';
      })
      .get()
      .filter(Boolean)
      .join('\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');

    if (chapterText) {
      return chapterText;
    }

    // Fallback to SvelteKit JSON if HTML parsing fails or is empty
    try {
      const jsonUrl = `${this.site}/series/${slugPath}/__data.json?x-sveltekit-invalidated=001`;
      const jsonRes = await fetchApi(jsonUrl);
      const json: Nodes = await jsonRes.json();

      const nodes = json.nodes;
      const data = nodes?.find(n => n.type === 'data')?.data;
      if (data) {
        const contentStr = data.find(
          d => typeof d === 'string' && d.includes('{"type":"doc"'),
        );

        if (contentStr) {
          return this.formatChapterContent(contentStr);
        }
      }
    } catch {
      // ignore
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(
      searchTerm,
    )}`;
    let res = await fetchApi(url).then(r => r.json());

    if (pageNo === 1 && (!res.data || res.data.length === 0)) {
      const words = searchTerm.split(' ');
      const fallbackTerm = words.find(w => w.length > 3) || words[0];
      if (fallbackTerm && fallbackTerm !== searchTerm) {
        url = `${this.site}/api/series/filter?page=${pageNo}&per_page=20&search=${encodeURIComponent(
          fallbackTerm,
        )}`;
        res = await fetchApi(url).then(r => r.json());
      }
    }

    return (res.data || []).map((novel: APINovel) =>
      this.parseNovelFromApi(novel),
    );
  }

  parseNovelFromApi(apiData: APINovel) {
    return {
      name: apiData.title,
      path: apiData.slug,
      cover: this.site + '/' + apiData.cover,
      summary: apiData.description,
      status: apiData.status,
      genres: apiData.genres.map(g => g.name).join(','),
    };
  }

  resolveUrl(path: string): string {
    return `${this.site}/series/${path.split('~~')[0]}`;
  }

  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'on-going' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Dropped', value: 'dropped' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Latest', value: 'latest' },
        { label: 'Updated', value: 'updated' },
      ],
    },
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres',
      value: [],
      options: [
        { 'label': 'Action', 'value': '1' },
        { 'label': 'Adult', 'value': '2' },
        {
          'label': 'Adventure',
          'value': '3',
        },
        { 'label': 'Comedy', 'value': '4' },
        { 'label': 'Drama', 'value': '5' },
        {
          'label': 'Ecchi',
          'value': '6',
        },
        { 'label': 'Fantasy', 'value': '7' },
        { 'label': 'Gender Bender', 'value': '8' },
        {
          'label': 'Harem',
          'value': '9',
        },
        { 'label': 'Historical', 'value': '10' },
        { 'label': 'Horror', 'value': '11' },
        {
          'label': 'Josei',
          'value': '12',
        },
        { 'label': 'Martial Arts', 'value': '13' },
        { 'label': 'Mature', 'value': '14' },
        {
          'label': 'Mecha',
          'value': '15',
        },
        { 'label': 'Mystery', 'value': '16' },
        { 'label': 'Psychological', 'value': '17' },
        {
          'label': 'Romance',
          'value': '18',
        },
        { 'label': 'School Life', 'value': '19' },
        { 'label': 'Sci-fi', 'value': '20' },
        {
          'label': 'Seinen',
          'value': '21',
        },
        { 'label': 'Shoujo', 'value': '22' },
        { 'label': 'Shoujo Ai', 'value': '23' },
        {
          'label': 'Shounen',
          'value': '24',
        },
        { 'label': 'Shounen Ai', 'value': '25' },
        { 'label': 'Slice of Life', 'value': '26' },
        {
          'label': 'Smut',
          'value': '27',
        },
        { 'label': 'Sports', 'value': '28' },
        { 'label': 'Supernatural', 'value': '29' },
        {
          'label': 'Tragedy',
          'value': '30',
        },
        { 'label': 'Wuxia', 'value': '31' },
        { 'label': 'Xianxia', 'value': '32' },
        {
          'label': 'Xuanhuan',
          'value': '33',
        },
        { 'label': 'Yaoi', 'value': '34' },
        { 'label': 'Yuri', 'value': '35' },
      ],
    },
  } satisfies Filters;
}

export default new FenrirRealmPlugin();
