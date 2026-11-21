// Deterministic, network-free regression check for the Novelight chapter
// pagination mapping (app page N -> Nth site range, oldest first).
//
// Run with: node --test scripts/novelight-pagination.test.mjs
//
// The real plugins/english/novelight.ts is bundled with esbuild (the same way
// scripts/live-check-plugin.js does) with only `@libs/fetch` swapped for an
// in-memory stub, so `parseNovel` and `parsePage` run unmodified against a
// fixture that mimics the site's chapter select and chapter-pagination
// endpoint.

import test from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOVEL_PATH = 'book/fixture-novel';
const CSRF_TOKEN = 'fixture-csrf';
const BOOK_ID = '4242';

// Four full 50-chapter ranges plus a short oldest range of 23 chapters.
// Total: 223 chapters. The select lists ranges newest first, as the site does.
const SITE_RANGES = [
  { value: '5', start: 174, end: 223 },
  { value: '4', start: 124, end: 173 },
  { value: '3', start: 74, end: 123 },
  { value: '2', start: 24, end: 73 },
  { value: '1', start: 1, end: 23 },
];
const TOTAL_CHAPTERS = 223;

const chapterPath = n => `book/fixture-novel/chapter-${n}`;

function novelPageHtml() {
  const options = SITE_RANGES.map(
    r => `<option value="${r.value}">${r.start} - ${r.end}</option>`,
  ).join('');
  return `<html><body>
    <script>window.CSRF_TOKEN = "${CSRF_TOKEN}";</script>
    <script>const OBJECT_BY_COMMENT = ${BOOK_ID};</script>
    <h1>Fixture Novel</h1>
    <select id="select-pagination-chapter">
      <option value="">Select a range</option>${options}
    </select>
  </body></html>`;
}

// The endpoint returns one range per request, newest chapter first.
function chapterPaginationHtml(range) {
  let html = '';
  for (let n = range.end; n >= range.start; n--) {
    html += `<a href="/${chapterPath(n)}"><div class="title">Chapter ${n}</div><div class="date">01.01.2024</div></a>`;
  }
  return html;
}

async function loadPlugin(requests) {
  const stubFetch = {
    name: 'stub-libs-fetch',
    setup(build) {
      build.onResolve({ filter: /^@libs\/fetch$/ }, () => ({
        path: 'stub-fetch',
        namespace: 'stub-fetch',
      }));
      build.onLoad({ filter: /.*/, namespace: 'stub-fetch' }, () => ({
        contents:
          'export const fetchApi = (...a) => globalThis.__novelightFetch(...a);',
        loader: 'js',
      }));
    },
  };
  const result = await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, 'plugins/english/novelight.ts')],
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
    plugins: [stubFetch],
  });

  globalThis.__novelightFetch = async url => {
    requests.push(url);
    const respond = body => ({
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
    });
    if (url === 'https://novelight.net/' + NOVEL_PATH) {
      return respond(novelPageHtml());
    }
    if (url.startsWith('https://novelight.net/book/ajax/chapter-pagination?')) {
      const params = new URL(url).searchParams;
      assert.equal(params.get('csrfmiddlewaretoken'), CSRF_TOKEN);
      assert.equal(params.get('book_id'), BOOK_ID);
      const range = SITE_RANGES.find(r => r.value === params.get('page'));
      assert.ok(range, `unknown site page requested: ${params.get('page')}`);
      return respond(JSON.stringify({ html: chapterPaginationHtml(range) }));
    }
    throw new Error('Unexpected request: ' + url);
  };

  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(
    module,
    module.exports,
    require,
  );
  return module.exports.default ?? module.exports;
}

test('novelight maps app pages to site ranges oldest first without skipping, duplicating or reversing chapters', async () => {
  const requests = [];
  const plugin = await loadPlugin(requests);
  const isPaginationRequest = url =>
    url.includes('/book/ajax/chapter-pagination?');

  const novel = await plugin.parseNovel(NOVEL_PATH);
  assert.equal(
    novel.totalPages,
    SITE_RANGES.length,
    'totalPages must equal the number of site ranges',
  );

  const ascendingRanges = [...SITE_RANGES].reverse();
  const walked = [];

  for (let pageNo = 1; pageNo <= novel.totalPages; pageNo++) {
    requests.length = 0;
    const { chapters } = await plugin.parsePage(NOVEL_PATH, String(pageNo));
    const expectedRange = ascendingRanges[pageNo - 1];

    const paginationRequests = requests.filter(isPaginationRequest);
    assert.equal(
      paginationRequests.length,
      1,
      `page ${pageNo} must issue exactly one chapter-pagination request`,
    );
    assert.equal(
      new URL(paginationRequests[0]).searchParams.get('page'),
      expectedRange.value,
      `page ${pageNo} must request site page ${expectedRange.value}`,
    );

    assert.equal(
      chapters.length,
      expectedRange.end - expectedRange.start + 1,
      `page ${pageNo} chapter count`,
    );
    assert.deepEqual(
      chapters.map(c => c.path),
      Array.from(
        { length: expectedRange.end - expectedRange.start + 1 },
        (_, i) => chapterPath(expectedRange.start + i),
      ),
      `page ${pageNo} must hold its range in ascending order`,
    );
    for (const chapter of chapters) {
      assert.equal(chapter.page, String(pageNo));
    }
    walked.push(...chapters);
  }

  // Oldest, short range is served first.
  assert.equal(walked[0].path, chapterPath(1));
  assert.equal(
    walked.slice(0, 23).at(-1).path,
    chapterPath(23),
    'page 1 must be the short oldest range',
  );

  // Across every page boundary: nothing skipped, nothing duplicated, ascending.
  assert.equal(walked.length, TOTAL_CHAPTERS);
  assert.equal(new Set(walked.map(c => c.path)).size, TOTAL_CHAPTERS);
  assert.deepEqual(
    walked.map(c => c.path),
    Array.from({ length: TOTAL_CHAPTERS }, (_, i) => chapterPath(i + 1)),
  );

  // A page past the last returns nothing and spends no pagination request.
  requests.length = 0;
  const past = await plugin.parsePage(NOVEL_PATH, String(novel.totalPages + 1));
  assert.deepEqual(past.chapters, []);
  assert.equal(requests.filter(isPaginationRequest).length, 0);
});
