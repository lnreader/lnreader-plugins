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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.icon = exports.version = exports.site = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
exports.id = "HasuTL";
exports.name = "Hasu Translations";
exports.site = "https://hasutl.wordpress.com/";
exports.version = "1.0.0";
exports.icon = "src/es/hasutl/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "light-novels-activas/";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.wp-block-columns").each(function () {
            const novelName = loadedCheerio(this).find(".wp-block-button").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = loadedCheerio(this)
                .find(".wp-block-button > a")
                .attr("href");
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
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url,
        };
        novel.url = novelUrl;
        novel.name = loadedCheerio(".post-header").text();
        novel.cover = loadedCheerio(".featured-media > img").attr("src");
        let novelSummary = loadedCheerio(".post-content").find("p").html();
        novel.summary = novelSummary;
        let novelChapters = [];
        loadedCheerio(".wp-block-media-text__content")
            .find("a")
            .each(function () {
            const chapterName = loadedCheerio(this).text().trim();
            const releaseDate = null;
            let chapterUrl = loadedCheerio(this).attr("href");
            if (!chapterUrl)
                return;
            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };
            novelChapters.push(chapter);
        });
        novel.chapters = novelChapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = chapterUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let chapterText = loadedCheerio(".post-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".post-container ").each(function () {
            const novelName = loadedCheerio(this).find(".post-header").text();
            if (!novelName.includes("Cap") &&
                !novelName.includes("Vol") &&
                !novelName.includes("Light Novels")) {
                const novelCover = loadedCheerio(this).find("img").attr("src");
                let novelUrl = loadedCheerio(this).find("a").attr("href");
                if (!novelUrl)
                    return;
                const novel = {
                    name: novelName,
                    cover: novelCover,
                    url: novelUrl,
                };
                novels.push(novel);
            }
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
