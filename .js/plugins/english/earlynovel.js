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
var filterInputs_1 = require("@libs/filterInputs");
var EarlyNovelPlugin = /** @class */ (function () {
    function EarlyNovelPlugin() {
        this.id = "earlynovel";
        this.name = "Early Novel";
        this.version = "1.0.0";
        this.icon = "multisrc/madara/icons/latestnovel.png";
        this.site = "https://earlynovel.net/";
        this.filters = {
            order: {
                value: "/most-popular",
                label: "Order by",
                options: [
                    { label: "Latest Release", value: "/latest-release-novel" },
                    { label: "Hot Novel", value: "/hot-novel" },
                    { label: "Completed Novel", value: "/completed-novel" },
                    { label: "Most Popular", value: "/most-popular" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            genres: {
                value: "",
                label: "Genre",
                options: [
                    { label: "None", value: "" },
                    { label: "Action", value: "/genre/action-1" },
                    { label: "Adult", value: "/genre/adult-2" },
                    { label: "Adventure", value: "/genre/adventure-3" },
                    { label: "Comedy", value: "/genre/comedy-4" },
                    { label: "Drama", value: "/genre/drama-5" },
                    { label: "Ecchi", value: "/genre/ecchi-6" },
                    { label: "Fantasy", value: "/genre/fantasy-7" },
                    { label: "Gender Bender", value: "/genre/gender-bender-8" },
                    { label: "Harem", value: "/genre/harem-9" },
                    { label: "Historical", value: "/genre/historical-10" },
                    { label: "Horror", value: "/genre/horror-11" },
                    { label: "Josei", value: "/genre/josei-12" },
                    { label: "Martial Arts", value: "/genre/martial-arts-13" },
                    { label: "Mature", value: "/genre/mature-14" },
                    { label: "Mecha", value: "/genre/mecha-15" },
                    { label: "Mystery", value: "/genre/mystery-16" },
                    { label: "Psychological", value: "/genre/psychological-17" },
                    { label: "Romance", value: "/genre/romance-18" },
                    { label: "School Life", value: "/genre/school-life-19" },
                    { label: "Sci-fi", value: "/genre/sci-fi-20" },
                    { label: "Seinen", value: "/genre/seinen-21" },
                    { label: "Shoujo", value: "/genre/shoujo-22" },
                    { label: "Shoujo Ai", value: "/genre/shoujo-ai-23" },
                    { label: "Shounen", value: "/genre/shounen-24" },
                    { label: "Shounen Ai", value: "/genre/shounen-ai-25" },
                    { label: "Slice of Life", value: "/genre/slice-of-life-26" },
                    { label: "Smut", value: "/genre/smut-27" },
                    { label: "Sports", value: "/genre/sports-28" },
                    { label: "Supernatural", value: "/genre/supernatural-29" },
                    { label: "Tragedy", value: "/genre/tragedy-30" },
                    { label: "Wuxia", value: "/genre/wuxia-31" },
                    { label: "Xianxia", value: "/genre/xianxia-32" },
                    { label: "Xuanhuan", value: "/genre/xuanhuan-33" },
                    { label: "Yaoi", value: "/genre/yaoi-34" },
                    { label: "Yuri", value: "/genre/yuri-35" },
                    { label: "Video Games", value: "/genre/video-games-36" },
                    { label: "Magical Realism", value: "/genre/magical-realism-37" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    EarlyNovelPlugin.prototype.parseNovels = function (loadedCheerio) {
        var _this = this;
        var novels = [];
        loadedCheerio(".col-truyen-main > .list-truyen > .row").each(function (i, el) {
            var nUrl = loadedCheerio(el).find("h3.truyen-title > a").attr("href");
            var novelUrl = _this.site + nUrl;
            var novelName = loadedCheerio(el)
                .find("h3.truyen-title > a")
                .text();
            var novelCover = loadedCheerio(el).find("img.cover").attr("src");
            console.log(novelCover);
            if (!nUrl)
                return;
            novels.push({
                url: novelUrl,
                name: novelName,
                cover: novelCover,
            });
        });
        return novels;
    };
    ;
    EarlyNovelPlugin.prototype.popularNovels = function (pageNo, _a) {
        var filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var link, headers, body, loadedCheerio;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        link = this.site;
                        if (filters.genres.value.length)
                            link += filters.genres.value;
                        else
                            link += filters.order.value;
                        link += "?page=".concat(pageNo);
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link, { headers: headers }).then(function (result) {
                                return result.text();
                            })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    EarlyNovelPlugin.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio, novel, delay, lastPageStr, lastPage, getChapters, _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        url = novelUrl;
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
                            chapters: [],
                        };
                        novel.name = loadedCheerio(".book > img").attr("alt");
                        novel.cover = loadedCheerio(".book > img").attr("src");
                        novel.summary = loadedCheerio(".desc-text").text().trim();
                        loadedCheerio(".info > div > h3").each(function () {
                            var detailName = loadedCheerio(this).text();
                            var detail = loadedCheerio(this)
                                .siblings()
                                .map(function (i, el) { return loadedCheerio(el).text(); })
                                .toArray()
                                .join(",");
                            switch (detailName) {
                                case "Author:":
                                    novel.author = detail;
                                    break;
                                case "Status:":
                                    novel.status = detail;
                                    break;
                                case "Genre:":
                                    novel.genres = detail;
                                    break;
                            }
                        });
                        delay = function (ms) { return new Promise(function (res) { return setTimeout(res, ms); }); };
                        lastPageStr = (_a = loadedCheerio('a:contains("Last ")')
                            .attr("title")) === null || _a === void 0 ? void 0 : _a.match(/(\d+)/g);
                        lastPage = Number((lastPageStr === null || lastPageStr === void 0 ? void 0 : lastPageStr[1]) || "0");
                        getChapters = function () { return __awaiter(_this, void 0, void 0, function () {
                            var chapter, i, chaptersUrl, data, chapters;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        chapter = [];
                                        i = 1;
                                        _a.label = 1;
                                    case 1:
                                        if (!(i <= lastPage)) return [3 /*break*/, 6];
                                        chaptersUrl = "".concat(novelUrl, "?page=").concat(i);
                                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chaptersUrl, { headers: headers })];
                                    case 2:
                                        data = _a.sent();
                                        return [4 /*yield*/, data.text()];
                                    case 3:
                                        chapters = _a.sent();
                                        loadedCheerio = (0, cheerio_1.load)(chapters);
                                        loadedCheerio("ul.list-chapter > li").each(function (i, el) {
                                            var _a;
                                            var chapterName = loadedCheerio(el)
                                                .find(".chapter-text")
                                                .text()
                                                .trim();
                                            var releaseDate = null;
                                            var cUrl = (_a = loadedCheerio(el)
                                                .find("a")
                                                .attr("href")) === null || _a === void 0 ? void 0 : _a.slice(1);
                                            if (!cUrl)
                                                return;
                                            var chapterUrl = _this.site + cUrl;
                                            chapter.push({
                                                name: chapterName,
                                                releaseTime: releaseDate,
                                                url: chapterUrl,
                                            });
                                        });
                                        return [4 /*yield*/, delay(1000)];
                                    case 4:
                                        _a.sent();
                                        _a.label = 5;
                                    case 5:
                                        i++;
                                        return [3 /*break*/, 1];
                                    case 6: return [2 /*return*/, chapter];
                                }
                            });
                        }); };
                        _b = novel;
                        return [4 /*yield*/, getChapters()];
                    case 3:
                        _b.chapters = _c.sent();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    ;
    EarlyNovelPlugin.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var headers, result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl, { headers: headers })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio("#chapter-c").html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    ;
    EarlyNovelPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "search?keyword=").concat(searchTerm);
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
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
    ;
    EarlyNovelPlugin.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return EarlyNovelPlugin;
}());
exports.default = new EarlyNovelPlugin();
