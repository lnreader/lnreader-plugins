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
exports.id = "nitroscans";
exports.name = "Nitroscans";
exports.version = "1.0.0";
exports.icon = "src/en/nitroscans/icon.png";
exports.site = "https://nitroscans.com/";
exports.protected = false;
const baseUrl = exports.site;
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "wp-admin/admin-ajax.php";
        let formData = new FormData();
        formData.append("action", "madara_load_more");
        formData.append("page", `${Number(page - 1)}`);
        formData.append("template", "madara-core/content/content-archive");
        formData.append("vars[orderby]", "meta_value_num");
        formData.append("vars[post_type]", "wp-manga");
        formData.append("vars[meta_key]", "_wp_manga_views");
        formData.append("vars[wp-manga-genre]", "novels");
        const body = yield (0, fetch_1.fetchApi)(url, {
            method: "POST",
            body: formData,
        }).then((r) => r.text());
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".page-item-detail").each(function () {
            const novelName = loadedCheerio(this).find("h3 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
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
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const body = yield (0, fetch_1.fetchApi)(url).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url,
            chapters: [],
        };
        loadedCheerio(".manga-title-badges.custom.novel").remove();
        novel.name = loadedCheerio(".post-title > h1").text().trim();
        novel.cover = loadedCheerio(".summary_image")
            .find("img")
            .attr("data-src");
        novel.summary = (_a = loadedCheerio(".summary__content").text()) === null || _a === void 0 ? void 0 : _a.trim();
        novel.genres = loadedCheerio(".genres-content")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");
        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();
            switch (detailName) {
                case "Author(s)":
                    novel.author = detail;
                    break;
                case "Status":
                    novel.status = detail.replace(/G/g, "g");
                    break;
            }
        });
        let chapter = [];
        let chapterlisturl = novelUrl + "ajax/chapters/";
        const data = yield (0, fetch_1.fetchApi)(chapterlisturl, { method: "POST" });
        const text = yield data.text();
        loadedCheerio = (0, cheerio_1.load)(text);
        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
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
        const body = yield (0, fetch_1.fetchApi)(chapterUrl).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio(".text-left").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = baseUrl + "wp-admin/admin-ajax.php";
        let formData = new FormData();
        formData.append("action", "madara_load_more");
        formData.append("page", `${Number(1 - 1)}`);
        formData.append("template", "madara-core/content/content-search");
        formData.append("vars[s]", searchTerm);
        formData.append("vars[post_type]", "wp-manga");
        formData.append("vars[wp-manga-genre]", "novels");
        const body = yield (0, fetch_1.fetchApi)(url, {
            method: "POST",
            body: formData,
        }).then((r) => r.text());
        let loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".c-tabs-item__content").each(function () {
            const novelName = loadedCheerio(this).find("h3 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
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
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            Referer: baseUrl,
        };
        return yield (0, fetch_1.fetchFile)(url, { headers: headers });
    });
};
exports.fetchImage = fetchImage;
