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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.version = exports.icon = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const isAbsoluteUrl_1 = require("@libs/isAbsoluteUrl");
const fetch_1 = require("@libs/fetch");
exports.id = "LNR.org";
exports.name = "LightNovelReader";
exports.icon = "src/en/lightnovelreader/icon.png";
exports.version = "1.0.0";
exports.site = "https://lightnovelreader.org";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "/ranking/top-rated/" + page;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio(".category-items.ranking-category.cm-list > ul > li").each(function () {
            let novelUrl = loadedCheerio(this).find("a").attr("href");
            if (novelUrl && !(0, isAbsoluteUrl_1.isUrlAbsolute)(novelUrl)) {
                novelUrl = baseUrl + novelUrl;
            }
            if (novelUrl) {
                const novelName = loadedCheerio(this)
                    .find(".category-name a")
                    .text()
                    .trim();
                let novelCover = loadedCheerio(this)
                    .find(".category-img img")
                    .attr("src");
                if (novelCover && !(0, isAbsoluteUrl_1.isUrlAbsolute)(novelCover)) {
                    novelCover = baseUrl + novelCover;
                }
                const novel = {
                    url: novelUrl,
                    name: novelName,
                    cover: novelCover,
                };
                novels.push(novel);
            }
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
        const novel = {
            url: novelUrl,
            chapters: [],
        };
        novel.name = loadedCheerio(".section-header-title > h2").text();
        let novelCover = loadedCheerio(".novels-detail img").attr("src");
        novel.cover = novelCover
            ? (0, isAbsoluteUrl_1.isUrlAbsolute)(novelCover)
                ? novelCover
                : baseUrl + novelCover
            : undefined;
        novel.summary = loadedCheerio("div.container > div > div.col-12.col-xl-9 > div > div:nth-child(5) > div")
            .text()
            .trim();
        novel.author = loadedCheerio("div.novels-detail-right > ul > li:nth-child(6) > .novels-detail-right-in-right > a")
            .text()
            .trim();
        novel.genres = loadedCheerio("body > section:nth-child(4) > div > div > div.col-12.col-xl-9 > div > div:nth-child(2) > div > div.novels-detail-right > ul > li:nth-child(3) > div.novels-detail-right-in-right")
            .text()
            .trim();
        novel.status = loadedCheerio("div.novels-detail-right > ul > li:nth-child(2) > .novels-detail-right-in-right")
            .text()
            .trim();
        loadedCheerio(".cm-tabs-content > ul > li").each(function () {
            var _a;
            let chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (chapterUrl && !(0, isAbsoluteUrl_1.isUrlAbsolute)(chapterUrl)) {
                chapterUrl = baseUrl + chapterUrl;
            }
            if (chapterUrl) {
                const chapterName = loadedCheerio(this).find("a").text().trim();
                const releaseDate = null;
                const chapter = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };
                (_a = novel.chapters) === null || _a === void 0 ? void 0 : _a.push(chapter);
            }
        });
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
        const chapterText = loadedCheerio("#chapterText").html() || "";
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + `/search/autocomplete?dataType=json&query=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.json();
        const novels = [];
        body.results.forEach((item) => novels.push({
            url: item.link,
            name: item.original_title,
            cover: item.image,
        }));
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, fetch_1.fetchFile)(url, {});
    });
};
exports.fetchImage = fetchImage;
