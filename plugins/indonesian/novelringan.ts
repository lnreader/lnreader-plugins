import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "novelringan.com";
export const name = "NovelRingan";
export const site = "https://novelringan.com/";
export const icon = "src/id/novelringan/icon.png";
export const version = "1.0.0";

const baseUrl = site;
const coverUriPrefix = "https://i0.wp.com/novelringan.com/wp-content/uploads/";

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}/top-novel/page/${page}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio("article.post").each(function () {
        const novelName = loadedCheerio(this)
            .find(".entry-title")
            .text()
            ?.trim();
        const novelCover =
            coverUriPrefix + loadedCheerio(this).find("img").attr("data-sxrx");
        const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");

        if (!novelUrl) return;

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

        const loadedCheerio = parseHTML(body);

        let novel: Novel.instance = {
            url,
            name: "",
            cover: "",
            genres: "",
            author: "",
            status: NovelStatus.Unknown,
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".entry-title").text()?.trim();
        novel.cover =
            coverUriPrefix +
            loadedCheerio("img.ts-post-image").attr("data-sxrx");
        novel.summary = loadedCheerio(
            "body > div.site-container > div > main > article > div > div.maininfo > span > p"
        ).text();

        let genreSelector = loadedCheerio(
            "body > div.site-container > div > main > article > div > div.maininfo > span > ul > li:nth-child(4)"
        ).text();

        novel.genres = genreSelector.includes("Genre")
            ? genreSelector.replace("Genre:", "").trim()
            : "";

        let statusSelector = loadedCheerio(
            "body > div.site-container > div > main > article > div > div.maininfo > span > ul > li:nth-child(3)"
        ).text();

        novel.status = statusSelector.includes("Status")
            ? statusSelector.replace("Status:", "").trim()
            : NovelStatus.Unknown;

        let chapters: Chapter.Item[] = [];

        loadedCheerio(".bxcl > ul > li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };

            chapters.push(chapter);
        });

        novel.chapters = chapters.reverse();

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('.entry-content div[style="display:none"]').remove();

    const chapterText = loadedCheerio(".entry-content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = baseUrl + "?s=" + searchTerm;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("article.post").each(function () {
        const novelName = loadedCheerio(this).find(".entry-title").text();
        const novelCover =
            coverUriPrefix + loadedCheerio(this).find("img").attr("data-sxrx");

        const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");

        if (!novelUrl) return;

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });
    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
