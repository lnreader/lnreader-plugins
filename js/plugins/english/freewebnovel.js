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
exports.id = "FWN.com";
exports.name = "Web NOVEL";
exports.site = "https://freewebnovel.com/";
exports.version = "1.0.0";
exports.icon = "src/en/freewebnovel/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "completed-novel/" + page;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".li-row").each(function () {
            const novelName = loadedCheerio(this).find(".tit").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = "https://freewebnovel.com" +
                loadedCheerio(this).find("h3 > a").attr("href");
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
        let novel = {
            url,
        };
        novel.name = loadedCheerio("h1.tit").text();
        novel.cover = loadedCheerio(".pic > img").attr("src");
        novel.genres = loadedCheerio("[title=Genre]")
            .next()
            .text()
            .replace(/[\t\n]/g, "");
        novel.author = loadedCheerio("[title=Author]")
            .next()
            .text()
            .replace(/[\t\n]/g, "");
        novel.status = loadedCheerio("[title=Status]")
            .next()
            .text()
            .replace(/[\t\n]/g, "");
        let novelSummary = loadedCheerio(".inner").text().trim();
        novel.summary = novelSummary;
        let novelChapters = [];
        let latestChapter;
        loadedCheerio("h3.tit").each(function (res) {
            var _a;
            if (loadedCheerio(this).find("a").text() === novel.name) {
                latestChapter = (_a = loadedCheerio(this)
                    .next()
                    .find("span.s3")
                    .text()
                    .match(/(\d+)/)) === null || _a === void 0 ? void 0 : _a[0];
            }
        });
        let prefixUrl = novelUrl.replace(".html", "/");
        for (let i = 1; i <= parseInt(latestChapter || "0", 10); i++) {
            const chapterName = "Chapter " + i;
            const releaseDate = null;
            let chapterUrl = "chapter-" + i;
            chapterUrl = `${prefixUrl}${chapterUrl}.html`;
            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };
            novelChapters.push(chapter);
        }
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
        let chapterText = loadedCheerio("div.txt").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "search/";
        const formData = {
            searchkey: searchTerm,
        };
        const result = yield (0, fetch_1.fetchApi)(url, {
            method: "POST",
            body: JSON.stringify(formData),
        });
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".li-row > .li > .con").each(function () {
            const novelName = loadedCheerio(this).find(".tit").text();
            const novelCover = loadedCheerio(this)
                .find(".pic > a > img")
                .attr("data-cfsrc");
            let novelUrl = "https://freewebnovel.com" +
                loadedCheerio(this).find("h3 > a").attr("href");
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
