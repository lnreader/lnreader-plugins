/* global RequestInit */
import { Buffer } from 'buffer';
import { FetchMode, ServerSetting } from './src/types/types';
import { Connect } from 'vite';
import httpProxy from 'http-proxy';
import { spawn } from 'child_process';
import { brotliDecompressSync, gunzipSync, zstdDecompressSync } from 'zlib';

const proxy = httpProxy.createProxyServer({});

const settings: ServerSetting = {
  CLIENT_HOST: 'http://localhost:3000',
  fetchMode: FetchMode.PROXY,
  cookies: '',
  siteCookies: {},
  usePerSiteCookies: false,
  disAllowedRequestHeaders: [
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-site',
    'origin',
    'sec-fetch-dest',
    'pragma',
  ],
  disAllowResponseHeaders: [
    'link',
    'set-cookie',
    'set-cookie2',
    'content-encoding',
    'content-length',
  ],
  useUserAgent: true,
};

const proxySettingMiddleware: Connect.NextHandleFunction = (req, res) => {
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify(settings));
    res.end();
    return;
  }

  let str = '';
  req.on('data', chunk => {
    str += chunk;
  });
  req.on('end', () => {
    try {
      const newSettings = JSON.parse(str);
      for (const key in newSettings) {
        // @ts-ignore
        settings[key] = newSettings[key];
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(settings));
    } catch {
      res.statusCode = 400;
    } finally {
      res.end();
    }
  });
};

function getCookiesForHost(hostname: string): string | undefined {
  if (settings.usePerSiteCookies && settings.siteCookies) {
    // exact match
    if (settings.siteCookies[hostname]) return settings.siteCookies[hostname];
    // parent domain match: key "source.com" matches "www.source.com", "api.source.com"
    for (const [site, cookie] of Object.entries(settings.siteCookies)) {
      if (hostname.endsWith('.' + site)) return cookie;
    }
    return undefined; // per-site mode: no cookie for unmatched hosts
  }
  return settings.cookies; // global mode: same cookie for all requests
}

const proxyHandlerMiddle: Connect.NextHandleFunction = (req, res) => {
  const rawUrl = 'https:' + req.url;
  if (req.headers['access-control-request-method']) {
    res.setHeader(
      'access-control-allow-methods',
      req.headers['access-control-request-method'],
    );
    delete req.headers['access-control-request-method'];
  }
  if (req.headers['access-control-request-headers']) {
    res.setHeader(
      'access-control-allow-headers',
      req.headers['access-control-request-headers'],
    );
    delete req.headers['access-control-request-headers'];
  }
  res.setHeader('Access-Control-Allow-Origin', settings.CLIENT_HOST);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  req.headers.referer = rawUrl;

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
  } else {
    try {
      const _url = new URL(rawUrl);
      for (const _header in req.headers) {
        if (
          req.headers[_header]?.includes('localhost') ||
          settings.disAllowedRequestHeaders.includes(_header)
        ) {
          delete req.headers[_header];
        }
      }
      req.headers['sec-fetch-mode'] = 'cors';
      if (!settings.useUserAgent) delete req.headers['user-agent'];
      req.headers.host = _url.host;
      req.url = _url.toString();
      proxyRequest(req, res);
    } catch (err) {
      console.log('\x1b[31m', '----------ERRROR----------');
      console.error(err);
      console.log('\x1b[31m', '----------ERRROR----------');
      if (!res.closed) {
        res.statusCode = 500;
        res.end();
      }
    }
  }
};

function curlRequest(
  url: string,
  method: string,
  req: Connect.IncomingMessage,
  bodyBuffer: Buffer,
  redirectCount: number,
  res: Connect.ServerResponse,
) {
  if (redirectCount >= 5) {
    res.statusCode = 508;
    res.end('Too many redirects');
    return;
  }

  const _url = new URL(url);
  const args = ['-X', method, '-s', '-D', '-', _url.href];

  if (settings.useUserAgent && req.headers['user-agent'])
    args.push('-H', 'User-Agent: ' + req.headers['user-agent']);
  const hostCookie = getCookiesForHost(_url.hostname);
  if (hostCookie) args.push('-H', 'Cookie: ' + hostCookie);
  if (req.headers.origin2) args.push('-H', 'Origin: ' + req.headers.origin2);
  if (req.headers['content-type'] && bodyBuffer.length > 0)
    args.push('-H', 'Content-Type: ' + req.headers['content-type']);

  if (bodyBuffer.length > 0) args.push('--data-binary', '@-');

  console.log('\x1b[36m', '----------------');
  console.log(
    'Making CURL request - at ' +
      new Date().toLocaleTimeString() +
      '\n  url: ' +
      _url.href +
      '\n  headers:',
  );
  args.forEach((a, i) => {
    if (args[i - 1] === '-H') console.log('\t', '\x1b[32m', a, '\x1b[37m');
  });
  console.log('\x1b[36m', '----------------');

  const child = spawn('curl', args);

  if (bodyBuffer.length > 0) {
    child.stdin.write(bodyBuffer);
    child.stdin.end();
  }

  const stdoutChunks: Buffer[] = [];
  child.stdout.on('data', chunk => stdoutChunks.push(Buffer.from(chunk)));

  let stderr = '';
  child.stderr.on('data', chunk => (stderr += chunk));

  child.on('close', code => {
    if (code !== 0) {
      console.error(stderr);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.write('curl error code: ' + code + '\n' + stderr);
        res.end();
      }
      return;
    }

    const output = Buffer.concat(stdoutChunks).toString('utf-8');
    const headerEnd = output.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      res.statusCode = 200;
      res.write(output);
      res.end();
      return;
    }

    const headerBlock = output.slice(0, headerEnd);
    const body = output.slice(headerEnd + 4);

    const statusMatch = headerBlock.match(/^HTTP\/[\d.]+\s+(\d+)/m);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : 200;

    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const locMatch = headerBlock.match(/^location:\s*(.+)$/im);
      if (locMatch) {
        try {
          const redirectUrl = new URL(locMatch[1].trim(), _url.href);
          let nextMethod = method;
          let nextBody = bodyBuffer;
          if ([301, 302, 303].includes(statusCode)) {
            nextMethod = 'GET';
            nextBody = Buffer.alloc(0);
          }
          curlRequest(
            redirectUrl.href,
            nextMethod,
            req,
            nextBody,
            redirectCount + 1,
            res,
          );
          return;
        } catch {
          console.error('Redirect URL parse error:', locMatch[1]);
        }
      }
    }

    res.statusCode = statusCode;

    const headerLines = headerBlock.split('\r\n').slice(1);
    for (const line of headerLines) {
      const ci = line.indexOf(':');
      if (ci === -1) continue;
      const key = line.slice(0, ci).trim().toLowerCase();
      const val = line.slice(ci + 1).trim();
      if (!settings.disAllowResponseHeaders.includes(key)) {
        res.setHeader(key, val);
      }
    }

    res.write(body);
    res.end();
  });

  res.on('close', () => {
    if (!child.killed) child.kill();
  });
}

const proxyRequest: Connect.SimpleHandleFunction = (req, res) => {
  const _url = new URL(req.url || '');
  console.log('\x1b[36m', '----------------');
  console.log(
    `Making proxy request - at ${new Date().toLocaleTimeString()}
  url: ${_url.href}
  headers:`,
  );
  Object.entries(req.headers).forEach(([name, value]) => {
    console.log('\t', '\x1b[32m', name + ':', '\x1b[37m', value);
  });
  console.log('\x1b[36m', '----------------');

  if (settings.fetchMode === FetchMode.PROXY) {
    const hostCookie = getCookiesForHost(_url.hostname);
    if (hostCookie) req.headers['cookie'] = hostCookie;
    else delete req.headers['cookie'];
    proxy.web(
      req,
      res,
      { target: _url.origin, selfHandleResponse: true },
      err => {
        console.error('Proxy target error:', err);
        res.statusCode = 500;
        res.end();
      },
    );
    return;
  }

  const method = req.method || 'GET';
  const chunks: Buffer[] = [];

  req.on('data', chunk => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    const bodyBuffer = Buffer.concat(chunks);

    if (settings.fetchMode === FetchMode.CURL) {
      curlRequest(_url.href, method, req, bodyBuffer, 0, res);
    } else if (settings.fetchMode === FetchMode.NODE_FETCH) {
      const headers = new Headers();

      if (settings.useUserAgent && req.headers['user-agent'])
        headers.append('user-agent', req.headers['user-agent'] as string);
      const hostCookie = getCookiesForHost(_url.hostname);
      if (hostCookie) headers.append('cookie', hostCookie);
      if (req.headers.origin2)
        headers.append('origin', req.headers.origin2 as string);
      if (req.headers['content-type'])
        headers.append('content-type', req.headers['content-type'] as string);

      const fetchOptions: RequestInit = { method, headers };
      if (method !== 'GET' && method !== 'HEAD' && bodyBuffer.length > 0) {
        fetchOptions.body = bodyBuffer;
      }

      fetch(_url.href, fetchOptions)
        .then(async res2 => {
          res.statusCode = res2.status;
          res2.headers.forEach((val, key) => {
            if (!settings.disAllowResponseHeaders.includes(key)) {
              res.setHeader(key, val);
            }
          });
          res.write(await res2.text());
          res.end();
        })
        .catch(err => {
          console.error(err);
          res.statusCode = 500;
          res.end();
        });
    }
  });
};

proxy.on('proxyRes', function (proxyRes, req, res) {
  const statusCode = proxyRes.statusCode || 200;

  // Redirect handling
  if ([301, 302, 303, 307, 308].includes(statusCode)) {
    const location = proxyRes.headers['location'];
    if (location) {
      try {
        const _url = new URL(req.url || '');
        const redirectUrl = new URL(location, _url.href);
        req.url = redirectUrl.toString();

        // Prevent infinite loops
        const reqWithRedirect = req as Connect.IncomingMessage & {
          _redirectCount?: number;
        };
        const redirectCount = reqWithRedirect._redirectCount || 0;
        if (redirectCount >= 5) {
          res.statusCode = 508;
          res.end('Too many redirects');
          return;
        }
        reqWithRedirect._redirectCount = redirectCount + 1;

        // Update method for 301/302/303 to GET as per spec
        if ([301, 302, 303].includes(statusCode)) {
          req.method = 'GET';
          req.headers['content-length'] = '0';
          delete req.headers['content-type'];
        }

        req.removeAllListeners();
        proxyRes.destroy();
        proxyRequest(req, res);
        return;
      } catch (err) {
        console.error('Redirect parsing error:', err);
      }
    }
  }

  res.statusCode = statusCode;

  // Propagate headers but filter restricted ones
  Object.keys(proxyRes.headers).forEach(key => {
    if (!settings.disAllowResponseHeaders.includes(key)) {
      res.setHeader(key, proxyRes.headers[key] as string);
    }
  });

  if (statusCode === 304) {
    res.end();
    return;
  }

  const contentEncoding = proxyRes.headers['content-encoding'] || '';
  const chunks: Buffer[] = [];
  proxyRes.on('data', chunk => chunks.push(Buffer.from(chunk)));
  proxyRes.on('end', () => {
    try {
      const compressedBuffer = Buffer.concat(chunks);
      if (compressedBuffer.length > 0) {
        let decompressedBuffer: Buffer;
        if (contentEncoding.includes('br')) {
          decompressedBuffer = brotliDecompressSync(compressedBuffer);
        } else if (contentEncoding.includes('gzip')) {
          decompressedBuffer = gunzipSync(compressedBuffer);
        } else if (contentEncoding.includes('zstd')) {
          try {
            decompressedBuffer = zstdDecompressSync(compressedBuffer);
          } catch {
            decompressedBuffer = compressedBuffer;
          }
        } else {
          decompressedBuffer = compressedBuffer;
        }
        res.write(decompressedBuffer);
      }
      res.end();
    } catch (err) {
      console.error('Decompression error:', err);
      res.statusCode = 500;
      res.end('Decompression error');
    }
  });
});

export { proxyHandlerMiddle, proxySettingMiddleware };
