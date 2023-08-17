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
exports.id = "chireads.com";
exports.name = "Chireads";
exports.site = "https://chireads.com/";
exports.version = "1.0.0";
exports.icon = "src/fr/chireads/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}category/translatedtales/page/${page}/`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#content li").each(function () {
            const novelName = loadedCheerio(this).find(".news-list-tit h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".news-list-tit h5 a")
                .attr("href");
            if (!novelUrl)
                return;
            const novel = { name: novelName, cover: novelCover, url: novelUrl };
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
            name: "",
            cover: "",
            author: "",
            status: "",
            genres: "",
            summary: "",
            chapters: [],
        };
        novel.name = loadedCheerio(".inform-title").text().trim();
        novel.cover = loadedCheerio(".inform-product img").attr("src");
        novel.summary = loadedCheerio(".inform-inform-txt").text().trim();
        let chapters = [];
        loadedCheerio(".chapitre-table a").each(function () {
            const chapterName = loadedCheerio(this).text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).attr("href");
            if (!chapterUrl)
                return;
            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });
        novel.chapters = chapters;
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
        const chapterText = loadedCheerio("#content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}search?x=0&y=0&name=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#content li").each(function () {
            const novelName = loadedCheerio(this).find(".news-list-tit h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".news-list-tit h5 a")
                .attr("href");
            if (!novelUrl)
                return;
            const novel = { name: novelName, cover: novelCover, url: novelUrl };
            novels.push(novel);
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
