import { Filter } from "@libs/filterInputs";
import { languages } from "@libs/languages";
import { NodeFetchParams } from "@libs/nodeFetch";

export namespace Chapter {
    export interface Item {
        name: string;
        url: string;
        releaseTime?: string | null;
    }
    export interface instance {
        sourceId: number;
        novelUrl: string;
        chapterUrl: string;
        name?: string;
        chapterText?: string;
    }
}

export namespace Novel {
    export interface Item {
        name: string;
        url: string;
        cover?: string;
    }
    export interface instance {
        url: string;
        name?: string;
        cover?: string;
        genres?: string;
        summary?: string;
        author?: string;
        status?: string;
        chapters?: Chapter.Item[];
    }
}

export namespace Plugin {
    export interface Options {
        showLatestNovels?: boolean;
        filters?: Record<string, string | string[]>;
    }
    export interface Info {
        id: string;
        name: string;
        lang: (typeof languages)[keyof typeof languages];
        version: string;
        requirePath: string;
    }
    export interface instance {
        id: string;
        name: string;
        version: string;
        icon: string;
        site: string;
        popularNovels: popularNovels;
        parseNovelAndChapters: parseNovelAndChapters;
        parseChapter: parseChapter;
        searchNovels: searchNovels;
        fetchImage: fetchImage;
        filters?: Filter[];
    }
    export type popularNovels = (
        page: number,
        options: Plugin.Options
    ) => Promise<PopularNovelsResponse>;
    export type PopularNovelsResponse = Novel.Item[];
    export type parseNovelAndChapters = (
        novelUrl: string
    ) => Promise<Novel.instance>;
    export type parseChapter = (chapterUrl: string) => Promise<string | null>;
    export type searchNovels = (searchTerm: string) => Promise<Novel.Item[]>;
    export type fetchImage = (
        ...params: NodeFetchParams
    ) => Promise<string | undefined>;
}

export const isPlugin = (p: any): p is Plugin.instance => {
    const pl = p as Plugin.instance;

    const errorOut = (key: string) => {
        console.error(`Plugin ${pl.name} doesn't have ${key}!`);
        return false;
    };

    const required_funcs: (keyof Plugin.instance)[] = [
        "popularNovels",
        "parseNovelAndChapters",
        "parseChapter",
        "searchNovels",
        "fetchImage",
    ];
    for (let i = 0; i < required_funcs.length; i++) {
        const key = required_funcs[i];
        if (!pl[key] || typeof pl[key] !== "function") return errorOut(key);
    }
    const requireds_fields: (keyof Plugin.instance)[] = [
        "id",
        "name",
        "version",
        "icon",
        "site",
    ];
    for (let i = 0; i < requireds_fields.length; i++) {
        const key = requireds_fields[i];
        if (pl[key] === undefined) return errorOut(key);
    }

    return true;
};
