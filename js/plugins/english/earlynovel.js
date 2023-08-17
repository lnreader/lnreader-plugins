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
const showToast_1 = require("@libs/showToast");
const defaultCover_1 = require("@libs/defaultCover");
exports.id = "earlynovel";
exports.name = "Early Novel";
exports.version = "1.0.0";
exports.icon = "multisrc/madara/icons/latestnovel.png";
exports.site = "https://earlynovel.net/";
module.exports.protected = false;
const pluginId = exports.id;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}most-popular?page=${page}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".col-truyen-main > .list-truyen > .row").each(function () {
            var _a;
            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .attr("title");
            const novelCover = loadedCheerio(this).find(".lazyimg").attr("data-desk-image") ||
                loadedCheerio(this).find("img.cover").attr("src");
            const novelUrl = baseUrl +
                ((_a = loadedCheerio(this)
                    .find("h3.truyen-title > a")
                    .attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1));
            if (!novelUrl || !novelName)
                return;
            const novel = {
                name: novelName,
                cover: novelCover || defaultCover_1.defaultCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        (0, showToast_1.showToast)("Early Novel may take 20-30 seconds");
        const url = novelUrl;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const name = loadedCheerio(".book > img").attr("alt");
        const cover = loadedCheerio(".book > img").attr("src") || defaultCover_1.defaultCover;
        const summary = loadedCheerio(".desc-text").text().trim();
        const novel = {
            url,
            chapters: [],
            name,
            summary,
            cover,
        };
        loadedCheerio(".info > div > h3").each(function () {
            let detailName = loadedCheerio(this).text();
            let detail = loadedCheerio(this)
                .siblings()
                .map((i, el) => loadedCheerio(el).text())
                .toArray()
                .join(",");
            switch (detailName) {
                case "Author:":
                    novel.author = detail;
                    break;
                case "Status:":
                    novel.status = detail;
                    break;
                case "Genre:":
                    novel.genres = detail;
                    break;
            }
        });
        //! Doesn't work since there are multiple pages and can't find source API
        //# Since cannot find sourceAPI i try similar function to lightnovelpub
        const delay = (ms) => new Promise((res) => setTimeout(res, ms));
        const lastPageStr = (_a = loadedCheerio('a:contains("Last ")')
            .attr("title")) === null || _a === void 0 ? void 0 : _a.match(/(\d+)/g);
        const lastPage = Number((lastPageStr === null || lastPageStr === void 0 ? void 0 : lastPageStr[1]) || "0");
        function getChapters() {
            return __awaiter(this, void 0, void 0, function* () {
                let chapter = [];
                for (let i = 1; i <= lastPage; i++) {
                    const chaptersUrl = `${novelUrl}?page=${i}`;
                    const chaptersHtml = yield (0, fetch_1.fetchApi)(chaptersUrl, {}, pluginId).then((r) => r.text());
                    loadedCheerio = (0, cheerio_1.load)(chaptersHtml);
                    loadedCheerio("ul.list-chapter > li").each(function () {
                        var _a;
                        const chapterName = loadedCheerio(this)
                            .find(".chapter-text")
                            .text()
                            .trim();
                        const releaseDate = null;
                        const chapterHref = (_a = loadedCheerio(this)
                            .find("a")
                            .attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1);
                        if (!chapterHref)
                            return;
                        const chapterUrl = baseUrl + chapterHref;
                        chapter.push({
                            name: chapterName,
                            releaseTime: releaseDate,
                            url: chapterUrl,
                        });
                    });
                    yield delay(1000);
                }
                return chapter;
            });
        }
        novel.chapters = yield getChapters();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio("#chapter-c").html() || "";
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}search?keyword=${searchTerm}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.col-truyen-main > div.list-truyen > .row").each(function () {
            const novelUrl = baseUrl +
                loadedCheerio(this).find("h3.truyen-title > a").attr("href");
            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover = baseUrl + loadedCheerio(this).find("img").attr("src");
            if (novelUrl) {
                novels.push({
                    url: novelUrl,
                    name: novelName,
                    cover: novelCover,
                });
            }
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = function fetchImage(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
