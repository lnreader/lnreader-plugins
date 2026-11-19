import test from 'node:test';
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
const LONG_CHAPTER = 'Chapter body text. '.repeat(20);

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      resolve({
        baseUrl,
        close: () =>
          new Promise(closeResolve => {
            server.closeAllConnections?.();
            server.close(() => closeResolve());
          }),
      });
    });
  });
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

test('popularNovels throws plain error on HTTP 429 -> INCONCLUSIVE', async () => {
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list') {
      res.writeHead(429, { 'content-type': 'text/plain' });
      return res.end('Too Many Requests');
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          const res = await fetchApi(site + '/list');
          if (!res.ok) throw new Error(\`Novelas MTL: HTTP \${res.status}.\`);
          return [];
        },
        searchNovels: async () => [],
        parseNovel: async () => ({ name: 'Novel', path: '/novel/1', chapters: [] }),
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 0);
    assert.ok(
      stdout.includes(
        '| `popularNovels` | ⚠️ INCONCLUSIVE | HTTP 429 (rate limited) (was: Novelas MTL: HTTP 429.) |',
      ),
      stdout,
    );
  } finally {
    await server.close();
  }
});

test('parseNovel throws localized error on HTTP 429 -> INCONCLUSIVE', async () => {
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list' || req.url === '/search') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify([{ name: 'Novel One', path: '/novel/1' }]));
    }
    if (req.url === '/novel/1') {
      res.writeHead(429);
      return res.end('Rate limited');
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          const res = await fetchApi(site + '/list');
          return res.json();
        },
        searchNovels: async () => {
          const res = await fetchApi(site + '/search');
          return res.json();
        },
        parseNovel: async (path: string) => {
          const res = await fetchApi(site + path);
          if (!res.ok) throw new Error(\`No se pudo acceder a la novela (\${res.status}).\`);
          return { name: 'Novel One', path, chapters: [] };
        },
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `parseNovel` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: No se pudo acceder a la novela \(429\)\.\) \|/,
    );
  } finally {
    await server.close();
  }
});

test('parseChapter throws on HTTP 429 -> INCONCLUSIVE', async () => {
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list' || req.url === '/search') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify([{ name: 'Novel One', path: '/novel/1' }]));
    }
    if (req.url === '/novel/1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          name: 'Novel One',
          path: '/novel/1',
          chapters: [{ name: 'Ch 1', path: '/chapter/1' }],
        }),
      );
    }
    if (req.url === '/chapter/1') {
      res.writeHead(429);
      return res.end('Too Many Requests');
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => (await fetchApi(site + '/list')).json(),
        searchNovels: async () => (await fetchApi(site + '/search')).json(),
        parseNovel: async (path: string) => (await fetchApi(site + path)).json(),
        parseChapter: async (path: string) => {
          const res = await fetchApi(site + path);
          if (!res.ok) throw new Error(\`EightysixAR: HTTP \${res.status}.\`);
          return res.text();
        },
      };
    `);

    assert.equal(code, 0);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseNovel` \| ✅ PASS \|/);
    assert.match(
      stdout,
      /\| `parseChapter` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: EightysixAR: HTTP 429\.\) \|/,
    );
  } finally {
    await server.close();
  }
});

test('fetchText swallows HTTP 429 and returns empty list -> INCONCLUSIVE', async () => {
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list') {
      res.writeHead(429, { 'content-type': 'text/html' });
      return res.end('<html>Too Many Requests</html>');
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchText } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          const html = await fetchText(site + '/list');
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        },
        searchNovels: async () => [],
        parseNovel: async () => ({ name: 'Novel', path: '/novel/1', chapters: [] }),
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 0);
    assert.match(
      stdout,
      /\| `popularNovels` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \(was: Returned no novels\) \|/,
    );
  } finally {
    await server.close();
  }
});

test('retry recovers from HTTP 429 and passes -> all PASS', async () => {
  let listCalls = 0;
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list') {
      listCalls += 1;
      if (listCalls === 1) {
        res.writeHead(429);
        return res.end('Rate limit');
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<div class="novel-item">Novel One</div>');
    }
    if (req.url === '/search') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify([{ name: 'Novel One', path: '/novel/1' }]));
    }
    if (req.url === '/novel/1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          name: 'Novel One',
          path: '/novel/1',
          chapters: [{ name: 'Ch 1', path: '/chapter/1' }],
        }),
      );
    }
    if (req.url === '/chapter/1') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(LONG_CHAPTER);
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          let res = await fetchApi(site + '/list');
          if (res.status === 429) {
            res = await fetchApi(site + '/list');
          }
          const html = await res.text();
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        },
        searchNovels: async () => (await fetchApi(site + '/search')).json(),
        parseNovel: async (path: string) => (await fetchApi(site + path)).json(),
        parseChapter: async (path: string) => (await fetchApi(site + path)).text(),
      };
    `);

    assert.equal(code, 0);
    assert.equal(listCalls, 2);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseNovel` \| ✅ PASS \|/);
    assert.match(stdout, /\| `parseChapter` \| ✅ PASS \|/);
    assert.ok(!stdout.includes('INCONCLUSIVE'), stdout);
  } finally {
    await server.close();
  }
});

test('adversarial: retry recovers from 429 (200 OK) then plugin fails on real selector bug -> FAIL', async () => {
  let listCalls = 0;
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list') {
      listCalls += 1;
      if (listCalls === 1) {
        res.writeHead(429);
        return res.end('Rate limit');
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><div>unexpected markup</div></html>');
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          let res = await fetchApi(site + '/list');
          if (res.status === 429) {
            res = await fetchApi(site + '/list');
          }
          const html = await res.text();
          return html.includes('novel-item')
            ? [{ name: 'Novel One', path: '/novel/1' }]
            : [];
        },
        searchNovels: async () => [],
        parseNovel: async () => ({ name: 'Novel', path: '/novel/1', chapters: [] }),
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 1);
    assert.equal(listCalls, 2);
    assert.match(
      stdout,
      /\| `popularNovels` \| ❌ FAIL \| Returned no novels \|/,
    );
  } finally {
    await server.close();
  }
});

test('adversarial: late HTTP 429 from earlier step does not mask later real failure', async () => {
  let releaseLate;
  const lateGate = new Promise(resolve => {
    releaseLate = resolve;
  });

  const server = await startServer(async (req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/late-429') {
      await lateGate;
      res.writeHead(429);
      return res.end('Too Many Requests');
    }
    if (req.url === '/release') {
      releaseLate();
      res.writeHead(200);
      return res.end('ok');
    }
    if (req.url === '/novel/1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          name: 'Novel One',
          path: '/novel/1',
          chapters: [{ name: 'Ch 1', path: '/chapter/1' }],
        }),
      );
    }
    if (req.url === '/chapter/1') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(LONG_CHAPTER);
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      let latePromise: Promise<Response>;
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          latePromise = fetch(site + '/late-429');
          return [{ name: 'Novel One', path: '/novel/1' }];
        },
        searchNovels: async () => {
          await fetch(site + '/release');
          await latePromise;
          throw new Error('real plugin bug');
        },
        parseNovel: async (path: string) => (await fetchApi(site + path)).json(),
        parseChapter: async (path: string) => (await fetchApi(site + path)).text(),
      };
    `);

    assert.equal(code, 1);
    assert.match(stdout, /\| `popularNovels` \| ✅ PASS \|/);
    assert.match(stdout, /\| `searchNovels` \| ❌ FAIL \| real plugin bug \|/);
  } finally {
    releaseLate();
    await server.close();
  }
});

test('adversarial: error message containing "429" without actual HTTP 429 stays FAIL', async () => {
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    if (req.url === '/list') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><body>ok</body></html>');
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      import { fetchApi } from '@libs/fetch';
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          await fetchApi(site + '/list');
          throw new Error('Chapter 429 not found');
        },
        searchNovels: async () => [],
        parseNovel: async () => ({ name: 'Novel', path: '/novel/1', chapters: [] }),
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 1);
    assert.match(
      stdout,
      /\| `popularNovels` \| ❌ FAIL \| Chapter 429 not found \|/,
    );
  } finally {
    await server.close();
  }
});

test('root site probe returns HTTP 429 -> siteReachability INCONCLUSIVE', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(429);
    res.end('Too Many Requests');
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => [],
        searchNovels: async () => [],
        parseNovel: async () => ({ name: 'Novel', path: '/novel/1', chapters: [] }),
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 0);
    assert.match(
      stdout,
      /\| `siteReachability` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \|/,
    );
  } finally {
    await server.close();
  }
});

test('structured HTTP error with status 429 (without fetch) -> INCONCLUSIVE', async () => {
  const server = await startServer((req, res) => {
    if (req.method === 'HEAD' && req.url === '/') {
      res.writeHead(200);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const { code, stdout } = await runLiveCheck(`
      const site = '${server.baseUrl}';
      export default {
        id: 'test429',
        name: 'Test 429',
        site,
        version: '1.0.0',
        popularNovels: async () => {
          throw Object.assign(new Error('Too Many Requests'), { status: 429 });
        },
        searchNovels: async () => [],
        parseNovel: async () => ({ name: 'Novel', path: '/novel/1', chapters: [] }),
        parseChapter: async () => '',
      };
    `);

    assert.equal(code, 0);
    assert.match(
      stdout,
      /\| `popularNovels` \| ⚠️ INCONCLUSIVE \| HTTP 429 \(rate limited\) \|/,
    );
  } finally {
    await server.close();
  }
});
