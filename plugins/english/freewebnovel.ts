import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Novel, Plugin } from "@typings/plugin";

export const id = "FWN.com";
export const name = "Web NOVEL";
export const site = "https://freewebnovel.com/";
export const version = "1.0.0";
export const icon = "src/en/freewebnovel/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "completed-novel/" + page;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".li-row").each(function () {
        const novelName = loadedCheerio(this).find(".tit").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");

        let novelUrl =
            "https://freewebnovel.com" +
            loadedCheerio(this).find("h3 > a").attr("href");

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
        };

        novel.name = loadedCheerio("h1.tit").text();

        novel.cover = loadedCheerio(".pic > img").attr("src");

        novel.genres = loadedCheerio("[title=Genre]")
            .next()
            .text()
            .replace(/[\t\n]/g, "");

        novel.author = loadedCheerio("[title=Author]")
            .next()
            .text()
            .replace(/[\t\n]/g, "");

        novel.status = loadedCheerio("[title=Status]")
            .next()
            .text()
            .replace(/[\t\n]/g, "");

        let novelSummary = loadedCheerio(".inner").text().trim();
        novel.summary = novelSummary;

        let novelChapters = [];

        let latestChapter: string | undefined;

        loadedCheerio("h3.tit").each(function (res) {
            if (loadedCheerio(this).find("a").text() === novel.name) {
                latestChapter = loadedCheerio(this)
                    .next()
                    .find("span.s3")
                    .text()
                    .match(/(\d+)/)?.[0];
            }
        });

        let prefixUrl = novelUrl.replace(".html", "/");

        for (let i = 1; i <= parseInt(latestChapter || "0", 10); i++) {
            const chapterName = "Chapter " + i;

            const releaseDate = null;

            let chapterUrl = "chapter-" + i;
            chapterUrl = `${prefixUrl}${chapterUrl}.html`;
            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };

            novelChapters.push(chapter);
        }

        novel.chapters = novelChapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio("div.txt").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = baseUrl + "search/";

    const formData = {
        searchkey: searchTerm,
    };

    const result = await fetchApi(url, {
        method: "POST",
        body: JSON.stringify(formData),
    });
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".li-row > .li > .con").each(function () {
        const novelName = loadedCheerio(this).find(".tit").text();
        const novelCover = loadedCheerio(this)
            .find(".pic > a > img")
            .attr("data-cfsrc");

        let novelUrl =
            "https://freewebnovel.com" +
            loadedCheerio(this).find("h3 > a").attr("href");

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
