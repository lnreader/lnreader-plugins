export async function fetchApi(
    url: string,
    init?: {
        headers?: Record<string,string> | Headers;
        [x: string]: string | Record<string,string> | undefined | FormData | Headers;
    },
) {
    let userAgent: string | undefined;
    try {
        // get your user agent when you open localhost:3000
        const getUserAgent = (await import('../index.js')).getUserAgent;
        userAgent = getUserAgent();
    }catch{
        // nothing to do
    }

    // there're 2 type of Headers, plain object {} or Headers instance
    if(userAgent) {
        if(init?.headers) {
            if(init.headers instanceof Headers){ 
                if(!init.headers.get('User-Agent')){
                    init.headers.set('User-Agent', userAgent);
                }
            }else{
                init.headers = {
                    "User-agent": userAgent,
                    ...init.headers
                }
            }
        }else{
            init = {
                ...init,
                headers: {
                    "User-Agent": userAgent
                }
            }
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
