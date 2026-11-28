'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { applyCloseDecision } = require('./close-invalid-issue.cjs');
const {
  checkSiteReachability,
  detectWebsiteThemes,
  probeUrlWithCurl,
} = require('./site-reachability.cjs');

test('probeUrlWithCurl blocks private and dual-homed DNS targets BEFORE executing curl', async () => {
  let execCalls = 0;
  const blockedSingle = await probeUrlWithCurl('https://evil.example/', {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    execCurl: async () => {
      execCalls += 1;
      return { stdout: '200\t0\t127.0.0.1\t\t\t', processExitCode: 0 };
    },
  });
  assert.equal(blockedSingle.blockedPrivateIp, true);
  assert.equal(execCalls, 0);

  const blockedDualHomed = await probeUrlWithCurl('https://rebind.example/', {
    lookup: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ],
    execCurl: async () => {
      execCalls += 1;
      return { stdout: '200\t0\t93.184.216.34\t\t\t', processExitCode: 0 };
    },
  });
  assert.equal(blockedDualHomed.blockedPrivateIp, true);
  assert.equal(execCalls, 0);

  const reachRes = await checkSiteReachability('rebind.example', {
    sleep: () => Promise.resolve(),
    probeUrl: url =>
      probeUrlWithCurl(url, {
        lookup: async () => [{ address: '169.254.169.254', family: 4 }],
        execCurl: async () => {
          execCalls += 1;
          return { stdout: '', processExitCode: 0 };
        },
      }),
  });
  assert.equal(reachRes.status, 'blocked_private_ip');
  assert.equal(execCalls, 0);
});

test('probeUrlWithCurl blocks redirects to private IPs before connecting and follows public redirects', async () => {
  let execCalls = 0;
  const ssrfRedirect = await probeUrlWithCurl('https://public.example/', {
    lookup: async host => {
      if (host === 'public.example') {
        return [{ address: '93.184.216.34', family: 4 }];
      }
      return [{ address: '169.254.169.254', family: 4 }];
    },
    execCurl: async () => {
      execCalls += 1;
      return {
        stdout:
          '302\t0\t93.184.216.34\ttext/html\thttp://internal.example/latest/meta-data\t',
        processExitCode: 0,
      };
    },
  });
  assert.equal(ssrfRedirect.blockedPrivateIp, true);
  assert.equal(execCalls, 1);

  let publicCalls = 0;
  const publicRedirect = await probeUrlWithCurl('https://public.example/', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    execCurl: async args => {
      publicCalls += 1;
      const targetUrl = args[args.length - 1];
      if (targetUrl === 'https://public.example/') {
        return {
          stdout:
            '301\t0\t93.184.216.34\ttext/html\thttps://www.public.example/\t',
          processExitCode: 0,
        };
      }
      return {
        stdout: '200\t0\t93.184.216.34\ttext/html\t\t',
        processExitCode: 0,
      };
    },
  });
  assert.equal(publicRedirect.blockedPrivateIp, false);
  assert.equal(publicRedirect.httpCode, 200);
  assert.equal(publicRedirect.url, 'https://www.public.example/');
  assert.equal(publicCalls, 2);
});

test('detectWebsiteThemes matches valid Content-Type/body probes and rejects soft-404 responses', async () => {
  let mode = 'madara';
  const server = http.createServer((req, res) => {
    if (
      mode === 'madara' &&
      req.url === '/wp-content/themes/madara/style.css'
    ) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end('body {}');
      return;
    }
    if (
      mode === 'soft-404' &&
      req.url === '/wp-content/themes/madara/style.css'
    ) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>not found</html>');
      return;
    }
    if (mode === 'readwn' && req.url === '/list/all/all-newstime-0.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<div class="novel-item">Test</div>');
      return;
    }
    if (mode === 'multi') {
      if (req.url === '/wp-content/themes/madara/style.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('ok');
        return;
      }
      if (req.url === '/frontend/js/appsettings.min.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end('console.log(1)');
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('missing');
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const madaraRes = await detectWebsiteThemes(`127.0.0.1:${port}`, {
      allowPrivateIp: true,
    });
    assert.equal(madaraRes.matchCount, 1);
    assert.equal(madaraRes.themeLabel, 'theme: madara');

    mode = 'soft-404';
    const soft404Res = await detectWebsiteThemes(`127.0.0.1:${port}`, {
      allowPrivateIp: true,
    });
    assert.equal(soft404Res.matchCount, 0);
    assert.equal(soft404Res.themeLabel, '');

    mode = 'readwn';
    const readwnRes = await detectWebsiteThemes(`127.0.0.1:${port}`, {
      allowPrivateIp: true,
    });
    assert.equal(readwnRes.matchCount, 1);
    assert.equal(readwnRes.themeLabel, 'theme: readwn');

    mode = 'multi';
    const multiRes = await detectWebsiteThemes(`127.0.0.1:${port}`, {
      allowPrivateIp: true,
    });
    assert.equal(multiRes.matchCount, 2);
    assert.equal(multiRes.themeLabel, '');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('applyCloseDecision skips non-closable decisions and posts label, comment, and close patch', async () => {
  const requests = [];
  const noopRes = await applyCloseDecision({
    decision: { shouldClose: false },
    repository: 'lnreader/lnreader-plugins',
    issueNumber: 123,
    token: 'tok',
    fetchImpl: async url => {
      requests.push(url);
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(noopRes, { closed: false });
  assert.equal(requests.length, 0);

  const closeRes = await applyCloseDecision({
    decision: {
      shouldClose: true,
      label: 'invalid',
      comment: 'Closing reason',
    },
    repository: 'lnreader/lnreader-plugins',
    issueNumber: 123,
    token: 'tok',
    fetchImpl: async (url, init) => {
      requests.push({
        url,
        method: init.method,
        body: JSON.parse(init.body),
      });
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(closeRes, { closed: true, label: 'invalid' });
  assert.deepEqual(requests, [
    {
      url: 'https://api.github.com/repos/lnreader/lnreader-plugins/issues/123/labels',
      method: 'POST',
      body: { labels: ['invalid'] },
    },
    {
      url: 'https://api.github.com/repos/lnreader/lnreader-plugins/issues/123/comments',
      method: 'POST',
      body: { body: 'Closing reason' },
    },
    {
      url: 'https://api.github.com/repos/lnreader/lnreader-plugins/issues/123',
      method: 'PATCH',
      body: { state: 'closed', state_reason: 'not_planned' },
    },
  ]);

  await assert.rejects(
    () =>
      applyCloseDecision({
        decision: { shouldClose: true, label: 'invalid', comment: 'x' },
        repository: 'lnreader/lnreader-plugins',
        issueNumber: 123,
        token: 'tok',
        fetchImpl: async () => ({ ok: false, status: 403 }),
      }),
    /HTTP 403/,
  );
});

test('probeUrlWithCurl tries remaining public IPs when first address fails', async () => {
  const triedResolveArgs = [];
  const lookup = async () => [
    { address: '198.51.100.1', family: 4 },
    { address: '198.51.100.2', family: 4 },
  ];
  const execCurl = async args => {
    const resolveArg = args[args.indexOf('--resolve') + 1];
    triedResolveArgs.push(resolveArg);
    if (resolveArg.endsWith(':198.51.100.1')) {
      return { stdout: '000\t7\t\t\t\tConnection refused', processExitCode: 7 };
    }
    return {
      stdout: '200\t0\t198.51.100.2\ttext/html\t\t',
      processExitCode: 0,
    };
  };

  const probeRes = await probeUrlWithCurl('https://cdn.example/', {
    lookup,
    execCurl,
  });
  assert.deepEqual(triedResolveArgs, [
    'cdn.example:443:198.51.100.1',
    'cdn.example:443:198.51.100.2',
  ]);
  assert.equal(probeRes.httpCode, 200);
  assert.equal(probeRes.remoteIp, '198.51.100.2');

  const reachRes = await checkSiteReachability('cdn.example', {
    sleep: () => Promise.resolve(),
    probeUrl: (url, opts) =>
      probeUrlWithCurl(url, { ...opts, lookup, execCurl }),
  });
  assert.equal(reachRes.status, 'reachable');
  assert.equal(reachRes.httpCode, 200);
});

test('checkSiteReachability treats 3xx redirect as reachable without following dead redirect target', async () => {
  const lookedUpHosts = [];
  const reachRes = await checkSiteReachability('source.example', {
    sleep: () => Promise.resolve(),
    probeUrl: (url, opts) =>
      probeUrlWithCurl(url, {
        ...opts,
        lookup: async host => {
          lookedUpHosts.push(host);
          if (host === 'source.example') {
            return [{ address: '93.184.216.34', family: 4 }];
          }
          throw new Error(`Unexpected DNS lookup for ${host}`);
        },
        execCurl: async () => ({
          stdout:
            '301\t0\t93.184.216.34\ttext/html\thttps://dead-target.invalid/\t',
          processExitCode: 0,
        }),
      }),
  });
  assert.deepEqual(lookedUpHosts, ['source.example']);
  assert.equal(reachRes.status, 'reachable');
  assert.equal(reachRes.httpCode, 301);
});
