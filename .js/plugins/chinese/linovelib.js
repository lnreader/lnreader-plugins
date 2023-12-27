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
var Linovelib = /** @class */ (function () {
    function Linovelib() {
        this.id = "linovelib";
        this.name = "Linovelib";
        this.icon = "src/cn/linovelib/icon.png";
        this.site = "https://w.linovelib.com";
        this.version = "1.0.0";
        this.userAgent = "";
        this.cookieString = "";
        this.filters = {
            sort: {
                label: "Sort By",
                value: "monthvisit",
                options: [
                    { label: "月点击榜", value: "monthvisit" },
                    { label: "周点击榜", value: "weekvisit" },
                    { label: "月推荐榜", value: "monthvote" },
                    { label: "周推荐榜", value: "weekvote" },
                    { label: "月鲜花榜", value: "monthflower" },
                    { label: "周鲜花榜", value: "weekflower" },
                    { label: "月鸡蛋榜", value: "monthegg" },
                    { label: "周鸡蛋榜", value: "weekegg" },
                    { label: "最近更新", value: "lastupdate" },
                    { label: "最新入库", value: "postdate" },
                    { label: "收藏榜", value: "goodnum" },
                    { label: "新书榜", value: "newhot" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    Linovelib.prototype.popularNovels = function (pageNo, _a) {
        var filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var link, headers, body, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        link = "".concat(this.site, "/top/");
                        link += filters.sort;
                        link += "/".concat(pageNo, ".html");
                        headers = new Headers();
                        if (this.cookieString) {
                            headers.append("cookie", this.cookieString);
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link, { headers: headers }).then(function (result) {
                                return result.text();
                            })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio(".module-rank-booklist .book-layout").each(function (i, el) {
                            var url = loadedCheerio(el).attr("href");
                            var novelName = loadedCheerio(el).find(".book-title").text();
                            var novelCover = loadedCheerio(el)
                                .find("img.book-cover")
                                .attr("data-src");
                            var novelUrl = _this.site + url;
                            if (!url)
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
    Linovelib.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio, novel, chapter, idPattern, novelId, chaptersUrl, chaptersResult, chaptersBody, chaptersLoadedCheerio, volumeName, chapterId;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        url = novelUrl;
                        headers = new Headers();
                        if (this.cookieString) {
                            headers.append("cookie", this.cookieString);
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                    case 1:
                        result = _b.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
                            chapters: [],
                        };
                        novel.name = loadedCheerio("#bookDetailWrapper .book-title").text();
                        novel.cover = loadedCheerio("#bookDetailWrapper img.book-cover").attr("src");
                        novel.summary = loadedCheerio("#bookSummary content").text();
                        novel.author = loadedCheerio("#bookDetailWrapper .book-rand-a a").text();
                        // TODO: Need some regex and dirty selector to get it
                        // Need to look into how to translate that message
                        novel.status = undefined;
                        novel.genres = loadedCheerio(".tag-small.red")
                            .children("a")
                            .map(function (i, el) { return loadedCheerio(el).text(); })
                            .toArray()
                            .join(",");
                        chapter = [];
                        idPattern = /\/(\d+)\.html/;
                        novelId = (_a = url.match(idPattern)) === null || _a === void 0 ? void 0 : _a[1];
                        chaptersUrl = this.site + loadedCheerio("#btnReadBook").attr("href");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chaptersUrl, { headers: headers })];
                    case 3:
                        chaptersResult = _b.sent();
                        return [4 /*yield*/, chaptersResult.text()];
                    case 4:
                        chaptersBody = _b.sent();
                        chaptersLoadedCheerio = (0, cheerio_1.load)(chaptersBody);
                        chaptersLoadedCheerio("#volumes .chapter-li").each(function (i, el) {
                            if (chaptersLoadedCheerio(el).hasClass("chapter-bar")) {
                                volumeName = chaptersLoadedCheerio(el).text();
                            }
                            else {
                                var urlPart = chaptersLoadedCheerio(el)
                                    .find(".chapter-li-a")
                                    .attr("href");
                                var chapterIdMatch = urlPart === null || urlPart === void 0 ? void 0 : urlPart.match(idPattern);
                                // Sometimes the href attribute does not contain the url, but javascript:cid(0).
                                // Increment the previous chapter ID should result in the right URL
                                if (chapterIdMatch) {
                                    chapterId = +chapterIdMatch[1];
                                }
                                else {
                                    chapterId++;
                                }
                            }
                            var chapterUrl = "".concat(_this.site, "/novel/").concat(novelId, "/").concat(chapterId, ".html");
                            var chapterName = volumeName +
                                " — " +
                                chaptersLoadedCheerio(el).find(".chapter-index").text().trim();
                            var releaseDate = null;
                            if (!chapterId)
                                return;
                            chapter.push({
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            });
                        });
                        novel.chapters = chapter;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    Linovelib.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var headers, chapterName, chapterText, hasNextPage, pageHasNextPage, pageText, pageNumber, skillgg, addPage, loadPage, url, page;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        headers = new Headers();
                        if (this.cookieString) {
                            headers.append("cookie", this.cookieString);
                        }
                        chapterText = "", pageText = "";
                        pageNumber = 1;
                        skillgg = {
                            "\u201c": "\u300c",
                            "\u201d": "\u300d",
                            "\u2018": "\u300e",
                            "\u2019": "\u300f",
                            "\ue82c": "\u7684",
                            "\ue852": "\u4e00",
                            "\ue82d": "\u662f",
                            "\ue819": "\u4e86",
                            "\ue856": "\u6211",
                            "\ue857": "\u4e0d",
                            "\ue816": "\u4eba",
                            "\ue83c": "\u5728",
                            "\ue830": "\u4ed6",
                            "\ue82e": "\u6709",
                            "\ue836": "\u8fd9",
                            "\ue859": "\u4e2a",
                            "\ue80a": "\u4e0a",
                            "\ue855": "\u4eec",
                            "\ue842": "\u6765",
                            "\ue858": "\u5230",
                            "\ue80b": "\u65f6",
                            "\ue81f": "\u5927",
                            "\ue84a": "\u5730",
                            "\ue853": "\u4e3a",
                            "\ue81e": "\u5b50",
                            "\ue822": "\u4e2d",
                            "\ue813": "\u4f60",
                            "\ue85b": "\u8bf4",
                            "\ue807": "\u751f",
                            "\ue818": "\u56fd",
                            "\ue810": "\u5e74",
                            "\ue812": "\u7740",
                            "\ue851": "\u5c31",
                            "\ue801": "\u90a3",
                            "\ue80c": "\u548c",
                            "\ue815": "\u8981",
                            "\ue84c": "\u5979",
                            "\ue840": "\u51fa",
                            "\ue848": "\u4e5f",
                            "\ue835": "\u5f97",
                            "\ue800": "\u91cc",
                            "\ue826": "\u540e",
                            "\ue863": "\u81ea",
                            "\ue861": "\u4ee5",
                            "\ue854": "\u4f1a",
                            "\ue827": "\u5bb6",
                            "\ue83b": "\u53ef",
                            "\ue85d": "\u4e0b",
                            "\ue84d": "\u800c",
                            "\ue862": "\u8fc7",
                            "\ue81c": "\u5929",
                            "\ue81d": "\u53bb",
                            "\ue860": "\u80fd",
                            "\ue843": "\u5bf9",
                            "\ue82f": "\u5c0f",
                            "\ue802": "\u591a",
                            "\ue831": "\u7136",
                            "\ue84b": "\u4e8e",
                            "\ue837": "\u5fc3",
                            "\ue829": "\u5b66",
                            "\ue85e": "\u4e48",
                            "\ue83a": "\u4e4b",
                            "\ue832": "\u90fd",
                            "\ue808": "\u597d",
                            "\ue841": "\u770b",
                            "\ue821": "\u8d77",
                            "\ue845": "\u53d1",
                            "\ue803": "\u5f53",
                            "\ue828": "\u6ca1",
                            "\ue81b": "\u6210",
                            "\ue83e": "\u53ea",
                            "\ue820": "\u5982",
                            "\ue84e": "\u4e8b",
                            "\ue85a": "\u628a",
                            "\ue806": "\u8fd8",
                            "\ue83f": "\u7528",
                            "\ue833": "\u7b2c",
                            "\ue811": "\u6837",
                            "\ue804": "\u9053",
                            "\ue814": "\u60f3",
                            "\ue80f": "\u4f5c",
                            "\ue84f": "\u79cd",
                            "\ue80e": "\u5f00",
                            "\ue823": "\u7f8e",
                            "\ue849": "\u4e73",
                            "\ue805": "\u9634",
                            "\ue809": "\u6db2",
                            "\ue81a": "\u830e",
                            "\ue844": "\u6b32",
                            "\ue847": "\u547b",
                            "\ue850": "\u8089",
                            "\ue824": "\u4ea4",
                            "\ue85f": "\u6027",
                            "\ue817": "\u80f8",
                            "\ue85c": "\u79c1",
                            "\ue838": "\u7a74",
                            "\ue82a": "\u6deb",
                            "\ue83d": "\u81c0",
                            "\ue82b": "\u8214",
                            "\ue80d": "\u5c04",
                            "\ue839": "\u8131",
                            "\ue834": "\u88f8",
                            "\ue846": "\u9a9a",
                            "\ue825": "\u5507",
                        };
                        addPage = function (pageCheerio) { return __awaiter(_this, void 0, void 0, function () {
                            var formatPage;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        formatPage = function () { return __awaiter(_this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                // Remove JS
                                                pageCheerio("#ccacontent .cgo").remove();
                                                // Load lazyloaded images
                                                pageCheerio("#ccacontent img.imagecontent").each(function (i, el) {
                                                    // Sometimes images are either in data-src or src
                                                    var imgSrc = pageCheerio(el).attr("data-src") ||
                                                        pageCheerio(el).attr("src");
                                                    if (imgSrc) {
                                                        // The original CDN URL is locked behind a CF-like challenge, switch the URL to bypass that
                                                        // There are no react-native-url-polyfill lib, can't use URL API
                                                        var regex = /\/\/.+\.com\//;
                                                        var imgUrl = imgSrc.replace(regex, "//img.linovelib.com/");
                                                        // Clean up img element
                                                        pageCheerio(el)
                                                            .attr("src", imgUrl)
                                                            .removeAttr("data-src")
                                                            .removeClass("lazyload");
                                                    }
                                                });
                                                // Recover the original character
                                                pageText = pageCheerio("#ccacontent").html() || "";
                                                pageText = pageText.replace(/./g, function (char) { return skillgg[char] || char; });
                                                return [2 /*return*/, Promise.resolve()];
                                            });
                                        }); };
                                        return [4 /*yield*/, formatPage()];
                                    case 1:
                                        _a.sent();
                                        chapterName =
                                            pageCheerio("#atitle + h3").text() +
                                                " — " +
                                                pageCheerio("#atitle").text();
                                        if (chapterText === "") {
                                            chapterText = "<h2>" + chapterName + "</h2>";
                                        }
                                        chapterText += pageText;
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                        loadPage = function (url) { return __awaiter(_this, void 0, void 0, function () {
                            var result, body, pageCheerio;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                                    case 1:
                                        result = _a.sent();
                                        return [4 /*yield*/, result.text()];
                                    case 2:
                                        body = _a.sent();
                                        pageCheerio = (0, cheerio_1.load)(body);
                                        return [4 /*yield*/, addPage(pageCheerio)];
                                    case 3:
                                        _a.sent();
                                        pageHasNextPage =
                                            pageCheerio("#footlink a:last").text() === "下一页"
                                                ? true
                                                : false;
                                        return [2 /*return*/, { pageCheerio: pageCheerio, pageHasNextPage: pageHasNextPage }];
                                }
                            });
                        }); };
                        url = chapterUrl;
                        _a.label = 1;
                    case 1: return [4 /*yield*/, loadPage(url)];
                    case 2:
                        page = _a.sent();
                        hasNextPage = page.pageHasNextPage;
                        if (hasNextPage === true) {
                            pageNumber++;
                            url = chapterUrl.replace(/\.html/gi, "_".concat(pageNumber) + ".html");
                        }
                        _a.label = 3;
                    case 3:
                        if (hasNextPage === true) return [3 /*break*/, 1];
                        _a.label = 4;
                    case 4: return [2 /*return*/, chapterText];
                }
            });
        });
    };
    Linovelib.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var searchUrl, Term, headers, NextPage, NoNextPage, DeadEnd, novels, addPage, loadPage, url, page;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        searchUrl = "".concat(this.site, "/search/");
                        Term = encodeURI(searchTerm);
                        headers = new Headers();
                        if (this.cookieString) {
                            headers.append("cookie", this.cookieString);
                        }
                        pageNo = 1;
                        novels = [];
                        addPage = function (pageCheerio, redirect) { return __awaiter(_this, void 0, void 0, function () {
                            var loadSearchResults, novelResults, novelName, novelCover, novelUrl;
                            var _this = this;
                            var _a;
                            return __generator(this, function (_b) {
                                loadSearchResults = function () {
                                    pageCheerio(".book-ol .book-layout").each(function (i, el) {
                                        var nUrl = pageCheerio(el).attr("href");
                                        var novelName = pageCheerio(el)
                                            .find(".book-title")
                                            .text();
                                        var novelCover = pageCheerio(el)
                                            .find("img.book-cover")
                                            .attr("data-src");
                                        var novelUrl = _this.site + nUrl;
                                        if (!nUrl)
                                            return;
                                        novels.push({
                                            name: novelName,
                                            url: novelUrl,
                                            cover: novelCover,
                                        });
                                    });
                                };
                                novelResults = pageCheerio(".book-ol a.book-layout");
                                if (novelResults.length === 0) {
                                    (0, showToast_1.showToast)("Bypass check by searching in Webview");
                                }
                                else {
                                    loadSearchResults();
                                }
                                if (redirect.length) {
                                    novels.length = 0;
                                    novelName = pageCheerio("#bookDetailWrapper .book-title").text();
                                    novelCover = pageCheerio("#bookDetailWrapper img.book-cover").attr("src");
                                    novelUrl = this.site +
                                        ((_a = pageCheerio("#btnReadBook").attr("href")) === null || _a === void 0 ? void 0 : _a.slice(0, -8)) +
                                        ".html";
                                    novels.push({
                                        name: novelName,
                                        url: novelUrl,
                                        cover: novelCover,
                                    });
                                }
                                return [2 /*return*/];
                            });
                        }); };
                        loadPage = function (url) { return __awaiter(_this, void 0, void 0, function () {
                            var result, body, pageCheerio, redirect;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                                    case 1:
                                        result = _a.sent();
                                        return [4 /*yield*/, result.text()];
                                    case 2:
                                        body = _a.sent();
                                        pageCheerio = (0, cheerio_1.load)(body);
                                        redirect = pageCheerio("div.book-layout").text();
                                        return [4 /*yield*/, addPage(pageCheerio, redirect)];
                                    case 3:
                                        _a.sent();
                                        NextPage = pageCheerio(".next").attr("href");
                                        if (!NextPage) {
                                            NoNextPage === true;
                                        }
                                        else {
                                            NoNextPage = NextPage === "#" ? true : false;
                                        }
                                        return [2 /*return*/, { pageCheerio: pageCheerio, NoNextPage: NoNextPage }];
                                }
                            });
                        }); };
                        url = "".concat(searchUrl).concat(Term, "_").concat(pageNo, ".html");
                        _a.label = 1;
                    case 1: return [4 /*yield*/, loadPage(url)];
                    case 2:
                        page = _a.sent();
                        DeadEnd = page.NoNextPage;
                        if (DeadEnd === false) {
                            pageNo++;
                            url = "".concat(searchUrl).concat(Term, "_").concat(pageNo, ".html");
                        }
                        _a.label = 3;
                    case 3:
                        if (DeadEnd === false) return [3 /*break*/, 1];
                        _a.label = 4;
                    case 4: return [2 /*return*/, novels];
                }
            });
        });
    };
    Linovelib.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return Linovelib;
}());
exports.default = new Linovelib();
