import { Plugin } from "@typings/plugin";
import { NodeFetchParams, getNodeFetch } from "./nodeFetch";

const fetch = async (...args: NodeFetchParams) =>
    (await getNodeFetch())(...args);

const defaultUserAgentString =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36";

export async function fetchApi(
    url: string,
    init?: NodeFetchParams[1],
    pluginId?: string
) {
    const headers = {
        "User-Agent": defaultUserAgentString,
        ...init?.headers,
    };
    if (pluginId) console.log("Enable CloudFlare cookie for", pluginId);
    return await fetch(url, { ...init, headers });
}

export const fetchFile: Plugin.fetchImage = async function (url, init) {
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
