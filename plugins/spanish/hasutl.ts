import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "HasuTL";
export const name = "Hasu Translations";
export const site = "https://hasutl.wordpress.com/";
export const version = "1.0.0";
export const icon = "src/es/hasutl/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "light-novels-activas/";

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("div.wp-block-columns").each(function () {
        const novelName = loadedCheerio(this).find(".wp-block-button").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");

        let novelUrl = loadedCheerio(this)
            .find(".wp-block-button > a")
            .attr("href");

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

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = {
            url,
        };

        novel.url = novelUrl;

        novel.name = loadedCheerio(".post-header").text();

        novel.cover = loadedCheerio(".featured-media > img").attr("src");

        let novelSummary = loadedCheerio(".post-content").find("p").html()!;
        novel.summary = novelSummary;

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio(".wp-block-media-text__content")
            .find("a")
            .each(function () {
                const chapterName = loadedCheerio(this).text().trim();

                const releaseDate = null;

                let chapterUrl = loadedCheerio(this).attr("href");

                if (!chapterUrl) return;

                const chapter = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };

                novelChapters.push(chapter);
            });

        novel.chapters = novelChapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio(".post-content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".post-container ").each(function () {
        const novelName = loadedCheerio(this).find(".post-header").text();
        if (
            !novelName.includes("Cap") &&
            !novelName.includes("Vol") &&
            !novelName.includes("Light Novels")
        ) {
            const novelCover = loadedCheerio(this).find("img").attr("src");

            let novelUrl = loadedCheerio(this).find("a").attr("href");

            if (!novelUrl) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        }
    });

    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
