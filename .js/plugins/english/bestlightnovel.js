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
var defaultCover_1 = require("@libs/defaultCover");
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var BLN = /** @class */ (function () {
    function BLN() {
        this.id = "BLN.com";
        this.name = "BestLightNovel";
        this.icon = "src/en/bestlightnovel/icon.png";
        this.site = "https://bestlightnovel.com/";
        this.version = "1.0.0";
        this.userAgent = "";
    }
    BLN.prototype.popularNovels = function (pageNo, options) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, _a, _b, body, loadedCheerio, novels;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        url = this.site +
                            "novel_list?type=topview&category=all&state=all&page=1" +
                            pageNo;
                        return [4 /*yield*/, fetch(url)];
                    case 1:
                        result = _c.sent();
                        if (!!result.ok) return [3 /*break*/, 3];
                        _b = (_a = console).error;
                        return [4 /*yield*/, result.text()];
                    case 2:
                        _b.apply(_a, [_c.sent()]);
                        // TODO: Cloudflare protection or other error
                        return [2 /*return*/, []];
                    case 3: return [4 /*yield*/, result.text()];
                    case 4:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".update_item.list_category").each(function () {
                            var novelName = loadedCheerio(this).find("h3 > a").text();
                            var novelCover = loadedCheerio(this).find("img").attr("src");
                            var novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
                            if (!novelUrl) {
                                // TODO: Handle error
                                console.error("No novel url!");
                                return;
                            }
                            var novel = {
                                name: novelName,
                                url: novelUrl,
                                cover: novelCover,
                            };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    BLN.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function () {
            var url, result, _d, _e, body, loadedCheerio, novel, status, novelChapters;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        url = novelUrl;
                        return [4 /*yield*/, fetch(url)];
                    case 1:
                        result = _f.sent();
                        if (!!result.ok) return [3 /*break*/, 3];
                        _e = (_d = console).error;
                        return [4 /*yield*/, result.text()];
                    case 2:
                        _e.apply(_d, [_f.sent()]);
                        // TODO: Cloudflare protection
                        return [2 /*return*/, { url: url, chapters: [] }];
                    case 3: return [4 /*yield*/, result.text()];
                    case 4:
                        body = _f.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
                            name: "",
                            cover: "",
                            author: "",
                            status: novelStatus_1.NovelStatus.Unknown,
                            genres: "",
                            summary: "",
                            chapters: [],
                        };
                        novel.name = loadedCheerio(".truyen_info_right  h1").text().trim();
                        novel.cover =
                            loadedCheerio(".info_image img").attr("src") || defaultCover_1.defaultCover;
                        novel.summary = (_a = loadedCheerio("#noidungm").text()) === null || _a === void 0 ? void 0 : _a.trim();
                        novel.author = (_b = loadedCheerio("#main_body > div.cotgiua > div.truyen_info_wrapper > div.truyen_info > div.entry-header > div.truyen_if_wrap > ul > li:nth-child(2) > a")
                            .text()) === null || _b === void 0 ? void 0 : _b.trim();
                        status = (_c = loadedCheerio("#main_body > div.cotgiua > div.truyen_info_wrapper > div.truyen_info > div.entry-header > div.truyen_if_wrap > ul > li:nth-child(4) > a")
                            .text()) === null || _c === void 0 ? void 0 : _c.trim();
                        novel.status =
                            status === "ONGOING"
                                ? novelStatus_1.NovelStatus.Ongoing
                                : status === "COMPLETED"
                                    ? novelStatus_1.NovelStatus.Completed
                                    : novelStatus_1.NovelStatus.Unknown;
                        novelChapters = [];
                        loadedCheerio(".chapter-list div.row").each(function () {
                            var chapterName = loadedCheerio(this).find("a").text().trim();
                            var releaseDate = loadedCheerio(this)
                                .find("span:nth-child(2)")
                                .text()
                                .trim();
                            var chapterUrl = loadedCheerio(this).find("a").attr("href");
                            if (!chapterUrl) {
                                // TODO: Handle error
                                console.error("No chapter url!");
                                return;
                            }
                            novelChapters.push({
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            });
                        });
                        novel.chapters = novelChapters.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    BLN.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = chapterUrl;
                        return [4 /*yield*/, fetch(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio("#vung_doc").html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    BLN.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "search_novels/").concat(searchTerm);
                        return [4 /*yield*/, fetch(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".update_item.list_category").each(function () {
                            var novelName = loadedCheerio(this).find("h3 > a").text();
                            var novelCover = loadedCheerio(this).find("img").attr("src");
                            var novelUrl = loadedCheerio(this).find("h3 > a").attr("href");
                            if (!novelUrl) {
                                // TODO: Handle error
                                console.error("No novel url!");
                                return;
                            }
                            var novel = { name: novelName, cover: novelCover, url: novelUrl };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    BLN.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return BLN;
}());
exports.default = new BLN();
