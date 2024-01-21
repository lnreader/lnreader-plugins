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
var WuxiaWorld = /** @class */ (function () {
    function WuxiaWorld() {
        this.id = "wuxiaworld";
        this.name = "Wuxia World";
        this.icon = "src/en/wuxiaworld/icon.png";
        this.site = "https://www.wuxiaworld.com/";
        this.version = "0.5.0";
        this.baseUrl = this.site;
    }
    WuxiaWorld.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var link, result, data, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        link = "".concat(this.baseUrl, "api/novels");
                        return [4 /*yield*/, fetch(link)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        data = _a.sent();
                        novels = [];
                        data.items.map(function (novel) {
                            var name = novel.name;
                            var cover = novel.coverUrl;
                            var url = _this.baseUrl + "novel/" + novel.slug + "/";
                            novels.push({
                                name: name,
                                cover: cover,
                                url: url,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    WuxiaWorld.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novel, genres, chapter;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = novelUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
                            chapters: [],
                        };
                        novel.name = loadedCheerio("h1.line-clamp-2").text();
                        novel.cover = loadedCheerio("img.absolute").attr("src");
                        novel.summary = loadedCheerio("div.flex-col:nth-child(4) > div > div > span > span")
                            .text()
                            .trim();
                        novel.author = loadedCheerio("div.MuiGrid-container > div > div > div")
                            .filter(function () {
                            return loadedCheerio(this).text().trim() === "Author:";
                        })
                            .next()
                            .text();
                        genres = [];
                        loadedCheerio("a.MuiLink-underlineNone").each(function () {
                            genres.push(loadedCheerio(this).find("div > div").text());
                        });
                        novel.genres = genres.join(",");
                        novel.status = loadedCheerio("div.font-set-b10")
                            .text();
                        chapter = [];
                        loadedCheerio("div.border-b.border-gray-line-base").each(function (idx, ele) {
                            var _a;
                            var name = loadedCheerio(ele)
                                .find("a > div > div > div > span")
                                .text();
                            var releaseTime = loadedCheerio(ele)
                                .find("a > div > div > div > div > span")
                                .text();
                            var url = (_a = loadedCheerio(ele).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1);
                            url = "".concat(_this.baseUrl).concat(url);
                            chapter.push({ name: name, releaseTime: releaseTime, url: url });
                        });
                        novel.chapters = chapter;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    WuxiaWorld.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio(".chapter-nav").remove();
                        loadedCheerio("#chapter-content > script").remove();
                        chapterText = loadedCheerio("#chapter-content").html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    WuxiaWorld.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var searchUrl, url, result, data, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        searchUrl = "https://www.wuxiaworld.com/api/novels/search?query=";
                        url = "".concat(searchUrl).concat(searchTerm);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        data = _a.sent();
                        novels = [];
                        data.items.map(function (novel) {
                            var name = novel.name;
                            var cover = novel.coverUrl;
                            var url = _this.baseUrl + "novel/" + novel.slug + "/";
                            novels.push({
                                name: name,
                                url: url,
                                cover: cover,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    WuxiaWorld.prototype.fetchImage = function (url) {
        return (0, fetch_1.fetchFile)(url);
    };
    return WuxiaWorld;
}());
exports.default = new WuxiaWorld();
