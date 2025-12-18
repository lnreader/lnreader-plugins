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
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var HotNovelPubPlugin = /** @class */ (function () {
    function HotNovelPubPlugin(metadata) {
        var _this = this;
        var _a;
        this.resolveUrl = function (path) { return _this.site + '/' + path; };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/hotnovelpub/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        this.apiSite = metadata.sourceSite.replace('://', '://api.');
        this.version = '1.0.1';
        this.filters = metadata.filters;
        this.lang = ((_a = metadata.options) === null || _a === void 0 ? void 0 : _a.lang) || 'en';
    }
    HotNovelPubPlugin.prototype.popularNovels = function (pageNo_1, _a) {
        return __awaiter(this, arguments, void 0, function (pageNo, _b) {
            var url, result, novels;
            var _this = this;
            var _c, _d, _e;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        url = this.apiSite + '/books/';
                        url += showLatestNovels ? 'new' : ((_c = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _c === void 0 ? void 0 : _c.value) || 'hot';
                        if ((_d = filters === null || filters === void 0 ? void 0 : filters.category) === null || _d === void 0 ? void 0 : _d.value) {
                            url = this.apiSite + '/category/' + filters.category.value;
                        }
                        url += '/?page=' + (pageNo - 1) + '&limit=20';
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                headers: {
                                    lang: this.lang,
                                },
                            }).then(function (res) { return res.json(); })];
                    case 1:
                        result = _f.sent();
                        novels = [];
                        if (result.status && ((_e = result.data.books.data) === null || _e === void 0 ? void 0 : _e.length)) {
                            result.data.books.data.forEach(function (novel) {
                                return novels.push({
                                    name: novel.name,
                                    cover: _this.site + novel.image,
                                    path: novel.slug,
                                });
                            });
                        }
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    HotNovelPubPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var json, novel, chapters_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.apiSite + '/book/' + novelPath, {
                            headers: {
                                lang: this.lang,
                            },
                        }).then(function (res) { return res.json(); })];
                    case 1:
                        json = _c.sent();
                        novel = {
                            name: json.data.book.name,
                            path: novelPath,
                            cover: this.site + json.data.book.image,
                            summary: json.data.book.authorize.description,
                            author: json.data.book.authorize.name,
                            status: json.data.book.status === 'updating'
                                ? novelStatus_1.NovelStatus.Ongoing
                                : novelStatus_1.NovelStatus.Completed,
                        };
                        if ((_a = json.data.tags.tags_name) === null || _a === void 0 ? void 0 : _a.length) {
                            novel.genres = json.data.tags.tags_name.join(',');
                        }
                        if ((_b = json.data.chapters) === null || _b === void 0 ? void 0 : _b.length) {
                            chapters_1 = [];
                            json.data.chapters.forEach(function (chapter, chapterIndex) {
                                return chapters_1.push({
                                    name: chapter.title,
                                    path: chapter.slug,
                                    releaseTime: undefined,
                                    chapterNumber: (chapter.index || chapterIndex) + 1,
                                });
                            });
                            novel.chapters = chapters_1;
                        }
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    HotNovelPubPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, chapterText, result, json;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.resolveUrl(chapterPath)).then(function (res) {
                            return res.text();
                        })];
                    case 1:
                        body = _b.sent();
                        chapterText = ((_a = body.match(/<div id="content-item" ([\s\S]*?)<\/div>/)) === null || _a === void 0 ? void 0 : _a[0]) || '';
                        if (!chapterText) return [3 /*break*/, 4];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + '/server/getContent?slug=' + chapterPath)];
                    case 2:
                        result = _b.sent();
                        return [4 /*yield*/, result.json()];
                    case 3:
                        json = (_b.sent());
                        if (json.data) {
                            chapterText += json.data
                                .map(function (item) { return '<p>' + item + '</p>'; })
                                .join('')
                                .replace(/\n/g, '</p><p>')
                                .replace(/\s/g, ' ');
                        }
                        _b.label = 4;
                    case 4: return [2 /*return*/, chapterText.replace(/\.copy right hot novel pub/g, '')];
                }
            });
        });
    };
    HotNovelPubPlugin.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var result, novels;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.apiSite + '/search', {
                            headers: {
                                'Content-Type': 'application/json;charset=utf-8',
                                Referer: this.site,
                                Origin: this.site,
                                lang: this.lang,
                            },
                            method: 'POST',
                            body: JSON.stringify({ key_search: searchTerm }),
                        }).then(function (res) { return res.json(); })];
                    case 1:
                        result = _b.sent();
                        novels = [];
                        if (result.status && ((_a = result.data.books) === null || _a === void 0 ? void 0 : _a.length)) {
                            result.data.books.forEach(function (novel) {
                                return novels.push({
                                    name: novel.name,
                                    path: novel.slug,
                                });
                            });
                        }
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return HotNovelPubPlugin;
}());
