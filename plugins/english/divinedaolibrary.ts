import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";

export const id = "DDL.com";
export const name = "Divine Dao Library";
export const site = "https://www.divinedaolibrary.com/";
export const version = "1.0.0";
export const icon = "src/en/divinedaolibrary/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "novels";

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("#main")
        .find("li")
        .each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover;
            const novelUrl = loadedCheerio(this).find(" a").attr("href");

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

        let novel: Novel.instance = { url };

        novel.name = loadedCheerio("h1.entry-title").text().trim();

        novel.cover =
            loadedCheerio(".entry-content").find("img").attr("data-ezsrc") ||
            defaultCover;

        novel.summary = loadedCheerio("#main > article > div > p:nth-child(6)")
            .text()
            .trim();

        novel.author = loadedCheerio("#main > article > div > h3:nth-child(2)")
            .text()
            .replace(/Author:/g, "")
            .trim();

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio("#main")
            .find("li > span > a")
            .each(function () {
                const chapterName = loadedCheerio(this).text().trim();
                const releaseDate = null;
                const chapterUrl = loadedCheerio(this).attr("href");

                if (!chapterUrl) return;

                novelChapters.push({
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                });
            });

        novel.chapters = novelChapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let chapterName = loadedCheerio(".entry-title").text().trim();

    let chapterText = loadedCheerio(".entry-content").html();

    if (!chapterText) {
        chapterText = loadedCheerio(".page-header").html();
    }

    chapterText = `<p><h1>${chapterName}</h1></p>` + chapterText;

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    let url = baseUrl + "novels";

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("#main")
        .find("li")
        .each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover;
            const novelUrl = loadedCheerio(this).find(" a").attr("href");

            if (!novelUrl) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        });

    novels = novels.filter((novel) =>
        novel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return novels;
};
export const fetchImage: Plugin.fetchImage = async function (url, init) {
    return await fetchFile(url, init);
};
