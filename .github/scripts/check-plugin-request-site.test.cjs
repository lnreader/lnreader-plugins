'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  UNREACHABLE_EXIT_CODES,
  checkSiteReachability,
  confirmCloseWithCurrentIssue,
  evaluatePluginRequestSite,
  extractBaseUrl,
  extractWebsiteUrl,
  isPrivateIp,
  probeUrlWithCurl,
} = require('./check-plugin-request-site.cjs');

const SCRIPT_PATH = path.join(__dirname, 'check-plugin-request-site.cjs');
const instantSleep = () => Promise.resolve();

function makePluginRequestBody(url) {
  return [
    '### Plugin Name',
    'Example Novel Site',
    '',
    '### Website URL',
    url,
    '',
    '### Language',
    'English',
    '',
    '### Other Details',
    'Some extra info',
    '',
    '### Acknowledgements',
    '- [x] I have searched existing issues and confirmed this plugin has not been requested before.',
  ].join('\n');
}

test('extractWebsiteUrl and extractBaseUrl parse valid URLs and reject unsafe or malformed inputs', () => {
  assert.equal(
    extractWebsiteUrl(
      makePluginRequestBody('  HTTPS://Example.COM:8443/novels?page=1#top  '),
    ),
    'HTTPS://Example.COM:8443/novels?page=1#top',
  );
  assert.equal(extractWebsiteUrl(makePluginRequestBody('_No response_')), '');
  assert.equal(extractWebsiteUrl('### Plugin Name\nTest'), '');

  assert.equal(
    extractBaseUrl('HTTPS://Example.COM:8443/novels?page=1#top'),
    'example.com:8443',
  );
  assert.equal(
    extractBaseUrl('sub.xn--bcher-kva.de/books'),
    'sub.xn--bcher-kva.de',
  );
  assert.equal(extractBaseUrl('http://novel.example.org'), 'novel.example.org');

  const invalidUrls = [
    '',
    'localhost',
    'http://localhost:3000',
    'https://api.service.local',
    'https://db.internal/path',
    'https://router.lan',
    'https://127.0.0.1:8080',
    'https://192.168.1.1',
    'https://notld',
    'https://example.com:0',
    'https://example.com:99999',
    'https://user@example.com',
    'ftp://example.com',
    'javascript:alert(1)',
    'https://-bad.example.com',
    'https://example..com',
    'https://example.com/path with spaces',
  ];

  for (const invalid of invalidUrls) {
    assert.equal(extractBaseUrl(invalid), '', `expected reject for ${invalid}`);
  }
});

test('isPrivateIp blocks private, loopback, link-local, multicast, and malformed IPs while allowing public IPs', () => {
  const privateIps = [
    '',
    null,
    'not-an-ip',
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '[::1]',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1%eth0',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    '256.1.1.1',
  ];

  for (const ip of privateIps) {
    assert.equal(isPrivateIp(ip), true, `expected private for ${ip}`);
  }

  const publicIps = [
    '93.184.216.34',
    '172.32.0.1',
    '100.128.0.1',
    '1.1.1.1',
    '2606:2800:220:1:248:1893:25c8:1946',
    '::ffff:93.184.216.34',
  ];

  for (const ip of publicIps) {
    assert.equal(isPrivateIp(ip), false, `expected public for ${ip}`);
  }
});

test('checkSiteReachability treats HTTP status codes (200/301/403/404/503) as reachable without extra retries', async () => {
  for (const httpCode of [200, 301, 403, 404, 503]) {
    let calls = 0;
    const result = await checkSiteReachability('example.com', {
      sleep: instantSleep,
      probeUrl: async url => {
        calls += 1;
        return {
          url,
          httpCode,
          exitCode: 0,
          remoteIp: '93.184.216.34',
          error: '',
          spawnError: false,
        };
      },
    });
    assert.equal(result.status, 'reachable');
    assert.equal(result.httpCode, httpCode);
    assert.equal(calls, 1);
  }
});

test('checkSiteReachability falls back to HTTP, respects http:// order, and retries transient failures', async () => {
  const seenUrls = [];
  const httpFallback = await checkSiteReachability('example.com', {
    rawUrl: 'https://example.com',
    sleep: instantSleep,
    probeUrl: async url => {
      seenUrls.push(url);
      if (url.startsWith('https://')) {
        return {
          url,
          httpCode: 0,
          exitCode: 35,
          remoteIp: '93.184.216.34',
          error: 'TLS error',
          spawnError: false,
        };
      }
      return {
        url,
        httpCode: 200,
        exitCode: 0,
        remoteIp: '93.184.216.34',
        error: '',
        spawnError: false,
      };
    },
  });
  assert.equal(httpFallback.status, 'reachable');
  assert.deepEqual(seenUrls, ['https://example.com/', 'http://example.com/']);

  const httpFirstUrls = [];
  await checkSiteReachability('example.com', {
    rawUrl: 'http://example.com',
    sleep: instantSleep,
    probeUrl: async url => {
      httpFirstUrls.push(url);
      return {
        url,
        httpCode: 200,
        exitCode: 0,
        remoteIp: '93.184.216.34',
        error: '',
        spawnError: false,
      };
    },
  });
  assert.deepEqual(httpFirstUrls, ['http://example.com/']);

  let attempt = 0;
  const retried = await checkSiteReachability('example.com', {
    sleep: instantSleep,
    probeUrl: async url => {
      attempt += 1;
      if (attempt <= 2) {
        return {
          url,
          httpCode: 0,
          exitCode: 28,
          remoteIp: '',
          error: 'timed out',
          spawnError: false,
        };
      }
      return {
        url,
        httpCode: 200,
        exitCode: 0,
        remoteIp: '93.184.216.34',
        error: '',
        spawnError: false,
      };
    },
  });
  assert.equal(retried.status, 'reachable');
  assert.equal(attempt, 3);
});

test('checkSiteReachability classifies unreachable exit codes and fail-safe errors accurately', async () => {
  const cases = [
    {
      name: 'DNS failure',
      exitCodes: [6, 6, 6, 6],
      expectedStatus: 'unreachable',
      reasonMatch: /DNS resolution failed/,
    },
    {
      name: 'Timeout',
      exitCodes: [28, 28, 28, 28],
      expectedStatus: 'unreachable',
      reasonMatch: /timed out/,
    },
    {
      name: 'Connection refused',
      exitCodes: [7, 7, 7, 7],
      expectedStatus: 'unreachable',
      reasonMatch: /refused or host unreachable/,
    },
    {
      name: 'Empty reply / reset',
      exitCodes: [52, 56, 52, 56],
      expectedStatus: 'unreachable',
      reasonMatch: /closed or reset/,
    },
    {
      name: 'TLS handshake + HTTP failure',
      exitCodes: [35, 7, 35, 7],
      expectedStatus: 'unreachable',
      reasonMatch: /refused or host unreachable/,
    },
    {
      name: 'TLS handshake only',
      exitCodes: [35, 35, 35, 35],
      expectedStatus: 'unreachable',
      reasonMatch: /TLS\/SSL handshake failed/,
    },
    {
      name: 'TLS cert mismatch (fail-safe)',
      exitCodes: [60, 7, 60, 7],
      expectedStatus: 'tls_cert_error',
      reasonMatch: /TLS certificate/,
    },
    {
      name: 'Unknown curl error (fail-safe)',
      exitCodes: [2, 2, 2, 2],
      expectedStatus: 'error',
      reasonMatch: /Unexpected probe error/,
    },
  ];

  for (const testCase of cases) {
    let idx = 0;
    const result = await checkSiteReachability('dead.example.com', {
      sleep: instantSleep,
      probeUrl: async url => {
        const exitCode = testCase.exitCodes[idx] ?? 7;
        idx += 1;
        return {
          url,
          httpCode: 0,
          exitCode,
          remoteIp: '',
          error: 'mock error',
          spawnError: false,
        };
      },
    });
    assert.equal(result.status, testCase.expectedStatus, testCase.name);
    assert.match(result.failureReason, testCase.reasonMatch, testCase.name);
  }

  const privateIpResult = await checkSiteReachability('example.com', {
    sleep: instantSleep,
    probeUrl: async url => ({
      url,
      httpCode: 200,
      exitCode: 0,
      remoteIp: '127.0.0.1',
      error: '',
      spawnError: false,
    }),
  });
  assert.equal(privateIpResult.status, 'blocked_private_ip');

  const spawnErrResult = await checkSiteReachability('example.com', {
    sleep: instantSleep,
    probeUrl: async url => ({
      url,
      httpCode: 0,
      exitCode: -1,
      remoteIp: '',
      error: 'spawn curl ENOENT',
      spawnError: true,
    }),
  });
  assert.equal(spawnErrResult.status, 'error');
});

test('evaluatePluginRequestSite enforces guardrails, edit safety, and author sanitization', () => {
  const unreachable = {
    status: 'unreachable',
    failureReason: 'DNS resolution failed (the domain could not be resolved).',
    attempts: [],
  };
  const body = makePluginRequestBody('https://dead.example.com');

  const closeDecision = evaluatePluginRequestSite({
    body,
    action: 'labeled',
    labels: ['plugin request'],
    author: 'octo-user',
    authorAssociation: 'NONE',
    authorType: 'User',
    state: 'open',
    reachability: unreachable,
  });
  assert.equal(closeDecision.shouldClose, true);
  assert.equal(closeDecision.label, 'invalid');
  assert.match(closeDecision.comment, /^@octo-user /);
  assert.match(closeDecision.comment, /`dead\.example\.com`/);
  assert.match(closeDecision.comment, /DNS resolution failed/);
  assert.match(closeDecision.comment, /geo-blocked/);

  assert.equal(
    evaluatePluginRequestSite({
      body,
      labels: ['plugin request'],
      state: 'closed',
      reachability: unreachable,
    }).skipped,
    'not-open',
  );

  for (const assoc of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.equal(
      evaluatePluginRequestSite({
        body,
        labels: ['plugin request'],
        authorAssociation: assoc,
        reachability: unreachable,
      }).skipped,
      'exempt-author',
    );
  }

  assert.equal(
    evaluatePluginRequestSite({
      body,
      labels: ['plugin request'],
      authorType: 'Bot',
      reachability: unreachable,
    }).skipped,
    'exempt-author',
  );

  assert.equal(
    evaluatePluginRequestSite({
      body,
      labels: ['bug'],
      reachability: unreachable,
    }).skipped,
    'missing-label',
  );

  assert.equal(
    evaluatePluginRequestSite({
      body: makePluginRequestBody('http://localhost:8080'),
      labels: ['plugin request'],
      reachability: unreachable,
    }).skipped,
    'invalid-or-missing-url',
  );

  // Title-only edit (previousBody is null) or unchanged URL edit must not close.
  assert.equal(
    evaluatePluginRequestSite({
      body,
      previousBody: null,
      action: 'edited',
      labels: ['plugin request'],
      reachability: unreachable,
    }).skipped,
    'url-unchanged',
  );
  assert.equal(
    evaluatePluginRequestSite({
      body,
      previousBody: makePluginRequestBody(
        'https://DEAD.example.com/other-path',
      ),
      action: 'edited',
      labels: ['plugin request'],
      reachability: unreachable,
    }).skipped,
    'url-unchanged',
  );

  // URL edited to a different dead domain SHOULD close.
  const editedNewDeadUrl = evaluatePluginRequestSite({
    body,
    previousBody: makePluginRequestBody('https://old.example.com'),
    action: 'edited',
    labels: ['plugin request'],
    author: 'octo-user',
    reachability: unreachable,
  });
  assert.equal(editedNewDeadUrl.shouldClose, true);

  for (const [status, expectedSkip] of [
    ['blocked_private_ip', 'private-ip'],
    ['tls_cert_error', 'tls-cert-error'],
    ['error', 'probe-error'],
  ]) {
    const res = evaluatePluginRequestSite({
      body,
      labels: ['plugin request'],
      reachability: { status, failureReason: 'x', attempts: [] },
    });
    assert.equal(res.shouldClose, false);
    assert.equal(res.skipped, expectedSkip);
  }

  const unsafeAuthor = evaluatePluginRequestSite({
    body,
    labels: ['plugin request'],
    author: 'bad user!@#',
    reachability: unreachable,
  });
  assert.equal(unsafeAuthor.shouldClose, true);
  assert.equal(unsafeAuthor.comment.startsWith('@'), false);
});

test('confirmCloseWithCurrentIssue aborts close when live issue changed during probe', () => {
  const siteCheck = evaluatePluginRequestSite({
    body: makePluginRequestBody('https://dead.example.com'),
    labels: ['plugin request'],
    author: 'octo-user',
    reachability: {
      status: 'unreachable',
      failureReason: 'Connection refused or host unreachable.',
      attempts: [],
    },
  });

  const approved = confirmCloseWithCurrentIssue(siteCheck, {
    state: 'open',
    labels: [{ name: 'plugin request' }],
    body: makePluginRequestBody('https://dead.example.com/books'),
  });
  assert.equal(approved.shouldClose, true);
  assert.equal(approved.label, 'invalid');

  assert.equal(
    confirmCloseWithCurrentIssue(siteCheck, {
      state: 'closed',
      labels: [{ name: 'plugin request' }],
      body: makePluginRequestBody('https://dead.example.com'),
    }).skipped,
    'already-closed',
  );

  assert.equal(
    confirmCloseWithCurrentIssue(siteCheck, {
      state: 'open',
      labels: [{ name: 'bug' }],
      body: makePluginRequestBody('https://dead.example.com'),
    }).skipped,
    'label-removed',
  );

  assert.equal(
    confirmCloseWithCurrentIssue(siteCheck, {
      state: 'open',
      labels: [{ name: 'plugin request' }],
      body: makePluginRequestBody('https://working.example.com'),
    }).skipped,
    'url-changed-during-check',
  );
});

test('probeUrlWithCurl reports HTTP status codes, stalled bodies after headers, socket resets, and refused ports', async () => {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');
    const mode = reqUrl.searchParams.get('mode');
    if (mode === '200') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (mode === '403') {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('cf challenge');
      return;
    }
    if (mode === 'stall') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html>');
      return;
    }
    if (mode === 'reset') {
      req.socket.destroy();
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const okRes = await probeUrlWithCurl(`http://127.0.0.1:${port}/?mode=200`, {
      maxTimeSec: 2,
      allowPrivateIp: true,
    });
    assert.equal(okRes.httpCode, 200);
    assert.equal(okRes.exitCode, 0);

    const forbiddenRes = await probeUrlWithCurl(
      `http://127.0.0.1:${port}/?mode=403`,
      {
        maxTimeSec: 2,
        allowPrivateIp: true,
      },
    );
    assert.equal(forbiddenRes.httpCode, 403);

    const stalledRes = await probeUrlWithCurl(
      `http://127.0.0.1:${port}/?mode=stall`,
      {
        maxTimeSec: 1,
        allowPrivateIp: true,
      },
    );
    assert.equal(stalledRes.httpCode, 200);

    const resetRes = await probeUrlWithCurl(
      `http://127.0.0.1:${port}/?mode=reset`,
      {
        maxTimeSec: 2,
        allowPrivateIp: true,
      },
    );
    assert.equal(resetRes.httpCode, 0);
    assert.equal(UNREACHABLE_EXIT_CODES.has(resetRes.exitCode), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  const refusedRes = await probeUrlWithCurl(`http://127.0.0.1:${port}/`, {
    connectTimeoutSec: 2,
    maxTimeSec: 2,
    allowPrivateIp: true,
  });
  assert.equal(refusedRes.httpCode, 0);
  assert.equal(refusedRes.exitCode, 7);
});

test('CLI supports --extract-url and --confirm-close without dirtying the repo tree', () => {
  const extractOut = execFileSync(
    process.execPath,
    [SCRIPT_PATH, '--extract-url'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ISSUE_BODY: makePluginRequestBody('https://Sub.Example.org/path'),
      },
    },
  );
  assert.deepEqual(JSON.parse(extractOut), {
    url: 'https://Sub.Example.org/path',
    baseUrl: 'sub.example.org',
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-check-cli-'));
  try {
    const siteCheckPath = path.join(tmpDir, 'site-check.json');
    const currentIssuePath = path.join(tmpDir, 'current-issue.json');

    const siteCheck = evaluatePluginRequestSite({
      body: makePluginRequestBody('https://dead.example.com'),
      labels: ['plugin request'],
      author: 'reporter',
      reachability: {
        status: 'unreachable',
        failureReason: 'Connection timed out with no HTTP response.',
        attempts: [],
      },
    });
    fs.writeFileSync(siteCheckPath, JSON.stringify(siteCheck));
    fs.writeFileSync(
      currentIssuePath,
      JSON.stringify({
        state: 'open',
        labels: [{ name: 'plugin request' }],
        body: makePluginRequestBody('https://dead.example.com'),
      }),
    );

    const confirmOut = execFileSync(
      process.execPath,
      [SCRIPT_PATH, '--confirm-close', siteCheckPath, currentIssuePath],
      { encoding: 'utf8' },
    );
    const decision = JSON.parse(confirmOut);
    assert.equal(decision.shouldClose, true);
    assert.equal(decision.label, 'invalid');
    assert.match(decision.comment, /@reporter/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
