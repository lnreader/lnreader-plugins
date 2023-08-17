"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filters = exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.icon = exports.version = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const filterInputs_1 = require("@libs/filterInputs");
exports.id = "lightnovelbrasil";
exports.name = "Light Novel Brasil";
exports.version = "1.0.0";
exports.icon = "multisrc/wpmangastream/icons/lightnovelbrasil.png";
exports.site = "https://lightnovelbrasil.com/";
exports.protected = false;
const pluginId = exports.id;
const baseUrl = exports.site;
const popularNovels = function (page, { filters }) {
    return __awaiter(this, void 0, void 0, function* () {
        let link = `${baseUrl}series/?page=${page}`;
        if (filters) {
            if (Array.isArray(filters.genres) && filters.genres.length) {
                link += filters.genres.map((i) => `&genre[]=${i}`).join("");
            }
            if (Array.isArray(filters.type) && filters.type.length) {
                link += filters.type.map((i) => `&lang[]=${i}`).join("");
            }
        }
        link += "&status=" + ((filters === null || filters === void 0 ? void 0 : filters.status) ? filters === null || filters === void 0 ? void 0 : filters.status : "");
        link += "&order=" + ((filters === null || filters === void 0 ? void 0 : filters.order) ? filters === null || filters === void 0 ? void 0 : filters.order : "popular");
        const body = yield (0, fetch_1.fetchApi)(link, {}, pluginId).then((result) => result.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio("article.bs").each(function () {
            const novelName = loadedCheerio(this).find(".ntitle").text().trim();
            let image = loadedCheerio(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl)
                return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const result = yield (0, fetch_1.fetchApi)(url, {}, pluginId);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
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
        let chapter = [];
        loadedCheerio(".eplister")
            .find("li")
            .each(function () {
            const chapterName = loadedCheerio(this).find(".epl-num").text() +
                " - " +
                loadedCheerio(this).find(".epl-title").text();
            const releaseDate = loadedCheerio(this)
                .find(".epl-date")
                .text()
                .trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });
        novel.chapters = chapter.reverse();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let chapterText = loadedCheerio("div.epcontent").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}?s=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url, {}, pluginId);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio("article.bs").each(function () {
            const novelName = loadedCheerio(this).find(".ntitle").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl)
                return;
            novels.push({
                name: novelName,
                url: novelUrl,
                cover: novelCover,
            });
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
exports.filters = [
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
        inputType: filterInputs_1.FilterInputs.Picker,
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
        inputType: filterInputs_1.FilterInputs.Picker,
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
        inputType: filterInputs_1.FilterInputs.Checkbox,
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
        inputType: filterInputs_1.FilterInputs.Checkbox,
    },
];
