import crypto from 'node:crypto';
import net from 'node:net';
import process from 'node:process';
import { Connect } from 'vite';
import type { WebviewFetchOptions } from './src/lib/fetch';

type WebviewFetchRequest = WebviewFetchOptions & {
  url: string;
};

type CdpTab = {
  id: string;
  webSocketDebuggerUrl?: string;
};

type CdpClient = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  waitForEvent: (method: string, timeoutMs: number) => Promise<void>;
  close: () => void;
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

const encodeWsFrame = (opcode: number, payload: Buffer): Buffer => {
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[1] = 0x80 | len;
    mask.copy(header, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    mask.copy(header, 10);
  }
  header[0] = 0x80 | opcode;
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ mask[i & 3];
  }
  return Buffer.concat([header, masked]);
};

/**
 * Minimal Node 20+ compatible WebSocket client for local `ws://` CDP endpoints.
 */
const connectCdp = (wsUrl: string): Promise<CdpClient> =>
  new Promise((resolve, reject) => {
    const parsed = new URL(wsUrl);
    if (parsed.protocol !== 'ws:') {
      reject(
        new Error(`Unsupported CDP WebSocket protocol: ${parsed.protocol}`),
      );
      return;
    }

    const port = Number(parsed.port || 80);
    const path = `${parsed.pathname}${parsed.search}`;
    const wsKey = crypto.randomBytes(16).toString('base64');
    const socket = net.createConnection({ host: parsed.hostname, port });

    let handshakeDone = false;
    let buffer = Buffer.alloc(0);
    let fragChunks: Buffer[] = [];
    let nextId = 1;
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();
    const listeners = new Map<string, (() => void)[]>();

    const failAll = (err: Error) => {
      for (const entry of pending.values()) {
        entry.reject(err);
      }
      pending.clear();
      listeners.clear();
    };

    const handleMessage = (raw: string) => {
      try {
        const msg = JSON.parse(raw);
        if (typeof msg.id === 'number') {
          const entry = pending.get(msg.id);
          if (entry) {
            pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(msg.error.message || 'CDP error'));
            } else {
              entry.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          const callbacks = listeners.get(msg.method);
          if (callbacks?.length) {
            listeners.delete(msg.method);
            callbacks.forEach(cb => cb());
          }
        }
      } catch {
        // ignore malformed CDP messages
      }
    };

    const drainFrames = () => {
      while (buffer.length >= 2) {
        const byte0 = buffer[0];
        const byte1 = buffer[1];
        const fin = (byte0 & 0x80) !== 0;
        const opcode = byte0 & 0x0f;
        const masked = (byte1 & 0x80) !== 0;
        let payloadLen = byte1 & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buffer.length < 4) return;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) return;
          payloadLen = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }

        const maskOffset = masked ? 4 : 0;
        if (buffer.length < offset + maskOffset + payloadLen) return;

        let payload = buffer.subarray(
          offset + maskOffset,
          offset + maskOffset + payloadLen,
        );
        if (masked) {
          const mask = buffer.subarray(offset, offset + 4);
          const unmasked = Buffer.allocUnsafe(payloadLen);
          for (let i = 0; i < payloadLen; i++) {
            unmasked[i] = payload[i] ^ mask[i & 3];
          }
          payload = unmasked;
        }
        buffer = buffer.subarray(offset + maskOffset + payloadLen);

        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode === 0x9) {
          socket.write(encodeWsFrame(0x0a, payload));
          continue;
        }
        if (opcode === 0x1 || opcode === 0x0) {
          fragChunks.push(Buffer.from(payload));
          if (fin) {
            const text = Buffer.concat(fragChunks).toString('utf8');
            fragChunks = [];
            handleMessage(text);
          }
        }
      }
    };

    socket.on('connect', () => {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: ${parsed.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${wsKey}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'),
      );
    });

    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshakeDone) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = buffer.subarray(0, headerEnd).toString('utf8');
        if (!headerText.startsWith('HTTP/1.1 101')) {
          const err = new Error(
            `CDP WebSocket handshake failed: ${headerText.split('\r\n')[0]}`,
          );
          socket.destroy();
          reject(err);
          return;
        }
        handshakeDone = true;
        buffer = buffer.subarray(headerEnd + 4);
        resolve({
          send: (method, params = {}) =>
            new Promise((res, rej) => {
              if (socket.destroyed) {
                rej(new Error('CDP WebSocket closed'));
                return;
              }
              const id = nextId++;
              pending.set(id, { resolve: res, reject: rej });
              socket.write(
                encodeWsFrame(
                  0x1,
                  Buffer.from(JSON.stringify({ id, method, params })),
                ),
              );
            }),
          waitForEvent: (method, timeoutMs) =>
            new Promise((res, rej) => {
              if (socket.destroyed) {
                rej(new Error('CDP WebSocket closed'));
                return;
              }
              const timer = setTimeout(() => {
                rej(new Error(`CDP event timeout: ${method}`));
              }, timeoutMs);
              const list = listeners.get(method) || [];
              list.push(() => {
                clearTimeout(timer);
                res();
              });
              listeners.set(method, list);
            }),
          close: () => {
            try {
              socket.destroy();
            } catch {
              // ignore close errors
            }
          },
        });
      }
      drainFrames();
    });

    socket.on('error', err => {
      if (!handshakeDone) {
        reject(err);
      } else {
        failAll(err);
      }
    });

    socket.on('close', () => {
      if (!handshakeDone) {
        reject(new Error('CDP WebSocket closed before handshake'));
      } else {
        failAll(new Error('CDP WebSocket closed unexpectedly'));
      }
    });
  });

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

  const tabRes = await fetch(
    `${cdpBase}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  );
  if (!tabRes.ok) {
    throw new Error(`CDP /json/new failed with status ${tabRes.status}`);
  }
  const tab = (await tabRes.json()) as CdpTab;
  if (!tab.webSocketDebuggerUrl) {
    throw new Error('CDP tab missing webSocketDebuggerUrl');
  }

  const cdp = await connectCdp(tab.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const deadline = Date.now() + timeoutMs;
    const loadPromise = cdp
      .waitForEvent('Page.loadEventFired', timeoutMs)
      .catch(() => undefined);

    await cdp.send('Page.navigate', { url });
    await loadPromise;

    let selectorMatched = !waitForSelector;
    if (waitForSelector) {
      const expr = `Boolean(document.querySelector(${JSON.stringify(waitForSelector)}))`;
      while (Date.now() < deadline) {
        const evalRes = (await cdp.send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
        })) as { result?: { value?: boolean } };
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

    const htmlRes = (await cdp.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
    })) as { result?: { value?: string } };

    return htmlRes?.result?.value || '';
  } finally {
    cdp.close();
    await fetch(`${cdpBase}/json/close/${tab.id}`).catch(() => undefined);
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
    res.statusCode = 405;
    res.end(
      JSON.stringify({ ok: false, html: '', error: 'Method not allowed' }),
    );
    return;
  }

  try {
    const rawBody = await readJsonBody(req);
    const payload = JSON.parse(rawBody) as Partial<WebviewFetchRequest>;
    const validUrl = parseHttpUrl(payload.url);
    if (!validUrl) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, html: '', error: 'Invalid url' }));
      return;
    }

    const html = await fetchViaCdp({
      url: validUrl,
      waitForSelector: payload.waitForSelector,
      timeoutMs: payload.timeoutMs,
      settleMs: payload.settleMs,
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: Boolean(html), html }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webview-fetch]', message);
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, html: '', error: message }));
  }
};
