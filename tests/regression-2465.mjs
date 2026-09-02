// Regression test for lnreader/lnreader-plugins#2465 (Riwyat @ cenele.com:
// no covers / empty chapters). Deterministic: the REAL generated plugin code
// (bundled exactly like scripts/live-check-plugin.js) runs against SAVED
// live-site fixtures via a URL-matched global fetch stub: no network.
//
// Run:  node plugins/multisrc/generate-multisrc-plugins.js   (once, if the
//        generated plugins/arabic/Riwyat[madara].ts is missing)
// Run:  node tests/regression-2465.mjs
//
// Expected BEFORE the spec-2465 fix: N1 N2 N4 N5 N6 C1 T1 fail (RED).
// Expected AFTER  the spec-2465 fix: all checks pass (GREEN).
import * as esbuild from 'esbuild';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import { load } from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.resolve(__dirname, 'fixtures', '2465');

const fixtures = {
  novel: fs.readFileSync(path.join(FIXTURES, 'novel.html'), 'utf8'), // /cont/cursed-imm/ detail page
  chapters: fs.readFileSync(path.join(FIXTURES, 'chapters.json'), 'utf8'), // ajax/chapters POST payload
  chapter: fs.readFileSync(path.join(FIXTURES, 'ch_noUA.html'), 'utf8'), // chapter page (no UA)
  nocontent:
    '<html><head><title>Test page</title></head><body><div class="something-else">no chapter container here</div></body></html>',
};

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

// --- Load the real generated plugin (identical bundling to scripts/live-check-plugin.js) ---
const absPath = path.resolve(REPO_ROOT, 'plugins/arabic/Riwyat[madara].ts');
if (!fs.existsSync(absPath)) {
  console.error(
    `FAIL: generated plugin not found at ${absPath}\n` +
      `Run "node plugins/multisrc/generate-multisrc-plugins.js" from the repo root first.`,
  );
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

// --- URL-matched fixture stub: the template talks to the site only via global fetch ---
globalThis.fetch = async url => {
  const u = String(url);
  let body;
  if (u.includes('ajax/chapters')) body = fixtures.chapters;
  else if (u.includes('cont/nocontent/')) body = fixtures.nocontent;
  else if (u.endsWith('cont/cursed-imm/')) body = fixtures.novel;
  else if (u.includes('cont/cursed-imm/'))
    body = fixtures.chapter; // chapter pages
  else throw new Error('No fixture for ' + u);
  return {
    ok: true,
    status: 200,
    url: u,
    text: async () => body,
  };
};

// --- 0. Mechanism proof: empty Cheerio selection shadows later selectors ---
const $ = load(fixtures.chapter);
const tl = $('.text-left');
const tr = $('.text-right');
const ec = $('.entry-content');
const cb = $('.c-blog-post > div > div:nth-child(2)');
check(
  'selectors: .text-left absent in body',
  tl.length === 0,
  `got ${tl.length} matches`,
);
check(
  'mechanism: empty .text-left selection is TRUTHY (short-circuits || chain)',
  Boolean(tl) === true,
  'empty Cheerio selection must be falsy-ish for the template chain to reach .entry-content',
);
const chainResult = tl || tr || ec || cb;
check(
  'mechanism: OLD unguarded || chain short-circuits to EMPTY .text-left selection (root cause trap)',
  chainResult.length === 0,
  `old chain picked ${chainResult.length} items instead of falling through to .entry-content`,
);

// --- 1. parseNovel: name, cover, chapter list, genres, status, author ---
const novel = await plugin.parseNovel('cont/cursed-imm/');
check(
  'parseNovel: novel name extracted',
  novel.name === 'الخلود الملعون',
  `got ${JSON.stringify(novel.name)}`,
);
check(
  'parseNovel: cover URL extracted from site (not defaultCover)',
  typeof novel.cover === 'string' &&
    novel.cover.startsWith('https://cenele.com/wp-content/uploads'),
  `got ${novel.cover}`,
);
check(
  'parseNovel: chapters listed',
  Array.isArray(novel.chapters) && novel.chapters.length > 0,
  `got ${novel?.chapters?.length} chapters`,
);
{
  const EXPECT_GENRES =
    'أكشن, بطل شرير, خيال, رعب, سحر, شريحة حياة, غموض, قوى خارقة, مظلمة, نفسي';
  check(
    'parseNovel: genres extracted (nhv-novel-genres)',
    novel.genres === EXPECT_GENRES,
    `got ${JSON.stringify(novel.genres)}`,
  );
}
check(
  'parseNovel: status Ongoing',
  novel.status === 'Ongoing',
  `got ${JSON.stringify(novel.status)}`,
);
check(
  'parseNovel: author extracted',
  novel.author === "I'm not social",
  `got ${JSON.stringify(novel.author)}`,
);

// --- 2. parseChapter: content length + clean of promo spam on a real chapter page ---
const content = novel.chapters?.length
  ? await plugin.parseChapter(novel.chapters[0].path)
  : '';
const len = (content || '').trim().length;
check(
  'parseChapter: content length >= 200',
  len >= 200,
  `got ${len} chars (user symptom: empty chapter)`,
);
const PROMO_MARKERS = ['آلاف الفصول', 'متجر فضاء الروايات', 'VIP'];
check(
  'parseChapter: no promo text markers',
  PROMO_MARKERS.every(m => !(content || '').includes(m)),
  `promo text leaked into chapter (${PROMO_MARKERS.filter(m => (content || '').includes(m)).join(', ')})`,
);
check(
  'parseChapter: no [data-nosnippet] in content',
  (content || '').includes('data-nosnippet') === false,
  'nosnippet elements leaked into chapter',
);
check(
  'parseChapter: no inline style/script in content',
  !(content || '').includes('<style') && !(content || '').includes('<script'),
  'inline <style>/<script> leaked into chapter',
);

// --- 3. Loud failure for unknown layouts (spec ruling: throw, never return '') ---
await expectReject(
  'parseChapter: unknown layout page REJECTS (no silent empty chapter)',
  plugin.parseChapter('cont/nocontent/foo/bar/'),
  /container not found|Chapter content/i,
);

console.log(
  `\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILING (RED: bug reproduced)'}`,
);
process.exit(failures === 0 ? 0 : 1);
