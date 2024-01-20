export async function fetchApi(
    url: string,
    init?: {
        headers?: Record<string, string> | Headers;
        [x: string]:
            | string
            | Record<string, string>
            | undefined
            | FormData
            | Headers;
    }
) {
    let defaultHeaders: Record<string, string> = {};
    try {
        const { getHeaders } = await import("../index.js");
        defaultHeaders = getHeaders();
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
    console.log(url, init);
    return await fetch(url, init);
}

export const fetchFile = async function (url: string, init?: RequestInit) {
    if (!init) init = {};
    let defaultHeaders: Record<string, string> = {};
    try {
        const { getHeaders } = await import("../index.js");
        defaultHeaders = getHeaders();
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
    try {
        const res = await fetch(url, init);
        if (!res.ok) return undefined;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer).toString("base64");
    } catch (e) {
        return undefined;
    }
};
