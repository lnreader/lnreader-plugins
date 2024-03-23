import { parse as parseProto } from 'protobufjs';

type FetchInit = {
  headers?: Record<string, string | undefined> | Headers;
  method?: string;
  body?: FormData | string;
  [x: string]:
    | string
    | Record<string, string | undefined>
    | undefined
    | FormData
    | Headers;
};

const makeInit = async (init?: FetchInit) => {
  let defaultHeaders: Record<string, string> = {
    'Connection': 'keep-alive',
    'Accept': '*/*',
    'Accept-Language': '*',
    'Sec-Fetch-Mode': 'cors',
    'Accept-Encoding': 'gzip, deflate',
    'Cache-Control': 'max-age=0',
  };
  try {
    const { getHeaders } = await import('../index.js');
    defaultHeaders = {
      ...defaultHeaders,
      ...getHeaders(),
    };
  } catch {
    // nothing to do
  }
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      for (const [name, value] of Object.entries(defaultHeaders)) {
        if (!init.headers.get(name)) init.headers.set(name, value);
      }
    } else {
      init.headers = {
        ...defaultHeaders,
        ...init.headers,
      };
    }
  } else {
    init = {
      ...init,
      headers: defaultHeaders,
    };
  }
  return init;
};

/**
 * Fetch with (Android) User Agent
 * @param url
 * @param init
 * @returns response as normal fetch
 */
export async function fetchApi(url: string, init?: FetchInit) {
  init = await makeInit(init);
  // console.log(init.headers);
  // console.log(url, init);
  return await fetch(url, init as RequestInit);
}

/**
 *
 * @param url
 * @param init
 * @returns base64 string of file
 * @example fetchFile('https://avatars.githubusercontent.com/u/81222734?s=48&v=4');
 */
export const fetchFile = async function (url: string, init?: FetchInit) {
  init = await makeInit(init);
  console.log(url, init);
  try {
    const res = await fetch(url, init as RequestInit);
    if (!res.ok) return '';
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (e) {
    return '';
  }
};

/**
 *
 * @param url
 * @param init
 * @param encoding default: `utf-8`. link: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
 * @returns plain text
 * @example fetchText('https://github.com/LNReader/lnreader', {}, 'gbk');
 */
export const fetchText = async function (
  url: string,
  init?: FetchInit,
  encoding?: string,
): Promise<string> {
  init = await makeInit(init);
  console.log(url, init);
  try {
    const res = await fetch(url, init as RequestInit);
    if (!res.ok) return '';
    const arrayBuffer = await res.arrayBuffer();
    const decoder = new TextDecoder(encoding);
    return decoder.decode(arrayBuffer);
  } catch (e) {
    return '';
  }
};

interface ProtoRequestInit {
  // merged .proto file
  proto: string;
  requestType: string;
  requestData?: any;
  responseType: string;
}

const BYTE_MARK = BigInt((1 << 8) - 1);

export const fetchProto = async function <ReturnType>(
  protoInit: ProtoRequestInit,
  url: string,
  init?: FetchInit,
) {
  const protoRoot = parseProto(protoInit.proto).root;
  const RequestMessge = protoRoot.lookupType(protoInit.requestType);
  if (RequestMessge.verify(protoInit.requestData)) {
    throw new Error('Invalid Proto');
  }
  // encode request data
  const encodedrequest = RequestMessge.encode(protoInit.requestData).finish();
  const requestLength = BigInt(encodedrequest.length);
  const headers = new Uint8Array(
    Array(5)
      .fill(0)
      .map((v, idx) => {
        if (idx === 0) return 0;
        return Number((requestLength >> BigInt(8 * (5 - idx - 1))) & BYTE_MARK);
      }),
  );
  init = await makeInit(init);
  const bodyArray = new Uint8Array(headers.length + encodedrequest.length);
  bodyArray.set(headers, 0);
  bodyArray.set(encodedrequest, headers.length);
  return fetch(url, {
    method: 'POST',
    ...init,
    body: bodyArray,
  } as RequestInit)
    .then(r => r.arrayBuffer())
    .then(arr => {
      // decode response data
      const payload = new Uint8Array(arr);
      const length = Number(
        BigInt(payload[1] << 24) |
          BigInt(payload[2] << 16) |
          BigInt(payload[3] << 8) |
          BigInt(payload[4]),
      );
      const ResponseMessage = protoRoot.lookupType(protoInit.responseType);
      return ResponseMessage.decode(payload.slice(5, 5 + length));
    }) as ReturnType;
};
