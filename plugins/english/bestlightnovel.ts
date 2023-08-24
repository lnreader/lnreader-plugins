import { load as cheerioload } from "cheerio";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";

export const id = "BLN.com";
export const name = "BestLightNovel";
export const site = "https://bestlightnovel.com/";
export const version = "1.0.0";
export const icon = "src/en/bestlightnovel/icon.png";

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url =
        site + "novel_list?type=topview&category=all&state=all&page=1" + page;

    const result = await fetchApi(url);
    if (!result.ok) {
        console.error(await result.text());
        // TODO: Cloudflare protection or other error
        return [];
    }
    const body = await result.text();

    const loadedCheerio = cheerioload(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".update_item.list_category").each(function () {
        const novelName = loadedCheerio(this).find("h3 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

        if (!novelUrl) {
            // TODO: Handle error
            console.error("No novel url!");
            return;
        }

        const novel = {
            name: novelName,
            url: novelUrl,
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
            console.error(await result.text());
            // TODO: Cloudflare protection
            return { url, chapters: [] };
        }
        const body = await result.text();

        let loadedCheerio = cheerioload(body);

        let novel: Novel.instance = {
            url,
            name: "",
            cover: "",
            author: "",
            status: NovelStatus.Unknown,
            genres: "",
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".truyen_info_right  h1").text().trim();
        novel.cover =
            loadedCheerio(".info_image img").attr("src") || defaultCover;
        novel.summary = loadedCheerio("#noidungm").text()?.trim();
        novel.author = loadedCheerio(
            "#main_body > div.cotgiua > div.truyen_info_wrapper > div.truyen_info > div.entry-header > div.truyen_if_wrap > ul > li:nth-child(2) > a"
        )
            .text()
            ?.trim();

        let status = loadedCheerio(
            "#main_body > div.cotgiua > div.truyen_info_wrapper > div.truyen_info > div.entry-header > div.truyen_if_wrap > ul > li:nth-child(4) > a"
        )
            .text()
            ?.trim();

        novel.status =
            status === "ONGOING"
                ? NovelStatus.Ongoing
                : status === "COMPLETED"
                ? NovelStatus.Completed
                : NovelStatus.Unknown;

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio(".chapter-list div.row").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = loadedCheerio(this)
                .find("span:nth-child(2)")
                .text()
                .trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) {
                // TODO: Handle error
                console.error("No chapter url!");
                return;
            }

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

    let loadedCheerio = cheerioload(body);

    const chapterText = loadedCheerio("#vung_doc").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${site}search_novels/${searchTerm}`;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = cheerioload(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".update_item.list_category").each(function () {
        const novelName = loadedCheerio(this).find("h3 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

        if (!novelUrl) {
            // TODO: Handle error
            console.error("No novel url!");
            return;
        }

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

        novels.push(novel);
    });

    return novels;
};

export const fetchImage: Plugin.fetchImage = (...args) => fetchFile(...args);


