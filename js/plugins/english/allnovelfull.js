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
exports.id = "ANF.com";
exports.name = "AllNovelFull";
exports.site = "https://allnovelfull.com";
exports.version = "1.0.0";
exports.icon = "src/en/allnovelfull/icon.png";
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${exports.site}/most-popular?page=${page}`;
        const result = yield (0, fetch_1.fetchApi)(url, {});
        if (!result.ok) {
            console.error("Cloudflare error");
            // console.error(await result.text());
            // TODO: Cloudflare protection or other error
            return [];
        }
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio(".col-truyen-main .list-truyen .row").each(function () {
            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover = exports.site + loadedCheerio(this).find("img.cover").attr("src");
            const novelUrl = exports.site + loadedCheerio(this).find("h3.truyen-title > a").attr("href");
            const novel = {
                url: novelUrl,
                name: novelName,
                cover: novelCover,
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
        if (!result.ok) {
            console.error("Cloudflare error");
            // console.error(await result.text());
            // TODO: Cloudflare protection or other error
            return { url, chapters: [] };
        }
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url: novelUrl,
        };
        novel.name = loadedCheerio("div.book > img").attr("alt");
        novel.cover = exports.site + loadedCheerio("div.book > img").attr("src");
        novel.summary = loadedCheerio("div.desc-text").text().trim();
        novel.author = loadedCheerio("div.info > div > h3")
            .filter(function () {
            return loadedCheerio(this).text().trim() === "Author:";
        })
            .siblings()
            .text();
        novel.genres = loadedCheerio("div.info > div")
            .filter(function () {
            return (loadedCheerio(this).find("h3").text().trim() === "Genre:");
        })
            .text()
            .replace("Genre:", "");
        novel.status = loadedCheerio("div.info > div > h3")
            .filter(function () {
            return loadedCheerio(this).text().trim() === "Status:";
        })
            .next()
            .text();
        const novelId = loadedCheerio("#rating").attr("data-novel-id");
        function getChapters(id) {
            return __awaiter(this, void 0, void 0, function* () {
                const chapterListUrl = exports.site + "/ajax/chapter-option?novelId=" + id;
                const data = yield (0, fetch_1.fetchApi)(chapterListUrl);
                if (!data.ok) {
                    console.error("Cloudflare error");
                    // console.error(await result.text());
                    // TODO: Cloudflare protection or other error
                    return [];
                }
                const chapters = yield data.text();
                loadedCheerio = (0, cheerio_1.load)(chapters);
                const novelChapters = [];
                loadedCheerio("select > option").each(function () {
                    var _a;
                    let chapterName = loadedCheerio(this).text();
                    let releaseDate = null;
                    let chapterUrl = (_a = loadedCheerio(this)
                        .attr("value")) === null || _a === void 0 ? void 0 : _a.replace(`/${novelUrl}`, "");
                    if (chapterUrl) {
                        novelChapters.push({
                            name: chapterName,
                            releaseTime: releaseDate,
                            url: chapterUrl,
                        });
                    }
                });
                return novelChapters;
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
        const url = exports.site + chapterUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        if (!result.ok) {
            console.error("Cloudflare error");
            // console.error(await result.text());
            // TODO: Cloudflare protection or other error
            return "Cloudflare protected site!";
        }
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio("#chapter-content").html() || "";
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${exports.site}/search?keyword=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        if (!result.ok) {
            console.error(yield result.text());
            // TODO: Cloudflare protection or other error
            return [];
        }
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.col-truyen-main > div.list-truyen > .row").each(function () {
            const novelUrl = exports.site +
                loadedCheerio(this).find("h3.truyen-title > a").attr("href");
            const novelName = loadedCheerio(this)
                .find("h3.truyen-title > a")
                .text();
            const novelCover = exports.site + loadedCheerio(this).find("img").attr("src");
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
const fetchImage = function (url, init) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, fetch_1.fetchFile)(url, init);
    });
};
exports.fetchImage = fetchImage;
exports.protected = false;
