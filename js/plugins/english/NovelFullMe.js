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
exports.id = "NF.me";
exports.name = "NovelFull.me";
exports.site = "https://novelfull.me/";
exports.version = "1.0.0";
exports.icon = "src/en/novelfullme/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}popular?page=${page}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".book-item").each(function () {
            var _a;
            const novelName = loadedCheerio(this).find(".title").text();
            const novelCover = "https:" + loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = baseUrl +
                ((_a = loadedCheerio(this).find(".title a").attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
            const novel = { name: novelName, cover: novelCover, url: novelUrl };
            novels.push(novel);
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url,
            name: "",
            cover: "",
            author: "",
            status: "",
            genres: "",
            summary: "",
            chapters: [],
        };
        novel.name = loadedCheerio(".name h1").text().trim();
        novel.cover =
            "https:" + loadedCheerio(".img-cover img").attr("data-src");
        novel.summary = loadedCheerio("body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.mt-1 > div.section.box.mt-1.summary > div.section-body > p.content")
            .text()
            .trim();
        novel.author = "Unknown";
        novel.status = (_a = loadedCheerio("body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(1) > a > span")
            .text()) === null || _a === void 0 ? void 0 : _a.trim();
        novel.genres = (_b = loadedCheerio("body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(2)")
            .text()) === null || _b === void 0 ? void 0 : _b.replace("Genres :", "").replace(/[\s\n]+/g, " ").trim();
        let chapters = [];
        const chaptersUrl = novelUrl.replace(baseUrl, "https://novelfull.me/api/novels/") +
            "/chapters?source=detail";
        const chaptersRequest = yield (0, fetch_1.fetchApi)(chaptersUrl);
        const chaptersHtml = yield chaptersRequest.text();
        loadedCheerio = (0, cheerio_1.load)(chaptersHtml);
        loadedCheerio("li").each(function () {
            const chapterName = loadedCheerio(this)
                .find(".chapter-title")
                .text()
                .trim();
            const releaseDate = loadedCheerio(this)
                .find(".chapter-update")
                .text()
                .trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
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
        let loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio("#listen-chapter").remove();
        loadedCheerio("#google_translate_element").remove();
        const chapterText = loadedCheerio(".chapter__content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}search?status=all&sort=views&q=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".book-item").each(function () {
            var _a;
            const novelName = loadedCheerio(this).find(".title").text();
            const novelCover = "https:" + loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = baseUrl +
                ((_a = loadedCheerio(this).find(".title a").attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
            const novel = { name: novelName, cover: novelCover, url: novelUrl };
            novels.push(novel);
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
