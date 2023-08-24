import { load as cheerioload } from "cheerio";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { fetchApi, fetchFile } from "@libs/fetch";

export const id = "ANF.com";
export const name = "AllNovelFull";
export const site = "https://allnovelfull.com";
export const version = "1.0.0";
export const icon = "src/en/allnovelfull/icon.png";

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${site}/most-popular?page=${page}`;

    const result = await fetchApi(url, {});
    if (!result.ok) {
        console.error("Cloudflare error");
        // console.error(await result.text());
        // TODO: Cloudflare protection or other error
        return [];
    }
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    const novels: Novel.Item[] = [];
    loadedCheerio(".col-truyen-main .list-truyen .row").each(function () {
        const novelName = loadedCheerio(this)
            .find("h3.truyen-title > a")
            .text();
        const novelCover =
            site + loadedCheerio(this).find("img.cover").attr("src");
        const novelUrl =
            site + loadedCheerio(this).find("h3.truyen-title > a").attr("href");

        const novel = {
            url: novelUrl,
            name: novelName,
            cover: novelCover,
        };
        novels.push(novel);
    });
    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = novelUrl;

        const result = await fetchApi(url);
        if (!result.ok) {
            console.error("Cloudflare error");
            // console.error(await result.text());
            // TODO: Cloudflare protection or other error
            return { url, chapters: [] };
        }
        const body = await result.text();

        let loadedCheerio = cheerioload(body);

        let novel: Novel.instance = {
            url: novelUrl,
        };

        novel.name = loadedCheerio("div.book > img").attr("alt");

        novel.cover = site + loadedCheerio("div.book > img").attr("src");

        novel.summary = loadedCheerio("div.desc-text").text().trim();

        novel.author = loadedCheerio("div.info > div > h3")
            .filter(function () {
                return loadedCheerio(this).text().trim() === "Author:";
            })
            .siblings()
            .text();

        novel.genres = loadedCheerio("div.info > div")
            .filter(function () {
                return (
                    loadedCheerio(this).find("h3").text().trim() === "Genre:"
                );
            })
            .text()
            .replace("Genre:", "");

        novel.status = loadedCheerio("div.info > div > h3")
            .filter(function () {
                return loadedCheerio(this).text().trim() === "Status:";
            })
            .next()
            .text();

        const novelId = loadedCheerio("#rating").attr("data-novel-id");

        async function getChapters(id: string) {
            const chapterListUrl = site + "/ajax/chapter-option?novelId=" + id;

            const data = await fetchApi(chapterListUrl);
            if (!data.ok) {
                console.error("Cloudflare error");
                // console.error(await result.text());
                // TODO: Cloudflare protection or other error
                return [];
            }
            const chapters = await data.text();

            loadedCheerio = cheerioload(chapters);

            const novelChapters: Chapter.Item[] = [];

            loadedCheerio("select > option").each(function () {
                let chapterName = loadedCheerio(this).text();
                let releaseDate = null;
                let chapterUrl = loadedCheerio(this)
                    .attr("value")
                    ?.replace(`/${novelUrl}`, "");

                if (chapterUrl) {
                    novelChapters.push({
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    });
                }
            });

            return novelChapters;
        }

        if (novelId) {
            novel.chapters = await getChapters(novelId);
        }

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = site + chapterUrl;

    const result = await fetchApi(url);
    if (!result.ok) {
        console.error("Cloudflare error");
        // console.error(await result.text());
        // TODO: Cloudflare protection or other error
        return "Cloudflare protected site!";
    }
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    const chapterText = loadedCheerio("#chapter-content").html() || "";

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${site}/search?keyword=${searchTerm}`;

    const result = await fetchApi(url);
    if (!result.ok) {
        console.error(await result.text());
        // TODO: Cloudflare protection or other error
        return [];
    }
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("div.col-truyen-main > div.list-truyen > .row").each(
        function () {
            const novelUrl =
                site +
                loadedCheerio(this).find("h3.truyen-title > a").attr("href");

            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover =
                site + loadedCheerio(this).find("img").attr("src");

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

export const fetchImage: Plugin.fetchImage = async function (url, init) {
    return await fetchFile(url, init);
};


