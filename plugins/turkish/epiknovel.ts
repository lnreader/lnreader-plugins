import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "epiknovel.com";
export const name = "EpikNovel";
export const site = "https://www.epiknovel.com/";
export const version = "1.0.0";
export const icon = "src/tr/epiknovel/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "seri-listesi?Sayfa=" + page;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("div.col-lg-12.col-md-12").each(function () {
        const novelName = loadedCheerio(this).find("h3").text();
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

        if (!novelUrl) return;

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    // console.log(novels);

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = novelUrl;
        // console.log(url);

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = { url };

        novel.name = loadedCheerio("h1#tables").text().trim();

        novel.cover = loadedCheerio("img.manga-cover").attr("src");

        novel.summary = loadedCheerio(
            "#wrapper > div.row > div.col-md-9 > div:nth-child(6) > p:nth-child(3)"
        )
            .text()
            .trim();

        novel.status = loadedCheerio(
            "#wrapper > div.row > div.col-md-9 > div.row > div.col-md-9 > h4:nth-child(3) > a"
        )
            .text()
            .trim();

        novel.author = loadedCheerio("#NovelInfo > p:nth-child(4)")
            .text()
            .replace(/Publisher:|\s/g, "")
            .trim();

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio("table").find("tr").first().remove();

        loadedCheerio("table")
            .find("tr")
            .each(function () {
                const releaseDate = loadedCheerio(this)
                    .find("td:nth-child(3)")
                    .text();

                let chapterName = loadedCheerio(this)
                    .find("td:nth-child(1) > a")
                    .text();

                if (
                    loadedCheerio(this).find("td:nth-child(1) > span").length >
                    0
                ) {
                    chapterName = "🔒 " + chapterName;
                }

                const chapterUrl = loadedCheerio(this)
                    .find(" td:nth-child(1) > a")
                    .attr("href");

                if (!chapterUrl) return;

                novelChapters.push({
                    name: chapterName,
                    url: chapterUrl,
                    releaseTime: releaseDate,
                });
            });

        novel.chapters = novelChapters;
        // console.log(novel);

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    // console.log(url);

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterName, chapterText;

    if (result.url === "https://www.epiknovel.com/login") {
        chapterName = "";
        chapterText = "Premium Chapter";
    } else {
        chapterName = loadedCheerio("#icerik > center > h4 > b").text();
        chapterText = loadedCheerio("div#icerik").html();
    }

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = baseUrl + "seri-listesi?q=" + searchTerm;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("div.col-lg-12.col-md-12").each(function () {
        const novelName = loadedCheerio(this).find("h3").text();
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

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
