import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "nitroscans";
export const name = "Nitroscans";
export const version = "1.0.0";
export const icon = "src/en/nitroscans/icon.png";
export const site = "https://nitroscans.com/";


const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = baseUrl + "wp-admin/admin-ajax.php";

    let formData = new FormData();
    formData.append("action", "madara_load_more");
    formData.append("page", `${Number(page - 1)}`);
    formData.append("template", "madara-core/content/content-archive");
    formData.append("vars[orderby]", "meta_value_num");
    formData.append("vars[post_type]", "wp-manga");
    formData.append("vars[meta_key]", "_wp_manga_views");
    formData.append("vars[wp-manga-genre]", "novels");

    const body = await fetchApi(url, {
        method: "POST",
        body: formData,
    }).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".page-item-detail").each(function () {
        const novelName = loadedCheerio(this).find("h3 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

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

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        loadedCheerio(".manga-title-badges.custom.novel").remove();

        novel.name = loadedCheerio(".post-title > h1").text().trim();
        novel.cover = loadedCheerio(".summary_image")
            .find("img")
            .attr("data-src");

        novel.summary = loadedCheerio(".summary__content").text()?.trim();

        novel.genres = loadedCheerio(".genres-content")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();
            switch (detailName) {
                case "Author(s)":
                    novel.author = detail;
                    break;
                case "Status":
                    novel.status = detail.replace(/G/g, "g");
                    break;
            }
        });
        let chapter: Chapter.Item[] = [];

        let chapterlisturl = novelUrl + "ajax/chapters/";

        const data = await fetchApi(chapterlisturl, { method: "POST" });
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
    const body = await fetchApi(chapterUrl).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio(".text-left").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = baseUrl + "wp-admin/admin-ajax.php";

    let formData = new FormData();
    formData.append("action", "madara_load_more");
    formData.append("page", `${Number(1 - 1)}`);
    formData.append("template", "madara-core/content/content-search");
    formData.append("vars[s]", searchTerm);
    formData.append("vars[post_type]", "wp-manga");
    formData.append("vars[wp-manga-genre]", "novels");

    const body = await fetchApi(url, {
        method: "POST",
        body: formData,
    }).then((r) => r.text());

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".c-tabs-item__content").each(function () {
        const novelName = loadedCheerio(this).find("h3 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("data-src");
        const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

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

export const fetchImage: Plugin.fetchImage = async function (url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};
