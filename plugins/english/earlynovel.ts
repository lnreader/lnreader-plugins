import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { showToast } from "@libs/showToast";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";

export const id = "earlynovel";
export const name = "Early Novel";
export const version = "1.0.0";
export const icon = "multisrc/madara/icons/latestnovel.png";
export const site = "https://earlynovel.net/";


const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}most-popular?page=${page}`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".col-truyen-main > .list-truyen > .row").each(function () {
        const novelName = loadedCheerio(this)
            .find("h3.truyen-title > a")
            .attr("title");
        const novelCover =
            loadedCheerio(this).find(".lazyimg").attr("data-desk-image") ||
            loadedCheerio(this).find("img.cover").attr("src");
        const novelUrl =
            baseUrl +
            loadedCheerio(this)
                .find("h3.truyen-title > a")
                .attr("href")
                ?.slice(1);

        if (!novelUrl || !novelName) return;

        const novel = {
            name: novelName,
            cover: novelCover || defaultCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        showToast("Early Novel may take 20-30 seconds");
        const url = novelUrl;

        const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const name = loadedCheerio(".book > img").attr("alt");
        const cover = loadedCheerio(".book > img").attr("src") || defaultCover;
        const summary = loadedCheerio(".desc-text").text().trim();
        const novel: Novel.instance = {
            url,
            chapters: [],
            name,
            summary,
            cover,
        };

        loadedCheerio(".info > div > h3").each(function () {
            let detailName = loadedCheerio(this).text();
            let detail = loadedCheerio(this)
                .siblings()
                .map((i, el) => loadedCheerio(el).text())
                .toArray()
                .join(",");

            switch (detailName) {
                case "Author:":
                    novel.author = detail;
                    break;
                case "Status:":
                    novel.status = detail;
                    break;
                case "Genre:":
                    novel.genres = detail;
                    break;
            }
        });

        //! Doesn't work since there are multiple pages and can't find source API
        //# Since cannot find sourceAPI i try similar function to lightnovelpub
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

        const lastPageStr = loadedCheerio('a:contains("Last ")')
            .attr("title")
            ?.match(/(\d+)/g);
        const lastPage = Number(lastPageStr?.[1] || "0");

        async function getChapters() {
            let chapter: Chapter.Item[] = [];
            for (let i = 1; i <= lastPage; i++) {
                const chaptersUrl = `${novelUrl}?page=${i}`;

                const chaptersHtml = await fetchApi(
                    chaptersUrl,
                    {},
                    pluginId
                ).then((r) => r.text());

                loadedCheerio = parseHTML(chaptersHtml);

                loadedCheerio("ul.list-chapter > li").each(function () {
                    const chapterName = loadedCheerio(this)
                        .find(".chapter-text")
                        .text()
                        .trim();
                    const releaseDate = null;
                    const chapterHref = loadedCheerio(this)
                        .find("a")
                        .attr("href")
                        ?.slice(1);
                    if (!chapterHref) return;
                    const chapterUrl = baseUrl + chapterHref;

                    chapter.push({
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    });
                });

                await delay(1000);
            }

            return chapter;
        }

        novel.chapters = await getChapters();

        return novel;
    };
export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const body = await fetchApi(chapterUrl, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio("#chapter-c").html() || "";

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}search?keyword=${searchTerm}`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("div.col-truyen-main > div.list-truyen > .row").each(
        function () {
            const novelUrl =
                baseUrl +
                loadedCheerio(this).find("h3.truyen-title > a").attr("href");

            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover =
                baseUrl + loadedCheerio(this).find("img").attr("src");

            if (novelUrl) {
                novels.push({
                    url: novelUrl,
                    name: novelName,
                    cover: novelCover,
                });
            }
        }
    );

    return novels;
};

export const fetchImage: Plugin.fetchImage = async function fetchImage(url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};
