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
var NitroManga = /** @class */ (function () {
    function NitroManga() {
        this.id = "nitromanga";
        this.name = "Nitro Manga";
        this.version = "1.0.0";
        this.icon = "src/en/nitromanga/icon.png";
        this.site = "https://nitromanga.com/";
        this.baseUrl = this.site;
    }
    NitroManga.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.baseUrl + "mangas-genre/novel/?m_orderby=trending";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".page-item-detail").each(function () {
                            var novelName = loadedCheerio(this).find("h3 > a").text();
                            var novelCover = loadedCheerio(this).find("img").attr("data-src");
                            var novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
                            if (!novelUrl)
                                return;
                            var novel = {
                                name: novelName,
                                cover: novelCover,
                                url: novelUrl,
                            };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    NitroManga.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novel, chapter, chapterlisturl, data, text;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        url = novelUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (r) { return r.text(); })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
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
                            .map(function (i, el) { return loadedCheerio(el).text(); })
                            .toArray()
                            .join(",");
                        loadedCheerio(".post-content_item").each(function () {
                            var detailName = loadedCheerio(this)
                                .find(".summary-heading")
                                .text()
                                .trim();
                            var detail = loadedCheerio(this)
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
                        chapter = [];
                        chapterlisturl = novelUrl + "ajax/chapters/";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterlisturl, { method: "POST" })];
                    case 2:
                        data = _b.sent();
                        return [4 /*yield*/, data.text()];
                    case 3:
                        text = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(text);
                        loadedCheerio(".wp-manga-chapter").each(function () {
                            var chapterName = loadedCheerio(this).find("a").text().trim();
                            var releaseDate = loadedCheerio(this).find("span").text().trim();
                            var chapterUrl = loadedCheerio(this).find("a").attr("href");
                            if (!chapterUrl)
                                return;
                            chapter.push({
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            });
                        });
                        novel.chapters = chapter.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    NitroManga.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio(".text-left").html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    NitroManga.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.baseUrl + '?s=' + searchTerm + '&post_type=wp-manga&genre%5B%5D=novel';
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".c-tabs-item__content").each(function () {
                            var novelName = loadedCheerio(this).find("h3 > a").text();
                            var novelCover = loadedCheerio(this).find("img").attr("data-src");
                            var novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
                            if (!novelUrl)
                                return;
                            var novel = {
                                name: novelName,
                                cover: novelCover,
                                url: novelUrl,
                            };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    NitroManga.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, fetch_1.fetchFile)(url)];
            });
        });
    };
    return NitroManga;
}());
exports.default = new NitroManga();
