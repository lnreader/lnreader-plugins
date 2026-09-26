// Captured-payload tests for the Nightjar Reads plugin.
//
// These tests replay HTML captured from nightjarreads.com (see fixtures/)
// through the real plugin code — including extractFlightText(), whose
// flight-chunk regex was hardened to tolerate `;`/whitespace before
// `</script>` — so parser regressions are caught without hitting the live
// site. The repo's `check:plugin` live check accepts an empty search result
// and reads only the first chapter, so it cannot cover these cases.
//
// The plugin is bundled with esbuild at test time; `@libs/*` imports are
// aliased to the shims in ./shims, where `@libs/fetch` serves the captured
// fixtures instead of the network.
//
// Run: npm install && node --test plugins/english/__tests__/nightjarreads.test.mjs
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  throw new Error(
    'esbuild is required to bundle the plugin for tests: run `npm install` in the repo root first.',
  );
}

let plugin;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nightjarreads-test-'));
  const outFile = join(dir, 'plugin.bundle.mjs');
  await esbuild.build({
    entryPoints: [join(here, '..', 'nightjarreads.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: outFile,
    logLevel: 'error',
    // The fetch shim is bundled, so import.meta.url no longer points at the
    // test dir at runtime; inject it as a compile-time constant instead.
    define: { 'process.env.NIGHTJARREADS_TEST_DIR': JSON.stringify(here) },
    alias: {
      '@libs/fetch': join(here, 'shims', 'fetch.mjs'),
      '@libs/novelStatus': join(here, 'shims', 'novelStatus.mjs'),
      '@/types/plugin': join(here, 'shims', 'types.mjs'),
    },
  });
  plugin = (await import(outFile)).default;
  assert.ok(plugin, 'plugin default export missing');
});

describe('search (captured /search payload)', () => {
  it('finds novels for a real query', async () => {
    const results = await plugin.searchNovels('god of guns', 1);
    // The captured page also carries a suggestion index before the query
    // marker; exactly one result proves the marker sliced the right section.
    assert.equal(results.length, 1);
    const gog = results.find(r => r.path === '/novel/god-of-guns');
    assert.ok(
      gog,
      'expected /novel/god-of-guns in ' +
        JSON.stringify(results.map(r => r.path)),
    );
    assert.equal(gog.name, 'God of Guns');
    assert.ok(gog.cover.startsWith('https://'), 'cover should be an https URL');
  });

  it('returns nothing for a nonsense query (query marker must not leak results)', async () => {
    const results = await plugin.searchNovels('zzzzqqqnotreal', 1);
    assert.deepEqual(results, []);
  });

  // The flight-chunk regex must not depend on the closing tag's formatting:
  // same captured payload, only the emitter's `</script>` style changes.
  for (const variant of ['semicolon', 'whitespace']) {
    it(`extracts flight chunks when scripts end with "${variant}" formatting`, async () => {
      process.env.NIGHTJARREADS_FIXTURE_VARIANT = variant;
      try {
        const results = await plugin.searchNovels('god of guns', 1);
        assert.ok(
          results.some(r => r.path === '/novel/god-of-guns'),
          'chunks were silently skipped with ' + variant + ' formatting',
        );
      } finally {
        delete process.env.NIGHTJARREADS_FIXTURE_VARIANT;
      }
    });
  }
});

describe('chapter (captured /novel/<slug>/<n> payloads)', () => {
  it('parses a free chapter into HTML paragraphs', async () => {
    const html = await plugin.parseChapter('/novel/god-of-guns/88');
    assert.ok(
      html.length > 1000,
      'expected substantial content, got ' + html.length + ' chars',
    );
    assert.ok(
      html.startsWith('<p>'),
      'expected <p> HTML, got: ' + html.slice(0, 60),
    );
    assert.ok(
      !html.includes('Advance chapters at Nightjar Reads'),
      'promo footer must be filtered out',
    );
  });

  it('shows the locked notice for a locked premium chapter', async () => {
    const html = await plugin.parseChapter(
      '/novel/trenches-guns-and-magic/608',
    );
    assert.ok(
      html.includes('This chapter is locked'),
      'expected the locked-chapter notice, got: ' + html.slice(0, 120),
    );
  });
});
