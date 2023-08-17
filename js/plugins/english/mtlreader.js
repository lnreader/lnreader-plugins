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
exports.id = "mtlreader";
exports.name = "MTL Reader";
exports.version = "1.0.0";
exports.icon = "src/en/mtlreader/icon.png";
exports.site = "https://mtlreader.com/";
exports.protected = false;
const pluginId = exports.id;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}novels?page=${page}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".col-md-4.col-sm-4").each(function () {
            const novelName = loadedCheerio(this).find("h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h5 > a").attr("href");
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
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url,
            chapters: [],
        };
        novel.name = loadedCheerio(".agent-title").text().trim();
        novel.cover = loadedCheerio(".agent-p-img > img").attr("src");
        novel.summary = loadedCheerio("#editdescription").text().trim();
        novel.author = loadedCheerio("i.fa-user")
            .parent()
            .text()
            .replace("Author: ", "")
            .trim();
        let chapter = [];
        loadedCheerio("tr.spaceUnder").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });
        novel.chapters = chapter;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio(".container ins,script,p.mtlreader").remove();
        const chapterText = loadedCheerio(".container").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}search?input=${searchTerm}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".col-md-4.col-sm-4").each(function () {
            const novelName = loadedCheerio(this).find("h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h5 > a").attr("href");
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
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
