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
exports.id = "epiknovel.com";
exports.name = "EpikNovel";
exports.site = "https://www.epiknovel.com/";
exports.version = "1.0.0";
exports.icon = "src/tr/epiknovel/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "seri-listesi?Sayfa=" + page;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.col-lg-12.col-md-12").each(function () {
            const novelName = loadedCheerio(this).find("h3").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
            if (!novelUrl)
                return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        // console.log(novels);
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        // console.log(url);
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = { url };
        novel.name = loadedCheerio("h1#tables").text().trim();
        novel.cover = loadedCheerio("img.manga-cover").attr("src");
        novel.summary = loadedCheerio("#wrapper > div.row > div.col-md-9 > div:nth-child(6) > p:nth-child(3)")
            .text()
            .trim();
        novel.status = loadedCheerio("#wrapper > div.row > div.col-md-9 > div.row > div.col-md-9 > h4:nth-child(3) > a")
            .text()
            .trim();
        novel.author = loadedCheerio("#NovelInfo > p:nth-child(4)")
            .text()
            .replace(/Publisher:|\s/g, "")
            .trim();
        let novelChapters = [];
        loadedCheerio("table").find("tr").first().remove();
        loadedCheerio("table")
            .find("tr")
            .each(function () {
            const releaseDate = loadedCheerio(this)
                .find("td:nth-child(3)")
                .text();
            let chapterName = loadedCheerio(this)
                .find("td:nth-child(1) > a")
                .text();
            if (loadedCheerio(this).find("td:nth-child(1) > span").length >
                0) {
                chapterName = "🔒 " + chapterName;
            }
            const chapterUrl = loadedCheerio(this)
                .find(" td:nth-child(1) > a")
                .attr("href");
            if (!chapterUrl)
                return;
            novelChapters.push({
                name: chapterName,
                url: chapterUrl,
                releaseTime: releaseDate,
            });
        });
        novel.chapters = novelChapters;
        // console.log(novel);
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = chapterUrl;
        // console.log(url);
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let chapterName, chapterText;
        if (result.url === "https://www.epiknovel.com/login") {
            chapterName = "";
            chapterText = "Premium Chapter";
        }
        else {
            chapterName = loadedCheerio("#icerik > center > h4 > b").text();
            chapterText = loadedCheerio("div#icerik").html();
        }
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "seri-listesi?q=" + searchTerm;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.col-lg-12.col-md-12").each(function () {
            const novelName = loadedCheerio(this).find("h3").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
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
