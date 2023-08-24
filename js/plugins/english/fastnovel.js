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
exports.id = "fastnovel";
exports.name = "Fast Novel";
exports.version = "1.0.0";
exports.icon = "src/en/fastnovel/icon.png";
exports.site = "https://fastnovel.org/";
const pluginId = exports.id;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}sort/p/?page=${page}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".col-novel-main .list-novel .row").each(function () {
            const novelName = loadedCheerio(this).find("h3.novel-title > a").text();
            const novelCover = loadedCheerio(this).find("img.cover").attr("src");
            const novelUrl = loadedCheerio(this)
                .find("h3.novel-title > a")
                .attr("href");
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
        novel.name = loadedCheerio("div.book > img").attr("alt");
        novel.cover = loadedCheerio("div.book > img").attr("src");
        novel.summary = loadedCheerio("div.desc-text").text().trim();
        loadedCheerio("ul.info > li > h3").each(function () {
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
        const novelId = loadedCheerio("#rating").attr("data-novel-id");
        function getChapters(id) {
            return __awaiter(this, void 0, void 0, function* () {
                const chapterListUrl = baseUrl + "ajax/chapter-archive?novelId=" + id;
                const data = yield (0, fetch_1.fetchApi)(chapterListUrl);
                const chapterdata = yield data.text();
                loadedCheerio = (0, cheerio_1.load)(chapterdata);
                let chapter = [];
                loadedCheerio("ul.list-chapter > li").each(function () {
                    const chapterName = loadedCheerio(this).find("a").attr("title");
                    const releaseDate = null;
                    const chapterUrl = loadedCheerio(this).find("a").attr("href");
                    if (!chapterName || !chapterUrl)
                        return;
                    chapter.push({
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    });
                });
                return chapter;
            });
        }
        if (novelId) {
            novel.chapters = yield getChapters(novelId);
        }
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio('#chr-content > div,h6,p[style="display: none;"]').remove();
        let chapterText = loadedCheerio("#chr-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}search/?keyword=${searchTerm}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.col-novel-main > div.list-novel > .row").each(function () {
            const novelUrl = loadedCheerio(this)
                .find("h3.novel-title > a")
                .attr("href");
            const novelName = loadedCheerio(this)
                .find("h3.novel-title > a")
                .text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
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
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
