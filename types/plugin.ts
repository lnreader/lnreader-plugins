import { FilterToValues, Filters } from "@libs/filterInputs";
import { languages } from "@libs/languages";
export namespace Plugin {
    export interface ChapterItem {
        name: string;
        url: string;
        /**
         * "YYYY-MM-DD" format or ISO string format
         * ```js
         * chapter.releaseTime = '2023-12-02';
         * chapter.releaseTime = new Date(2023, 12, 02).toISOString();
         * ```
         */
        releaseTime?: string | null;
        chapterNumber?: number;
    }
    export interface NovelItem {
        name: string;
        url: string;
        cover?: string;
    }
    export interface SourceNovel {
        url: string;
        name?: string;
        /** Novel cover absolute URL */
        cover?: string;
        /** Comma separated genre list */
        genres?: string;
        summary?: string;
        author?: string;
        artist?: string;
        status?: string;
        chapters?: ChapterItem[];
    }
    export interface PopularNovelsOptions<
        Q extends Filters | undefined = Filters | undefined
    > {
        showLatestNovels?: boolean;
        filters: Q extends undefined ? undefined : FilterToValues<Q>;
    }
    export interface PluginItem {
        id: string;
        name: string;
        lang: (typeof languages)[keyof typeof languages];
        version: string;
        requirePath: string;
        icon: string;
    }

    export interface PluginBase {
        id: string;
        name: string;
        /**
         * Relative path without icon. E.g:
         * ```js
         * "src/vi/hakolightnovel/icon.png"
         * ```
         */
        icon: string;
        site: string;
        filters?: Filters;
        version: string;
        popularNovels(
            pageNo: number,
            options: PopularNovelsOptions<Filters>
        ): Promise<NovelItem[]>;
        parseNovelAndChapters(novelUrl: string): Promise<SourceNovel>;
        parseChapter(chapterUrl: string): Promise<string>;
        searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
        /**
         *
         * @param url Image url
         * @returns {Promise<string|undefined>} Base64 of image
         * @example
         * ```ts
         *  const headers = {
         *      Referer: "https://ln.hako.vn",
         *   };
         *  return await fetchFile(url, { headers: headers });
         * ```
         */
        fetchImage(url: string): Promise<string | undefined>;
    }
}

export const isPlugin = (p: any): p is Plugin.PluginBase => {
    const pl = p as Plugin.PluginBase;

    const errorOut = (key: string) => {
        console.error(`Plugin ${pl.name} doesn't have ${key}!`);
        return false;
    };

    const required_funcs: (keyof Plugin.PluginBase)[] = [
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
    const requireds_fields: (keyof Plugin.PluginBase)[] = [
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
