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
const defaultCover_1 = require("@libs/defaultCover");
exports.id = "DDL.com";
exports.name = "Divine Dao Library";
exports.site = "https://www.divinedaolibrary.com/";
exports.version = "1.0.0";
exports.icon = "src/en/divinedaolibrary/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "novels";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#main")
            .find("li")
            .each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover_1.defaultCover;
            const novelUrl = loadedCheerio(this).find(" a").attr("href");
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
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novel = { url };
        novel.name = loadedCheerio("h1.entry-title").text().trim();
        novel.cover =
            loadedCheerio(".entry-content").find("img").attr("data-ezsrc") ||
                defaultCover_1.defaultCover;
        novel.summary = loadedCheerio("#main > article > div > p:nth-child(6)")
            .text()
            .trim();
        novel.author = loadedCheerio("#main > article > div > h3:nth-child(2)")
            .text()
            .replace(/Author:/g, "")
            .trim();
        let novelChapters = [];
        loadedCheerio("#main")
            .find("li > span > a")
            .each(function () {
            const chapterName = loadedCheerio(this).text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).attr("href");
            if (!chapterUrl)
                return;
            novelChapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
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
        const loadedCheerio = (0, cheerio_1.load)(body);
        let chapterName = loadedCheerio(".entry-title").text().trim();
        let chapterText = loadedCheerio(".entry-content").html();
        if (!chapterText) {
            chapterText = loadedCheerio(".page-header").html();
        }
        chapterText = `<p><h1>${chapterName}</h1></p>` + chapterText;
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "novels";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#main")
            .find("li")
            .each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover_1.defaultCover;
            const novelUrl = loadedCheerio(this).find(" a").attr("href");
            if (!novelUrl)
                return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        novels = novels.filter((novel) => novel.name.toLowerCase().includes(searchTerm.toLowerCase()));
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = function (url, init) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, fetch_1.fetchFile)(url, init);
    });
};
exports.fetchImage = fetchImage;
