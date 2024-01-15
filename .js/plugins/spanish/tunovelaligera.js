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
var showToast_1 = require("@libs/showToast");
var defaultCover_1 = require("@libs/defaultCover");
var novelStatus_1 = require("@libs/novelStatus");
var TuNovelaLigera = /** @class */ (function () {
    function TuNovelaLigera() {
        this.id = "tunovelaligera";
        this.name = "TuNovelaLigera";
        this.icon = "src/es/tunovelaligera/icon.png";
        this.site = "https://tunovelaligera.com/";
        this.version = "1.0.0";
        this.userAgent = "";
        this.filters = {
            order: {
                value: "?m_orderby=rating",
                label: "Ordenado por",
                options: [
                    { label: "Lo mas reciente", value: "?m_orderby=latest" },
                    { label: "A-Z", value: "?m_orderby=alphabet" },
                    { label: "Clasificación", value: "?m_orderby=rating" },
                    { label: "Trending", value: "?m_orderby=trending" },
                    { label: "Mas visto", value: "?m_orderby=views" },
                    { label: "Nuevo", value: "?m_orderby=new-manga" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            genres: {
                value: "",
                label: "Generos",
                options: [
                    { label: "None", value: "" },
                    { label: "Acción", value: "accion" },
                    { label: "Adulto", value: "adulto" },
                    { label: "Artes Marciales", value: "artes-marciales" },
                    { label: "Aventura", value: "aventura" },
                    { label: "Ciencia Ficción", value: "ciencia-ficcion" },
                    { label: "Comedia", value: "comedia" },
                    { label: "Deportes", value: "deportes" },
                    { label: "Drama", value: "drama" },
                    { label: "Eastern Fantasy", value: "eastern-fantasy" },
                    { label: "Ecchi", value: "ecchi" },
                    { label: "FanFiction", value: "fan-fiction" },
                    { label: "Fantasía", value: "fantasia" },
                    { label: "Fantasía oriental", value: "fantasia-oriental" },
                    { label: "Ficción Romántica", value: "ficcion-romantica" },
                    { label: "Gender Bender", value: "gender-bender" },
                    { label: "Harem", value: "harem" },
                    { label: "Histórico", value: "historico" },
                    { label: "Horror", value: "horror" },
                    { label: "Josei", value: "josei" },
                    { label: "Maduro", value: "maduro" },
                    { label: "Mecha", value: "mecha" },
                    { label: "Misterio", value: "misterio" },
                    { label: "Novela China", value: "novela-china" },
                    { label: "Novela FanFiction", value: "novela-fanfiction" },
                    { label: "Novela Japonesa", value: "novela-japonesa" },
                    { label: "Novela Koreana", value: "novela-koreana" },
                    { label: "Novela ligera", value: "novela-ligera" },
                    { label: "Novela original", value: "novela-original" },
                    { label: "Novela Web", value: "web-novel" },
                    { label: "Psicológico", value: "psicologico" },
                    { label: "Realismo Mágico", value: "realismo-magico" },
                    { label: "Recuento de vida", value: "recuento-de-vida" },
                    { label: "Romance", value: "romance" },
                    {
                        label: "Romance contemporáneo",
                        value: "romance-contemporaneo",
                    },
                    { label: "Romance Moderno", value: "romance-moderno" },
                    { label: "Seinen", value: "seinen" },
                    { label: "Shoujo", value: "shoujo" },
                    { label: "Shounen", value: "shounen" },
                    { label: "Sobrenatural", value: "sobrenatural" },
                    { label: "Tragedia", value: "tragedia" },
                    { label: "Vampiros", value: "vampiros" },
                    { label: "Vida Escolar", value: "vida-escolar" },
                    { label: "Western Fantasy", value: "western-fantasy" },
                    { label: "Wuxia", value: "wuxia" },
                    { label: "Xianxia", value: "xianxia" },
                    { label: "Xuanhuan", value: "xuanhuan" },
                    { label: "Yaoi", value: "yaoi" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    TuNovelaLigera.prototype.popularNovels = function (pageNo, _a) {
        var filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var link, headers, result, body, loadedCheerio, novels;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        link = "".concat(this.site);
                        link += filters.genres ? "genero/" + filters.genres : "novelas";
                        link += "/page/".concat(pageNo);
                        link += filters.order;
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link, { headers: headers })];
                    case 1:
                        result = _b.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".page-item-detail").each(function (i, el) {
                            var novelName = loadedCheerio(el).find(".h5 > a").text();
                            var novelCover = loadedCheerio(el).find("img").attr("src");
                            var novelUrl = loadedCheerio(el).find(".h5 > a").attr("href");
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
    TuNovelaLigera.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio, novel, novelCover, chapter, delay, lastPage, getChapters, getPageChapters, _a, _b;
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
                        loadedCheerio(".manga-title-badges").remove();
                        novel.name = loadedCheerio(".post-title > h1").text().trim();
                        novelCover = loadedCheerio(".summary_image > a > img");
                        novel.cover =
                            novelCover.attr("data-src") ||
                                novelCover.attr("src") ||
                                novelCover.attr("data-cfsrc") ||
                                defaultCover_1.defaultCover;
                        loadedCheerio(".post-content_item").each(function () {
                            var detailName = loadedCheerio(this)
                                .find(".summary-heading > h5")
                                .text()
                                .trim();
                            var detail = loadedCheerio(this)
                                .find(".summary-content")
                                .text()
                                .trim();
                            switch (detailName) {
                                case "Generos":
                                    novel.genres = detail.replace(/, /g, ",");
                                    break;
                                case "Autores":
                                    novel.author = detail;
                                    break;
                                case "Estado":
                                    novel.status =
                                        detail.includes("OnGoing") ||
                                            detail.includes("Updating")
                                            ? novelStatus_1.NovelStatus.Ongoing
                                            : novelStatus_1.NovelStatus.Completed;
                                    break;
                            }
                        });
                        novel.summary = loadedCheerio("div.summary__content > p").text().trim();
                        chapter = [];
                        delay = function (ms) { return new Promise(function (res) { return setTimeout(res, ms); }); };
                        lastPage = 1;
                        lastPage = +loadedCheerio(".lcp_paginator li:last").prev().text();
                        getChapters = function () { return __awaiter(_this, void 0, void 0, function () {
                            var n, novelName, formData, result, text;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        n = url.split("/");
                                        novelName = n[4];
                                        (0, showToast_1.showToast)("Cargando desde Archivo...");
                                        formData = new FormData();
                                        formData.append("action", "madara_load_more");
                                        formData.append("page", "0");
                                        formData.append("template", "html/loop/content");
                                        formData.append("vars[category_name]", novelName);
                                        formData.append("vars[posts_per_page]", "10000");
                                        return [4 /*yield*/, (0, fetch_1.fetchApi)("".concat(this.site, "wp-admin/admin-ajax.php"), {
                                                method: "POST",
                                                body: formData,
                                                headers: headers,
                                            })];
                                    case 1:
                                        result = _a.sent();
                                        return [4 /*yield*/, result.text()];
                                    case 2:
                                        text = _a.sent();
                                        loadedCheerio = (0, cheerio_1.load)(text);
                                        loadedCheerio(".heading").each(function (i, el) {
                                            var chapterName = loadedCheerio(el)
                                                .text()
                                                .replace(/[\t\n]/g, "")
                                                .trim();
                                            var releaseDate = null;
                                            var chapterUrl = loadedCheerio(el).find("a").attr("href") || "";
                                            chapter.push({
                                                name: chapterName,
                                                url: chapterUrl,
                                                releaseTime: releaseDate,
                                            });
                                        });
                                        return [2 /*return*/, chapter.reverse()];
                                }
                            });
                        }); };
                        getPageChapters = function () { return __awaiter(_this, void 0, void 0, function () {
                            var _loop_1, i;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _loop_1 = function (i) {
                                            var chaptersUrl, result_1, chaptersHTML, chapterCheerio;
                                            return __generator(this, function (_b) {
                                                switch (_b.label) {
                                                    case 0:
                                                        chaptersUrl = "".concat(novelUrl, "?lcp_page0=").concat(i);
                                                        (0, showToast_1.showToast)("Cargando desde la p\u00E1gina ".concat(i, "/").concat(lastPage, "..."));
                                                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chaptersUrl, { headers: headers })];
                                                    case 1:
                                                        result_1 = _b.sent();
                                                        return [4 /*yield*/, result_1.text()];
                                                    case 2:
                                                        chaptersHTML = _b.sent();
                                                        chapterCheerio = (0, cheerio_1.load)(chaptersHTML);
                                                        chapterCheerio(".lcp_catlist li").each(function (i, el) {
                                                            var chapterName = chapterCheerio(el)
                                                                .find("a")
                                                                .text()
                                                                .replace(/[\t\n]/g, "")
                                                                .trim();
                                                            var releaseDate = chapterCheerio(el)
                                                                .find("span")
                                                                .text()
                                                                .trim();
                                                            var chapterUrl = chapterCheerio(el).find("a").attr("href") || "";
                                                            chapter.push({
                                                                name: chapterName,
                                                                releaseTime: releaseDate,
                                                                url: chapterUrl,
                                                            });
                                                        });
                                                        return [4 /*yield*/, delay(1000)];
                                                    case 3:
                                                        _b.sent();
                                                        return [2 /*return*/];
                                                }
                                            });
                                        };
                                        i = 1;
                                        _a.label = 1;
                                    case 1:
                                        if (!(i <= lastPage)) return [3 /*break*/, 4];
                                        return [5 /*yield**/, _loop_1(i)];
                                    case 2:
                                        _a.sent();
                                        _a.label = 3;
                                    case 3:
                                        i++;
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/, chapter.reverse()];
                                }
                            });
                        }); };
                        _a = novel;
                        return [4 /*yield*/, getChapters()];
                    case 3:
                        _a.chapters = _c.sent();
                        if (!!novel.chapters.length) return [3 /*break*/, 6];
                        (0, showToast_1.showToast)("¡Archivo no encontrado!");
                        return [4 /*yield*/, delay(1000)];
                    case 4:
                        _c.sent();
                        _b = novel;
                        return [4 /*yield*/, getPageChapters()];
                    case 5:
                        _b.chapters = _c.sent();
                        _c.label = 6;
                    case 6: return [2 /*return*/, novel];
                }
            });
        });
    };
    TuNovelaLigera.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var headers, result, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio("#hola_siguiente").next().find("div").remove();
                        chapterText = loadedCheerio("#hola_siguiente").next().html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    TuNovelaLigera.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "?s=").concat(searchTerm, "&post_type=wp-manga");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".c-tabs-item__content").each(function (i, el) {
                            var novelName = loadedCheerio(el).find(".h4 > a").text();
                            var novelCover = loadedCheerio(el).find("img").attr("src");
                            var novelUrl = loadedCheerio(el).find(".h4 > a").attr("href");
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
    TuNovelaLigera.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return TuNovelaLigera;
}());
exports.default = new TuNovelaLigera();
