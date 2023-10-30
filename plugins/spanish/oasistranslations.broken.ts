import { fetchFile, fetchApi } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { load as parseHTML } from "cheerio";

export const id = "oasisTL.wp";
export const name = "Oasis Translations";
export const site = "https://oasistranslations.wordpress.com/";
export const version = "1.0.0";
export const icon = "src/es/oasistranslations/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".menu-item-1819")
        .find(".sub-menu > li")
        .each(function () {
            const novelName = loadedCheerio(this).text();
            if (!novelName.match(/Activas|Finalizadas|Dropeadas/)) {
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

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = novelUrl;

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = { url };

        novel.name = loadedCheerio("h1.entry-title")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();

        novel.cover = loadedCheerio('img[loading="lazy"]').attr("src");

        loadedCheerio(".entry-content > p").each(function (res) {
            if (loadedCheerio(this).text().includes("Autor")) {
                let details = loadedCheerio(this).html()!;
                details = details.match(/<\/strong>(.|\n)*?<br>/g);
                details = details.map((detail) =>
                    detail.replace(/<strong>|<\/strong>|<br>|:\s/g, "")
                );

                novel.genres = "";

                novel.author = details[2];
                novel.genres = details[4].replace(/\s|&nbsp;/g, "");
            }
        });

        // let novelSummary = $(this).next().html();
        novel.summary = "";

        let novelChapters: Chapter.Item[] = [];

        // if ($(".entry-content").find("li").length) {
        loadedCheerio(".entry-content")
            .find("a")
            .each(function () {
                let chapterUrl = loadedCheerio(this).attr("href");

                if (chapterUrl && chapterUrl.includes(baseUrl)) {
                    const chapterName = loadedCheerio(this).text();
                    const releaseDate = null;

                    const chapter = {
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    };

                    novelChapters.push(chapter);
                }
            });

        novel.chapters = novelChapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    loadedCheerio("div#jp-post-flair").remove();

    let chapterText = loadedCheerio(".entry-content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    searchTerm = searchTerm.toLowerCase();

    let url = baseUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];
    loadedCheerio(".menu-item-1819")
        .find(".sub-menu > li")
        .each(function () {
            const novelName = loadedCheerio(this).text();
            if (!novelName.match(/Activas|Finalizadas|Dropeadas/)) {
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

    novels = novels.filter((novel) =>
        novel.name.toLowerCase().includes(searchTerm)
    );

    return novels;
};

export const fetchImage: Plugin.fetchImage = fetchFile;