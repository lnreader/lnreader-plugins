import { load as parseHTML } from "cheerio";
import { isUrlAbsolute } from "@libs/isAbsoluteUrl";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "LNR.org";
export const name = "LightNovelReader";
export const icon = "src/en/lightnovelreader/icon.png";
export const version = "1.0.0";
export const site = "https://lightnovelreader.org";
exports.protected = false;

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = baseUrl + "/ranking/top-rated/" + page;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio(".category-items.ranking-category.cm-list > ul > li").each(
        function () {
            let novelUrl = loadedCheerio(this).find("a").attr("href");

            if (novelUrl && !isUrlAbsolute(novelUrl)) {
                novelUrl = baseUrl + novelUrl;
            }

            if (novelUrl) {
                const novelName = loadedCheerio(this)
                    .find(".category-name a")
                    .text()
                    .trim();
                let novelCover = loadedCheerio(this)
                    .find(".category-img img")
                    .attr("src");

                if (novelCover && !isUrlAbsolute(novelCover)) {
                    novelCover = baseUrl + novelCover;
                }

                const novel = {
                    url: novelUrl,
                    name: novelName,
                    cover: novelCover,
                };

                novels.push(novel);
            }
        }
    );

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = novelUrl;
        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url: novelUrl,
            chapters: [],
        };

        novel.name = loadedCheerio(".section-header-title > h2").text();

        let novelCover = loadedCheerio(".novels-detail img").attr("src");

        novel.cover = novelCover
            ? isUrlAbsolute(novelCover)
                ? novelCover
                : baseUrl + novelCover
            : undefined;

        novel.summary = loadedCheerio(
            "div.container > div > div.col-12.col-xl-9 > div > div:nth-child(5) > div"
        )
            .text()
            .trim();

        novel.author = loadedCheerio(
            "div.novels-detail-right > ul > li:nth-child(6) > .novels-detail-right-in-right > a"
        )
            .text()
            .trim();

        novel.genres = loadedCheerio(
            "body > section:nth-child(4) > div > div > div.col-12.col-xl-9 > div > div:nth-child(2) > div > div.novels-detail-right > ul > li:nth-child(3) > div.novels-detail-right-in-right"
        )
            .text()
            .trim();

        novel.status = loadedCheerio(
            "div.novels-detail-right > ul > li:nth-child(2) > .novels-detail-right-in-right"
        )
            .text()
            .trim();

        loadedCheerio(".cm-tabs-content > ul > li").each(function () {
            let chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (chapterUrl && !isUrlAbsolute(chapterUrl)) {
                chapterUrl = baseUrl + chapterUrl;
            }

            if (chapterUrl) {
                const chapterName = loadedCheerio(this).find("a").text().trim();
                const releaseDate = null;

                const chapter: Chapter.Item = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };

                novel.chapters?.push(chapter);
            }
        });

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio("#chapterText").html() || "";

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url =
        baseUrl + `/search/autocomplete?dataType=json&query=${searchTerm}`;
    const result = await fetchApi(url);
    const body = await result.json();
    const data = body?.results || [];

    const novels: Novel.Item[] = [];

    data.forEach((item) => {
        let novelUrl = item.link;
        let novelName = item.original_title;
        let novelCover = item.image;

        novels.push({
            url: novelUrl,
            name: novelName,
            cover: novelCover,
        });
    });

    return novels;
};

export const fetchImage: Plugin.fetchImage = async function (url) {
    return await fetchFile(url, {});
};
