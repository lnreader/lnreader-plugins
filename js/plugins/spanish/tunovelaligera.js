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
const novelStatus_1 = require("@libs/novelStatus");
const defaultCover_1 = require("@libs/defaultCover");
exports.id = "TNL.com";
exports.name = "TuNovelaLigera";
exports.site = "https://tunovelaligera.com/";
exports.version = "1.0.0";
exports.icon = "src/es/tunovelaligera/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "novelas/page/" + page + "/?m_orderby=rating";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".page-item-detail").each(function () {
            const novelName = loadedCheerio(this).find(".h5 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = loadedCheerio(this).find(".h5 > a").attr("href");
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
        loadedCheerio(".manga-title-badges").remove();
        novel.name = loadedCheerio(".post-title > h1").text().trim();
        let novelCover = loadedCheerio(".summary_image > a > img");
        novel.cover =
            novelCover.attr("data-src") ||
                novelCover.attr("src") ||
                defaultCover_1.defaultCover;
        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();
            switch (detailName) {
                case "Generos":
                    novel.genres = detail.replace(/, /g, ",");
                    break;
                case "Autores":
                    novel.author = detail;
                    break;
                case "Estado":
                    novel.status =
                        detail.includes("OnGoing") ||
                            detail.includes("Updating")
                            ? novelStatus_1.NovelStatus.Ongoing
                            : novelStatus_1.NovelStatus.Completed;
                    break;
            }
        });
        novel.summary = loadedCheerio("div.summary__content > p").text().trim();
        let novelChapters = [];
        loadedCheerio(".lcp_catlist li").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();
            const releaseDate = loadedCheerio(this).find("span").text().trim();
            let chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            novelChapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });
        novel.chapters = novelChapters.reverse();
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
        let chapterText = loadedCheerio("#hola_siguiente").next().text();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".c-tabs-item__content").each(function () {
            const novelName = loadedCheerio(this).find(".h4 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");
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
exports.fetchImage = fetch_1.fetchFile;
