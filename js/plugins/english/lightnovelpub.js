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
exports.id = "lightnovelpub";
exports.name = "LightNovelPub";
exports.version = "1.0.0";
exports.icon = "src/en/lightnovelpub/icon.png";
exports.site = "https://www.lightnovelpub.com/";
const baseUrl = exports.site;
const pluginId = exports.id;
const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
};
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}browse/all/popular/all/${page}`;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio(".novel-item.ads").remove();
        loadedCheerio(".novel-item").each(function () {
            var _a;
            const novelName = loadedCheerio(this)
                .find(".novel-title")
                .text()
                .trim();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = baseUrl +
                ((_a = loadedCheerio(this)
                    .find(".novel-title > a")
                    .attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
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
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const body = yield (0, fetch_1.fetchApi)(url, {}, pluginId).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url,
            chapters: [],
        };
        novel.name = loadedCheerio("h1.novel-title").text().trim();
        novel.cover = loadedCheerio("figure.cover > img").attr("data-src");
        novel.genres = "";
        loadedCheerio(".categories > ul > li > a").each(function () {
            novel.genres += loadedCheerio(this).text() + ",";
        });
        novel.genres = novel.genres.slice(0, -1);
        loadedCheerio("div.header-stats > span").each(function () {
            if (loadedCheerio(this).find("small").text() === "Status") {
                novel.status = loadedCheerio(this).find("strong").text();
            }
        });
        novel.author = loadedCheerio(".author > a > span").text();
        novel.summary = loadedCheerio(".summary > .content").text().trim();
        const delay = (ms) => new Promise((res) => setTimeout(res, ms));
        let lastPage = 1;
        lastPage = parseInt((_a = loadedCheerio("#novel > header > div.header-body.container > div.novel-info > div.header-stats > span:nth-child(1) > strong")
            .text()) === null || _a === void 0 ? void 0 : _a.trim());
        lastPage = Math.ceil(lastPage / 100);
        function getChapters() {
            return __awaiter(this, void 0, void 0, function* () {
                let chapter = [];
                for (let i = 1; i <= lastPage; i++) {
                    const chaptersUrl = `${novelUrl}/chapters/page-${i}`;
                    const chaptersHtml = yield (0, fetch_1.fetchApi)(chaptersUrl, { headers: headers }, pluginId).then((r) => r.text());
                    loadedCheerio = (0, cheerio_1.load)(chaptersHtml);
                    loadedCheerio(".chapter-list li").each(function () {
                        var _a;
                        const chapterName = loadedCheerio(this)
                            .find(".chapter-title")
                            .text()
                            .trim();
                        const releaseDate = loadedCheerio(this)
                            .find(".chapter-update")
                            .text()
                            .trim();
                        const chapterUrl = baseUrl +
                            ((_a = loadedCheerio(this)
                                .find("a")
                                .attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
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
        let chapterText = loadedCheerio("#chapter-container").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}lnsearchlive`;
        const link = `${baseUrl}search`;
        const response = yield (0, fetch_1.fetchApi)(link, {}, pluginId).then((r) => r.text());
        const token = (0, cheerio_1.load)(response);
        let verifytoken = token("#novelSearchForm > input").attr("value");
        let formData = new FormData();
        formData.append("inputContent", searchTerm);
        const body = yield (0, fetch_1.fetchApi)(url, {
            method: "POST",
            headers: { LNRequestVerifyToken: verifytoken },
            body: formData,
        }, pluginId).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        let results = JSON.parse(loadedCheerio("body").text());
        loadedCheerio = (0, cheerio_1.load)(results.resultview);
        loadedCheerio(".novel-item").each(function () {
            var _a;
            const novelName = loadedCheerio(this)
                .find("h4.novel-title")
                .text()
                .trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = baseUrl + ((_a = loadedCheerio(this).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
            novels.push({
                name: novelName,
                url: novelUrl,
                cover: novelCover,
            });
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
