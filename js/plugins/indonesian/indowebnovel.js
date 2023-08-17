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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.version = exports.icon = exports.site = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const defaultCover_1 = require("@libs/defaultCover");
exports.id = "IDWN.id";
exports.name = "IndoWebNovel";
exports.site = "https://indowebnovel.id/id/";
exports.icon = "src/id/indowebnovel/icon.png";
exports.version = "1.0.0";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}daftar-novel/`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".novellist-blc li").each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover_1.defaultCover;
            const novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl || !novelName)
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
            name: "",
            cover: "",
            author: "",
            status: "",
            genres: "",
            summary: "",
            chapters: [],
        };
        novel.name = loadedCheerio(".series-title").text().trim();
        novel.cover = loadedCheerio(".series-thumb > img").attr("src");
        novel.summary = loadedCheerio(".series-synops").text().trim();
        novel.status = loadedCheerio(".status").text().trim();
        const genres = [];
        loadedCheerio(".series-genres").each(function () {
            genres.push(loadedCheerio(this).find("a").text().trim());
        });
        novel.genres = genres.join(",");
        let chapters = [];
        loadedCheerio(".series-chapterlist li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
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
        const chapterText = loadedCheerio(".reader").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}daftar-novel/`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".novellist-blc li").each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover_1.defaultCover;
            const novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl)
                return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            if (novelName.toLowerCase().includes(searchTerm.toLowerCase())) {
                novels.push(novel);
            }
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
