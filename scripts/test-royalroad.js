// Run offline with: node --test scripts/test-royalroad.js
// Exercise the actual plugin compiled to ES5, with isolated app/network stubs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../plugins/english/royalroad.ts', import.meta.url),
  'utf8',
);
// Expose the private hash search only in this in-memory test compilation.
const code = ts.transpileModule(source + '\nexport { nonceSearch };', {
  compilerOptions: {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const botError = /bot check could not be passed/;
const url = 'https://www.royalroad.com/fiction/1';
const response = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  text: async () => body,
});
const challenge = (difficulty = 0, algorithm = 'fast') =>
  '<script id="anubis_challenge" type="application/json">' +
  JSON.stringify({
    rules: { difficulty, algorithm },
    challenge: { id: 'offline-example', randomData: 'a'.repeat(128) },
  }) +
  '</script>';

function loadPlugin(fetchApi) {
  const exports = {};
  const stubs = {
    '@libs/fetch': { fetchApi },
    '@libs/storage': { storage: { get: () => undefined } },
    '@libs/filterInputs': { FilterTypes: {} },
    '@libs/novelStatus': { NovelStatus: {} },
    '@libs/isAbsoluteUrl': { isUrlAbsolute: value => /^https?:/.test(value) },
  };
  runInNewContext(code, {
    exports,
    require: name => stubs[name] || require(name),
    URLSearchParams,
    setTimeout,
  });
  return { plugin: exports.default, nonceSearch: exports.nonceSearch };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => (resolve = done));
  return { promise, resolve };
}

test('hashes match Node SHA-256 across padding, block and nonce boundaries', () => {
  const { nonceSearch } = loadPlugin(() => assert.fail('unexpected request'));
  for (const length of [
    0, 1, 53, 54, 55, 56, 62, 63, 64, 65, 119, 120, 127, 128,
  ]) {
    for (const nonce of [0, 9, 10, 99, 100, 4095, 4096, 65536]) {
      const data = 'a'.repeat(length);
      const found = nonceSearch(data, 0)(nonce, nonce + 1);
      assert.equal(found.nonce, nonce);
      assert.equal(
        found.hash,
        createHash('sha256')
          .update(data + nonce)
          .digest('hex'),
      );
    }
  }
});

test('difficulty checks and search batches produce a valid proof', () => {
  const { nonceSearch } = loadPlugin();
  for (const difficulty of [1, 2, 3, 4]) {
    const search = nonceSearch('offline', difficulty);
    let found;
    for (let from = 0; from < 1000000 && !found; from += 4096) {
      found = search(from, from + 4096);
    }
    assert.ok(found);
    assert.ok(found.hash.startsWith('0'.repeat(difficulty)));
    assert.equal(
      found.hash,
      createHash('sha256')
        .update('offline' + found.nonce)
        .digest('hex'),
    );
  }
});

for (const status of [403, 500]) {
  test(`initial HTTP ${status} rejects instead of parsing empty content`, async () => {
    const { plugin } = loadPlugin(async () =>
      response('<h1>Error</h1>', status),
    );
    await assert.rejects(
      plugin.parseChapter('fiction/1'),
      new RegExp(`HTTP ${status}`),
    );
    await assert.rejects(plugin.fetchHtml(url), new RegExp(`HTTP ${status}`));
  });
  test(`pass HTTP ${status} rejects and the next request can recover`, async () => {
    let fail = true;
    let passes = 0;
    const { plugin } = loadPlugin(async request => {
      if (!request.includes('/pass-challenge?')) return response(challenge());
      passes++;
      return response(fail ? '<h1>Error</h1>' : 'content', fail ? status : 200);
    });
    await assert.rejects(plugin.fetchHtml(url), botError);
    fail = false;
    assert.equal(await plugin.fetchHtml(url), 'content');
    assert.equal(passes, 2);
  });
}

for (const [difficulty, algorithm] of [
  [5, 'fast'],
  [1, 'unknown'],
]) {
  test(`unsupported challenge ${algorithm}/${difficulty} stops before submitting`, async () => {
    let calls = 0;
    const { plugin } = loadPlugin(async () => {
      calls++;
      return response(challenge(difficulty, algorithm));
    });
    await assert.rejects(plugin.fetchHtml(url), botError);
    assert.equal(calls, 1);
  });
}

test('repeated challenge after passing stops without a loop', async () => {
  let calls = 0;
  const { plugin } = loadPlugin(async () => {
    calls++;
    return response(challenge());
  });
  await assert.rejects(plugin.fetchHtml(url), botError);
  assert.equal(calls, 2);
});

for (const retryStatus of [200, 403, 500]) {
  test(`concurrent pages share a solve and check retry status ${retryStatus}`, async () => {
    const started = deferred();
    const finish = deferred();
    let passes = 0;
    let passed = false;
    const { plugin } = loadPlugin(async request => {
      if (request.includes('/pass-challenge?')) {
        passes++;
        const params = new URL(request).searchParams;
        assert.equal(
          params.get('response'),
          createHash('sha256')
            .update('a'.repeat(128) + params.get('nonce'))
            .digest('hex'),
        );
        started.resolve();
        await finish.promise;
        passed = true;
        return response(params.get('redir'));
      }
      return passed ? response(request, retryStatus) : response(challenge());
    });
    const first = plugin.fetchHtml(url);
    const second = plugin.fetchHtml(url + '/chapter/2');
    const results = Promise.allSettled([first, second]);
    await started.promise;
    // Also cover a request arriving while the solve is already in progress.
    const late = plugin.fetchHtml(url + '/chapter/3');
    const lateResult = Promise.allSettled([late]);
    finish.resolve();
    const [a, b] = await results;
    const [c] = await lateResult;
    assert.equal(a.value, url);
    for (const [result, suffix] of [
      [b, '/chapter/2'],
      [c, '/chapter/3'],
    ]) {
      if (retryStatus === 200) assert.equal(result.value, url + suffix);
      else {
        assert.equal(result.status, 'rejected');
        assert.match(result.reason.message, new RegExp(`HTTP ${retryStatus}`));
      }
    }
    assert.equal(passes, 1);
  });
}

test('network rejection clears the shared solve for a later request', async () => {
  let failed = false;
  const { plugin } = loadPlugin(async request => {
    if (!request.includes('/pass-challenge?'))
      return response(challenge(0, 'slow'));
    if (!failed) {
      failed = true;
      throw new Error('offline network failure');
    }
    return response('recovered');
  });
  await assert.rejects(plugin.fetchHtml(url), /offline network failure/);
  assert.equal(await plugin.fetchHtml(url), 'recovered');
});

for (const difficulty of [-1, 0.5, null, '4']) {
  test(`malformed difficulty ${JSON.stringify(difficulty)} fails before hashing`, async () => {
    let calls = 0;
    const { plugin } = loadPlugin(async () => {
      calls++;
      return response(challenge(difficulty));
    });
    await assert.rejects(plugin.fetchHtml(url), botError);
    assert.equal(calls, 1);
  });
}

test('a failed shared submission rejects all waiting pages and permits recovery', async () => {
  const started = deferred();
  const finish = deferred();
  let fail = true;
  let passes = 0;
  const { plugin } = loadPlugin(async request => {
    if (!request.includes('/pass-challenge?')) return response(challenge());
    passes++;
    started.resolve();
    await finish.promise;
    return response('content', fail ? 500 : 200);
  });
  const results = Promise.allSettled([
    plugin.fetchHtml(url),
    plugin.fetchHtml(url + '/chapter/2'),
  ]);
  await started.promise;
  finish.resolve();
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, botError);
  }
  assert.equal(passes, 1);
  fail = false;
  assert.equal(await plugin.fetchHtml(url), 'content');
  assert.equal(passes, 2);
});

test('successful pages bypass the solver and reach the chapter parser', async () => {
  let calls = 0;
  const { plugin } = loadPlugin(async () => {
    calls++;
    return response(
      '<div class="chapter-content"><p>Offline chapter.</p></div>',
    );
  });
  assert.match(await plugin.parseChapter('fiction/1'), /Offline chapter\./);
  assert.equal(calls, 1);
});

for (const status of [200, 403]) {
  for (const stage of ['initial', 'submission', 'retry']) {
    test(`Cloudflare HTTP ${status} during ${stage} rejects with response metadata`, async () => {
      const started = deferred();
      const finish = deferred();
      let passed = false;
      let submissions = 0;
      const blocked = response('<h1>Just a moment...</h1>', status, {
        'cf-mitigated': 'challenge',
      });

      const { plugin } = loadPlugin(async request => {
        if (request.includes('/pass-challenge?')) {
          submissions++;
          started.resolve();
          await finish.promise;
          passed = true;
          return stage === 'submission' ? blocked : response('content');
        }
        if (stage === 'initial' || passed) return blocked;
        return response(challenge());
      });

      const results = Promise.allSettled([
        plugin.fetchHtml(url),
        plugin.fetchHtml(url + '/chapter/2'),
      ]);

      if (stage !== 'initial') {
        await started.promise;
        finish.resolve();
      }

      const settled = await results;
      if (stage === 'retry') {
        assert.equal(settled[0].status, 'fulfilled');
        assert.equal(settled[0].value, 'content');
      }

      const rejected = stage === 'retry' ? settled.slice(1) : settled;
      for (const result of rejected) {
        assert.equal(result.status, 'rejected');
        assert.match(result.reason.message, botError);
        assert.equal(result.reason.response, blocked);
        assert.equal(result.reason.response.status, status);
        assert.equal(
          result.reason.response.headers.get('cf-mitigated'),
          'challenge',
        );
      }
      assert.equal(submissions, stage === 'initial' ? 0 : 1);
    });
  }
}

for (const status of [403, 503, 500]) {
  test(`ordinary HTTP ${status} preserves its status and message`, async () => {
    const failed = response('<h1>Request failed</h1>', status);
    const { plugin } = loadPlugin(async () => failed);

    await assert.rejects(plugin.fetchHtml(url), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.equal(error.response, failed);
      return true;
    });
  });
}
