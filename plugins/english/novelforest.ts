import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { load as parseHTML } from "cheerio";

export const id = "novelforest";
export const name = "Novel Forest (Broken)";
export const version = "1.0.0";
export const icon = "src/en/novelforest/icon.png";
export const site = "https://novelforest.com/";


const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}popular?page=${page}`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".book-item").each(function () {
        const novelName = loadedCheerio(this).find(".title").text();
        const novelCover =
            "https:" + loadedCheerio(this).find("img").attr("data-src");
        const novelUrl =
            baseUrl +
            loadedCheerio(this).find(".title a").attr("href")?.substring(1);

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters = async (
    novelUrl
) => {
    const url = novelUrl;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    const novel: Novel.instance = {
        url,
        chapters: [],
    };

    novel.name = loadedCheerio(".name h1").text().trim();

    novel.cover = "https:" + loadedCheerio(".img-cover img").attr("data-src");

    novel.summary = loadedCheerio(
        "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.mt-1 > div.section.box.mt-1.summary > div.section-body > p.content"
    )
        .text()
        .trim();

    novel.author = loadedCheerio(
        "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(1) > a > span"
    )
        .text()
        ?.trim();

    novel.status = loadedCheerio(
        "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(2) > a > span"
    )
        .text()
        ?.trim();

    novel.genres = loadedCheerio(
        "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(3)"
    )
        .text()
        ?.replace("Genres :", "")
        .replace(/[\s\n]+/g, " ")
        .trim();

    let chapter: Chapter.Item[] = [];

    const chaptersUrl =
        novelUrl.replace(baseUrl, "https://novelforest.com/api/novels/") +
        "/chapters?source=detail";

    const chaptersRequest = await fetch(chaptersUrl);
    const chaptersHtml = await chaptersRequest.text();

    loadedCheerio = parseHTML(chaptersHtml);

    loadedCheerio("li").each(function () {
        const chapterName = loadedCheerio(this)
            .find(".chapter-title")
            .text()
            .trim();

        const releaseDate = loadedCheerio(this)
            .find(".chapter-update")
            .text()
            .trim();

        const chapterUrl =
            baseUrl + loadedCheerio(this).find("a").attr("href")?.substring(1);

        chapter.push({
            name: chapterName,
            releaseTime: releaseDate,
            url: chapterUrl,
        });
    });

    novel.chapters = chapter;

    return novel;
};

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const body = await fetchApi(chapterUrl, {}, pluginId).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    loadedCheerio("#listen-chapter").remove();
    loadedCheerio("#google_translate_element").remove();

    const chapterText = loadedCheerio(".chapter__content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}search?q=${searchTerm}`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".book-item").each(function () {
        const novelName = loadedCheerio(this).find(".title").text();
        const novelCover =
            "https:" + loadedCheerio(this).find("img").attr("data-src");
        const novelUrl =
            baseUrl +
            loadedCheerio(this).find(".title a").attr("href")?.substring(1);

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
