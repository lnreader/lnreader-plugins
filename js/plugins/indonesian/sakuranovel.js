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
exports.id = "sakura.id";
exports.name = "SakuraNovel";
exports.site = "https://sakuranovel.id/";
exports.icon = "src/id/sakuranovel/icon.png";
exports.version = "1.0.0";
const pluginId = exports.id;
const sourceName = exports.name;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}advanced-search/page/${page}/?title&author&yearx&status&type&order=rating&country%5B0%5D=china&country%5B1%5D=jepang&country%5B2%5D=unknown`;
        const result = yield (0, fetch_1.fetchApi)(url, {}, pluginId);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".flexbox2-item").each(function () {
            const novelName = loadedCheerio(this)
                .find(".flexbox2-title span")
                .first()
                .text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".flexbox2-content > a")
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
        const result = yield (0, fetch_1.fetchApi)(novelUrl, {}, pluginId);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            name: sourceName,
            url: novelUrl,
        };
        novel.name = loadedCheerio(".series-title h2").text().trim();
        novel.cover = loadedCheerio(".series-thumb img").attr("src");
        loadedCheerio(".series-infolist > li").each(function () {
            const detailName = loadedCheerio(this).find("b").text().trim();
            const detail = loadedCheerio(this).find("b").next().text().trim();
            switch (detailName) {
                case "Author":
                    novel.author = detail;
                    break;
            }
        });
        novel.status = loadedCheerio(".status").text().trim();
        novel.genres = loadedCheerio(".series-genres")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");
        loadedCheerio(".series-synops div").remove();
        novel.summary = loadedCheerio(".series-synops").text().trim();
        let chapters = [];
        loadedCheerio(".series-chapterlist li").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a span")
                .first()
                .text()
                .replace(/.*?(Chapter.|[0-9])/g, "$1")
                .replace(/Bahasa Indonesia/g, "")
                .replace(/\s+/g, " ")
                .trim();
            const releaseDate = loadedCheerio(this)
                .find("a span")
                .first()
                .next()
                .text();
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
        const result = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio(".readers").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}?s=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url, {}, pluginId);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".flexbox2-item").each(function () {
            const novelName = loadedCheerio(this)
                .find(".flexbox2-title span")
                .first()
                .text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".flexbox2-content > a")
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
