// import { load as parseHTML } from "cheerio";
// import dayjs from 'dayjs';
import { fetchFile, fetchApi } from "@libs/fetch";
import { Novel, Plugin, Chapter } from "@typings/plugin";
// import { parseMadaraDate } from "@libs/parseMadaraDate";
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { showToast } from "@libs/showToast";
// import { Filter, FilterInputs } from "@libs/filterInputs";
// import { NovelStatus } from '@libs/novelStatus';
// import { defaultCover } from "@libs/defaultCover";


export const id = "";
export const name = "Source name";
export const icon = "";
export const version = "0.0.0";
export const site = "";
// export const filters: Filter[] = [];

export const popularNovels: Plugin.popularNovels = async function (
    page,
    { filters, showLatestNovels }
) {
    const novels: Novel.Item[] = [];

    return novels;
};


export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const novel: Novel.instance = {
            url: novelUrl,
            chapters: [],
        };

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const chapterText = "";

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async (searchTerm) => {
    const novels: Novel.Item[] = [];

    return novels;
};

export const fetchImage: Plugin.fetchImage = async (url) => {
    return await fetchFile(url, {});
};
