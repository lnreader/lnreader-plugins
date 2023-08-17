import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "sakura.id";
export const name = "SakuraNovel";
export const site = "https://sakuranovel.id/";
export const icon = "src/id/sakuranovel/icon.png";
export const version = "1.0.0";

const pluginId = id;
const sourceName = name;

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}advanced-search/page/${page}/?title&author&yearx&status&type&order=rating&country%5B0%5D=china&country%5B1%5D=jepang&country%5B2%5D=unknown`;

    const result = await fetchApi(url, {}, pluginId);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".flexbox2-item").each(function () {
        const novelName = loadedCheerio(this)
            .find(".flexbox2-title span")
            .first()
            .text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this)
            .find(".flexbox2-content > a")
            .attr("href");

        if (!novelUrl) return;

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

        novels.push(novel);
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const result = await fetchApi(novelUrl, {}, pluginId);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = {
            name: sourceName,
            url: novelUrl,
        };

        novel.name = loadedCheerio(".series-title h2").text().trim();

        novel.cover = loadedCheerio(".series-thumb img").attr("src");

        loadedCheerio(".series-infolist > li").each(function () {
            const detailName = loadedCheerio(this).find("b").text().trim();
            const detail = loadedCheerio(this).find("b").next().text().trim();

            switch (detailName) {
                case "Author":
                    novel.author = detail;
                    break;
            }
        });

        novel.status = loadedCheerio(".status").text().trim();

        novel.genres = loadedCheerio(".series-genres")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        loadedCheerio(".series-synops div").remove();
        novel.summary = loadedCheerio(".series-synops").text().trim();

        let chapters: Chapter.Item[] = [];

        loadedCheerio(".series-chapterlist li").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a span")
                .first()
                .text()
                .replace(/.*?(Chapter.|[0-9])/g, "$1")
                .replace(/Bahasa Indonesia/g, "")
                .replace(/\s+/g, " ")
                .trim();

            const releaseDate = loadedCheerio(this)
                .find("a span")
                .first()
                .next()
                .text();
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
    const result = await fetchApi(chapterUrl, {}, pluginId);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio(".readers").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}`;
    const result = await fetchApi(url, {}, pluginId);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".flexbox2-item").each(function () {
        const novelName = loadedCheerio(this)
            .find(".flexbox2-title span")
            .first()
            .text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this)
            .find(".flexbox2-content > a")
            .attr("href");

        if (!novelUrl) return;

        const novel = { name: novelName, cover: novelCover, url: novelUrl };

        novels.push(novel);
    });

    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
