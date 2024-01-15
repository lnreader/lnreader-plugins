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
var WPmangaStreamPlugin = /** @class */ (function () {
    function WPmangaStreamPlugin(metadata) {
        this.fetchImage = fetch_1.fetchFile;
        this.id = metadata.id;
        this.name = metadata.sourceName + "[wpmangastream]";
        this.icon = "multisrc/wpmangastream/icons/".concat(metadata.id, ".png");
        this.site = metadata.sourceSite;
        this.version = "1.0.0";
        this.userAgent = "";
        this.options = metadata.options;
    }
    WPmangaStreamPlugin.prototype.popularNovels = function (page) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site + "series/?page=" + page + "&status=&order=popular";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("article.maindet").each(function () {
                            var name = loadedCheerio(this).find("h2").text();
                            var image = loadedCheerio(this).find("img");
                            var url = loadedCheerio(this).find("h2 a").attr("href");
                            if (!url)
                                return;
                            novels.push({
                                name: name,
                                cover: image.attr("data-src") || image.attr("src"),
                                url: url,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    WPmangaStreamPlugin.prototype.parseNovelAndChapters = function (url) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, novel, summary, i, p, chapters;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = { url: url };
                        // novel.url = url;
                        novel.name = loadedCheerio("h1.entry-title").text();
                        novel.cover =
                            loadedCheerio("img.wp-post-image").attr("data-src") ||
                                loadedCheerio("img.wp-post-image").attr("src");
                        novel.status = loadedCheerio("div.sertostat > span").attr("class");
                        loadedCheerio("div.serl > span").each(function () {
                            var detailName = loadedCheerio(this).text().trim();
                            var detail = loadedCheerio(this).next().text().trim();
                            switch (detailName) {
                                case "الكاتب":
                                case "Author":
                                case "Auteur":
                                    novel.author = detail;
                                    break;
                            }
                        });
                        novel.genres = loadedCheerio(".sertogenre")
                            .children("a")
                            .map(function (i, el) { return loadedCheerio(el).text(); })
                            .toArray()
                            .join(",");
                        summary = loadedCheerio(".sersys > p").siblings().remove("div").end();
                        novel.summary = "";
                        for (i = 0; i < summary.length; i++) {
                            p = summary[i];
                            novel.summary += loadedCheerio(p).text().trim() + "\\n\\n";
                        }
                        chapters = loadedCheerio(".eplister li")
                            .map(function (index, element) { return ({
                            name: loadedCheerio(element).find(".epl-num").text() +
                                loadedCheerio(element).find(".epl-title").text(),
                            releaseTime: loadedCheerio(element).find(".epl-date").text().trim(),
                            url: loadedCheerio(element).find("a").attr("href") || "",
                        }); })
                            .get()
                            .filter(function (chapter) { return chapter.name && chapter.url; });
                        if (((_a = this.options) === null || _a === void 0 ? void 0 : _a.reverseChapters) && chapters.length)
                            chapters.reverse();
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    WPmangaStreamPlugin.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio(".epcontent").html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    WPmangaStreamPlugin.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site + "?s=" + searchTerm;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("article.maindet").each(function () {
                            var name = loadedCheerio(this).find("h2").text();
                            var image = loadedCheerio(this).find("img");
                            var url = loadedCheerio(this).find("h2 a").attr("href");
                            if (!url)
                                return;
                            novels.push({
                                name: name,
                                cover: image.attr("data-src") || image.attr("src"),
                                url: url,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return WPmangaStreamPlugin;
}());
var plugin = new WPmangaStreamPlugin({ "id": "lightnovelfr", "sourceSite": "https://lightnovelfr.com/", "sourceName": "Ligh Novel FR", "options": { "lang": "French", "reverseChapters": true } });
exports.default = plugin;
