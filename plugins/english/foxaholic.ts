import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "foxaholic";
export const name = "Foxaholic";
export const version = "1.0.0";
export const icon = "src/en/foxaholic/icon.png";
export const site = "https://www.foxaholic.com/";


const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const link = `${baseUrl}novel/page/${page}/?m_orderby=rating`;

    const result = await fetchApi(link, {}, pluginId);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio(".page-item-detail").each(function () {
        const novelName = loadedCheerio(this).find(".h5 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl = loadedCheerio(this).find(".h5 > a").attr("href");

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
        const result = await fetchApi(url, {}, pluginId);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".post-title > h1").text().trim();

        novel.cover = loadedCheerio(".summary_image > a > img").attr(
            "data-src"
        );

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this).find(".summary-content").html();

            if (!detail) return;

            switch (detailName) {
                case "Genre":
                    novel.genres = loadedCheerio(detail)
                        .children("a")
                        .map((i, el) => loadedCheerio(el).text())
                        .toArray()
                        .join(",");
                    break;
                case "Author":
                    novel.author = loadedCheerio(detail)
                        .children("a")
                        .map((i, el) => loadedCheerio(el).text())
                        .toArray()
                        .join(", ");
                    break;
                case "Novel":
                    novel.status = detail?.trim().replace(/G/g, "g");
                    break;
            }
        });

        loadedCheerio(
            ".description-summary > div.summary__content > div"
        ).remove();

        novel.summary = loadedCheerio(
            ".description-summary > div.summary__content"
        )
            .text()
            .trim();

        let chapter: Chapter.Item[] = [];
        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();
            const releaseDate = loadedCheerio(this).find("span").text().trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapter.reverse();

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const result = await fetchApi(chapterUrl, {}, pluginId);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio("img").removeAttr("srcset");
    let chapterText = loadedCheerio(".reading-content").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;
    const result = await fetchApi(url, {}, pluginId);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio(".c-tabs-item__content").each(function () {
        const novelName = loadedCheerio(this).find(".h4 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");

        if (!novelUrl) return;

        novels.push({
            name: novelName,
            url: novelUrl,
            cover: novelCover,
        });
    });

    return novels;
};

export const fetchImage: Plugin.fetchImage = async function (url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};
