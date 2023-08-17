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
exports.fetchImage = exports.parseChapter = exports.popularNovels = exports.parseNovelAndChapters = exports.searchNovels = exports.version = exports.icon = exports.site = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
exports.id = "NO.net";
exports.name = "novelsOnline";
exports.site = "https://novelsonline.net";
exports.icon = "src/coverNotAvailable.jpg";
exports.version = "1.0.0";
const pluginId = exports.id;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)("https://novelsonline.net/sResults.php", {
            headers: {
                Accept: "*/*",
                "Accept-Language": "pl,en-US;q=0.7,en;q=0.3",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            method: "POST",
            body: "q=" + encodeURIComponent(searchTerm),
        }, pluginId).then((res) => res.text());
        let $ = (0, cheerio_1.load)(result);
        const headers = $("li");
        return headers
            .map((i, h) => {
            const novelName = $(h).text();
            const novelUrl = $(h).find("a").attr("href");
            const novelCover = $(h).find("img").attr("src");
            if (!novelUrl) {
                return null;
            }
            return {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
        })
            .get()
            .filter((sr) => sr !== null);
    });
};
exports.searchNovels = searchNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        let novel = {
            url: novelUrl,
            chapters: [],
        };
        const result = yield (0, fetch_1.fetchApi)(novelUrl).then((res) => res.text());
        let $ = (0, cheerio_1.load)(result);
        novel.name = $("h1").text();
        novel.cover = $(".novel-cover").find("a > img").attr("src");
        novel.author = $("div.novel-details > div:nth-child(5) > div.novel-detail-body")
            .find("li")
            .map((_, el) => $(el).text())
            .get()
            .join(", ");
        novel.genres = $("div.novel-details > div:nth-child(2) > div.novel-detail-body")
            .find("li")
            .map((_, el) => $(el).text())
            .get()
            .join(",");
        novel.summary = $("div.novel-right > div > div:nth-child(1) > div.novel-detail-body").text();
        novel.chapters = $("ul.chapter-chs > li > a")
            .map((_, el) => {
            const chapterUrl = $(el).attr("href");
            const chapterName = $(el).text();
            return {
                name: chapterName,
                releaseTime: "",
                url: chapterUrl,
            };
        })
            .get();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        return []; /** TO DO */
    });
};
exports.popularNovels = popularNovels;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl).then((res) => res.text());
        let loadedCheerio = (0, cheerio_1.load)(result);
        const chapterText = loadedCheerio("#contentall").html() || "";
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
exports.fetchImage = fetch_1.fetchFile;
