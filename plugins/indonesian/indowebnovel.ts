import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";

export const id = "IDWN.id";
export const name = "IndoWebNovel";
export const site = "https://indowebnovel.id/id/";
export const icon = "src/id/indowebnovel/icon.png";
export const version = "1.0.0";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}daftar-novel/`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".novellist-blc li").each(function () {
        const novelName = loadedCheerio(this).find("a").text();
        const novelCover = defaultCover;
        const novelUrl = loadedCheerio(this).find("a").attr("href");

        if (!novelUrl || !novelName) return;

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = novelUrl;

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = {
            url,
            name: "",
            cover: "",
            author: "",
            status: "",
            genres: "",
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".series-title").text().trim();

        novel.cover = loadedCheerio(".series-thumb > img").attr("src");

        novel.summary = loadedCheerio(".series-synops").text().trim();

        novel.status = loadedCheerio(".status").text().trim();

        const genres: string[] = [];

        loadedCheerio(".series-genres").each(function () {
            genres.push(loadedCheerio(this).find("a").text().trim());
        });

        novel.genres = genres.join(",");

        let chapters: Chapter.Item[] = [];

        loadedCheerio(".series-chapterlist li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapters.reverse();

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio(".reader").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}daftar-novel/`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".novellist-blc li").each(function () {
        const novelName = loadedCheerio(this).find("a").text();
        const novelCover = defaultCover;
        const novelUrl = loadedCheerio(this).find("a").attr("href");

        if (!novelUrl) return;

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        if (novelName.toLowerCase().includes(searchTerm.toLowerCase())) {
            novels.push(novel);
        }
    });

    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
