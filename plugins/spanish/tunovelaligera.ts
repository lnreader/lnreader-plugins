import { fetchApi, fetchFile } from "@libs/fetch";
import { load as parseHTML } from "cheerio";
import { NovelStatus } from "@libs/novelStatus";
import { defaultCover } from "@libs/defaultCover";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "TNL.com";
export const name = "TuNovelaLigera";
export const site = "https://tunovelaligera.com/";
export const version = "1.0.0";
export const icon = "src/es/tunovelaligera/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "novelas/page/" + page + "/?m_orderby=rating";

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".page-item-detail").each(function () {
        const novelName = loadedCheerio(this).find(".h5 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");

        let novelUrl = loadedCheerio(this).find(".h5 > a").attr("href");
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

        loadedCheerio(".manga-title-badges").remove();

        novel.name = loadedCheerio(".post-title > h1").text().trim();

        let novelCover = loadedCheerio(".summary_image > a > img");

        novel.cover =
            novelCover.attr("data-src") ||
            novelCover.attr("src") ||
            defaultCover;

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();

            switch (detailName) {
                case "Generos":
                    novel.genres = detail.replace(/, /g, ",");
                    break;
                case "Autores":
                    novel.author = detail;
                    break;
                case "Estado":
                    novel.status =
                        detail.includes("OnGoing") ||
                        detail.includes("Updating")
                            ? NovelStatus.Ongoing
                            : NovelStatus.Completed;
                    break;
            }
        });

        novel.summary = loadedCheerio("div.summary__content > p").text().trim();

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio(".lcp_catlist li").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();

            const releaseDate = loadedCheerio(this).find("span").text().trim();

            let chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl) return;
            novelChapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = novelChapters.reverse();

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio("#hola_siguiente").next().text();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".c-tabs-item__content").each(function () {
        const novelName = loadedCheerio(this).find(".h4 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");

        let novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");
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
