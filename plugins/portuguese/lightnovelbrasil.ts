import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterInputs } from "@libs/filterInputs";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "lightnovelbrasil";
export const name = "Light Novel Brasil";
export const version = "1.0.0";
export const icon = "multisrc/wpmangastream/icons/lightnovelbrasil.png";
export const site = "https://lightnovelbrasil.com/";
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

    loadedCheerio("article.bs").each(function () {
        const novelName = loadedCheerio(this).find(".ntitle").text().trim();
        let image = loadedCheerio(this).find("img");
        const novelCover = image.attr("data-src") || image.attr("src");

        const novelUrl = loadedCheerio(this).find("a").attr("href");

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

        novel.name = loadedCheerio(".entry-title").text();

        novel.cover =
            loadedCheerio("img.wp-post-image").attr("data-src") ||
            loadedCheerio("img.wp-post-image").attr("src");

        loadedCheerio("div.spe > span").each(function () {
            const detailName = loadedCheerio(this).find("b").text().trim();
            const detail = loadedCheerio(this)
                .find("b")
                .remove()
                .end()
                .text()
                .trim();

            switch (detailName) {
                case "المؤلف:":
                case "Yazar:":
                case "Autor:":
                case "Author:":
                    novel.author = detail;
                    break;
                case "Status:":
                case "Seviye:":
                    novel.status = detail;
                    break;
            }
        });

        novel.genres = loadedCheerio(".genxed")
            .text()
            .trim()
            .replace(/\s/g, ",");

        loadedCheerio('div[itemprop="description"]  h3,p.a,strong').remove();
        novel.summary = loadedCheerio('div[itemprop="description"]')
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

    let chapterText = loadedCheerio("div.epcontent").html();

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}?s=${searchTerm}`;

    const result = await fetchApi(url, {}, pluginId);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Novel.Item[] = [];

    loadedCheerio("article.bs").each(function () {
        const novelName = loadedCheerio(this).find(".ntitle").text().trim();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find("a").attr("href");

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
            { label: "Chinese novel", value: "chinese-novel" },

            { label: "habyeol", value: "habyeol" },

            { label: "korean novel", value: "korean-novel" },

            { label: "Web Novel", value: "web-novel" },

            { label: "삼심", value: "%ec%82%bc%ec%8b%ac" },

            { label: "호곡", value: "%ed%98%b8%ea%b3%a1" },
        ],
        inputType: FilterInputs.Checkbox,
    },
    {
        key: "genres",
        label: "Genres",
        values: [
            { label: "A.I", value: "a.i" },

            { label: "Academy", value: "academy" },

            { label: "Action", value: "action" },

            { label: "Adult", value: "adult" },

            { label: "Adventure", value: "adventure" },

            { label: "Alternative History", value: "alternative-history" },

            { label: "Another World", value: "another-world" },

            { label: "Apocalypse", value: "apocalypse" },

            { label: "Bromance", value: "bromance" },

            { label: "Comedy", value: "comedy" },

            { label: "Dark fantasy", value: "dark-fantasy" },

            { label: "Demons", value: "demons" },

            { label: "Drama", value: "drama" },

            { label: "Dystopia", value: "dystopia" },

            { label: "Ecchi", value: "ecchi" },

            { label: "Entertainment", value: "entertainment" },

            { label: "Exhaustion", value: "exhaustion" },

            { label: "Fanfiction", value: "fanfiction" },

            { label: "fantasy", value: "fantasy" },

            { label: "finance", value: "finance" },

            { label: "Full color", value: "full-color" },

            { label: "Game", value: "game" },

            { label: "Gender Bender", value: "gender-bender" },

            { label: "Genius", value: "genius" },

            { label: "Harem", value: "harem" },

            { label: "Hero", value: "hero" },

            { label: "Historical", value: "historical" },

            { label: "Hunter", value: "hunter" },

            { label: "korean novel", value: "korean-novel" },

            { label: "Light Novel", value: "light-novel" },

            {
                label: "List Adventure Manga Genres",
                value: "list-adventure-manga-genres",
            },

            { label: "Long Strip", value: "long-strip" },

            { label: "Love comedy", value: "love-comedy" },

            { label: "magic", value: "magic" },

            { label: "Manhua", value: "manhua" },

            { label: "Martial Arts", value: "martial-arts" },

            { label: "Mature", value: "mature" },

            { label: "Medieval", value: "medieval" },

            { label: "Misunderstanding", value: "misunderstanding" },

            { label: "Modern", value: "modern" },

            { label: "modern fantasy", value: "modern-fantasy" },

            { label: "music", value: "music" },

            { label: "Mystery", value: "mystery" },

            { label: "Necromancy", value: "necromancy" },

            { label: "No Romance", value: "no-romance" },

            { label: "NTL", value: "ntl" },

            { label: "o", value: "o" },

            { label: "Obsession", value: "obsession" },

            { label: "Politics", value: "politics" },

            { label: "Possession", value: "possession" },

            { label: "Programming", value: "programming" },

            { label: "Psychological", value: "psychological" },

            { label: "Pure Love", value: "pure-love" },

            { label: "Redemption", value: "redemption" },

            { label: "Regression", value: "regression" },

            { label: "Regret", value: "regret" },

            { label: "Reincarnation", value: "reincarnation" },

            { label: "Revenge", value: "revenge" },

            { label: "Romance", value: "romance" },

            { label: "Romance Fanrasy", value: "romance-fanrasy" },

            { label: "Salvation", value: "salvation" },

            { label: "School Life", value: "school-life" },

            { label: "Sci-fi", value: "sci-fi" },

            { label: "Science fiction", value: "science-fiction" },

            { label: "Seinen", value: "seinen" },

            { label: "Shounen", value: "shounen" },

            { label: "Slice of Life", value: "slice-of-life" },

            { label: "Soft yandere", value: "soft-yandere" },

            { label: "Sports", value: "sports" },

            { label: "Supernatural", value: "supernatural" },

            { label: "Survival", value: "survival" },

            { label: "system", value: "system" },

            { label: "Time limit", value: "time-limit" },

            { label: "Tragedy", value: "tragedy" },

            { label: "Transmigration", value: "transmigration" },

            { label: "TS", value: "ts" },

            { label: "Tsundere", value: "tsundere" },

            { label: "Unique", value: "unique" },

            { label: "Wholesome", value: "wholesome" },

            { label: "Wuxia", value: "wuxia" },

            { label: "Xuanhuan", value: "xuanhuan" },

            { label: "Yandere", value: "yandere" },

            { label: "Yuri", value: "yuri" },
        ],
        inputType: FilterInputs.Checkbox,
    },
];
