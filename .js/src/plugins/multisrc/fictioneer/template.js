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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
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
var FictioneerPlugin = /** @class */ (function () {
    function FictioneerPlugin(metadata) {
        var _this = this;
        var _a;
        this.filters = undefined;
        this.resolveUrl = function (path, isNovel) {
            return _this.site + '/' + path + '/';
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/fictioneer/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        var versionIncrements = ((_a = metadata.options) === null || _a === void 0 ? void 0 : _a.versionIncrements) || 0;
        this.version = "1.0.".concat(0 + versionIncrements);
        this.options = metadata.options;
    }
    FictioneerPlugin.prototype.popularNovels = function (pageNo_1, _a) {
        return __awaiter(this, arguments, void 0, function (pageNo, _b) {
            var req, body, loadedCheerio;
            var _this = this;
            var showLatestNovels = _b.showLatestNovels, filters = _b.filters;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site +
                            '/' +
                            this.options.browsePage +
                            '/' +
                            (pageNo === 1 ? '' : 'page/' + pageNo + '/'))];
                    case 1:
                        req = _c.sent();
                        return [4 /*yield*/, req.text()];
                    case 2:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, loadedCheerio('#featured-list > li > div > div, #list-of-stories > li > div > div')
                                .map(function (i, el) {
                                var novelName = loadedCheerio(el).find('h3 > a').text();
                                var novelCover = loadedCheerio(el)
                                    .find('a.cell-img:has(img)')
                                    .attr('href');
                                var novelUrl = loadedCheerio(el).find('h3 > a').attr('href');
                                return {
                                    name: novelName,
                                    cover: novelCover,
                                    path: novelUrl.replace(_this.site + '/', '').replace(/\/$/, ''),
                                };
                            })
                                .toArray()];
                }
            });
        });
    };
    FictioneerPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var req, body, loadedCheerio, novel, status;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + '/' + novelPath + '/')];
                    case 1:
                        req = _a.sent();
                        return [4 /*yield*/, req.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            path: novelPath,
                            name: loadedCheerio('h1.story__identity-title').text(),
                        };
                        // novel.artist = '';
                        novel.author = loadedCheerio('div.story__identity-meta')
                            .text()
                            .split('|')[0]
                            .replace('Author: ', '')
                            .replace('by ', '')
                            .trim();
                        novel.cover = loadedCheerio('figure.story__thumbnail > a').attr('href');
                        novel.genres = loadedCheerio('div.tag-group > a, section.tag-group > a')
                            .map(function (i, el) { return loadedCheerio(el).text(); })
                            .toArray()
                            .join(',');
                        novel.summary = loadedCheerio('section.story__summary').text();
                        novel.chapters = loadedCheerio('li.chapter-group__list-item._publish')
                            .filter(function (i, el) { return !el.attribs['class'].includes('_password'); })
                            .filter(function (i, el) {
                            return !loadedCheerio(el)
                                .find('i')
                                .first()
                                .attr('class')
                                .includes('fa-lock');
                        })
                            .map(function (i, el) {
                            var _a;
                            var chapterName = loadedCheerio(el).find('a').text();
                            var chapterUrl = (_a = loadedCheerio(el)
                                .find('a')
                                .attr('href')) === null || _a === void 0 ? void 0 : _a.replace(_this.site + '/', '').replace(/\/$/, '');
                            return {
                                name: chapterName,
                                path: chapterUrl,
                            };
                        })
                            .toArray();
                        status = loadedCheerio('span.story__status').text().trim();
                        if (status === 'Ongoing')
                            novel.status = novelStatus_1.NovelStatus.Ongoing;
                        if (status === 'Completed')
                            novel.status = novelStatus_1.NovelStatus.Completed;
                        if (status === 'Cancelled')
                            novel.status = novelStatus_1.NovelStatus.Cancelled;
                        if (status === 'Hiatus')
                            novel.status = novelStatus_1.NovelStatus.OnHiatus;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    FictioneerPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var req, body, loadedCheerio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + '/' + chapterPath + '/')];
                    case 1:
                        req = _a.sent();
                        return [4 /*yield*/, req.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, loadedCheerio('section#chapter-content > div').html() || ''];
                }
            });
        });
    };
    FictioneerPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var req, body, loadedCheerio;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site +
                            "/".concat(pageNo === 1 ? '' : 'page/' + pageNo + '/', "?s=").concat(encodeURIComponent(searchTerm), "&post_type=fcn_story"))];
                    case 1:
                        req = _a.sent();
                        return [4 /*yield*/, req.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, loadedCheerio('#search-result-list > li > div > div')
                                .map(function (i, el) {
                                var novelName = loadedCheerio(el).find('h3 > a').text();
                                var novelCover = loadedCheerio(el)
                                    .find('a.cell-img:has(img)')
                                    .attr('href');
                                var novelUrl = loadedCheerio(el).find('h3 > a').attr('href');
                                return {
                                    name: novelName,
                                    cover: novelCover,
                                    path: novelUrl.replace(_this.site + '/', '').replace(/\/$/, ''),
                                };
                            })
                                .toArray()];
                }
            });
        });
    };
    return FictioneerPlugin;
}());
