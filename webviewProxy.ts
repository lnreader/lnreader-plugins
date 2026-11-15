import { ServerResponse } from 'node:http';
import process from 'node:process';
import { Connect } from 'vite';
import { connectCdp, type CdpClient } from './cdpClient';
import type { WebviewFetchOptions, WebviewFetchResult } from './src/lib/fetch';

type WebviewFetchRequest = WebviewFetchOptions & {
  url: string;
};

type CdpTab = {
  id: string;
  webSocketDebuggerUrl?: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const readJsonBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  body: WebviewFetchResult & { error?: string },
) => {
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
};

const fetchViaCdp = async ({
  url,
  waitForSelector,
  timeoutMs = 15000,
  settleMs = 400,
}: WebviewFetchRequest): Promise<string> => {
  const cdpBase = (process.env.CDP_URL || 'http://127.0.0.1:9222').replace(
    /\/+$/,
    '',
  );

  const deadline = Date.now() + timeoutMs;
  const remainingMs = () => {
    const rem = deadline - Date.now();
    if (rem <= 0) {
      throw new Error('Webview fetch deadline exceeded');
    }
    return rem;
  };

  const tabRes = await fetch(
    `${cdpBase}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT', signal: AbortSignal.timeout(remainingMs()) },
  );
  if (!tabRes.ok) {
    throw new Error(`CDP /json/new failed with status ${tabRes.status}`);
  }
  const tab = (await tabRes.json()) as CdpTab;
  let cdp: CdpClient | null = null;
  try {
    if (!tab.webSocketDebuggerUrl) {
      throw new Error('CDP tab missing webSocketDebuggerUrl');
    }

    cdp = await connectCdp(tab.webSocketDebuggerUrl, remainingMs());
    await cdp.send('Page.enable', {}, remainingMs());
    await cdp.send('Runtime.enable', {}, remainingMs());

    const loadPromise = cdp
      .waitForEvent('Page.loadEventFired', remainingMs())
      .catch(() => undefined);

    const navRes = (await cdp.send(
      'Page.navigate',
      { url },
      remainingMs(),
    )) as { errorText?: string };
    if (navRes?.errorText) {
      throw new Error(`Page.navigate failed: ${navRes.errorText}`);
    }
    await loadPromise;

    let selectorMatched = !waitForSelector;
    if (waitForSelector) {
      const expr = `Boolean(document.querySelector(${JSON.stringify(waitForSelector)}))`;
      while (Date.now() < deadline) {
        const evalRes = (await cdp.send(
          'Runtime.evaluate',
          {
            expression: expr,
            returnByValue: true,
          },
          remainingMs(),
        )) as { result?: { value?: boolean } };
        if (evalRes?.result?.value) {
          selectorMatched = true;
          break;
        }
        await sleep(150);
      }
    }

    if (selectorMatched && settleMs > 0) {
      await sleep(settleMs);
    }

    const htmlRes = (await cdp.send(
      'Runtime.evaluate',
      {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      },
      Math.max(1000, deadline - Date.now()),
    )) as { result?: { value?: string } };

    return htmlRes?.result?.value || '';
  } finally {
    cdp?.close();
    if (tab.id) {
      await fetch(`${cdpBase}/json/close/${tab.id}`).catch(() => undefined);
    }
  }
};

const parseHttpUrl = (rawUrl?: string): string | null => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

export const webviewFetchMiddleware: Connect.NextHandleFunction = async (
  req,
  res,
) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, html: '', error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await readJsonBody(req);
    const payload = JSON.parse(rawBody) as Partial<WebviewFetchRequest>;
    const validUrl = parseHttpUrl(payload.url);
    if (!validUrl) {
      sendJson(res, 400, { ok: false, html: '', error: 'Invalid url' });
      return;
    }

    const html = await fetchViaCdp({
      url: validUrl,
      waitForSelector: payload.waitForSelector,
      timeoutMs: payload.timeoutMs,
      settleMs: payload.settleMs,
    });
    sendJson(res, 200, { ok: Boolean(html), html });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webview-fetch]', message);
    sendJson(res, 502, { ok: false, html: '', error: message });
  }
};
