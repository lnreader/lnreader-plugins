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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var filterInputs_1 = require("@libs/filterInputs");
var defaultCover_1 = require("@libs/defaultCover");
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var dayjs_1 = __importDefault(require("dayjs"));
var RNRF = /** @class */ (function () {
    function RNRF() {
        this.id = "RNRF";
        this.name = "РанобэРФ";
        this.site = "https://ранобэ.рф";
        this.version = "1.0.0";
        this.icon = "src/ru/ranoberf/icon.png";
        this.userAgent = "";
        this.cookieString = "";
        this.fetchImage = fetch_1.fetchFile;
        this.filters = {
            sort: {
                label: "Сортировка",
                value: "",
                options: [
                    { label: "Рейтинг", value: "popular" },
                    { label: "Дате добавления", value: "new" },
                    { label: "Дате обновления", value: "lastPublishedChapter" },
                    { label: "Законченные", value: "completed" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    RNRF.prototype.popularNovels = function (pageNo, _a) {
        var _b, _c, _d, _e;
        var showLatestNovels = _a.showLatestNovels, filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, jsonRaw, json, novels;
            var _this = this;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        url = this.site + "/books?order=";
                        url += showLatestNovels
                            ? "lastPublishedChapter"
                            : ((_b = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _b === void 0 ? void 0 : _b.value) || "popular";
                        url += "&page=" + pageNo;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _f.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _f.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        jsonRaw = loadedCheerio("#__NEXT_DATA__").html();
                        json = JSON.parse(jsonRaw || "{}");
                        novels = [];
                        (_e = (_d = (_c = json.props.pageProps) === null || _c === void 0 ? void 0 : _c.totalData) === null || _d === void 0 ? void 0 : _d.items) === null || _e === void 0 ? void 0 : _e.forEach(function (novel) {
                            var _a;
                            return novels.push({
                                name: novel.title,
                                cover: ((_a = novel === null || novel === void 0 ? void 0 : novel.verticalImage) === null || _a === void 0 ? void 0 : _a.url)
                                    ? _this.site + novel.verticalImage.url
                                    : defaultCover_1.defaultCover,
                                url: _this.site + "/" + novel.slug,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    RNRF.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            var result, body, loadedCheerio, jsonRaw, book, novel, chapters;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(novelUrl)];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        jsonRaw = loadedCheerio("#__NEXT_DATA__").html();
                        book = JSON.parse(jsonRaw || "{}").props.pageProps.book;
                        novel = {
                            url: novelUrl,
                            name: book === null || book === void 0 ? void 0 : book.title,
                            cover: ((_a = book === null || book === void 0 ? void 0 : book.verticalImage) === null || _a === void 0 ? void 0 : _a.url)
                                ? this.site + book.verticalImage.url
                                : defaultCover_1.defaultCover,
                            summary: book === null || book === void 0 ? void 0 : book.description,
                            author: (book === null || book === void 0 ? void 0 : book.author) || "",
                            genres: book === null || book === void 0 ? void 0 : book.genres.map(function (item) { return item.title; }).join(", "),
                            status: (book === null || book === void 0 ? void 0 : book.additionalInfo.includes("Активен"))
                                ? novelStatus_1.NovelStatus.Ongoing
                                : novelStatus_1.NovelStatus.Completed,
                        };
                        chapters = [];
                        (_b = book === null || book === void 0 ? void 0 : book.chapters) === null || _b === void 0 ? void 0 : _b.forEach(function (chapter) {
                            if (!chapter.isDonate || chapter.isUserPaid) {
                                chapters.push({
                                    name: chapter.title,
                                    releaseTime: (0, dayjs_1.default)(chapter.publishedAt).format("LLL"),
                                    url: _this.site + chapter.url,
                                });
                            }
                        });
                        novel.chapters = chapters.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    RNRF.prototype.parseChapter = function (chapterUrl) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function () {
            var result, body, loadedCheerio, jsonRaw, json, baseUrl, chapterText;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl)];
                    case 1:
                        result = _d.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _d.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        jsonRaw = loadedCheerio("#__NEXT_DATA__").html();
                        json = JSON.parse(jsonRaw || "{}");
                        loadedCheerio = (0, cheerio_1.load)(((_c = (_b = (_a = json.props.pageProps) === null || _a === void 0 ? void 0 : _a.chapter) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.text) || "");
                        baseUrl = this.site;
                        loadedCheerio("img").each(function () {
                            var _a;
                            if (!((_a = loadedCheerio(this).attr("src")) === null || _a === void 0 ? void 0 : _a.startsWith("http"))) {
                                var src = loadedCheerio(this).attr("src");
                                loadedCheerio(this).attr("src", baseUrl + src);
                            }
                        });
                        chapterText = loadedCheerio.html();
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    RNRF.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "/v3/books?filter[or][0][title][like]=").concat(searchTerm, "&filter[or][1][titleEn][like]=").concat(searchTerm, "&filter[or][2][fullTitle][like]=").concat(searchTerm, "&filter[status][]=active&filter[status][]=abandoned&filter[status][]=completed&expand=verticalImage");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        body = (_a.sent());
                        novels = [];
                        body.items.forEach(function (novel) {
                            var _a;
                            return novels.push({
                                name: novel.title,
                                cover: ((_a = novel === null || novel === void 0 ? void 0 : novel.verticalImage) === null || _a === void 0 ? void 0 : _a.url)
                                    ? _this.site + novel.verticalImage.url
                                    : defaultCover_1.defaultCover,
                                url: _this.site + "/" + novel.slug,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return RNRF;
}());
exports.default = new RNRF();
