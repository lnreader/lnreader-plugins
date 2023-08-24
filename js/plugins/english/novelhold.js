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
exports.id = "novelhold";
exports.name = "Novel Hold";
exports.version = "1.0.0";
exports.icon = "src/en/novelhold/icon.png";
exports.site = "https://novelhold.com/";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}all-${page}.html`;
        const body = yield (0, fetch_1.fetchApi)(url).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#article_list_content > li").each(function () {
            var _a;
            const novelName = loadedCheerio(this)
                .find("h3")
                .text()
                .replace(/\t+/g, "")
                .replace(/\n/g, " ");
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = baseUrl + ((_a = loadedCheerio(this).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1));
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
        const body = yield (0, fetch_1.fetchApi)(url).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url,
            chapters: [],
        };
        novel.name = loadedCheerio(".booknav2 > h1").text();
        novel.cover = loadedCheerio('meta[property="og:image"]').attr("content");
        novel.summary = loadedCheerio(".navtxt").text().trim();
        novel.author = loadedCheerio('p:contains("Author")')
            .text()
            .replace("Author：", "")
            .trim();
        novel.status = loadedCheerio('p:contains("Status")')
            .text()
            .replace("Status：", "")
            .replace("Active", "Ongoing")
            .trim();
        novel.genres = (_a = loadedCheerio('p:contains("Genre")')
            .text()) === null || _a === void 0 ? void 0 : _a.replace("Genre：", "").trim();
        let chapter = [];
        loadedCheerio("ul.chapterlist > li").each(function () {
            var _a;
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl = baseUrl + ((_a = loadedCheerio(this).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1));
            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });
        novel.chapters = chapter;
        console.log(novel);
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = yield (0, fetch_1.fetchApi)(chapterUrl).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio(".content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}index.php?s=so&module=book&keyword=${searchTerm}`;
        const body = yield (0, fetch_1.fetchApi)(url).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#article_list_content > li").each(function () {
            var _a;
            const novelName = loadedCheerio(this)
                .find("h3")
                .text()
                .replace(/\t+/g, "")
                .replace(/\n/g, " ");
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = baseUrl + ((_a = loadedCheerio(this).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1));
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
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
