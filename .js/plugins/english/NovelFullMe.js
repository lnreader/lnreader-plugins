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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var cheerio_1 = require("cheerio");
var fetch_1 = require("@libs/fetch");
var NovelFull = /** @class */ (function () {
    function NovelFull() {
        this.id = "NF.me";
        this.name = "NovelFull";
        this.site = "https://novelfull.me/";
        this.version = "1.0.0";
        this.icon = "src/en/novelfullme/icon.png";
        this.baseUrl = this.site;
    }
    NovelFull.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl, "popular?page=").concat(pageNo);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".book-item").each(function (idx, ele) {
                            var _a;
                            var novelName = loadedCheerio(ele).find(".title").text();
                            var novelCover = "https:" + loadedCheerio(ele).find("img").attr("data-src");
                            var novelUrl = _this.baseUrl +
                                ((_a = loadedCheerio(ele).find(".title a").attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
                            var novel = { name: novelName, cover: novelCover, url: novelUrl };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    NovelFull.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novel, chapters, chaptersUrl, chaptersRequest, chaptersHtml;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        url = novelUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
                            name: "",
                            cover: "",
                            author: "",
                            status: "",
                            genres: "",
                            summary: "",
                            chapters: [],
                        };
                        novel.name = loadedCheerio(".name h1").text().trim();
                        novel.cover =
                            "https:" + loadedCheerio(".img-cover img").attr("data-src");
                        novel.summary = loadedCheerio("body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.mt-1 > div.section.box.mt-1.summary > div.section-body > p.content")
                            .text()
                            .trim();
                        novel.author = "Unknown";
                        novel.status = (_a = loadedCheerio("body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(1) > a > span")
                            .text()) === null || _a === void 0 ? void 0 : _a.trim();
                        novel.genres = (_b = loadedCheerio("body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(2)")
                            .text()) === null || _b === void 0 ? void 0 : _b.replace("Genres :", "").replace(/[\s\n]+/g, " ").trim();
                        chapters = [];
                        chaptersUrl = novelUrl.replace(this.baseUrl, "https://novelfull.me/api/novels/") +
                            "/chapters?source=detail";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chaptersUrl)];
                    case 3:
                        chaptersRequest = _c.sent();
                        return [4 /*yield*/, chaptersRequest.text()];
                    case 4:
                        chaptersHtml = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(chaptersHtml);
                        loadedCheerio("li").each(function () {
                            var chapterName = loadedCheerio(this)
                                .find(".chapter-title")
                                .text()
                                .trim();
                            var releaseDate = loadedCheerio(this)
                                .find(".chapter-update")
                                .text()
                                .trim();
                            var chapterUrl = loadedCheerio(this).find("a").attr("href");
                            if (!chapterUrl)
                                return;
                            chapters.push({
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            });
                        });
                        novel.chapters = chapters.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    NovelFull.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = chapterUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio("#listen-chapter").remove();
                        loadedCheerio("#google_translate_element").remove();
                        chapterText = loadedCheerio(".chapter__content").html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    NovelFull.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl, "search?status=all&sort=views&q=").concat(searchTerm);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".book-item").each(function (idx, ele) {
                            var _a;
                            var novelName = loadedCheerio(ele).find(".title").text();
                            var novelCover = "https:" + loadedCheerio(ele).find("img").attr("data-src");
                            var novelUrl = _this.baseUrl +
                                ((_a = loadedCheerio(ele).find(".title a").attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
                            var novel = { name: novelName, cover: novelCover, url: novelUrl };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    NovelFull.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, fetch_1.fetchFile)(url)];
            });
        });
    };
    return NovelFull;
}());
exports.default = new NovelFull();
