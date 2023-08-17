import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterInputs } from "@libs/filterInputs";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "PandaMTL";
export const name = "PandaMTL";
export const version = "1.0.0";
export const icon = "src/en/wordpress/icon.png";
export const site = "https://www.pandamtl.com/";
exports.protected = false;

const pluginId = id;
const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (
    page,
    { filters }
) {
    let link = `${baseUrl}series/?page=${page}`;

    if (filters) {
        if (Array.isArray(filters.genres) && filters.genres.length) {
            link += filters.genres.map((i) => `&genre[]=${i}`).join("");
        }

        if (Array.isArray(filters.type) && filters.type.length) {
            link += filters.type.map((i) => `&lang[]=${i}`).join("");
        }
    }

    link += "&status=" + (filters?.status ? filters?.status : "");

    link += "&order=" + (filters?.order ? filters?.order : "popular");

    const body = await fetchApi(link, {}, pluginId).then((result) =>
        result.text()
    );

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio("article.maindet").each(function () {
        const novelName = loadedCheerio(this).find("h2").text();
        let image = loadedCheerio(this).find("img");
        const novelCover = image.attr("data-src") || image.attr("src");
        const novelUrl = loadedCheerio(this).find("h2 a").attr("href");

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

        novel.name = loadedCheerio("h1.entry-title").text();

        novel.cover =
            loadedCheerio("img.wp-post-image").attr("data-src") ||
            loadedCheerio("img.wp-post-image").attr("src");

        loadedCheerio("div.serl:nth-child(3) > span").each(function () {
            const detailName = loadedCheerio(this).text().trim();
            const detail = loadedCheerio(this).next().text().trim();

            switch (detailName) {
                case "الكاتب":
                case "Author":
                    novel.author = detail;
                    break;
            }
        });

        novel.status = loadedCheerio("div.sertostat > span").attr("class");

        novel.genres = loadedCheerio(".sertogenre")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        novel.summary = loadedCheerio(".sersys")
            .find("br")
            .replaceWith("\n")
            .end()
            .text();

        let chapter: Chapter.Item[] = [];

        loadedCheerio(".eplister")
            .find("li")
            .each(function () {
                const chapterName =
                    loadedCheerio(this).find(".epl-num").text() +
                    " - " +
                    loadedCheerio(this).find(".epl-title").text();

                const releaseDate = loadedCheerio(this)
                    .find(".epl-date")
                    .text()
                    .trim();

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

    let chapterText = loadedCheerio(".epcontent").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}`;

    const result = await fetchApi(url, {}, pluginId);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio("article.maindet").each(function () {
        const novelName = loadedCheerio(this).find("h2").text();
        let image = loadedCheerio(this).find("img");
        const novelCover = image.attr("data-src") || image.attr("src");
        const novelUrl = loadedCheerio(this).find("h2 a").attr("href");

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

export const filters = [
    {
        key: "order",
        label: "Sort By",
        values: [
            { label: "Default", value: "" },

            { label: "A-Z", value: "title" },

            { label: "Z-A", value: "titlereverse" },

            { label: "Latest Update", value: "update" },

            { label: "Latest Added", value: "latest" },

            { label: "Popular", value: "popular" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "status",
        label: "Status",
        values: [
            { label: "All", value: "" },

            { label: "Ongoing", value: "ongoing" },

            { label: "Hiatus", value: "hiatus" },

            { label: "Completed", value: "completed" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "type",
        label: "Type",
        values: [
            { label: "Light Novel (KR)", value: "light-novel-kr" },

            { label: "Web Novel", value: "web-novel" },
        ],
        inputType: FilterInputs.Checkbox,
    },
    {
        key: "genres",
        label: "Genres",
        values: [
            { label: "Action", value: "action" },

            { label: "Adult", value: "adult" },

            { label: "Adventure", value: "adventure" },

            { label: "Comedy", value: "comedy" },

            { label: "Ecchi", value: "ecchi" },

            { label: "Fantasy", value: "fantasy" },

            { label: "Harem", value: "harem" },

            { label: "Josei", value: "josei" },

            { label: "Martial Arts", value: "martial-arts" },

            { label: "Mature", value: "mature" },

            { label: "Romance", value: "romance" },

            { label: "School Life", value: "school-life" },

            { label: "Sci-fi", value: "sci-fi" },

            { label: "Seinen", value: "seinen" },

            { label: "Slice of Life", value: "slice-of-life" },

            { label: "Smut", value: "smut" },

            { label: "Sports", value: "sports" },

            { label: "Supernatural", value: "supernatural" },

            { label: "Tragedy", value: "tragedy" },
        ],
        inputType: FilterInputs.Checkbox,
    },
];
