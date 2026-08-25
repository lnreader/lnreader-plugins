// Regression test for lnreader/lnreader-plugins#2442 (Galaxy Novels: chapter
// fetch fails with 403 because Cloudflare blocks UA-less requests).
// Deterministic: the REAL plugin (bundled exactly like scripts/live-check-plugin.js)
// runs against SAVED live-site fixtures via a URL-matched global fetch stub that
// also emulates the Cloudflare rule: no User-Agent header -> HTTP 403. No network.
//
// Run:  node tests/regression-2442.mjs
//
// Expected BEFORE the spec-2442 fix (RED on e1dcd06): REQ-1 fails, N-1..N-6 fail,
// C-1 fails, C-2 passes (the 403 surfaces as the exact user error), C-3 passes
// (the API URL was attempted).
// Expected AFTER  the spec-2442 fix: all 10 checks pass (GREEN).
import * as esbuild from 'esbuild';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.resolve(__dirname, 'fixtures', '2442');

const fixtures = {
  novel: fs.readFileSync(path.join(FIXTURES, 'novel.html'), 'utf8'), // detail page (captured 2026-08-25)
  chapters: fs.readFileSync(path.join(FIXTURES, 'chapters.json'), 'utf8'), // chapters index (5 of 488)
  chapterApi: fs.readFileSync(path.join(FIXTURES, 'chapter-api.json'), 'utf8'), // chapter API for id 221415
};

const NOVEL_PATH = '/novel/i-can-practice-the-god-level-system-with-one-click/';
const CHAPTER_PATH = NOVEL_PATH + 'chapter-221415/';

let failures = 0;
const check = (label, cond, detail) => {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${ok ? '' : '-- ' + detail}`);
  if (!ok) failures++;
};
const expectReject = async (label, promise, pattern) => {
  try {
    await promise;
    check(label, false, 'resolved but should have rejected');
  } catch (err) {
    check(
      label,
      pattern.test(String((err && err.message) || err)),
      `rejected without ${pattern}`,
    );
  }
};

// --- Load the real plugin (identical bundling to scripts/live-check-plugin.js) ---
const absPath = path.resolve(REPO_ROOT, 'plugins/arabic/galaxynovels.ts');
if (!fs.existsSync(absPath)) {
  console.error(`FAIL: plugin not found at ${absPath}`);
  process.exit(1);
}
const result = await esbuild.build({
  entryPoints: [absPath],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  write: false,
  logLevel: 'silent',
  alias: {
    '@libs': path.join(REPO_ROOT, 'src/libs'),
    '@': path.join(REPO_ROOT, 'src'),
  },
});
const tmpFile = path.join(REPO_ROOT, 'regression-bundle.cjs');
fs.writeFileSync(tmpFile, result.outputFiles[0].text, 'utf8');
const require = createRequire(import.meta.url);
const mod = require(tmpFile);
const plugin = mod.default ?? mod;
fs.unlinkSync(tmpFile);

// --- URL-matched fixture stub with Cloudflare emulation (403 when no UA) ---
// `calls` records every init for REQ-1; `denyAll` lets C-2 force the 403 mode
// even after the fix sends a User-Agent (the site could still block the request).
const calls = [];
let denyAll = false;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const initSafe = init || {};
  calls.push({ url: u, headers: initSafe.headers || {} });
  const ua = (initSafe.headers || {})['User-Agent'];
  // Cloudflare bot-fight rule: any request without a browser User-Agent -> 403,
  // except the /novels/ listing. Here the plugin never fetches the listing, so
  // every UA-less request must 403.
  if (denyAll || !ua) {
    return {
      ok: false,
      status: 403,
      url: u,
      text: async () => '',
      json: async () => ({}),
    };
  }
  let body;
  if (u.includes('wor-reader-cache/chapters')) body = fixtures.chapters;
  else if (u.includes('/wp-json/wor-reader-app/v1/chapters/'))
    body = fixtures.chapterApi;
  else if (u.endsWith(NOVEL_PATH)) body = fixtures.novel;
  else throw new Error('No fixture for ' + u);
  return {
    ok: true,
    status: 200,
    url: u,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
};

// --- 1. parseNovel: name, cover, author, status, genres, chapter list ---
let novel = null;
try {
  novel = await plugin.parseNovel(NOVEL_PATH);
} catch (err) {
  console.log(
    `FAIL  N-1 parseNovel name == fixture h1  -- parseNovel threw: ${err.message}`,
  );
  console.log(
    `FAIL  N-2 parseNovel cover == fixture cover  -- parseNovel threw: ${err.message}`,
  );
  console.log(
    `FAIL  N-3 parseNovel author == "Miao Di"  -- parseNovel threw: ${err.message}`,
  );
  console.log(
    `FAIL  N-4 parseNovel status == "Ongoing"  -- parseNovel threw: ${err.message}`,
  );
  console.log(
    `FAIL  N-5 parseNovel genres: 22 items, starts with أكشن  -- parseNovel threw: ${err.message}`,
  );
  console.log(
    `FAIL  N-6 parseNovel chapters: 5 items, /chapter-\d+/  -- parseNovel threw: ${err.message}`,
  );
  failures += 6;
}
if (novel) {
  check(
    'N-1 parseNovel name == fixture h1',
    novel.name === 'يمكنني ممارسة الزراعة الروحية بالنظام الاعظم بنقرة واحدة',
    `got ${JSON.stringify(novel.name)}`,
  );
  check(
    'N-2 parseNovel cover == fixture cover',
    novel.cover ===
      'https://galaxynovels.com/wp-content/uploads/2026/07/h237-576x1024.webp',
    `got ${JSON.stringify(novel.cover)}`,
  );
  check(
    'N-3 parseNovel author == "Miao Di"',
    novel.author === 'Miao Di',
    `got ${JSON.stringify(novel.author)}`,
  );
  check(
    'N-4 parseNovel status == "Ongoing"',
    novel.status === 'Ongoing',
    `got ${JSON.stringify(novel.status)}`,
  );
  {
    const genres = Array.isArray(novel.genres)
      ? novel.genres
      : String(novel.genres || '').split(', ');
    check(
      'N-5 parseNovel genres: 22 items, starts with أكشن',
      genres.length === 22 && genres[0] === 'أكشن',
      `got ${genres.length} items, first ${JSON.stringify(genres[0])}`,
    );
  }
  check(
    'N-6 parseNovel chapters: 5 items, /chapter-\\d+/',
    Array.isArray(novel.chapters) &&
      novel.chapters.length === 5 &&
      novel.chapters.every(c => /chapter-\d+/.test(c.path)),
    `got ${novel?.chapters?.length} chapters: ${JSON.stringify(novel?.chapters?.map(c => c.path))}`,
  );
}

// --- 2. parseChapter: content served from the API (the only viable path) ---
let content = null;
try {
  content = await plugin.parseChapter(
    novel?.chapters?.[0]?.path || CHAPTER_PATH,
  );
} catch (err) {
  console.log(
    `FAIL  C-1 parseChapter content >= 200, starts with <p>الفصل 1  -- parseChapter threw: ${err.message}`,
  );
  failures++;
}
if (content !== null) {
  const len = content.trim().length;
  check(
    'C-1 parseChapter content >= 200, starts with <p>الفصل 1',
    len >= 200 && content.startsWith('<p>الفصل 1'),
    `got ${len} chars, starts ${JSON.stringify(content.slice(0, 20))}`,
  );
}

// --- 3. Symptom pin: a 403 (regardless of cause) must reject with the exact
// user-facing error, never resolve silently. C-2 forces the 403 mode. ---
await expectReject(
  'C-2 403 rejects with /Could not reach site (403)/',
  (() => {
    denyAll = true;
    return plugin.parseChapter(CHAPTER_PATH).finally(() => {
      denyAll = false;
    });
  })(),
  /Could not reach site \(403\)/,
);

// --- 4. Mechanism pin: the chapter API was used for the success case ---
check(
  'C-3 chapter API /wp-json/wor-reader-app/v1/chapters/ was fetched',
  calls.some(c => c.url.includes('/wp-json/wor-reader-app/v1/chapters/')),
  'no API call in the fetch log',
);

// --- 5. REQ-1 (last so it covers the whole run incl. C-2): every fetch init
// carried a User-Agent header ---
check(
  'REQ-1 every fetch init carries a User-Agent header',
  calls.length > 0 &&
    calls.every(
      c =>
        typeof c.headers['User-Agent'] === 'string' &&
        c.headers['User-Agent'].length > 0,
    ),
  `${calls.filter(c => !c.headers['User-Agent']).length} of ${calls.length} requests UA-less: ${JSON.stringify(calls.filter(c => !c.headers['User-Agent']).map(c => c.url))}`,
);

console.log(
  `\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILING (RED - bug reproduced)'}`,
);
process.exit(failures === 0 ? 0 : 1);
