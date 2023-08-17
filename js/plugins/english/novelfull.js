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
exports.id = "novelfull";
exports.name = "NovelFull";
exports.version = "1.0.0";
exports.icon = "src/en/novelfull/icon.png";
exports.site = "https://novelfull.com/";
exports.protected = false;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}most-popular?page=${page}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".col-truyen-main .list-truyen .row").each(function () {
            var _a, _b;
            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover = baseUrl + ((_a = loadedCheerio(this).find("img").attr("src")) === null || _a === void 0 ? void 0 : _a.slice(1));
            const novelUrl = baseUrl +
                ((_b = loadedCheerio(this)
                    .find("h3.truyen-title > a")
                    .attr("href")) === null || _b === void 0 ? void 0 : _b.slice(1));
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
        const novel = {
            url,
            chapters: [],
        };
        novel.name = loadedCheerio("div.book > img").attr("alt");
        novel.cover = baseUrl + loadedCheerio("div.book > img").attr("src");
        novel.summary = loadedCheerio("div.desc-text").text().trim();
        novel.author = loadedCheerio('h3:contains("Author")')
            .parent()
            .contents()
            .text()
            .replace("Author:", "");
        novel.genres = loadedCheerio('h3:contains("Genre")')
            .siblings()
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");
        novel.status = loadedCheerio('h3:contains("Status")').next().text();
        const novelId = loadedCheerio("#rating").attr("data-novel-id");
        function getChapters(id) {
            return __awaiter(this, void 0, void 0, function* () {
                const chapterListUrl = baseUrl + "ajax/chapter-option?novelId=" + id;
                const data = yield (0, fetch_1.fetchApi)(chapterListUrl);
                const chapterlist = yield data.text();
                loadedCheerio = (0, cheerio_1.load)(chapterlist);
                let chapter = [];
                loadedCheerio("select > option").each(function () {
                    var _a;
                    const chapterName = loadedCheerio(this).text();
                    const releaseDate = null;
                    const chapterUrl = baseUrl + ((_a = loadedCheerio(this).attr("value")) === null || _a === void 0 ? void 0 : _a.slice(1));
                    chapter.push({
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    });
                });
                return chapter;
            });
        }
        novel.chapters = yield getChapters(novelId);
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio("#chapter-content div.ads").remove();
        let chapterText = loadedCheerio("#chapter-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const searchUrl = `${baseUrl}search?keyword=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(searchUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".col-truyen-main .list-truyen .row").each(function () {
            var _a, _b;
            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover = baseUrl + ((_a = loadedCheerio(this).find("img").attr("src")) === null || _a === void 0 ? void 0 : _a.slice(1));
            const novelUrl = baseUrl +
                ((_b = loadedCheerio(this)
                    .find("h3.truyen-title > a")
                    .attr("href")) === null || _b === void 0 ? void 0 : _b.slice(1));
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
