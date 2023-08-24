import { load as cheerioload } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import dayjs from "dayjs";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "comrademao";
export const name = "Comrade Mao";
export const site = "https://comrademao.com/";
export const version = "1.0.0";
export const icon = "src/en/comrademao/icon.png";

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = site + "page/" + page + "/?post_type=novel";

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".listupd")
        .find("div.bs")
        .each(function () {
            const novelName = loadedCheerio(this).find(".tt").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");

            if (!novelUrl) {
                // TODO: Handle error
                console.error("No novel url!");
                return;
            }

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

        const loadedCheerio = cheerioload(body);

        let novel: Novel.instance = { url };

        novel.name = loadedCheerio(".entry-title").text().trim();

        novel.cover = loadedCheerio("div.thumbook > div > img").attr("src");

        novel.summary = loadedCheerio("div.infox > div:nth-child(6) > span > p")
            .text()
            .trim();

        novel.genres = loadedCheerio("div.infox > div:nth-child(4) > span")
            .text()
            .replace(/\s/g, "");

        novel.status = loadedCheerio("div.infox > div:nth-child(3) > span")
            .text()
            .trim();

        novel.author = loadedCheerio("div.infox > div:nth-child(2) > span")
            .text()
            .trim();

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio("#chapterlist")
            .find("li")
            .each(function () {
                const releaseDate = dayjs(
                    loadedCheerio(this).find(".chapterdate").text()
                ).format("LL");
                const chapterName = loadedCheerio(this)
                    .find(".chapternum")
                    .text();
                const chapterUrl = loadedCheerio(this).find("a").attr("href");

                if (!chapterUrl) {
                    // TODO: Handle error
                    console.error("No chapter url!");
                    return;
                }

                novelChapters.push({
                    name: chapterName,
                    url: chapterUrl,
                    releaseTime: releaseDate,
                });
            });

        novel.chapters = novelChapters.reverse();

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    if (!result.ok) {
        const err = await result.text();
        console.error(err);
        // TODO: Cloudflare protection or other error
        return "Error!" + err;
    }
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    let chapterText = loadedCheerio("#chaptercontent").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = site + "?s=" + searchTerm + "&post_type=novel";

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".listupd")
        .find("div.bs")
        .each(function () {
            const novelName = loadedCheerio(this).find(".tt").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");

            if (!novelUrl) {
                // TODO: Handle error
                console.error("No novel url!");
                return;
            }

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        });

    return novels;
};
export const fetchImage: Plugin.fetchImage = (...args) => fetchFile(...args);


