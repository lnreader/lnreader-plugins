// Test shim for `@libs/fetch`: serves captured fixture pages instead of the
// network. Used only by plugins/english/__tests__/nightjarreads.test.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE: import.meta.url points at the esbuild bundle, not this file, so the
// fixtures directory is injected at bundle time (see the test's esbuild
// `define`).
const fixturesDir = join(process.env.NIGHTJARREADS_TEST_DIR, 'fixtures');
const read = f => readFileSync(join(fixturesDir, f), 'utf8');

// Same captured payload, reformatted the way other Next.js emitters close
// their flight scripts — exercises the hardened extractFlightText regex.
function withVariant(html) {
  const v = process.env.NIGHTJARREADS_FIXTURE_VARIANT;
  if (v === 'semicolon')
    return html.replaceAll('"])</script>', '"])</script>');
  if (v === 'whitespace')
    return html.replaceAll('"])</script>', '"])\n  </script>');
  return html;
}

export async function fetchText(url) {
  const u = new URL(url);
  if (u.pathname === '/search') {
    const q = u.searchParams.get('q') || '';
    return withVariant(
      read(
        q === 'god of guns' ? 'search-god-of-guns.html' : 'search-empty.html',
      ),
    );
  }
  if (u.pathname === '/novel/god-of-guns/88') return read('chapter-free.html');
  if (u.pathname === '/novel/trenches-guns-and-magic/608')
    return read('chapter-locked.html');
  throw new Error('[test shim] no fixture for ' + url);
}

export async function fetchApi() {
  throw new Error('[test shim] fetchApi is not used by this plugin');
}
