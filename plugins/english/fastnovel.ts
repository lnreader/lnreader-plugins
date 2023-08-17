import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "fastnovel";
export const name = "Fast Novel";
export const version = "1.0.0";
export const icon = "src/en/fastnovel/icon.png";
export const site = "https://fastnovel.org/";
exports.protected = false;

const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = `${baseUrl}sort/p/?page=${page}`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".col-novel-main .list-novel .row").each(function () {
        const novelName = loadedCheerio(this).find("h3.novel-title > a").text();
        const novelCover = loadedCheerio(this).find("img.cover").attr("src");
        const novelUrl = loadedCheerio(this)
            .find("h3.novel-title > a")
            .attr("href");

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
        const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("div.book > img").attr("alt");

        novel.cover = loadedCheerio("div.book > img").attr("src");

        novel.summary = loadedCheerio("div.desc-text").text().trim();

        loadedCheerio("ul.info > li > h3").each(function () {
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

        const novelId = loadedCheerio("#rating").attr("data-novel-id");

        async function getChapters(id: string) {
            const chapterListUrl =
                baseUrl + "ajax/chapter-archive?novelId=" + id;

            const data = await fetchApi(chapterListUrl);
            const chapterdata = await data.text();

            loadedCheerio = parseHTML(chapterdata);

            let chapter: Chapter.Item[] = [];

            loadedCheerio("ul.list-chapter > li").each(function () {
                const chapterName = loadedCheerio(this).find("a").attr("title");
                const releaseDate = null;
                const chapterUrl = loadedCheerio(this).find("a").attr("href");

                if (!chapterName || !chapterUrl) return;

                chapter.push({
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                });
            });
            return chapter;
        }

        if (novelId) {
            novel.chapters = await getChapters(novelId);
        }

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const body = await fetchApi(chapterUrl, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    loadedCheerio('#chr-content > div,h6,p[style="display: none;"]').remove();
    let chapterText = loadedCheerio("#chr-content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}search/?keyword=${searchTerm}`;
    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio("div.col-novel-main > div.list-novel > .row").each(
        function () {
            const novelUrl = loadedCheerio(this)
                .find("h3.novel-title > a")
                .attr("href");

            const novelName = loadedCheerio(this)
                .find("h3.novel-title > a")
                .text();
            const novelCover = loadedCheerio(this).find("img").attr("src");

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

export const fetchImage: Plugin.fetchImage = async function (url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};
