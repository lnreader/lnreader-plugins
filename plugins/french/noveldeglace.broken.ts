import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "NDG.com";
export const name = "NovelDeGlace";
export const site = "https://noveldeglace.com/";
export const version = "1.0.0";
export const icon = "src/fr/noveldeglace/icon.png";

const pluginId = id;

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "roman";

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("article").each(function () {
        const novelName = loadedCheerio(this).find("h2").text().trim();
        const novelCover = loadedCheerio(this).find("img").attr("src");
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

        const result = await fetchApi(url, {}, pluginId);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = { url };

        novel.name = loadedCheerio(
            "div.entry-content > div > strong"
        )[0].nextSibling?.nodeType.trim();

        novel.cover = loadedCheerio(".su-row > div > div > img").attr("src");

        novel.summary = loadedCheerio("div[data-title=Synopsis]").text();

        const author = loadedCheerio(
            "div.romans > div.project-large > div.su-row > div.su-column.su-column-size-3-4 > div > div:nth-child(3) > strong"
        )[0];

        novel.author = author ? author.nextSibling.nodeValue.trim() : null;

        novel.genres = loadedCheerio(".genre")
            .text()
            .replace("Genre : ", "")
            .replace(/, /g, ",");

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio(".chpt").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

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

    const result = await fetchApi(url, {}, pluginId);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio(".chapter-content").html();
    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    let url = baseUrl + "roman";

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("article").each(function () {
        const novelName = loadedCheerio(this).find("h2").text().trim();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");

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

export const fetchImage: Plugin.fetchImage = fetchFile;