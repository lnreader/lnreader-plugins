import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "LightNovelUpdates";
export const name = "Light Novel Updates";
export const version = "1.0.0";
export const icon = "src/en/lightnovelupdates/icon.png";
export const site = "https://www.lightnovelupdates.com/";


const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = `${baseUrl}novel/page/${page}/?m_orderby=rating`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".page-item-detail").each(function () {
        const novelName = loadedCheerio(this).find(".h5 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
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

        const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".post-title > h1").text().trim();
        novel.cover =
            loadedCheerio(".summary_image > a > img").attr("src") || undefined;

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();

            switch (detailName) {
                case "Genre(s)":
                    novel.genres = detail.trim().replace(/[\t\n]/g, ",");
                    break;
                case "Author(s)":
                    novel.author = detail.trim();
                    break;
                case "Status":
                    novel.status = detail.replace(/G/g, "g");
                    break;
            }
        });

        novel.summary = loadedCheerio("div.summary__content").text();

        const chapter: Chapter.Item[] = [];

        const novelId = loadedCheerio(".rating-post-id").attr("value")!;

        let formData = new FormData();
        formData.append("action", "manga_get_chapters");
        formData.append("manga", novelId);

        const data = await fetchApi(
            "https://www.lightnovelupdates.com/wp-admin/admin-ajax.php",
            {
                method: "POST",
                body: formData,
            },
            pluginId
        );
        const text = await data.text();

        loadedCheerio = parseHTML(text);

        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
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
    const chapterText = (await NovelUpdatesScraper.parseChapter(chapterUrl))
        .chapterText;

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga&m_orderby=rating`;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".c-tabs-item__content").each(function () {
        const novelName = loadedCheerio(this).find(".h4 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");

        if (!novelUrl) return;

        novels.push({
            url: novelUrl,
            name: novelName,
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
