import crypto from 'node:crypto';
import net from 'node:net';

export type CdpClient = {
  send: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<unknown>;
  waitForEvent: (method: string, timeoutMs: number) => Promise<void>;
  close: () => void;
};

const WS_OP_CONT = 0x0;
const WS_OP_TEXT = 0x1;
const WS_OP_CLOSE = 0x8;
const WS_OP_PING = 0x9;
const WS_OP_PONG = 0xa;

const applyWsMask = (data: Buffer, mask: Buffer): Buffer => {
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ mask[i & 3];
  }
  return out;
};

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
  return Buffer.concat([header, applyWsMask(payload, mask)]);
};

/**
 * Minimal Node 20+ compatible WebSocket client for local `ws://` CDP endpoints.
 */
export const connectCdp = (
  wsUrl: string,
  connectTimeoutMs = 10000,
): Promise<CdpClient> =>
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

    let settled = false;
    let handshakeDone = false;
    let buffer = Buffer.alloc(0);
    let fragChunks: Buffer[] = [];
    let nextId = 1;
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();
    const listeners = new Map<string, (() => void)[]>();

    const connectTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(
          new Error(`CDP WebSocket connect timeout (${connectTimeoutMs}ms)`),
        );
      }
    }, connectTimeoutMs);

    const clearConnectTimer = () => {
      clearTimeout(connectTimer);
    };

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
          payload = applyWsMask(payload, mask);
        }
        buffer = buffer.subarray(offset + maskOffset + payloadLen);

        if (opcode === WS_OP_CLOSE) {
          socket.end();
          return;
        }
        if (opcode === WS_OP_PING) {
          socket.write(encodeWsFrame(WS_OP_PONG, payload));
          continue;
        }
        if (opcode === WS_OP_TEXT || opcode === WS_OP_CONT) {
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
          clearConnectTimer();
          const err = new Error(
            `CDP WebSocket handshake failed: ${headerText.split('\r\n')[0]}`,
          );
          socket.destroy();
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }
        handshakeDone = true;
        settled = true;
        clearConnectTimer();
        buffer = buffer.subarray(headerEnd + 4);
        resolve({
          send: (method, params = {}, commandTimeoutMs = 15000) =>
            new Promise((res, rej) => {
              if (socket.destroyed) {
                rej(new Error('CDP WebSocket closed'));
                return;
              }
              const id = nextId++;
              const timer = setTimeout(() => {
                if (pending.delete(id)) {
                  rej(new Error(`CDP command timeout: ${method}`));
                }
              }, commandTimeoutMs);
              pending.set(id, {
                resolve: v => {
                  clearTimeout(timer);
                  res(v);
                },
                reject: e => {
                  clearTimeout(timer);
                  rej(e);
                },
              });
              socket.write(
                encodeWsFrame(
                  WS_OP_TEXT,
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
      clearConnectTimer();
      if (!handshakeDone) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      } else {
        failAll(err);
      }
    });

    socket.on('close', () => {
      clearConnectTimer();
      if (!handshakeDone) {
        if (!settled) {
          settled = true;
          reject(new Error('CDP WebSocket closed before handshake'));
        }
      } else {
        failAll(new Error('CDP WebSocket closed unexpectedly'));
      }
    });
  });
