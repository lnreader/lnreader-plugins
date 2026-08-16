#!/usr/bin/env node

// Bundles one or more LNReader plugin source files and runs them against the
// real target site, exercising the same PluginBase surface a live install
// would use. Type-checking/lint alone have missed real bugs (zero chapters,
// search leaking foreign-language pages) that only show up when the plugin
// actually talks to its site — see docs/testing.md.

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import path, { dirname } from 'path';
import fs from 'fs/promises';
import os from 'os';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

const MIN_CHAPTER_LENGTH = 200;
const STEP_TIMEOUT_MS = 30_000;
const CLOUDFLARE_HEADER_HINTS = ['cf-ray', 'cf-cache-status', 'cf-request-id'];

/** @typedef {'PASS' | 'FAIL' | 'INCONCLUSIVE'} StepStatus */

function isNetworkOrBlockError(error) {
  const code = error?.code || error?.cause?.code;
  const message = String(error?.message || '');
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)) {
    return { inconclusive: true, reason: `Network error (${code})` };
  }
  if (/timed? ?out/i.test(message)) {
    return { inconclusive: true, reason: 'Timeout' };
  }
  // Only 403/503 indicate a block — a cf-ray/cf-cache-status header alone
  // just means the site is fronted by Cloudflare's CDN (true for a huge
  // share of the web) and says nothing about whether we were blocked.
  const status = error?.response?.status ?? error?.status;
  if (status === 403 || status === 503) {
    const headers = error?.response?.headers;
    const headerKeys = headers
      ? Object.keys(
          typeof headers.entries === 'function'
            ? Object.fromEntries(headers.entries())
            : headers,
        ).map(k => k.toLowerCase())
      : [];
    const isCloudflare = CLOUDFLARE_HEADER_HINTS.some(h =>
      headerKeys.includes(h),
    );
    return {
      inconclusive: true,
      reason: `HTTP ${status}${isCloudflare ? ' (Cloudflare)' : ' (likely anti-bot block)'}`,
    };
  }
  return { inconclusive: false };
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error(`${label} timed out`), { code: 'ETIMEDOUT' }),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function bundlePlugin(pluginPath) {
  const absPath = path.resolve(REPO_ROOT, pluginPath);
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
  const code = result.outputFiles[0].text;
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpFile = path.join(
    os.tmpdir(),
    `live-check-${path.basename(pluginPath, '.ts')}-${unique}.cjs`,
  );
  await fs.writeFile(tmpFile, code, 'utf8');
  return tmpFile;
}

async function loadPluginInstance(pluginPath) {
  const bundledPath = await bundlePlugin(pluginPath);
  try {
    // Plain CJS require(), not ESM import() — importing a CJS module from an
    // ESM context wraps the whole `module.exports` as `.default` (so a
    // `default` *named* export inside it ends up double-nested at
    // `mod.default.default`). require() resolves it the way the plugin
    // author actually wrote it: `export default plugin` -> `mod.default`.
    const mod = require(bundledPath);
    return mod.default ?? mod;
  } finally {
    delete require.cache[require.resolve(bundledPath)];
    await fs.unlink(bundledPath).catch(() => undefined);
  }
}

function makeStep(name) {
  return { name, status: /** @type {StepStatus} */ ('FAIL'), detail: '' };
}

/**
 * The real app always calls popularNovels with the plugin's own default
 * filter values (from its `filters` schema), never a bare `undefined` -
 * `undefined` is only valid for plugins that declare no filters at all.
 * Passing it to a plugin that assumes its filters are populated (e.g.
 * `options.filters.language`) produces a crash that looks like a plugin bug
 * but is really just an unrealistic call from the harness.
 */
function defaultFilterValues(plugin) {
  if (!plugin.filters) return undefined;
  // FilterToValues<Filters> keeps the {value, type} shape per key — plugins
  // read e.g. filters.language.value, not filters.language directly.
  return Object.fromEntries(
    Object.entries(plugin.filters).map(([key, filter]) => [
      key,
      { value: filter.value, type: filter.type },
    ]),
  );
}

async function runChecks(plugin) {
  const steps = [];
  const filters = defaultFilterValues(plugin);

  // 1. popularNovels
  const popularStep = makeStep('popularNovels');
  steps.push(popularStep);
  let popular;
  try {
    popular = await withTimeout(
      plugin.popularNovels(1, { filters }),
      STEP_TIMEOUT_MS,
      'popularNovels',
    );
    if (!Array.isArray(popular) || popular.length === 0) {
      popularStep.status = 'FAIL';
      popularStep.detail = 'Returned no novels';
      return steps;
    }
    popularStep.status = 'PASS';
    popularStep.detail = `${popular.length} novels`;
  } catch (error) {
    const net = isNetworkOrBlockError(error);
    popularStep.status = net.inconclusive ? 'INCONCLUSIVE' : 'FAIL';
    popularStep.detail = net.reason || error.message;
    return steps;
  }

  const firstNovel = popular[0];

  // 2. searchNovels
  const searchStep = makeStep('searchNovels');
  steps.push(searchStep);
  try {
    const results = await withTimeout(
      plugin.searchNovels(firstNovel.name, 1),
      STEP_TIMEOUT_MS,
      'searchNovels',
    );
    if (!Array.isArray(results)) {
      searchStep.status = 'FAIL';
      searchStep.detail = 'Did not return an array';
    } else {
      searchStep.status = 'PASS';
      searchStep.detail = `${results.length} results for "${firstNovel.name}"`;
    }
  } catch (error) {
    const net = isNetworkOrBlockError(error);
    searchStep.status = net.inconclusive ? 'INCONCLUSIVE' : 'FAIL';
    searchStep.detail = net.reason || error.message;
  }

  // 3. parseNovel
  const parseNovelStep = makeStep('parseNovel');
  steps.push(parseNovelStep);
  let novel;
  try {
    novel = await withTimeout(
      plugin.parseNovel(firstNovel.path),
      STEP_TIMEOUT_MS,
      'parseNovel',
    );
    const isPagePlugin = typeof plugin.parsePage === 'function';
    let chapters = novel?.chapters;
    if (isPagePlugin && (!chapters || chapters.length === 0)) {
      const page = await withTimeout(
        plugin.parsePage(firstNovel.path, '1'),
        STEP_TIMEOUT_MS,
        'parsePage',
      );
      chapters = page?.chapters;
    }
    if (!novel?.name || !chapters || chapters.length === 0) {
      parseNovelStep.status = 'FAIL';
      parseNovelStep.detail = !novel?.name
        ? 'Missing novel name'
        : 'No chapters returned';
      return steps;
    }
    parseNovelStep.status = 'PASS';
    parseNovelStep.detail = `${chapters.length} chapters`;
    novel = { ...novel, chapters };
  } catch (error) {
    const net = isNetworkOrBlockError(error);
    parseNovelStep.status = net.inconclusive ? 'INCONCLUSIVE' : 'FAIL';
    parseNovelStep.detail = net.reason || error.message;
    return steps;
  }

  // 4. parseChapter
  const parseChapterStep = makeStep('parseChapter');
  steps.push(parseChapterStep);
  try {
    const firstChapter = novel.chapters[0];
    const content = await withTimeout(
      plugin.parseChapter(firstChapter.path),
      STEP_TIMEOUT_MS,
      'parseChapter',
    );
    const length = typeof content === 'string' ? content.trim().length : 0;
    if (length < MIN_CHAPTER_LENGTH) {
      parseChapterStep.status = 'FAIL';
      parseChapterStep.detail = `Content too short (${length} chars, expected >= ${MIN_CHAPTER_LENGTH})`;
    } else {
      parseChapterStep.status = 'PASS';
      parseChapterStep.detail = `${length} chars`;
    }
  } catch (error) {
    const net = isNetworkOrBlockError(error);
    parseChapterStep.status = net.inconclusive ? 'INCONCLUSIVE' : 'FAIL';
    parseChapterStep.detail = net.reason || error.message;
  }

  return steps;
}

/**
 * fetchText/fetchFile in this repo swallow network and non-2xx errors and
 * resolve to '' instead of throwing (see src/lib/fetch.ts), so a plugin using
 * them will surface a site-down/anti-bot block as an empty result, not an
 * exception — which runChecks() would otherwise misreport as a FAIL. Probe
 * the plugin's base site directly first so a known-bad site short-circuits
 * to INCONCLUSIVE before running the real checks, using the same Cloudflare
 * header heuristic as scripts/check-plugin-sites.js.
 */
async function probeSiteReachability(site) {
  try {
    const res = await withTimeout(
      fetch(site, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 live-check-plugin' },
      }),
      STEP_TIMEOUT_MS,
      'site probe',
    );
    if (res.status >= 200 && res.status < 400) {
      // A cf-ray/cf-cache-status header here just means the site is fronted
      // by Cloudflare's CDN, which is true of a huge share of the web and
      // says nothing about whether we were blocked — only a 403/503 does.
      return { reachable: true };
    }
    const isCloudflare = CLOUDFLARE_HEADER_HINTS.some(h => res.headers.has(h));
    if (res.status === 403 || res.status === 503) {
      return {
        reachable: false,
        reason: `HTTP ${res.status}${isCloudflare ? ' (Cloudflare)' : ''}`,
      };
    }
    return { reachable: false, reason: `HTTP ${res.status}` };
  } catch (error) {
    const net = isNetworkOrBlockError(error);
    return { reachable: false, reason: net.reason || error.message };
  }
}

async function checkPlugin(pluginPath) {
  const result = { pluginPath, steps: [], loadError: null };
  let plugin;
  try {
    plugin = await loadPluginInstance(pluginPath);
  } catch (error) {
    result.loadError = error.message;
    return result;
  }

  const probe = await probeSiteReachability(plugin.site);
  if (!probe.reachable) {
    const step = makeStep('siteReachability');
    step.status = 'INCONCLUSIVE';
    step.detail = probe.reason;
    result.steps = [step];
    return result;
  }

  result.steps = await runChecks(plugin);
  return result;
}

function escapeMarkdown(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('`', '&#96;')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br>');
}

function printReport(results) {
  let hasFail = false;
  let hasInconclusive = false;

  console.log('## Plugin Live Check');

  for (const result of results) {
    console.log(`\n### \`${escapeMarkdown(result.pluginPath)}\``);
    console.log('\n| Check | Result | Details |');
    console.log('| --- | --- | --- |');

    if (result.loadError) {
      hasFail = true;
      console.log(
        `| \`bundle/load\` | ❌ FAIL | ${escapeMarkdown(result.loadError)} |`,
      );
      continue;
    }

    for (const step of result.steps) {
      const resultLabel =
        step.status === 'PASS'
          ? '✅ PASS'
          : step.status === 'FAIL'
            ? '❌ FAIL'
            : '⚠️ INCONCLUSIVE';
      console.log(
        `| \`${escapeMarkdown(step.name)}\` | ${resultLabel} | ${escapeMarkdown(step.detail)} |`,
      );
      if (step.status === 'FAIL') hasFail = true;
      if (step.status === 'INCONCLUSIVE') hasInconclusive = true;
    }
  }

  console.log(
    hasFail
      ? '\n**Result: ❌ Failed — at least one check failed.**'
      : hasInconclusive
        ? '\n**Result: ⚠️ Inconclusive — no hard failures.**'
        : '\n**Result: ✅ Passed — all checks succeeded.**',
  );
  return hasFail;
}

async function main() {
  const pluginPaths = process.argv.slice(2);
  if (pluginPaths.length === 0) {
    console.error(
      'Usage: node scripts/live-check-plugin.mjs <plugin.ts> [more.ts...]',
    );
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const pluginPath of pluginPaths) {
    results.push(await checkPlugin(pluginPath));
  }

  const hasFail = printReport(results);
  // Set exitCode rather than calling process.exit(): fetch's keep-alive
  // sockets can still be mid-close here, and an abrupt exit() while libuv
  // has a handle in that state crashes the process on Windows.
  process.exitCode = hasFail ? 1 : 0;
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
