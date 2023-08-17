import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";
// import dayjs from "dayjs";
// import { FilterInputs } from "@libs/filterInputs";
// import { NovelStatus } from "@libs/novelStatus";
import { isUrlAbsolute } from "@libs/isAbsoluteUrl";
// import { parseMadaraDate } from "@libs/parseMadaraDate";

const pluginId = "ln.hako";
const baseUrl = "https://ln.hako.vn";

export const id = pluginId; // string and must be unique
export const name = "Hako";
export const icon = "src/vi/hakolightnovel/icon.png"; // The relative path to the icon without @icons . For example: 'src/vi/hakolightnovel/icon.png'
export const version = "1.0.0"; // xx.xx.xx
export const site = baseUrl; // the link to the site
exports["protected"] = true;

export const popularNovels: Plugin.popularNovels = async (pageNo) => {
    const novels: Novel.Item[] = [];
    const link =
        baseUrl + "/danh-sach?truyendich=1&sapxep=topthang&page=" + pageNo;
    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio("main.row > .thumb-item-flow").each(function () {
        let url = loadedCheerio(this)
            .find("div.thumb_attr.series-title > a")
            .attr("href");

        if (url && !isUrlAbsolute(url)) {
            url = baseUrl + url;
        }

        if (url) {
            const name = loadedCheerio(this)
                .find(".series-title")
                .text()
                .trim();
            let cover = loadedCheerio(this)
                .find(".img-in-ratio")
                .attr("data-bg");

            if (cover && !isUrlAbsolute(cover)) {
                cover = baseUrl + cover;
            }

            const novel = {
                name,
                url,
                cover,
            };

            novels.push(novel);
        }
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters = async (
    novelUrl
) => {
    const novel: Novel.instance = {
        url: novelUrl,
    };
    const result = await fetchApi(novelUrl);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    novel.name = loadedCheerio(".series-name").text();

    const background =
        loadedCheerio(".series-cover > .a6-ratio > div").attr("style") || "";
    const novelCover = background.substring(
        background.indexOf("http"),
        background.length - 2
    );

    novel.cover = novelCover
        ? isUrlAbsolute(novelCover)
            ? novelCover
            : baseUrl + novelCover
        : "";

    novel.summary = loadedCheerio(".summary-content").text().trim();

    novel.author = loadedCheerio(
        "#mainpart > div:nth-child(2) > div > div:nth-child(1) > section > main > div.top-part > div > div.col-12.col-md-9 > div.series-information > div:nth-child(2) > span.info-value > a"
    )
        .text()
        .trim();

    novel.genres = loadedCheerio(".series-gernes")
        .text()
        .trim()
        .replace(/ +/g, " ")
        .split("\n")
        .filter((e) => e.trim())
        .join(", ");

    novel.status = loadedCheerio(
        "#mainpart > div:nth-child(2) > div > div:nth-child(1) > section > main > div.top-part > div > div.col-12.col-md-9 > div.series-information > div:nth-child(4) > span.info-value > a"
    )
        .text()
        .trim();

    const chapters: Chapter.Item[] = [];
    loadedCheerio(".list-chapters li").each(function () {
        let chapterUrl = loadedCheerio(this).find("a").attr("href");

        if (chapterUrl && !isUrlAbsolute(chapterUrl)) {
            chapterUrl = baseUrl + chapterUrl;
        }

        if (chapterUrl) {
            const chapterName = loadedCheerio(this)
                .find(".chapter-name")
                .text()
                .trim();
            const releaseTime = loadedCheerio(this)
                .find(".chapter-time")
                .text();

            const chapter = {
                name: chapterName,
                releaseTime: releaseTime,
                url: chapterUrl,
            };

            chapters.push(chapter);
        }
    });
    novel.chapters = chapters;
    return novel;
};

export const parseChapter: Plugin.parseChapter = async (chapterUrl) => {
    const result = await fetchApi(chapterUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio("#chapter-content").html() || "";

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async (searchTerm) => {
    const novels: Novel.Item[] = [];

    const url = baseUrl + "/tim-kiem?keywords=" + searchTerm;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio("div.row > .thumb-item-flow").each(function () {
        let novelUrl = loadedCheerio(this)
            .find("div.thumb_attr.series-title > a")
            .attr("href");

        if (novelUrl && !isUrlAbsolute(novelUrl)) {
            novelUrl = baseUrl + novelUrl;
        }

        if (novelUrl) {
            const novelName = loadedCheerio(this).find(".series-title").text();
            let novelCover = loadedCheerio(this)
                .find(".img-in-ratio")
                .attr("data-bg");

            if (novelCover && !isUrlAbsolute(novelCover)) {
                novelCover = baseUrl + novelCover;
            }

            novels.push({
                name: novelName,
                url: novelUrl,
                cover: novelCover,
            });
        }
    });

    return novels;
};

export const fetchImage: Plugin.fetchImage = async (url) => {
    const headers = {
        Referer: "https://ln.hako.vn",
    };
    return await fetchFile(url, { headers: headers });
};
