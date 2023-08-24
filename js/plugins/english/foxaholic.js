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
exports.id = "foxaholic";
exports.name = "Foxaholic";
exports.version = "1.0.0";
exports.icon = "src/en/foxaholic/icon.png";
exports.site = "https://www.foxaholic.com/";
const pluginId = exports.id;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const link = `${baseUrl}novel/page/${page}/?m_orderby=rating`;
        const result = yield (0, fetch_1.fetchApi)(link, {}, pluginId);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio(".page-item-detail").each(function () {
            const novelName = loadedCheerio(this).find(".h5 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find(".h5 > a").attr("href");
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
        const result = yield (0, fetch_1.fetchApi)(url, {}, pluginId);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url,
            chapters: [],
        };
        novel.name = loadedCheerio(".post-title > h1").text().trim();
        novel.cover = loadedCheerio(".summary_image > a > img").attr("data-src");
        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this).find(".summary-content").html();
            if (!detail)
                return;
            switch (detailName) {
                case "Genre":
                    novel.genres = loadedCheerio(detail)
                        .children("a")
                        .map((i, el) => loadedCheerio(el).text())
                        .toArray()
                        .join(",");
                    break;
                case "Author":
                    novel.author = loadedCheerio(detail)
                        .children("a")
                        .map((i, el) => loadedCheerio(el).text())
                        .toArray()
                        .join(", ");
                    break;
                case "Novel":
                    novel.status = detail === null || detail === void 0 ? void 0 : detail.trim().replace(/G/g, "g");
                    break;
            }
        });
        loadedCheerio(".description-summary > div.summary__content > div").remove();
        novel.summary = loadedCheerio(".description-summary > div.summary__content")
            .text()
            .trim();
        let chapter = [];
        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();
            const releaseDate = loadedCheerio(this).find("span").text().trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });
        novel.chapters = chapter.reverse();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl, {}, pluginId);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio("img").removeAttr("srcset");
        let chapterText = loadedCheerio(".reading-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;
        const result = yield (0, fetch_1.fetchApi)(url, {}, pluginId);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const novels = [];
        loadedCheerio(".c-tabs-item__content").each(function () {
            const novelName = loadedCheerio(this).find(".h4 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");
            if (!novelUrl)
                return;
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
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
