import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "NF.me";
export const name = "NovelFull.me";
export const site = "https://novelfull.me/";
export const version = "1.0.0";
export const icon = "src/en/novelfullme/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}popular?page=${page}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".book-item").each(function () {
        const novelName = loadedCheerio(this).find(".title").text();
        const novelCover =
            "https:" + loadedCheerio(this).find("img").attr("data-src");
        const novelUrl =
            baseUrl +
            loadedCheerio(this).find(".title a").attr("href")?.substring(1);

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

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
            name: "",
            cover: "",
            author: "",
            status: "",
            genres: "",
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".name h1").text().trim();

        novel.cover =
            "https:" + loadedCheerio(".img-cover img").attr("data-src");

        novel.summary = loadedCheerio(
            "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.mt-1 > div.section.box.mt-1.summary > div.section-body > p.content"
        )
            .text()
            .trim();

        novel.author = "Unknown";

        novel.status = loadedCheerio(
            "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(1) > a > span"
        )
            .text()
            ?.trim();

        novel.genres = loadedCheerio(
            "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(2)"
        )
            .text()
            ?.replace("Genres :", "")
            .replace(/[\s\n]+/g, " ")
            .trim();

        let chapters: Chapter.Item[] = [];

        const chaptersUrl =
            novelUrl.replace(baseUrl, "https://novelfull.me/api/novels/") +
            "/chapters?source=detail";

        const chaptersRequest = await fetchApi(chaptersUrl);
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

            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapters.reverse();

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    loadedCheerio("#listen-chapter").remove();
    loadedCheerio("#google_translate_element").remove();

    const chapterText = loadedCheerio(".chapter__content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}search?status=all&sort=views&q=${searchTerm}`;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".book-item").each(function () {
        const novelName = loadedCheerio(this).find(".title").text();
        const novelCover =
            "https:" + loadedCheerio(this).find("img").attr("data-src");
        const novelUrl =
            baseUrl +
            loadedCheerio(this).find(".title a").attr("href")?.substring(1);

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

        novels.push(novel);
    });

    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
