import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "novelfull";
export const name = "NovelFull";
export const version = "1.0.0";
export const icon = "src/en/novelfull/icon.png";
export const site = "https://novelfull.com/";
exports.protected = false;

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}most-popular?page=${page}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".col-truyen-main .list-truyen .row").each(function () {
        const novelName = loadedCheerio(this)
            .find("h3.truyen-title > a")
            .text();

        const novelCover =
            baseUrl + loadedCheerio(this).find("img").attr("src")?.slice(1);

        const novelUrl =
            baseUrl +
            loadedCheerio(this)
                .find("h3.truyen-title > a")
                .attr("href")
                ?.slice(1);

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

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("div.book > img").attr("alt");

        novel.cover = baseUrl + loadedCheerio("div.book > img").attr("src");

        novel.summary = loadedCheerio("div.desc-text").text().trim();

        novel.author = loadedCheerio('h3:contains("Author")')
            .parent()
            .contents()
            .text()
            .replace("Author:", "");

        novel.genres = loadedCheerio('h3:contains("Genre")')
            .siblings()
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        novel.status = loadedCheerio('h3:contains("Status")').next().text();

        const novelId = loadedCheerio("#rating").attr("data-novel-id")!;

        async function getChapters(id: string) {
            const chapterListUrl =
                baseUrl + "ajax/chapter-option?novelId=" + id;

            const data = await fetchApi(chapterListUrl);
            const chapterlist = await data.text();

            loadedCheerio = parseHTML(chapterlist);

            let chapter: Chapter.Item[] = [];

            loadedCheerio("select > option").each(function () {
                const chapterName = loadedCheerio(this).text();
                const releaseDate = null;
                const chapterUrl =
                    baseUrl + loadedCheerio(this).attr("value")?.slice(1);

                chapter.push({
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                });
            });
            return chapter;
        }

        novel.chapters = await getChapters(novelId);

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const result = await fetchApi(chapterUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio("#chapter-content div.ads").remove();
    let chapterText = loadedCheerio("#chapter-content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const searchUrl = `${baseUrl}search?keyword=${searchTerm}`;

    const result = await fetchApi(searchUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".col-truyen-main .list-truyen .row").each(function () {
        const novelName = loadedCheerio(this)
            .find("h3.truyen-title > a")
            .text();

        const novelCover =
            baseUrl + loadedCheerio(this).find("img").attr("src")?.slice(1);

        const novelUrl =
            baseUrl +
            loadedCheerio(this)
                .find("h3.truyen-title > a")
                .attr("href")
                ?.slice(1);

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    return novels;
};

export const fetchImage: Plugin.fetchImage = async function (url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};
