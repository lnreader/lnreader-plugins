// Run with: node --test scripts/live-check-plugin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkPlugin, installChallengeDetector } from './live-check-plugin.js';

installChallengeDetector();

// Root probe always succeeds (as on the GitHub runner); /list behaves per mode.
function startServer(listResponse) {
  const server = http.createServer((req, res) => {
    if (req.url === '/list') return listResponse(res);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html></html>');
  });
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(server)),
  );
}

async function runAgainst(listResponse) {
  const server = await startServer(listResponse);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-check-test-'));
  const file = path.join(dir, 'plugin.js');
  await fs.writeFile(
    file,
    `const site = 'http://127.0.0.1:${server.address().port}';
     module.exports = { default: {
       site,
       popularNovels: async () => {
         const html = await (await fetch(site + '/list')).text();
         return html.includes('novel-item') ? [{ name: 'a', path: '/a' }] : [];
       },
     } };`,
  );
  try {
    const result = await checkPlugin(file);
    return result.steps[0];
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('cf-mitigated challenge page -> INCONCLUSIVE', async () => {
  const step = await runAgainst(res => {
    res.writeHead(403, { 'cf-mitigated': 'challenge' });
    res.end('<html>Just a moment...</html>');
  });
  assert.equal(step.name, 'popularNovels');
  assert.equal(step.status, 'INCONCLUSIVE');
  assert.match(step.detail, /Cloudflare/);
});

test('challenge served as 200 with cf-mitigated -> INCONCLUSIVE', async () => {
  const step = await runAgainst(res => {
    res.writeHead(200, { 'cf-mitigated': 'challenge' });
    res.end('<html>Just a moment...</html>');
  });
  assert.equal(step.status, 'INCONCLUSIVE');
});

test('403 with Cloudflare headers -> INCONCLUSIVE', async () => {
  const step = await runAgainst(res => {
    res.writeHead(403, { 'cf-ray': 'abc-AMS' });
    res.end('blocked');
  });
  assert.equal(step.status, 'INCONCLUSIVE');
});

test('unchallenged empty result still FAILs', async () => {
  const step = await runAgainst(res => {
    res.writeHead(200, { 'cf-ray': 'abc-AMS' }); // CDN header alone is no block
    res.end('<html>no novels here</html>');
  });
  assert.equal(step.status, 'FAIL');
  assert.equal(step.detail, 'Returned no novels');
});

test('plain 403 without Cloudflare headers still FAILs', async () => {
  const step = await runAgainst(res => {
    res.writeHead(403);
    res.end('forbidden');
  });
  assert.equal(step.status, 'FAIL');
});

test('challenged response does not downgrade a passing step', async () => {
  const step = await runAgainst(res => {
    res.writeHead(200, { 'cf-mitigated': 'challenge' });
    res.end('<div class="novel-item"></div>');
  });
  assert.equal(step.status, 'PASS');
});
