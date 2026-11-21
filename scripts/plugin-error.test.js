import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { minify } from './terser.js';
import { isNetworkOrBlockError } from './live-check-plugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

async function loadPluginErrorModule() {
  const entry = path.join(REPO_ROOT, 'src/libs/pluginError.ts');
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
    logLevel: 'silent',
  });
  const tmpFile = path.join(
    os.tmpdir(),
    `plugin-error-test-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`,
  );
  await fs.writeFile(tmpFile, result.outputFiles[0].text, 'utf8');
  try {
    return require(tmpFile);
  } finally {
    delete require.cache[require.resolve(tmpFile)];
    await fs.unlink(tmpFile).catch(() => undefined);
  }
}

describe('@libs/pluginError', () => {
  it('exposes PluginError constants, createPluginError, httpError, checkResponse, assertNoChallenge, and isPluginError', async () => {
    const mod = await loadPluginErrorModule();
    const {
      PluginError,
      createPluginError,
      httpError,
      checkResponse,
      isChallengeHtml,
      assertNoChallenge,
      isPluginError,
    } = mod;

    assert.equal(PluginError.Captcha, 'Captcha error, please open in webview');
    assert.equal(
      PluginError.Cloudflare,
      'Cloudflare is blocking requests. Try again later.',
    );
    assert.equal(
      PluginError.RateLimited,
      'Too many requests (429). Please try again later.',
    );

    const customErr = createPluginError(PluginError.EmptyContent, {
      status: 200,
      message: 'Custom empty',
      url: 'https://example.com/ch1',
    });
    assert.ok(customErr instanceof Error);
    assert.equal(customErr.code, PluginError.EmptyContent);
    assert.equal(customErr.status, 200);
    assert.equal(customErr.message, 'Custom empty');
    assert.equal(customErr.url, 'https://example.com/ch1');
    assert.equal(isPluginError(customErr), true);
    assert.equal(isPluginError(new Error('plain')), false);

    const err401 = httpError(401);
    assert.equal(err401.code, PluginError.AuthRequired);
    assert.equal(err401.status, 401);

    const err403 = httpError(403);
    assert.equal(err403.code, PluginError.Cloudflare);
    assert.equal(err403.status, 403);

    const err503 = httpError(503);
    assert.equal(err503.code, PluginError.Cloudflare);
    assert.equal(err503.status, 503);

    const err404 = httpError(404);
    assert.equal(err404.code, PluginError.NotFound);
    assert.equal(err404.status, 404);

    const err429 = httpError(429);
    assert.equal(err429.code, PluginError.RateLimited);
    assert.equal(err429.status, 429);

    const err500 = httpError(500);
    assert.equal(err500.code, PluginError.NetworkError);
    assert.equal(err500.status, 500);

    const okRes = { ok: true, status: 200, url: 'https://example.com' };
    assert.equal(checkResponse(okRes), okRes);

    const searchRes = { ok: false, status: 404, url: 'https://example.com' };
    assert.equal(checkResponse(searchRes, { search: true }), searchRes);

    assert.throws(
      () =>
        checkResponse(
          { ok: false, status: 404, url: 'https://example.com/n' },
          { notFoundCode: PluginError.NovelNotFound },
        ),
      err =>
        isPluginError(err) &&
        err.code === PluginError.NovelNotFound &&
        err.status === 404,
    );

    assert.throws(
      () =>
        checkResponse({
          ok: false,
          status: 429,
          url: 'https://example.com/p',
        }),
      err =>
        isPluginError(err) &&
        err.code === PluginError.RateLimited &&
        err.status === 429,
    );

    assert.equal(isChallengeHtml('<title>Just a moment...</title>'), true);
    assert.equal(
      isChallengeHtml(
        '<title>Novel</title>',
        'https://example.com/book',
        'https://captcha.other.org/verify',
      ),
      true,
    );
    assert.equal(
      isChallengeHtml(
        '<title>Novel</title>',
        'https://example.com/book',
        'https://www.example.com/book',
      ),
      false,
    );
    assert.throws(
      () => assertNoChallenge('<title>Bot Verification</title>'),
      err => isPluginError(err) && err.code === PluginError.Captcha,
    );
  });
});

describe('live-check-plugin error classification', () => {
  it('marks Captcha, Cloudflare, RateLimited, and HTTP 429 errors as INCONCLUSIVE', async () => {
    const { PluginError, createPluginError, httpError } =
      await loadPluginErrorModule();

    for (const error of [
      createPluginError(PluginError.Captcha),
      createPluginError(PluginError.Cloudflare),
      httpError(429),
      new Error(PluginError.Captcha),
      new Error(PluginError.RateLimited),
    ]) {
      assert.equal(
        isNetworkOrBlockError(error).inconclusive,
        true,
        `Expected inconclusive for: ${error.message}`,
      );
    }
  });

  it('keeps NotFound, NovelNotFound, ChapterNotFound, EmptyContent, InvalidResponse, and AuthRequired errors as FAIL', async () => {
    const { PluginError, createPluginError } = await loadPluginErrorModule();

    for (const error of [
      createPluginError(PluginError.NotFound, { status: 404 }),
      createPluginError(PluginError.NovelNotFound, { status: 404 }),
      createPluginError(PluginError.ChapterNotFound, { status: 404 }),
      createPluginError(PluginError.EmptyContent),
      createPluginError(PluginError.InvalidResponse),
      createPluginError(PluginError.AuthRequired, { status: 401 }),
    ]) {
      assert.equal(
        isNetworkOrBlockError(error).inconclusive,
        false,
        `Expected FAIL for: ${error.message}`,
      );
    }
  });
});

describe('scripts/terser.js fallback injection', () => {
  it('injects ES5 fallback when host require("@libs/pluginError") returns undefined', async () => {
    const { PluginError } = await loadPluginErrorModule();
    const tmpFile = path.join(
      os.tmpdir(),
      `terser-plugin-error-${Date.now()}-${Math.random().toString(36).slice(2)}.js`,
    );
    const sampleCompiled = [
      '"use strict";',
      'Object.defineProperty(exports, "__esModule", { value: true });',
      'var pluginError_1 = require("@libs/pluginError");',
      'exports.default = { make429: function () { return pluginError_1.httpError(429); } };',
    ].join('\n');

    await fs.writeFile(tmpFile, sampleCompiled, 'utf8');
    try {
      minify(tmpFile);
      const minified = await fs.readFile(tmpFile, 'utf8');
      const instance = Function(
        'require',
        'module',
        `const exports = module.exports = {};\n${minified}\nreturn exports.default;`,
      )(() => undefined, {});

      const err = instance.make429();
      assert.ok(err instanceof Error);
      assert.equal(err.status, 429);
      assert.equal(err.code, PluginError.RateLimited);
    } finally {
      await fs.unlink(tmpFile).catch(() => undefined);
    }
  });
});
