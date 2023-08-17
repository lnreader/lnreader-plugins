import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "novelhold";
export const name = "Novel Hold";
export const version = "1.0.0";
export const icon = "src/en/novelhold/icon.png";
export const site = "https://novelhold.com/";
exports.protected = false;

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}all-${page}.html`;

    const body = await fetchApi(url).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("#article_list_content > li").each(function () {
        const novelName = loadedCheerio(this)
            .find("h3")
            .text()
            .replace(/\t+/g, "")
            .replace(/\n/g, " ");
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl =
            baseUrl + loadedCheerio(this).find("a").attr("href")?.slice(1);

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

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".booknav2 > h1").text();

        novel.cover = loadedCheerio('meta[property="og:image"]').attr(
            "content"
        );

        novel.summary = loadedCheerio(".navtxt").text().trim();

        novel.author = loadedCheerio('p:contains("Author")')
            .text()
            .replace("Author：", "")
            .trim();

        novel.status = loadedCheerio('p:contains("Status")')
            .text()
            .replace("Status：", "")
            .replace("Active", "Ongoing")
            .trim();

        novel.genres = loadedCheerio('p:contains("Genre")')
            .text()
            ?.replace("Genre：", "")
            .trim();

        let chapter: Chapter.Item[] = [];

        loadedCheerio("ul.chapterlist > li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl =
                baseUrl + loadedCheerio(this).find("a").attr("href")?.slice(1);

            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapter;
        console.log(novel);
        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const body = await fetchApi(chapterUrl).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio(".content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}index.php?s=so&module=book&keyword=${searchTerm}`;

    const body = await fetchApi(url).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("#article_list_content > li").each(function () {
        const novelName = loadedCheerio(this)
            .find("h3")
            .text()
            .replace(/\t+/g, "")
            .replace(/\n/g, " ");
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl =
            baseUrl + loadedCheerio(this).find("a").attr("href")?.slice(1);

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
