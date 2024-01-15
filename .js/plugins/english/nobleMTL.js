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
var NobleMTL = /** @class */ (function () {
    function NobleMTL() {
        this.id = "noblemtl";
        this.name = "NobleMTL";
        this.icon = "src/en/noblemtl/icon.png";
        this.site = "https://noblemtl.com/";
        this.version = "1.0.0";
        this.userAgent = "";
        this.filters = {
            order: {
                label: "Sort By",
                type: filterInputs_1.FilterTypes.Picker,
                options: [
                    { label: "Default", value: "" },
                    { label: "A-Z", value: "title" },
                    { label: "Z-A", value: "titlereverse" },
                    { label: "Latest Update", value: "update" },
                    { label: "Latest Added", value: "latest" },
                    { label: "Popular", value: "popular" },
                ],
                value: "",
            },
            status: {
                label: "Status",
                options: [
                    { label: "All", value: "" },
                    { label: "Ongoing", value: "ongoing" },
                    { label: "Hiatus", value: "hiatus" },
                    { label: "Completed", value: "completed" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
                value: "",
            },
            type: {
                label: "Type",
                options: [
                    { label: "Chinese novel", value: "chinese-novel" },
                    { label: "habyeol", value: "habyeol" },
                    { label: "korean novel", value: "korean-novel" },
                    { label: "Web Novel", value: "web-novel" },
                    { label: "삼심", value: "%ec%82%bc%ec%8b%ac" },
                    { label: "호곡", value: "%ed%98%b8%ea%b3%a1" },
                ],
                type: filterInputs_1.FilterTypes.CheckboxGroup,
                value: [],
            },
            genres: {
                label: "Genres",
                value: [],
                options: [
                    { label: "A.I", value: "a.i" },
                    { label: "Academy", value: "academy" },
                    { label: "Action", value: "action" },
                    { label: "Adult", value: "adult" },
                    { label: "Adventure", value: "adventure" },
                    { label: "Alternative History", value: "alternative-history" },
                    { label: "Another World", value: "another-world" },
                    { label: "Apocalypse", value: "apocalypse" },
                    { label: "Bromance", value: "bromance" },
                    { label: "Comedy", value: "comedy" },
                    { label: "Dark fantasy", value: "dark-fantasy" },
                    { label: "Demons", value: "demons" },
                    { label: "Drama", value: "drama" },
                    { label: "Dystopia", value: "dystopia" },
                    { label: "Ecchi", value: "ecchi" },
                    { label: "Entertainment", value: "entertainment" },
                    { label: "Exhaustion", value: "exhaustion" },
                    { label: "Fanfiction", value: "fanfiction" },
                    { label: "fantasy", value: "fantasy" },
                    { label: "finance", value: "finance" },
                    { label: "Full color", value: "full-color" },
                    { label: "Game", value: "game" },
                    { label: "Gender Bender", value: "gender-bender" },
                    { label: "Genius", value: "genius" },
                    { label: "Harem", value: "harem" },
                    { label: "Hero", value: "hero" },
                    { label: "Historical", value: "historical" },
                    { label: "Hunter", value: "hunter" },
                    { label: "korean novel", value: "korean-novel" },
                    { label: "Light Novel", value: "light-novel" },
                    {
                        label: "List Adventure Manga Genres",
                        value: "list-adventure-manga-genres",
                    },
                    { label: "Long Strip", value: "long-strip" },
                    { label: "Love comedy", value: "love-comedy" },
                    { label: "magic", value: "magic" },
                    { label: "Manhua", value: "manhua" },
                    { label: "Martial Arts", value: "martial-arts" },
                    { label: "Mature", value: "mature" },
                    { label: "Medieval", value: "medieval" },
                    { label: "Misunderstanding", value: "misunderstanding" },
                    { label: "Modern", value: "modern" },
                    { label: "modern fantasy", value: "modern-fantasy" },
                    { label: "music", value: "music" },
                    { label: "Mystery", value: "mystery" },
                    { label: "Necromancy", value: "necromancy" },
                    { label: "No Romance", value: "no-romance" },
                    { label: "NTL", value: "ntl" },
                    { label: "o", value: "o" },
                    { label: "Obsession", value: "obsession" },
                    { label: "Politics", value: "politics" },
                    { label: "Possession", value: "possession" },
                    { label: "Programming", value: "programming" },
                    { label: "Psychological", value: "psychological" },
                    { label: "Pure Love", value: "pure-love" },
                    { label: "Redemption", value: "redemption" },
                    { label: "Regression", value: "regression" },
                    { label: "Regret", value: "regret" },
                    { label: "Reincarnation", value: "reincarnation" },
                    { label: "Revenge", value: "revenge" },
                    { label: "Romance", value: "romance" },
                    { label: "Romance Fanrasy", value: "romance-fanrasy" },
                    { label: "Salvation", value: "salvation" },
                    { label: "School Life", value: "school-life" },
                    { label: "Sci-fi", value: "sci-fi" },
                    { label: "Science fiction", value: "science-fiction" },
                    { label: "Seinen", value: "seinen" },
                    { label: "Shounen", value: "shounen" },
                    { label: "Slice of Life", value: "slice-of-life" },
                    { label: "Soft yandere", value: "soft-yandere" },
                    { label: "Sports", value: "sports" },
                    { label: "Supernatural", value: "supernatural" },
                    { label: "Survival", value: "survival" },
                    { label: "system", value: "system" },
                    { label: "Time limit", value: "time-limit" },
                    { label: "Tragedy", value: "tragedy" },
                    { label: "Transmigration", value: "transmigration" },
                    { label: "TS", value: "ts" },
                    { label: "Tsundere", value: "tsundere" },
                    { label: "Unique", value: "unique" },
                    { label: "Wholesome", value: "wholesome" },
                    { label: "Wuxia", value: "wuxia" },
                    { label: "Xuanhuan", value: "xuanhuan" },
                    { label: "Yandere", value: "yandere" },
                    { label: "Yuri", value: "yuri" },
                ],
                type: filterInputs_1.FilterTypes.CheckboxGroup,
            },
        };
    }
    NobleMTL.prototype.popularNovels = function (pageNo, _a) {
        var filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var link, headers, body, loadedCheerio, novels;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        link = "".concat(this.site, "series/?page=").concat(pageNo);
                        if (filters.genres.value.length)
                            link += filters.genres.value.map(function (i) { return "&genre[]=".concat(i); }).join("");
                        if (filters.type.value.length)
                            link += filters.type.value.map(function (i) { return "&lang[]=".concat(i); }).join("");
                        link += "&status=" + filters.status.value;
                        link += "&order=" + filters.order.value;
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link, { headers: headers }).then(function (result) {
                                return result.text();
                            })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("article.bs").each(function () {
                            var novelName = loadedCheerio(this).find(".ntitle").text().trim();
                            var image = loadedCheerio(this).find("img");
                            var novelCover = image.attr("data-src") || image.attr("src");
                            var novelUrl = loadedCheerio(this).find("a").attr("href");
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
    NobleMTL.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio, novel, chapter;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = novelUrl;
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
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
                        novel.name = loadedCheerio(".entry-title").text();
                        novel.cover =
                            loadedCheerio("img.wp-post-image").attr("data-src") ||
                                loadedCheerio("img.wp-post-image").attr("src");
                        loadedCheerio("div.spe > span").each(function () {
                            var detailName = loadedCheerio(this).find("b").text().trim();
                            var detail = loadedCheerio(this)
                                .find("b")
                                .remove()
                                .end()
                                .text()
                                .trim();
                            switch (detailName) {
                                case "Author:":
                                    novel.author = detail;
                                    break;
                                case "Status:":
                                    novel.status = detail;
                                    break;
                            }
                        });
                        novel.genres = loadedCheerio(".genxed")
                            .text()
                            .trim()
                            .replace(/\s/g, ",");
                        loadedCheerio('div[itemprop="description"]  h3,p.a,strong').remove();
                        novel.summary = loadedCheerio('div[itemprop="description"]')
                            .find("br")
                            .replaceWith("\n")
                            .end()
                            .text();
                        chapter = [];
                        loadedCheerio(".eplister")
                            .find("li")
                            .each(function () {
                            var chapterName = loadedCheerio(this).find(".epl-num").text() +
                                " - " +
                                loadedCheerio(this).find(".epl-title").text();
                            var releaseDate = loadedCheerio(this)
                                .find(".epl-date")
                                .text()
                                .trim();
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
    NobleMTL.prototype.parseChapter = function (chapterUrl) {
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
                        chapterText = loadedCheerio(".epcontent").html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    NobleMTL.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "?s=").concat(searchTerm);
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("article.bs").each(function () {
                            var novelName = loadedCheerio(this).find(".ntitle").text().trim();
                            var novelCover = loadedCheerio(this).find("img").attr("src");
                            var novelUrl = loadedCheerio(this).find("a").attr("href");
                            if (!novelUrl)
                                return;
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
    NobleMTL.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return NobleMTL;
}());
var Noble = new NobleMTL();
exports.default = new NobleMTL();
