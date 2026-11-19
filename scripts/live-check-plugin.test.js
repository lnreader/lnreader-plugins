import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'live-check-plugin.js');

const NOVEL_LIST_JSON = JSON.stringify([
  { name: 'Novel One', path: '/novel/1' },
]);
const NOVEL_DETAIL_JSON = JSON.stringify({
  name: 'Novel One',
  path: '/novel/1',
  chapters: [{ name: 'Ch 1', path: '/chapter/1' }],
});
const LONG_CHAPTER = 'Chapter body text. '.repeat(20);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStandardRoute(req, res) {
  if (req.url === '/list' || req.url === '/search') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(NOVEL_LIST_JSON);
    return true;
  }
  if (req.url === '/novel/1') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(NOVEL_DETAIL_JSON);
    return true;
  }
  if (req.url === '/chapter/1') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(LONG_CHAPTER);
    return true;
  }
  return false;
}

function createTestServer(t, handler = null, { rootStatus = 200 } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(rootStatus);
      res.end();
      return;
    }
    if (handler) {
      await handler(req, res);
    }
    if (!res.writableEnded) {
      res.writeHead(404);
      res.end();
    }
  });

  t.after(
    () =>
      new Promise(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  );

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function makePluginSource(
  baseUrl,
  { imports = [], setup = '', methods = {} } = {},
) {
  const importLine =
    imports.length > 0
      ? `import { ${imports.join(', ')} } from '@libs/fetch';\n`
      : '';
  const popularNovels = methods.popularNovels ?? 'async () => []';
  const searchNovels = methods.searchNovels ?? 'async () => []';
  const parseNovel =
    methods.parseNovel ??
    "async () => ({ name: 'Novel', path: '/novel/1', chapters: [] })";
  const parseChapter = methods.parseChapter ?? "async () => ''";

  return `${importLine}const site = '${baseUrl}';
${setup}
export default {
  id: 'test429',
  name: 'Test 429',
  site,
  version: '1.0.0',
  popularNovels: ${popularNovels},
  searchNovels: ${searchNovels},
  parseNovel: ${parseNovel},
  parseChapter: ${parseChapter},
};`;
}

async function runLiveCheck(pluginSource) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-check-429-'));
  const pluginPath = path.join(tmpDir, 'test-plugin.ts');
  await fs.writeFile(pluginPath, pluginSource, 'utf8');

  try {
    return await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [SCRIPT_PATH, pluginPath],
        { cwd: REPO_ROOT },
        (error, stdout, stderr) => {
          if (error && typeof error.code !== 'number') {
            reject(error);
            return;
          }
          resolve({
            code: error ? error.code : 0,
            stdout,
            stderr,
          });
        },
      );
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

describe('live-check-plugin HTTP 429 handling', { concurrency: 4 }, () => {
  test('popularNovels throws plain error on HTTP 429 -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/list') {
        res.writeHead(429, { 'content-type': 'text/plain' });
        res.end('Too Many Requests');
      }
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: `async () => {
          const res = await fetchApi(site + '/list');
          if (!res.ok) throw new Error(\`Novelas MTL: HTTP \${res.status}.\`);
          return [];
        }`,
        },
      }),
    );

    assert.equal(code, 0);
    assert.ok(
      stdout.includes(
        '| `popularNovels` | ⚠️ INCONCLUSIVE | HTTP 429 (rate limited) (was: Novelas MTL: HTTP 429.) |',
      ),
      stdout,
    );
  });

  test('parseNovel throws localized error on HTTP 429 -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/novel/1') {
        res.writeHead(429);
        res.end('Rate limited');
        return;
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: "async () => (await fetchApi(site + '/list')).json()",
          searchNovels: "async () => (await fetchApi(site + '/search')).json()",
          parseNovel: `async (path: string) => {
          const res = await fetchApi(site + path);
          if (!res.ok) throw new Error(\`No se pudo acceder a la novela (\${res.status}).\`);
          return { name: 'Novel One', path, chapters: [] };
        }`,
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `parseNovel` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: No se pudo acceder a la novela \(429\)\.\) \|/,
    );
  });

  test('parseChapter throws on HTTP 429 -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/chapter/1') {
        res.writeHead(429);
        res.end('Too Many Requests');
        return;
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: "async () => (await fetchApi(site + '/list')).json()",
          searchNovels: "async () => (await fetchApi(site + '/search')).json()",
          parseNovel:
            'async (path: string) => (await fetchApi(site + path)).json()',
          parseChapter: `async (path: string) => {
          const res = await fetchApi(site + path);
          if (!res.ok) throw new Error(\`EightysixAR: HTTP \${res.status}.\`);
          return res.text();
        }`,
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseNovel` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `parseChapter` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: EightysixAR: HTTP 429\.\) \|/,
    );
  });

  test('fetchText swallows HTTP 429 and returns empty list -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/list') {
        res.writeHead(429, { 'content-type': 'text/html' });
        res.end('<html>Too Many Requests</html>');
      }
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchText'],
        methods: {
          popularNovels: `async () => {
          const html = await fetchText(site + '/list');
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        }`,
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(
      stdout,
      /\| `popularNovels` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: Returned no novels\) \|/,
    );
  });

  test('retry recovers from HTTP 429 and passes -> all PASS', async t => {
    let listCalls = 0;
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/list') {
        listCalls += 1;
        if (listCalls === 1) {
          res.writeHead(429);
          res.end('Rate limit');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<div class="novel-item">Novel One</div>');
        return;
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: `async () => {
          let res = await fetchApi(site + '/list');
          if (res.status === 429) {
            res = await fetchApi(site + '/list');
          }
          const html = await res.text();
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        }`,
          searchNovels: "async () => (await fetchApi(site + '/search')).json()",
          parseNovel:
            'async (path: string) => (await fetchApi(site + path)).json()',
          parseChapter:
            'async (path: string) => (await fetchApi(site + path)).text()',
        },
      }),
    );

    assert.equal(code, 0);
    assert.equal(listCalls, 2);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseNovel` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseChapter` \| ✅ PASS \|/);
    assert.ok(!stdout.includes('INCONCLUSIVE'), stdout);
  });

  test('adversarial: retry recovers from 429 (200 OK) then plugin fails on real selector bug -> FAIL', async t => {
    let listCalls = 0;
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/list') {
        listCalls += 1;
        if (listCalls === 1) {
          res.writeHead(429);
          res.end('Rate limit');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><div>unexpected markup</div></html>');
      }
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: `async () => {
          let res = await fetchApi(site + '/list');
          if (res.status === 429) {
            res = await fetchApi(site + '/list');
          }
          const html = await res.text();
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        }`,
        },
      }),
    );

    assert.equal(code, 1);
    assert.equal(listCalls, 2);
    assert.match(
      stdout,
      /\| `popularNovels` \| ❌ FAIL \| Returned no novels \|/,
    );
  });

  test('adversarial: late HTTP 429 from earlier step does not mask later real failure', async t => {
    let releaseLate;
    const lateGate = new Promise(resolve => {
      releaseLate = resolve;
    });
    t.after(() => releaseLate());

    const baseUrl = await createTestServer(t, async (req, res) => {
      if (req.url === '/late-429') {
        await lateGate;
        res.writeHead(429);
        res.end('Too Many Requests');
        return;
      }
      if (req.url === '/release') {
        releaseLate();
        res.writeHead(200);
        res.end('ok');
        return;
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        setup: 'let latePromise: Promise<Response>;',
        methods: {
          popularNovels: `async () => {
          latePromise = fetch(site + '/late-429');
          return [{ name: 'Novel One', path: '/novel/1' }];
        }`,
          searchNovels: `async () => {
          await fetch(site + '/release');
          await latePromise;
          throw new Error('real plugin bug');
        }`,
          parseNovel:
            'async (path: string) => (await fetchApi(site + path)).json()',
          parseChapter:
            'async (path: string) => (await fetchApi(site + path)).text()',
        },
      }),
    );

    assert.equal(code, 1);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ❌ FAIL \| real plugin bug \|/);
  });

  test('adversarial: error message containing "429" without actual HTTP 429 stays FAIL', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/list') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body>ok</body></html>');
      }
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: `async () => {
          await fetchApi(site + '/list');
          throw new Error('Chapter 429 not found');
        }`,
        },
      }),
    );

    assert.equal(code, 1);
    assert.match(
      stdout,
      /\| `popularNovels` \| ❌ FAIL \| Chapter 429 not found \|/,
    );
  });

  test('root site probe returns HTTP 429 -> siteReachability INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, null, { rootStatus: 429 });

    const { code, stdout } = await runLiveCheck(makePluginSource(baseUrl));

    assert.equal(code, 0);
    assert.match(
      stdout,
      /\| `siteReachability` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \|/,
    );
  });

  test('structured HTTP error with status 429 (without fetch) -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t);

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        methods: {
          popularNovels: `async () => {
          throw Object.assign(new Error('Too Many Requests'), { status: 429 });
        }`,
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(
      stdout,
      /\| `popularNovels` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \|/,
    );
  });

  test('searchNovels throws on HTTP 429 -> INCONCLUSIVE (other steps PASS)', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/search') {
        res.writeHead(429);
        res.end('Rate limited');
        return;
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: "async () => (await fetchApi(site + '/list')).json()",
          searchNovels: `async () => {
          const res = await fetchApi(site + '/search');
          if (!res.ok) throw new Error('Search HTTP 429');
          return [];
        }`,
          parseNovel:
            'async (path: string) => (await fetchApi(site + path)).json()',
          parseChapter:
            'async (path: string) => (await fetchApi(site + path)).text()',
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `searchNovels` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: Search HTTP 429\) \|/,
    );
    assert.match(stdout, /\| `parseNovel` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseChapter` \| ✅ PASS \|/);
  });

  test('fetchFile swallows HTTP 429 -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, (req, res) => {
      if (req.url === '/chapter/1') {
        res.writeHead(429);
        res.end('Too Many Requests');
        return;
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi', 'fetchFile'],
        methods: {
          popularNovels: "async () => (await fetchApi(site + '/list')).json()",
          searchNovels: "async () => (await fetchApi(site + '/search')).json()",
          parseNovel:
            'async (path: string) => (await fetchApi(site + path)).json()',
          parseChapter: 'async (path: string) => await fetchFile(site + path)',
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseNovel` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `parseChapter` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: Content too short/,
    );
  });

  test('shared POST endpoint with different bodies preserves HTTP 429 -> INCONCLUSIVE', async t => {
    const baseUrl = await createTestServer(t, async (req, res) => {
      if (req.method === 'POST' && req.url === '/admin-ajax.php') {
        const body = await readBody(req);
        if (body === 'action=chapters') {
          res.writeHead(429);
          res.end('Rate limited');
          return;
        }
        if (body === 'action=meta') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ name: 'Novel One' }));
          return;
        }
      }
      serveStandardRoute(req, res);
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: "async () => (await fetchApi(site + '/list')).json()",
          searchNovels: "async () => (await fetchApi(site + '/search')).json()",
          parseNovel: `async (path: string) => {
          const chaptersRes = await fetchApi(site + '/admin-ajax.php', {
            method: 'POST',
            body: 'action=chapters',
          });
          const metaRes = await fetchApi(site + '/admin-ajax.php', {
            method: 'POST',
            body: 'action=meta',
          });
          const meta = await metaRes.json();
          if (!chaptersRes.ok) {
            return { name: meta.name, path, chapters: [] };
          }
          return {
            name: meta.name,
            path,
            chapters: [{ name: 'Ch 1', path: '/chapter/1' }],
          };
        }`,
        },
      }),
    );

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `parseNovel` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: No chapters returned\) \|/,
    );
  });

  test('adversarial: shared POST endpoint retry with same body recovers then selector fails -> FAIL', async t => {
    let postCalls = 0;
    const baseUrl = await createTestServer(t, async (req, res) => {
      if (req.method === 'POST' && req.url === '/admin-ajax.php') {
        const body = await readBody(req);
        if (body === 'action=list') {
          postCalls += 1;
          if (postCalls === 1) {
            res.writeHead(429);
            res.end('Rate limit');
            return;
          }
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<html><div>unexpected markup</div></html>');
        }
      }
    });

    const { code, stdout } = await runLiveCheck(
      makePluginSource(baseUrl, {
        imports: ['fetchApi'],
        methods: {
          popularNovels: `async () => {
          let res = await fetchApi(site + '/admin-ajax.php', {
            method: 'POST',
            body: 'action=list',
          });
          if (res.status === 429) {
            res = await fetchApi(site + '/admin-ajax.php', {
              method: 'POST',
              body: 'action=list',
            });
          }
          const html = await res.text();
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        }`,
        },
      }),
    );

    assert.equal(code, 1);
    assert.equal(postCalls, 2);
    assert.match(
      stdout,
      /\| `popularNovels` \| ❌ FAIL \| Returned no novels \|/,
    );
  });
});
