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
var isAbsoluteUrl_1 = require("@libs/isAbsoluteUrl");
var HakoPlugin = /** @class */ (function () {
    function HakoPlugin() {
        this.id = "ln.hako";
        this.name = "Hako";
        this.icon = "src/vi/hakolightnovel/icon.png";
        this.site = "https://ln.hako.vn";
        this.version = "1.0.0";
        this.userAgent = "";
    }
    HakoPlugin.prototype.parseNovels = function (loadedCheerio) {
        var _this = this;
        var novels = [];
        loadedCheerio(".row > .thumb-item-flow").each(function (index, ele) {
            var url = loadedCheerio(ele)
                .find("div.thumb_attr.series-title > a")
                .attr("href");
            if (url && !(0, isAbsoluteUrl_1.isUrlAbsolute)(url)) {
                url = _this.site + url;
            }
            if (url) {
                var name_1 = loadedCheerio(ele)
                    .find(".series-title")
                    .text()
                    .trim();
                var cover = loadedCheerio(ele)
                    .find(".img-in-ratio")
                    .attr("data-bg");
                if (cover && !(0, isAbsoluteUrl_1.isUrlAbsolute)(cover)) {
                    cover = _this.site + cover;
                }
                var novel = { name: name_1, url: url, cover: cover };
                novels.push(novel);
            }
        });
        return novels;
    };
    HakoPlugin.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var link, result, body, loadedCheerio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        link = this.site +
                            "/danh-sach?truyendich=1&sapxep=topthang&page=" +
                            pageNo;
                        return [4 /*yield*/, fetch(link)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    HakoPlugin.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var novel, result, body, loadedCheerio, background, novelCover, chapters;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        novel = {
                            url: novelUrl,
                        };
                        return [4 /*yield*/, fetch(novelUrl)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel.name = loadedCheerio(".series-name").text();
                        background = loadedCheerio(".series-cover > .a6-ratio > div").attr("style") ||
                            "";
                        novelCover = background.substring(background.indexOf("http"), background.length - 2);
                        novel.cover = novelCover
                            ? (0, isAbsoluteUrl_1.isUrlAbsolute)(novelCover)
                                ? novelCover
                                : this.site + novelCover
                            : "";
                        novel.summary = loadedCheerio(".summary-content").text().trim();
                        novel.author = loadedCheerio("#mainpart > div:nth-child(2) > div > div:nth-child(1) > section > main > div.top-part > div > div.col-12.col-md-9 > div.series-information > div:nth-child(2) > span.info-value > a")
                            .text()
                            .trim();
                        novel.genres = loadedCheerio(".series-gernes")
                            .text()
                            .trim()
                            .replace(/ +/g, " ")
                            .split("\n")
                            .filter(function (e) { return e.trim(); })
                            .join(", ");
                        novel.status = loadedCheerio("#mainpart > div:nth-child(2) > div > div:nth-child(1) > section > main > div.top-part > div > div.col-12.col-md-9 > div.series-information > div:nth-child(4) > span.info-value > a")
                            .text()
                            .trim();
                        chapters = [];
                        loadedCheerio(".list-chapters li").each(function (index, ele) {
                            var chapterUrl = loadedCheerio(ele).find("a").attr("href");
                            if (chapterUrl && !(0, isAbsoluteUrl_1.isUrlAbsolute)(chapterUrl)) {
                                chapterUrl = _this.site + chapterUrl;
                            }
                            if (chapterUrl) {
                                var chapterName = loadedCheerio(ele)
                                    .find(".chapter-name")
                                    .text()
                                    .trim();
                                var releaseTime = loadedCheerio(ele)
                                    .find(".chapter-time")
                                    .text();
                                var chapter = {
                                    name: chapterName,
                                    releaseTime: releaseTime,
                                    url: chapterUrl,
                                };
                                chapters.push(chapter);
                            }
                        });
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    HakoPlugin.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetch(chapterUrl)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio("#chapter-content").html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    HakoPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site + "/tim-kiem?keywords=" + searchTerm;
                        return [4 /*yield*/, fetch(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    HakoPlugin.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        headers = {
                            Referer: "https://ln.hako.vn",
                        };
                        return [4 /*yield*/, (0, fetch_1.fetchFile)(url, { headers: headers })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return HakoPlugin;
}());
exports.default = new HakoPlugin();
