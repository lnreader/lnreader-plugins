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
exports.id = "ligera.com";
exports.name = "Novelas Ligera";
exports.site = "https://novelasligera.com/";
exports.version = "1.0.0";
exports.icon = "src/es/novelasligera/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".elementor-column").each(function () {
            const novelName = loadedCheerio(this)
                .find(".widget-image-caption.wp-caption-text")
                .text();
            if (novelName) {
                const novelCover = loadedCheerio(this)
                    .find("a > img")
                    .attr("data-lazy-src");
                let novelUrl = loadedCheerio(this).find("a").attr("href");
                if (!novelUrl)
                    return;
                const novel = {
                    name: novelName,
                    cover: novelCover,
                    url: novelUrl,
                };
                novels.push(novel);
            }
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "novela/" + novelUrl;
        // console.log(url);
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novel = { url };
        novel.name = loadedCheerio("h1").text();
        novel.cover = loadedCheerio(".elementor-widget-container")
            .find("img")
            .attr("src");
        loadedCheerio(".elementor-row")
            .find("p")
            .each(function () {
            if (loadedCheerio(this).text().includes("Autor:")) {
                novel.author = loadedCheerio(this)
                    .text()
                    .replace("Autor:", "")
                    .trim();
            }
            if (loadedCheerio(this).text().includes("Estado:")) {
                novel.status = loadedCheerio(this)
                    .text()
                    .replace("Estado: ", "")
                    .trim();
            }
            if (loadedCheerio(this).text().includes("Género:")) {
                loadedCheerio(this).find("span").remove();
                novel.genres = loadedCheerio(this)
                    .text()
                    .replace(/,\s/g, ",");
            }
        });
        novel.summary = loadedCheerio(".elementor-text-editor.elementor-clearfix").text();
        let novelChapters = [];
        loadedCheerio(".elementor-accordion-item").remove();
        loadedCheerio(".elementor-tab-content")
            .find("li")
            .each(function () {
            const chapterName = loadedCheerio(this).text();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl)
                return;
            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };
            novelChapters.push(chapter);
        });
        novel.chapters = novelChapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = chapterUrl;
        // console.log(url);
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio(".osny-nightmode.osny-nightmode--left").remove();
        loadedCheerio(".code-block.code-block-1").remove();
        loadedCheerio(".adsb30").remove();
        loadedCheerio(".saboxplugin-wrap").remove();
        loadedCheerio(".wp-post-navigation").remove();
        let chapterText = loadedCheerio(".entry-content").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "?s=" + searchTerm + "&post_type=wp-manga";
        // console.log(url);
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".inside-article").each(function () {
            const novelCover = loadedCheerio(this).find("img").attr("src");
            let novelUrl = loadedCheerio(this).find("a").attr("href");
            let novelName;
            if (novelUrl) {
                novelName = novelUrl.replace(/-/g, " ").replace(/^./, function (x) {
                    return x.toUpperCase();
                });
            }
            novelUrl += "/";
            if (!novelName || !novelUrl)
                return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        novels = [Object.assign({}, novels[1])];
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
