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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.version = exports.icon = exports.site = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const novelStatus_1 = require("@libs/novelStatus");
exports.id = "novelringan.com";
exports.name = "NovelRingan";
exports.site = "https://novelringan.com/";
exports.icon = "src/id/novelringan/icon.png";
exports.version = "1.0.0";
const baseUrl = exports.site;
const coverUriPrefix = "https://i0.wp.com/novelringan.com/wp-content/uploads/";
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}/top-novel/page/${page}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio("article.post").each(function () {
            var _a;
            const novelName = (_a = loadedCheerio(this)
                .find(".entry-title")
                .text()) === null || _a === void 0 ? void 0 : _a.trim();
            const novelCover = coverUriPrefix + loadedCheerio(this).find("img").attr("data-sxrx");
            const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");
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
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url,
            name: "",
            cover: "",
            genres: "",
            author: "",
            status: novelStatus_1.NovelStatus.Unknown,
            summary: "",
            chapters: [],
        };
        novel.name = (_a = loadedCheerio(".entry-title").text()) === null || _a === void 0 ? void 0 : _a.trim();
        novel.cover =
            coverUriPrefix +
                loadedCheerio("img.ts-post-image").attr("data-sxrx");
        novel.summary = loadedCheerio("body > div.site-container > div > main > article > div > div.maininfo > span > p").text();
        let genreSelector = loadedCheerio("body > div.site-container > div > main > article > div > div.maininfo > span > ul > li:nth-child(4)").text();
        novel.genres = genreSelector.includes("Genre")
            ? genreSelector.replace("Genre:", "").trim()
            : "";
        let statusSelector = loadedCheerio("body > div.site-container > div > main > article > div > div.maininfo > span > ul > li:nth-child(3)").text();
        novel.status = statusSelector.includes("Status")
            ? statusSelector.replace("Status:", "").trim()
            : novelStatus_1.NovelStatus.Unknown;
        let chapters = [];
        loadedCheerio(".bxcl > ul > li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };
            chapters.push(chapter);
        });
        novel.chapters = chapters.reverse();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = chapterUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio('.entry-content div[style="display:none"]').remove();
        const chapterText = loadedCheerio(".entry-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "?s=" + searchTerm;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("article.post").each(function () {
            const novelName = loadedCheerio(this).find(".entry-title").text();
            const novelCover = coverUriPrefix + loadedCheerio(this).find("img").attr("data-sxrx");
            const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");
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
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
