# Google Drive plugin: worker setup

The Google Drive plugin (`src/jp/googledrive`) does not talk to Google directly. It talks to a small Cloudflare Worker (`worker.js`) that you host yourself. The worker logs in to **your** Google Drive, lists your EPUB/PDF files, reads EPUBs, and returns chapters as HTML.

```
LNReader app  ->  your Worker (worker.js)  ->  Google Drive API
```

Everything is free-tier friendly and only you can use it (protected by an access key).

## What you need

- A Google account (the one that owns the books)
- A free Cloudflare account
- Node.js 18+ (only if you deploy with Wrangler)

---

## 1. Get the Google Client ID and Client Secret

1. Open <https://console.cloud.google.com/> and sign in.
2. Top bar → project picker → **New project**. Name it (e.g. `lnreader-drive`) → **Create**, then select it.
3. **Enable the Drive API**: menu → **APIs & Services** → **Library** → search **Google Drive API** → **Enable**.
4. **Configure the consent screen**: **APIs & Services** → **OAuth consent screen** (newer UI: **Google Auth Platform** → **Branding / Audience**).
   - User type: **External**.
   - Fill in app name, support email, developer email. Save.
   - **Data access / Scopes**: add `https://www.googleapis.com/auth/drive.readonly`.
   - **Audience**: add your own Google account under **Test users**.
5. **Create the credentials**: **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs** → add:
     ```
     https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev/callback
     ```
     (You will know the exact URL after step 2 below. You can come back and add it.)
   - **Create**. Copy the **Client ID** and **Client secret**.

> **Important: avoid the 7-day logout.**
> While the consent screen is in **Testing** mode, Google expires refresh tokens after **7 days**, and the worker will report `Token refresh failed: invalid_grant`.
> Fix: **OAuth consent screen / Audience** → **Publish app** (set to **In production**). For personal use you do not need Google verification. You will just see an "unverified app" warning on login: **Advanced** → **Go to app (unsafe)**. This is your own app and your own account.

The redirect URI must match **exactly** (https, no trailing slash, path `/callback`). A mismatch gives `redirect_uri_mismatch`.

---

## 2. Deploy the worker

### Option A: Cloudflare dashboard (no tools needed)

1. <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Create Worker**. Name it, **Deploy**.
2. **Edit code** → replace everything with the contents of `worker.js` → **Deploy**.
3. Create the KV store: **Storage & Databases** → **KV** → **Create namespace** → name it `drive-store`.
4. Back in the worker: **Settings** → **Bindings** → **Add** → **KV namespace**
   - Variable name: `STORE` (must be exactly this)
   - Namespace: `drive-store`
5. **Settings** → **Variables and Secrets** → add these (type **Secret**):

   | Name | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | Client ID from step 1 |
   | `GOOGLE_CLIENT_SECRET` | Client secret from step 1 |
   | `ACCESS_KEY` | A long random string you invent (this is your password) |

6. Deploy again. Your worker URL is shown at the top, e.g. `https://drive-reader.yourname.workers.dev`.

### Option B: Wrangler CLI

```bash
npm install -g wrangler
wrangler login
mkdir googledrive-worker && cd googledrive-worker   # put worker.js here
wrangler kv namespace create STORE                  # copy the printed id
```

`wrangler.toml`:

```toml
name = "drive-reader"
main = "worker.js"
compatibility_date = "2024-09-01"

[[kv_namespaces]]
binding = "STORE"
id = "PASTE_KV_ID_HERE"
```

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ACCESS_KEY
wrangler deploy
```

Generate a good access key with: `openssl rand -hex 24`

---

## 3. Add the redirect URI

Go back to Google Cloud → **Credentials** → your OAuth client → add:

```
https://YOUR-WORKER-URL/callback
```

Save. It can take a few minutes to apply.

---

## 4. Log in once

Open this in a browser (replace the values):

```
https://YOUR-WORKER-URL/login?key=YOUR_ACCESS_KEY
```

Pick your Google account, accept the (unverified) warning, grant **read-only** Drive access. You should see **"Logged in. You can close this page."**

The worker stores a refresh token in KV and renews access automatically. You only repeat this if you revoke access or the token expires.

---

## 5. Configure the plugin in LNReader

**Settings → Browse → Google Drive → plugin settings**

- **Worker URL**: `https://YOUR-WORKER-URL` (no trailing slash needed)
- **Access key**: the same `ACCESS_KEY`

Open the plugin. Your EPUB and PDF files appear as novels, and spine items appear as chapters.

---

## How it behaves

| Route | Purpose |
| --- | --- |
| `/login?key=` | Starts Google sign-in (one time) |
| `/callback` | Google redirects here; saves the refresh token |
| `/list?q=&page=` | Lists/searches EPUB and PDF files (first page only, up to 1000 files, sorted by name) |
| `/novel/<fileId>` | Title, author, summary, cover, chapter list from the EPUB |
| `/chapter/<fileId>/<index>` | Chapter HTML with images inlined as base64 |
| `/cover/<fileId>` | Cover image extracted from the EPUB |
| `/file/<fileId>` | Raw file download (used for PDF links) |

All routes except `/login` and `/callback` require `?key=ACCESS_KEY` or an `Authorization: Bearer ACCESS_KEY` header.

- Only files your account can see are listed. Search matches file names.
- EPUBs are cached in Cloudflare's edge cache for 1 hour to speed up chapter loading.
- PDFs show a single "Open PDF" chapter containing a link; they are not converted to text.
- Chapter titles come from the EPUB table of contents; if missing, they are named `Section N`.

---

## Troubleshooting

| Problem | Cause / fix |
| --- | --- |
| `redirect_uri_mismatch` | The URI in Google Cloud must be exactly `https://<worker>/callback` |
| `access_denied` / app blocked | Add your account as a **Test user**, or publish the app |
| `No refresh token: ...` | Remove the app at <https://myaccount.google.com/permissions> and run `/login` again |
| `Not logged in. Open /login?key=...` | Login was never completed, or KV binding `STORE` is missing/misnamed |
| `Token refresh failed: invalid_grant` | Token expired (app still in Testing mode) or access revoked. Publish the app, then log in again |
| `unauthorized` | Access key in the plugin differs from the worker's `ACCESS_KEY` |
| Empty library | Files must be `.epub`/`.pdf`; check you logged in with the account that owns them |
| `Download failed (403/404)` | File not accessible to the logged-in account |

## Security notes

- Keep `ACCESS_KEY` private. Anyone with it and your worker URL can read your Drive files through the worker.
- The scope is **read-only** (`drive.readonly`). The worker cannot modify or delete files.
- Never commit your client secret or access key. Use Worker secrets, not `wrangler.toml`.
- To revoke access: <https://myaccount.google.com/permissions>.

---

## Worker code (`worker.js`)

Copy everything below into your Worker (dashboard: **Edit code**, or save as `worker.js` for Wrangler).

```js
let cachedToken = null;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

const plain = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

function attr(tag, name) {
  const m = tag.match(
    new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"|\\b' + name + "\\s*=\\s*'([^']*)'", 'i'),
  );
  return m ? decodeEntities(m[1] !== undefined ? m[1] : m[2]) : null;
}

function resolvePath(base, href) {
  const clean = safeDecode(href.split('#')[0].split('?')[0]);
  const full = clean.startsWith('/') ? clean.slice(1) : base + clean;
  const out = [];
  for (const part of full.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

function mimeOf(path) {
  const ext = path.split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function readZip(buf) {
  const view = new DataView(buf);
  let eocd = -1;
  const stop = Math.max(0, buf.byteLength - 65557);
  for (let i = buf.byteLength - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid EPUB');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(offset + 10, true);
    const csize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buf, offset + 46, nameLen));
    entries.set(name, { method, csize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { buf, view, entries };
}

async function readEntry(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const nameLen = zip.view.getUint16(entry.localOffset + 26, true);
  const extraLen = zip.view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const data = new Uint8Array(zip.buf, start, entry.csize);
  if (entry.method === 0) return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readText(zip, name) {
  const data = await readEntry(zip, name);
  return data ? new TextDecoder().decode(data) : null;
}

async function accessToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value;
  const refresh = await env.STORE.get('refresh_token');
  if (!refresh) throw new Error('Not logged in. Open /login?key=YOUR_KEY first.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + (data.error || 'unknown'));
  cachedToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function drive(env, path, params) {
  const token = await accessToken(env);
  const url = new URL('https://www.googleapis.com/drive/v3/' + path);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  return fetch(url, { headers: { authorization: 'Bearer ' + token } });
}

async function fileMeta(env, id) {
  const res = await drive(env, 'files/' + id, { fields: 'id,name,mimeType,thumbnailLink' });
  if (!res.ok) throw new Error('File lookup failed (' + res.status + ')');
  return res.json();
}

const isPdf = (meta) => meta.mimeType === 'application/pdf' || /\.pdf$/i.test(meta.name);

async function loadEpub(env, ctx, id) {
  const cache = caches.default;
  const cacheKey = new Request('https://epub-cache.invalid/' + id);
  let res = await cache.match(cacheKey);
  if (!res) {
    res = await drive(env, 'files/' + id, { alt: 'media' });
    if (!res.ok) throw new Error('Download failed (' + res.status + ')');
    const copy = new Response(res.clone().body, { headers: { 'cache-control': 'max-age=3600' } });
    ctx.waitUntil(cache.put(cacheKey, copy));
  }
  return readZip(await res.arrayBuffer());
}

async function readToc(zip, manifest, base) {
  const map = new Map();
  const items = Object.values(manifest);
  const nav = items.find((i) => i.props.split(/\s+/).includes('nav'));
  if (nav) {
    const navPath = resolvePath(base, nav.href);
    const navBase = dirOf(navPath);
    const html = await readText(zip, navPath);
    if (html) {
      for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const target = resolvePath(navBase, decodeEntities(m[1]));
        const label = plain(m[2]);
        if (label && !map.has(target)) map.set(target, label);
      }
    }
  }
  if (!map.size) {
    const ncx = items.find((i) => i.type === 'application/x-dtbncx+xml');
    if (ncx) {
      const ncxPath = resolvePath(base, ncx.href);
      const ncxBase = dirOf(ncxPath);
      const xml = await readText(zip, ncxPath);
      if (xml) {
        const re = /<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src\s*=\s*["']([^"']+)["']/gi;
        for (const m of xml.matchAll(re)) {
          const target = resolvePath(ncxBase, decodeEntities(m[2]));
          const label = plain(m[1]);
          if (label && !map.has(target)) map.set(target, label);
        }
      }
    }
  }
  return map;
}

async function parseEpub(zip) {
  const container = await readText(zip, 'META-INF/container.xml');
  if (!container) throw new Error('Not a valid EPUB');
  const rootfile = container.match(/<rootfile\b[^>]*>/i);
  const opfPath = rootfile ? attr(rootfile[0], 'full-path') : null;
  const opf = opfPath ? await readText(zip, opfPath) : null;
  if (!opf) throw new Error('EPUB package file missing');
  const base = dirOf(opfPath);

  const manifest = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = attr(m[0], 'id');
    if (id) {
      manifest[id] = {
        href: attr(m[0], 'href') || '',
        type: attr(m[0], 'media-type') || '',
        props: attr(m[0], 'properties') || '',
      };
    }
  }

  const spine = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/gi)) {
    const item = manifest[attr(m[0], 'idref')];
    if (item && item.href) spine.push(resolvePath(base, item.href));
  }

  let cover = null;
  const coverItem = Object.values(manifest).find((i) => i.props.split(/\s+/).includes('cover-image'));
  if (coverItem) cover = resolvePath(base, coverItem.href);
  if (!cover) {
    const meta = opf.match(/<meta\b[^>]*name\s*=\s*["']cover["'][^>]*>/i);
    const ref = meta ? manifest[attr(meta[0], 'content')] : null;
    if (ref) cover = resolvePath(base, ref.href);
  }

  const field = (tag) => {
    const m = opf.match(new RegExp('<dc:' + tag + '[^>]*>([\\s\\S]*?)</dc:' + tag + '>', 'i'));
    return m ? plain(m[1]) : '';
  };

  return {
    title: field('title'),
    author: field('creator'),
    summary: field('description'),
    cover,
    spine,
    toc: await readToc(zip, manifest, base),
  };
}

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del',
  'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'rb', 'rp', 'rt', 'ruby', 's', 'section',
  'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u',
  'ul',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
const ALLOWED_ATTRS = {
  '*': new Set(['id', 'title', 'lang', 'dir']),
  a: new Set(['href', 'name']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  ol: new Set(['start']),
};
const URL_ATTRS = {
  href: /^(https?:|mailto:|#)/i,
  src: /^(https?:|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i,
};
const ID_PREFIX = 'lnr-';
const ID_RE = /^[\p{L}\p{N}_.:-]{1,200}$/u;
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n' };

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function decodeEntities(s) {
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (all, hex, dec, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? all;
    const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function cleanAttrs(tag, raw, rewriteHref) {
  const allowed = ALLOWED_ATTRS[tag];
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let out = '';
  for (const m of raw.matchAll(re)) {
    let name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS['*'].has(name) && !(allowed && allowed.has(name))) continue;
    let value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
    if (tag === 'a' && name === 'name') name = 'id';
    if (name === 'id') {
      // Prefixed so book ids can never clash with (or clobber) names in the reader page.
      if (!ID_RE.test(value)) continue;
      value = ID_PREFIX + value;
    } else if (URL_ATTRS[name]) {
      value = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
      if (name === 'href' && rewriteHref) value = rewriteHref(value);
      if (name === 'href' && value.startsWith('#')) {
        const frag = safeDecode(value.slice(1));
        if (!ID_RE.test(frag)) continue;
        value = '#' + ID_PREFIX + frag;
      }
      if (!URL_ATTRS[name].test(value)) continue;
    }
    out += ' ' + name + '="' + escapeAttr(value) + '"';
  }
  return out;
}

// Allowlist sanitizer: unknown tags are dropped (text is kept), every attribute and URL is checked.
function sanitizeHtml(input, rewriteHref) {
  const html = input
    .replace(/<(script|style|iframe|object|embed|noscript|template|textarea|title|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return html.replace(
    /<[!?][^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|</g,
    (all, close, name, attrs) => {
      if (name === undefined) return all === '<' ? '&lt;' : '';
      const tag = name.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (close) return VOID_TAGS.has(tag) ? '' : '</' + tag + '>';
      return '<' + tag + cleanAttrs(tag, attrs, rewriteHref) + '>';
    },
  );
}

async function chapterHtml(zip, path) {
  const raw = await readText(zip, path);
  if (!raw) throw new Error('Chapter file missing');
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const dir = dirOf(path);
  let html = (bodyMatch ? bodyMatch[1] : raw)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  html = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (block) => {
    const m = block.match(/<image\b[^>]*?href\s*=\s*(["'])([^"']+)\1/i);
    return m ? '<img src="' + m[2] + '">' : '';
  });

  const imgRe = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi;
  const wanted = new Set();
  for (const m of html.matchAll(imgRe)) {
    if (!/^(data:|https?:)/i.test(m[3])) wanted.add(resolvePath(dir, decodeEntities(m[3])));
  }
  const uris = new Map();
  for (const p of wanted) {
    const data = await readEntry(zip, p);
    if (data) uris.set(p, 'data:' + mimeOf(p) + ';base64,' + toBase64(data));
  }
  html = html.replace(imgRe, (all, pre, quote, src) => {
    const uri = uris.get(resolvePath(dir, decodeEntities(src)));
    return uri ? pre + quote + uri + quote : all;
  });
  // Links inside the same chapter file become anchors; links to other book files cannot be
  // followed from a single chapter, so they lose their href instead of pointing nowhere.
  const rewriteHref = (href) => {
    if (/^(https?:|mailto:)/i.test(href)) return href;
    const hash = href.indexOf('#');
    const file = hash < 0 ? href : href.slice(0, hash);
    const frag = hash < 0 ? '' : href.slice(hash);
    if (!file || resolvePath(dir, file) === path) return frag;
    return '';
  };
  return sanitizeHtml(html, rewriteHref);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/login') {
        if (!env.ACCESS_KEY || url.searchParams.get('key') !== env.ACCESS_KEY) {
          return new Response('unauthorized', { status: 401 });
        }
        const state = crypto.randomUUID();
        await env.STORE.put('state:' + state, '1', { expirationTtl: 600 });
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: url.origin + '/callback',
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
          state,
        }).toString();
        return Response.redirect(auth.toString(), 302);
      }

      if (path === '/callback') {
        const state = url.searchParams.get('state');
        const valid = state ? await env.STORE.get('state:' + state) : null;
        if (!valid) return new Response('invalid state', { status: 400 });
        await env.STORE.delete('state:' + state);
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: url.searchParams.get('code') || '',
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: url.origin + '/callback',
            grant_type: 'authorization_code',
          }),
        });
        const data = await res.json();
        if (!data.refresh_token) {
          return new Response('No refresh token: ' + (data.error || 'unknown'), { status: 400 });
        }
        await env.STORE.put('refresh_token', data.refresh_token);
        cachedToken = null;
        return new Response('Logged in. You can close this page.');
      }

      const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const key = url.searchParams.get('key') || bearer;
      if (!env.ACCESS_KEY || key !== env.ACCESS_KEY) return json({ error: 'unauthorized' }, 401);

      if (path === '/list') {
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        if (page > 1) return json([]);
        const term = (url.searchParams.get('q') || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        let q =
          "trashed=false and (mimeType='application/epub+zip' or mimeType='application/pdf' or (mimeType='application/octet-stream' and name contains 'epub'))";
        if (term) q += " and name contains '" + term + "'";
        const res = await drive(env, 'files', {
          q,
          pageSize: '1000',
          orderBy: 'name',
          fields: 'files(id,name,mimeType,thumbnailLink)',
        });
        if (!res.ok) throw new Error('Drive listing failed (' + res.status + ')');
        const data = await res.json();
        const files = (data.files || []).filter(
          (f) =>
            /\.(epub|pdf)$/i.test(f.name) ||
            f.mimeType === 'application/epub+zip' ||
            f.mimeType === 'application/pdf',
        );
        return json(
          files.map((f) => ({
            id: f.id,
            name: f.name.replace(/\.(epub|pdf)$/i, ''),
            cover: f.thumbnailLink
              ? f.thumbnailLink.replace(/=s\d+$/, '=s400')
              : isPdf(f)
                ? ''
                : url.origin + '/cover/' + f.id + '?key=' + encodeURIComponent(env.ACCESS_KEY),
          })),
        );
      }

      let m = path.match(/^\/novel\/([\w-]+)$/);
      if (m) {
        const meta = await fileMeta(env, m[1]);
        const fallbackCover = url.origin + '/cover/' + m[1] + '?key=' + encodeURIComponent(env.ACCESS_KEY);
        const title = meta.name.replace(/\.(epub|pdf)$/i, '');
        if (isPdf(meta)) {
          return json({
            title,
            author: '',
            summary: 'PDF file. Chapter 1 contains a link to open it.',
            cover: meta.thumbnailLink ? meta.thumbnailLink.replace(/=s\d+$/, '=s400') : '',
            chapters: [{ title: 'Open PDF', index: 0 }],
          });
        }
        const zip = await loadEpub(env, ctx, m[1]);
        const info = await parseEpub(zip);
        return json({
          title: info.title || title,
          author: info.author,
          summary: info.summary,
          cover: meta.thumbnailLink ? meta.thumbnailLink.replace(/=s\d+$/, '=s400') : fallbackCover,
          chapters: info.spine.map((p, i) => ({
            title: info.toc.get(p) || 'Section ' + (i + 1),
            index: i,
          })),
        });
      }

      m = path.match(/^\/chapter\/([\w-]+)\/(\d+)$/);
      if (m) {
        const meta = await fileMeta(env, m[1]);
        if (isPdf(meta)) {
          const link = url.origin + '/file/' + m[1] + '?key=' + encodeURIComponent(env.ACCESS_KEY);
          return json({
            html: sanitizeHtml('<p><a href="' + escapeAttr(link) + '">Open ' + escapeHtml(meta.name) + '</a></p>'),
          });
        }
        const zip = await loadEpub(env, ctx, m[1]);
        const info = await parseEpub(zip);
        const target = info.spine[parseInt(m[2], 10)];
        if (!target) return json({ error: 'chapter not found' }, 404);
        return json({ html: await chapterHtml(zip, target) });
      }

      m = path.match(/^\/cover\/([\w-]+)$/);
      if (m) {
        const zip = await loadEpub(env, ctx, m[1]);
        const info = await parseEpub(zip);
        const data = info.cover ? await readEntry(zip, info.cover) : null;
        if (!data) return new Response('no cover', { status: 404 });
        return new Response(data, {
          headers: { 'content-type': mimeOf(info.cover), 'cache-control': 'public, max-age=86400' },
        });
      }

      m = path.match(/^\/file\/([\w-]+)$/);
      if (m) {
        const res = await drive(env, 'files/' + m[1], { alt: 'media' });
        if (!res.ok) throw new Error('Download failed (' + res.status + ')');
        return new Response(res.body, {
          headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' },
        });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
```
