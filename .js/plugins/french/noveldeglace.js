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
var novelStatus_1 = require("@libs/novelStatus");
var NovelDeGlacePlugin = /** @class */ (function () {
    function NovelDeGlacePlugin() {
        this.id = "NDG.com";
        this.name = "NovelDeGlace";
        this.icon = "src/fr/noveldeglace/icon.png";
        this.site = "https://noveldeglace.com/";
        this.version = "1.0.0";
        this.userAgent = "''";
    }
    NovelDeGlacePlugin.prototype.popularNovels = function (page) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site + "roman";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: { 'Accept-Encoding': 'deflate' }, })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("article").each(function () {
                            var novelName = loadedCheerio(this).find("h2").text().trim();
                            var novelCover = loadedCheerio(this).find("img").attr("src");
                            var novelUrl = loadedCheerio(this).find("h2 > a").attr("href");
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
    ;
    NovelDeGlacePlugin.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novel, categorie, genres, status, novelChapters;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        url = novelUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: { 'Accept-Encoding': 'deflate' } })];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = { url: url };
                        novel.name = ((_b = (_a = loadedCheerio("div.entry-content > div > strong")[0].nextSibling) === null || _a === void 0 ? void 0 : _a.nodeValue) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                        novel.cover = loadedCheerio(".su-row > div > div > img").attr("src");
                        novel.summary = loadedCheerio("div[data-title=Synopsis]").text();
                        novel.author = loadedCheerio("strong:contains('Auteur :')").parent().text().replace("Auteur : ", "").trim();
                        categorie = loadedCheerio(".categorie")
                            .text()
                            .replace("Catégorie :", "")
                            .trim();
                        genres = loadedCheerio(".genre")
                            .text()
                            .replace("Genre :", "")
                            .replace(/, /g, ",")
                            .trim();
                        if (categorie && categorie != "Autre")
                            novel.genres = categorie;
                        if (genres)
                            novel.genres = novel.genres ? novel.genres + "," + genres : genres;
                        status = loadedCheerio("strong:contains('Statut :')").parent().attr("class");
                        switch (status) {
                            case "type etat0":
                                novel.status = novelStatus_1.NovelStatus.Ongoing;
                                break;
                            case "type etat1":
                                novel.status = novelStatus_1.NovelStatus.Ongoing;
                                break;
                            case "type etat4":
                                novel.status = novelStatus_1.NovelStatus.OnHiatus;
                                break;
                            case "type etat5":
                                novel.status = novelStatus_1.NovelStatus.Completed;
                                break;
                            case "type etat6":
                                novel.status = novelStatus_1.NovelStatus.Cancelled;
                                break;
                            default:
                                novel.status = novelStatus_1.NovelStatus.Unknown;
                                break;
                        }
                        novelChapters = [];
                        loadedCheerio(".chpt").each(function () {
                            var chapterName = loadedCheerio(this).find("a").text().trim();
                            var releaseDate = null;
                            var chapterUrl = loadedCheerio(this).find("a").attr("href");
                            if (!chapterUrl)
                                return;
                            var chapter = {
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            };
                            novelChapters.push(chapter);
                        });
                        novel.chapters = novelChapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    ;
    NovelDeGlacePlugin.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = chapterUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: { 'Accept-Encoding': 'deflate' } })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio(".mistape_caption").remove();
                        chapterText = loadedCheerio(".chapter-content").html() || "Chapitre introuvable";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    ;
    NovelDeGlacePlugin.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site + "roman";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: { 'Accept-Encoding': 'deflate' } })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("article").each(function () {
                            var novelName = loadedCheerio(this).find("h2").text().trim();
                            var novelCover = loadedCheerio(this).find("img").attr("src");
                            var novelUrl = loadedCheerio(this).find("h2 > a").attr("href");
                            if (!novelUrl)
                                return;
                            var novel = {
                                name: novelName,
                                cover: novelCover,
                                url: novelUrl,
                            };
                            novels.push(novel);
                        });
                        novels = novels.filter(function (novel) {
                            return novel.name.toLowerCase().includes(searchTerm.toLowerCase());
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    ;
    NovelDeGlacePlugin.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return NovelDeGlacePlugin;
}());
exports.default = new NovelDeGlacePlugin();
