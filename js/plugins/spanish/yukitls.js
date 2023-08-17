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
const fetch_1 = require("@libs/fetch");
const cheerio_1 = require("cheerio");
exports.id = "yuukitls.com";
exports.name = "Yuuki Tls";
exports.site = "https://yuukitls.com/";
exports.version = "1.0.0";
exports.icon = "src/es/yuukitls/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".quadmenu-navbar-collapse ul li:nth-child(2)")
            .find("li")
            .each(function () {
            const novelName = loadedCheerio(this)
                .text()
                .replace(/[\s\n]+/g, " ");
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = loadedCheerio(this).find("a").attr("href");
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
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url,
        };
        novel.name = loadedCheerio("h1.entry-title")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();
        novel.cover = loadedCheerio('img[loading="lazy"]').attr("src");
        loadedCheerio(".entry-content")
            .find("div")
            .each(function () {
            if (loadedCheerio(this).text().includes("Escritor:")) {
                novel.author = loadedCheerio(this)
                    .text()
                    .replace("Escritor: ", "")
                    .trim();
            }
            if (loadedCheerio(this).text().includes("Género:")) {
                novel.genres = loadedCheerio(this)
                    .text()
                    .replace(/Género: |\s/g, "");
            }
            if (loadedCheerio(this).text().includes("Sinopsis:")) {
                novel.summary = loadedCheerio(this).next().text();
            }
        });
        let novelChapters = [];
        if (loadedCheerio(".entry-content").find("li").length) {
            loadedCheerio(".entry-content")
                .find("li")
                .each(function () {
                let chapterUrl = loadedCheerio(this).find("a").attr("href");
                if (chapterUrl && chapterUrl.includes(baseUrl)) {
                    const chapterName = loadedCheerio(this).text();
                    const releaseDate = null;
                    const chapter = {
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    };
                    novelChapters.push(chapter);
                }
            });
        }
        else {
            loadedCheerio(".entry-content")
                .find("p")
                .each(function () {
                let chapterUrl = loadedCheerio(this).find("a").attr("href");
                if (chapterUrl && chapterUrl.includes(baseUrl)) {
                    const chapterName = loadedCheerio(this).text();
                    const releaseDate = null;
                    const chapter = {
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    };
                    novelChapters.push(chapter);
                }
            });
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
        let loadedCheerio = (0, cheerio_1.load)(body);
        let chapterText = loadedCheerio(".entry-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        searchTerm = searchTerm.toLowerCase();
        let url = baseUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".menu-item-2869")
            .find(".menu-item.menu-item-type-post_type.menu-item-object-post")
            .each(function () {
            const novelName = loadedCheerio(this).text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl)
                return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        novels = novels.filter((novel) => novel.name.toLowerCase().includes(searchTerm));
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
