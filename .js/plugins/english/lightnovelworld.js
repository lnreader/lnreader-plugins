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
var LightNovelWorld = /** @class */ (function () {
    function LightNovelWorld() {
        this.id = "lightnovelworld";
        this.name = "LightNovelWorld";
        this.site = "https://www.webnovelworld.org/";
        this.version = "1.0.0";
        this.icon = "src/en/lightnovelworld/icon.png";
        this.baseUrl = this.site;
        this.headers = {
            Accept: "application/json",
            "Content-Type": "application/json",
        };
    }
    LightNovelWorld.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl, "browse/all/popular/all/").concat(pageNo);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".novel-item.ads").remove();
                        loadedCheerio(".novel-item").each(function (idx, ele) {
                            var _a;
                            var novelName = loadedCheerio(ele)
                                .find(".novel-title")
                                .text()
                                .trim();
                            var novelCover = loadedCheerio(ele).find("img").attr("data-src");
                            var novelUrl = _this.baseUrl +
                                ((_a = loadedCheerio(ele)
                                    .find(".novel-title > a")
                                    .attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
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
    LightNovelWorld.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novel, delay, chapterListUrl, chapterListBody, loadedChapterList, lastNumber, lastChapterUrl, chapterUrlPrefix, chapters, i;
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
                        delay = function (ms) { return new Promise(function (res) { return setTimeout(res, ms); }); };
                        return [4 /*yield*/, delay(1000)];
                    case 2:
                        _b.sent();
                        chapterListUrl = novelUrl + '/chapters?chorder=desc';
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterListUrl).then(function (r) { return r.text(); })];
                    case 3:
                        chapterListBody = _b.sent();
                        loadedChapterList = (0, cheerio_1.load)(chapterListBody);
                        lastNumber = parseInt((_a = loadedChapterList('ul.chapter-list > li:nth-child(1)').attr('data-chapterno')) !== null && _a !== void 0 ? _a : '0');
                        lastChapterUrl = loadedChapterList('ul.chapter-list > li:nth-child(1) > a').attr('href');
                        if (lastChapterUrl) {
                            chapterUrlPrefix = this.baseUrl + lastChapterUrl.split('/').slice(1, -1).join('/');
                            chapters = [];
                            for (i = 1; i <= lastNumber; i++) {
                                chapters.push({
                                    chapterNumber: i,
                                    name: 'Chapter ' + i,
                                    url: chapterUrlPrefix + '/chapter-' + i,
                                });
                            }
                            novel.chapters = chapters;
                        }
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    LightNovelWorld.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl).then(function (r) { return r.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio("#chapter-container").html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    LightNovelWorld.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, link, response, token, verifytoken, formData, body, loadedCheerio, novels, results;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl, "lnsearchlive");
                        link = "".concat(this.baseUrl, "search");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link).then(function (r) { return r.text(); })];
                    case 1:
                        response = _a.sent();
                        token = (0, cheerio_1.load)(response);
                        verifytoken = token("#novelSearchForm > input").attr("value");
                        formData = new FormData();
                        formData.append("inputContent", searchTerm);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                method: "POST",
                                headers: { LNRequestVerifyToken: verifytoken },
                                body: formData,
                            }).then(function (r) { return r.text(); })];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        results = JSON.parse(loadedCheerio("body").text());
                        loadedCheerio = (0, cheerio_1.load)(results.resultview);
                        loadedCheerio(".novel-item").each(function (idx, ele) {
                            var _a;
                            var novelName = loadedCheerio(ele)
                                .find("h4.novel-title")
                                .text()
                                .trim();
                            var novelCover = loadedCheerio(ele).find("img").attr("src");
                            var novelUrl = _this.baseUrl + ((_a = loadedCheerio(ele).find("a").attr("href")) === null || _a === void 0 ? void 0 : _a.substring(1));
                            novels.push({
                                name: novelName,
                                url: novelUrl,
                                cover: novelCover,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    LightNovelWorld.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, fetch_1.fetchFile)(url, { headers: this.headers })];
            });
        });
    };
    return LightNovelWorld;
}());
exports.default = new LightNovelWorld();
