import process from 'node:process';
import { Buffer } from 'buffer';
import { FetchMode, ServerSetting } from './src/types/types';
import { Connect } from 'vite';
import httpProxy from 'http-proxy';
import { exec } from 'child_process';
import { brotliDecompressSync, gunzipSync, zstdDecompressSync } from 'zlib';

const proxy = httpProxy.createProxyServer({});

const settings: ServerSetting = {
  CLIENT_HOST: 'http://localhost:3000',
  fetchMode: FetchMode.PROXY,
  disAllowedRequestHeaders: [
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-site',
    'origin',
    'sec-fetch-site',
    'sec-fetch-dest',
    'pragma',
  ],
  disAllowResponseHeaders: ['link', 'set-cookie', 'set-cookie2'],
  useUserAgent: true,
};

const proxySettingMiddleware: Connect.NextHandleFunction = (req, res) => {
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
      if (settings.cookies) {
        req.headers['cookie'] = settings.cookies;
      }
      if (!settings.useUserAgent) {
        delete req.headers['user-agent'];
      }
      req.headers.host = _url.host;
      req.url = _url.toString();
      res.statusCode = 200;
      proxyRequest(req, res);
    } catch (err) {
      console.log('\x1b[31m', '----------ERRROR----------');
      console.error(err);
      console.log('\x1b[31m', '----------ERRROR----------');
      if (!res.closed) {
        res.end();
      }
    }
  }
};

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
  if (settings.fetchMode === FetchMode.CURL) {
    //i mean if it works it works i guess, better than nothing
    let curl = `curl '${_url.href}'`;
    if (settings.useUserAgent) {
      curl += ` -H 'User-Agent: ${req.headers['user-agent']}'`;
    }
    if (settings.cookies) curl += ` -H 'Cookie: ${settings.cookies}'`;
    if (req.headers.origin2) curl += ` -H 'Origin: ${req.headers.origin2}'`;

    console.log('Running curl command:', curl);

    const isWindows = process.platform === 'win32';
    const options = isWindows
      ? {
          shell:
            process.env.BASH_LOCATION ||
            process.env.ProgramFiles + '\\git\\usr\\bin\\bash.exe',
        }
      : {};

    exec(curl, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        res.statusCode = 500;
        res.write(`exec error: ${error}`);
        res.end();
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      res.statusCode = 200;
      res.write(stdout);
      res.end();
    });
  } else if (settings.fetchMode === FetchMode.NODE_FETCH) {
    const headers = new Headers();
    if (settings.useUserAgent) {
      headers.append('user-agent', req.headers['user-agent'] as string);
    }
    if (settings.cookies) {
      headers.append('cookie', settings.cookies);
    }
    if (req.headers.origin2) {
      headers.append('origin', req.headers.origin2 as string);
    }
    fetch(_url.href, {
      headers: headers,
    })
      .then(async res2 => [res2, await res2.text()] as const)
      .then(([res2, text]) => {
        res.statusCode = res2.status;
        res2.headers.forEach((val, key) => {
          if (
            !settings.disAllowResponseHeaders.includes(key) &&
            key !== 'content-encoding' &&
            key !== 'content-length'
          ) {
            res.setHeader(key, val);
          }
        });
        res.write(text);
        res.end();
      })
      .catch(err => {
        console.error(err);
        res.statusCode = 500;
        res.end();
      });
  } else if (settings.fetchMode === FetchMode.PROXY) {
    proxy.web(
      req,
      res,
      {
        target: _url.origin,
        selfHandleResponse: true,
        followRedirects: true,
      },
      err => {
        console.error(err);
        res.statusCode = 500;
        res.end();
      },
    );
  }
};

proxy.on('proxyRes', function (proxyRes, req, res) {
  const statusCode = proxyRes.statusCode;
  // Redirect
  if (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  ) {
    req.method = 'GET';
    req.headers['content-length'] = '0';
    delete req.headers['content-type'];
    // Remove all listeners (=reset events to initial state)
    req.removeAllListeners();

    // Initiate a new proxy request.
    proxyRequest(req, res);
    return false;
  }

  const contentEncoding = proxyRes.headers['content-encoding'];
  const isBrotli =
    contentEncoding &&
    (Array.isArray(contentEncoding)
      ? contentEncoding.some(enc => enc.includes('br'))
      : contentEncoding.includes('br'));

  const isGzip =
    contentEncoding &&
    (Array.isArray(contentEncoding)
      ? contentEncoding.some(enc => enc.includes('gzip'))
      : contentEncoding.includes('gzip'));

  const isZstd =
    contentEncoding &&
    (Array.isArray(contentEncoding)
      ? contentEncoding.some(enc => enc.includes('zstd'))
      : contentEncoding.includes('zstd'));

  if (isBrotli || isGzip || isZstd) {
    delete proxyRes.headers['content-encoding'];
    delete proxyRes.headers['content-length'];

    for (const _header in proxyRes.headers) {
      if (!settings.disAllowResponseHeaders.includes(_header)) {
        res.setHeader(_header, proxyRes.headers[_header] as string);
      }
    }

    const chunks: Buffer[] = [];
    proxyRes.on('data', chunk => chunks.push(Buffer.from(chunk)));
    proxyRes.on('end', async function () {
      try {
        const buffer = Buffer.concat(chunks);
        let decompressed;

        if (isBrotli) {
          decompressed = brotliDecompressSync(buffer);
        } else if (isZstd) {
          decompressed = zstdDecompressSync(buffer);
        } else {
          decompressed = gunzipSync(buffer);
        }

        res.write(Buffer.from(decompressed));
        res.end();
      } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end(`Error decompressing ${isBrotli ? 'Brotli' : 'GZIP'} content`);
      }
    });
  } else {
    for (const _header in proxyRes.headers) {
      if (!settings.disAllowResponseHeaders.includes(_header)) {
        res.setHeader(_header, proxyRes.headers[_header] as string);
      }
    }
    for (const _header in settings.disAllowedRequestHeaders) {
      delete proxyRes.headers[_header];
    }
    proxyRes.on('data', function (chunk) {
      res.write(chunk);
    });
    proxyRes.on('end', function () {
      res.end();
    });
  }
});

export { proxyHandlerMiddle, proxySettingMiddleware };
