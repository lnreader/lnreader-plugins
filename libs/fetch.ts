export async function fetchApi(
    url: string,
    init?: {
        headers?: Record<string,string> | Headers;
        [x: string]: string | Record<string,string> | undefined | FormData | Headers;
    },
) {
    let defaultHeaders: {
        'User-Agent'?: string,
        'Cookie'?: string,
    } = {};
    try {
        const getHeaders = (await import('../index.js')).getHeaders;
        defaultHeaders = getHeaders();
    }catch{
        // nothing to do
    }

    if(init?.headers) {
        if(init.headers instanceof Headers){ 
            if(!init.headers.get('User-Agent') && defaultHeaders['User-Agent']){
                init.headers.set('User-Agent', defaultHeaders['User-Agent']);
            }
            if(defaultHeaders.Cookie) {
                init.headers.set('Cookie', defaultHeaders.Cookie);
            }
        }else{
            init.headers = {
                ...defaultHeaders,
                ...init.headers,
            };
        }
    }else{
        init = {
            ...init,
            headers: defaultHeaders
        }
    }

    console.log(url, init);
    return await fetch(url, init);
}

export const fetchFile = async function (url: string, init?: RequestInit) {
    if (!init) init = {};
    try {
        const res = await fetch(url, init);
        if (!res.ok) return undefined;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer).toString("base64");
    } catch (e) {
        return undefined;
    }
};
