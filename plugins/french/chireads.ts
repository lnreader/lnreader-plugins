import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "chireads.com";
export const name = "Chireads";
export const site = "https://chireads.com/";
export const version = "1.0.0";
export const icon = "src/fr/chireads/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}category/translatedtales/page/${page}/`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("#content li").each(function () {
        const novelName = loadedCheerio(this).find(".news-list-tit h5").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this)
            .find(".news-list-tit h5 a")
            .attr("href");

        if (!novelUrl) return;

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

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

        novel.name = loadedCheerio(".inform-title").text().trim();

        novel.cover = loadedCheerio(".inform-product img").attr("src");

        novel.summary = loadedCheerio(".inform-inform-txt").text().trim();

        let chapters: Chapter.Item[] = [];

        loadedCheerio(".chapitre-table a").each(function () {
            const chapterName = loadedCheerio(this).text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).attr("href");

            if (!chapterUrl) return;

            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio("#content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}search?x=0&y=0&name=${searchTerm}`;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("#content li").each(function () {
        const novelName = loadedCheerio(this).find(".news-list-tit h5").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this)
            .find(".news-list-tit h5 a")
            .attr("href");

        if (!novelUrl) return;

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

        novels.push(novel);
    });
    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
