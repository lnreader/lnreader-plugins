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
var NovelHall = /** @class */ (function () {
    function NovelHall() {
        this.id = "novelhall";
        this.name = "Novel Hall";
        this.version = "1.0.0";
        this.icon = "src/en/novelhall/icon.png";
        this.site = "https://novelhall.com/";
        this.baseUrl = this.site;
    }
    NovelHall.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl, "all2022-").concat(pageNo, ".html");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("li.btm").each(function (idx, ele) {
                            var novelName = loadedCheerio(ele).text().trim();
                            var novelUrl = _this.baseUrl + loadedCheerio(ele).find("a").attr("href");
                            var novel = {
                                name: novelName,
                                url: novelUrl,
                            };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    NovelHall.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novel, chapter;
            var _this = this;
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
                        novel.name = loadedCheerio(".booknav2 > h1").text();
                        novel.cover = loadedCheerio('meta[property="og:image"]').attr("content");
                        novel.summary = loadedCheerio(".navtxt").text().trim();
                        novel.author = loadedCheerio('p:contains("Author")')
                            .text()
                            .replace("Author：", "")
                            .trim();
                        novel.status = loadedCheerio('p:contains("Status")')
                            .text()
                            .replace("Status：", "")
                            .replace("Active", "Ongoing")
                            .trim();
                        novel.genres = (_a = loadedCheerio('p:contains("Genre")')
                            .text()) === null || _a === void 0 ? void 0 : _a.replace("Genre：", "").trim();
                        chapter = [];
                        loadedCheerio("#morelist ul > li").each(function (idx, ele) {
                            var chapterName = loadedCheerio(ele).find("a").text().trim();
                            var releaseDate = null;
                            var chapterUrl = _this.baseUrl + loadedCheerio(ele).find("a").attr("href");
                            chapter.push({
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            });
                        });
                        novel.chapters = chapter;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    NovelHall.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio(".content").html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    NovelHall.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl, "index.php?s=so&module=book&keyword=").concat(searchTerm);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("#article_list_content > li").each(function (idx, ele) {
                            var _a;
                            var novelName = loadedCheerio(ele)
                                .find("h3")
                                .text()
                                .replace(/\t+/g, "")
                                .replace(/\n/g, " ");
                            var novelCover = loadedCheerio(ele).find("img").attr("data-src");
                            var novelUrl = _this.baseUrl + ((_a = loadedCheerio(ele).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1));
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
    NovelHall.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, fetch_1.fetchFile)(url)];
            });
        });
    };
    return NovelHall;
}());
exports.default = new NovelHall();
