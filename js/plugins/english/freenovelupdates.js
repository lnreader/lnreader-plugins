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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.icon = exports.version = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const showToast_1 = require("@libs/showToast");
const isAbsoluteUrl_1 = require("@libs/isAbsoluteUrl");
exports.id = "freenovelupdates";
exports.name = "Free Novel Updates (Broken)";
exports.version = "1.0.0";
exports.icon = "src/en/freenovelupdates/icon.png";
exports.site = "https://www.freenovelupdates.com";
const pluginId = exports.id;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}genres/light-novel-1002`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".books-item").each(function () {
            let novelUrl = loadedCheerio(this).find("a").attr("href");
            if (novelUrl && !(0, isAbsoluteUrl_1.isUrlAbsolute)(novelUrl)) {
                novelUrl = baseUrl + novelUrl;
            }
            if (novelUrl) {
                const novelName = loadedCheerio(this).find(".title").text().trim();
                let novelCover = loadedCheerio(this).find("img").attr("src");
                if (novelCover && !(0, isAbsoluteUrl_1.isUrlAbsolute)(novelCover)) {
                    novelCover = baseUrl + novelCover;
                }
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
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url,
            chapters: [],
        };
        novel.name = loadedCheerio("h1").text();
        let novelCover = loadedCheerio(".img > img").attr("src");
        novel.cover = novelCover
            ? (0, isAbsoluteUrl_1.isUrlAbsolute)(novelCover)
                ? novelCover
                : baseUrl + novelCover
            : undefined;
        novel.summary = loadedCheerio(".description-content").text().trim();
        novel.author = loadedCheerio(".author").text().trim();
        novel.genres = loadedCheerio(".category").text().trim();
        novel.status = loadedCheerio(".status").text().trim();
        loadedCheerio(".chapter").each(function () {
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
        const body = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio(".content").html() || "";
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        (0, showToast_1.showToast)("Search is not available in this source");
        return [];
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
