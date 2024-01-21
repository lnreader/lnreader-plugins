import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { isUrlAbsolute } from "@libs/isAbsoluteUrl";
import { Novel, Plugin } from "@typings/plugin";

export const id = "freenovelupdates";
export const name = "Free Novel Updates (Broken)";
export const version = "1.0.0";
export const icon = "src/en/freenovelupdates/icon.png";
export const site = "https://www.freenovelupdates.com";


const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}genres/light-novel-1002`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".books-item").each(function () {
        let novelUrl = loadedCheerio(this).find("a").attr("href");

        if (novelUrl && !isUrlAbsolute(novelUrl)) {
            novelUrl = baseUrl + novelUrl;
        }

        if (novelUrl) {
            const novelName = loadedCheerio(this).find(".title").text().trim();
            let novelCover = loadedCheerio(this).find("img").attr("src");

            if (novelCover && !isUrlAbsolute(novelCover)) {
                novelCover = baseUrl + novelCover;
            }

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        }
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = novelUrl;

        const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("h1").text();

        let novelCover = loadedCheerio(".img > img").attr("src");

        novel.cover = novelCover
            ? isUrlAbsolute(novelCover)
                ? novelCover
                : baseUrl + novelCover
            : undefined;

        novel.summary = loadedCheerio(".description-content").text().trim();

        novel.author = loadedCheerio(".author").text().trim();

        novel.genres = loadedCheerio(".category").text().trim();

        novel.status = loadedCheerio(".status").text().trim();

        loadedCheerio(".chapter").each(function () {
            let chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (chapterUrl && !isUrlAbsolute(chapterUrl)) {
                chapterUrl = baseUrl + chapterUrl;
            }

            if (chapterUrl) {
                const chapterName = loadedCheerio(this).find("a").text().trim();
                const releaseDate = null;

                const chapter = {
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
    const body = await fetchApi(chapterUrl, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio(".content").html() || "";

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    return [];
};

export const fetchImage: Plugin.fetchImage = async function (url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};
