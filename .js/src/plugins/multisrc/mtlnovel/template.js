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
var defaultCover_1 = require("@libs/defaultCover");
var MTLNovelPlugin = /** @class */ (function () {
    function MTLNovelPlugin(metadata) {
        var _a;
        this.imageRequestInit = {
            headers: {
                'Alt-Used': 'www.mtlnovels.com',
            },
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = 'multisrc/mtlnovel/mtlnovel/icon.png';
        this.site = metadata.sourceSite;
        this.mainUrl = 'https://www.mtlnovels.com/';
        this.version = '1.1.3';
        this.options = (_a = metadata.options) !== null && _a !== void 0 ? _a : {};
        this.filters = metadata.filters;
    }
    MTLNovelPlugin.prototype.safeFecth = function (url_1) {
        return __awaiter(this, arguments, void 0, function (url, headers) {
            var r;
            if (headers === void 0) { headers = new Headers(); }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        headers.append('Alt-Used', 'www.mtlnovels.com');
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                    case 1:
                        r = _a.sent();
                        if (!r.ok)
                            throw new Error('Could not reach site (' + r.status + ') try to open in webview.');
                        return [2 /*return*/, r];
                }
            });
        });
    };
    MTLNovelPlugin.prototype.popularNovels = function (page_1, _a) {
        return __awaiter(this, arguments, void 0, function (page, _b) {
            var link, body, loadedCheerio, novels;
            var _this = this;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        link = "".concat(this.site, "novel-list/?");
                        if (filters) {
                            link += "orderby=".concat(filters.order.value);
                            link += "&order=".concat(filters.sort.value);
                            link += "&status=".concat(filters.storyStatus.value);
                        }
                        if (showLatestNovels)
                            link += '&m_orderby=date';
                        link += "&pg=".concat(page);
                        return [4 /*yield*/, this.safeFecth(link).then(function (r) { return r.text(); })];
                    case 1:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio('div.box.wide').each(function (i, el) {
                            var novelName = loadedCheerio(el).find('a.list-title').text().trim();
                            var novelCover = loadedCheerio(el).find('amp-img').attr('src');
                            if (!novelCover ||
                                novelCover == 'https://www.mtlnovel.net/no-image.jpg.webp')
                                novelCover = defaultCover_1.defaultCover;
                            var novelUrl = loadedCheerio(el).find('a.list-title').attr('href');
                            if (!novelUrl)
                                return;
                            var novel = {
                                name: novelName,
                                cover: novelCover,
                                path: novelUrl.replace(_this.mainUrl, '').replace(_this.site, ''),
                            };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    MTLNovelPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var headers, body, loadedCheerio, novel, chapterListUrl, getChapters, _a, genresArray;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        headers = new Headers();
                        headers.append('Referer', "".concat(this.site, "novel-list/"));
                        return [4 /*yield*/, this.safeFecth(this.site + novelPath, headers).then(function (r) {
                                return r.text();
                            })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            path: novelPath,
                            name: loadedCheerio('h1.entry-title').text().trim() || 'Untitled',
                            cover: loadedCheerio('.nov-head > amp-img').attr('src') || defaultCover_1.defaultCover,
                            summary: loadedCheerio('div.desc > h2').next().text().trim(),
                            chapters: [],
                        };
                        loadedCheerio('.info tr').each(function (i, el) {
                            var infoName = loadedCheerio(el).find('td').eq(0).text().trim();
                            var infoValue = loadedCheerio(el).find('td').eq(2).text().trim();
                            switch (infoName) {
                                case 'Genre':
                                case 'Tags':
                                case 'Mots Clés':
                                case 'Género':
                                case 'Label':
                                case 'Gênero':
                                case 'Tag':
                                case 'Теги':
                                    if (novel.genres)
                                        novel.genres += ', ' + infoValue;
                                    else
                                        novel.genres = infoValue;
                                    break;
                                case 'Author':
                                case 'Auteur':
                                case 'Autor(a)':
                                case 'Autor':
                                case 'Автор':
                                    novel.author = infoValue;
                                    break;
                                case 'Status':
                                case 'Statut':
                                case 'Estado':
                                case 'Положение дел':
                                    if (infoValue == 'Hiatus')
                                        novel.status = novelStatus_1.NovelStatus.OnHiatus;
                                    else
                                        novel.status = infoValue;
                                    break;
                            }
                        });
                        chapterListUrl = this.site + novelPath + 'chapter-list/';
                        getChapters = function () { return __awaiter(_this, void 0, void 0, function () {
                            var listBody, chapter;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.safeFecth(chapterListUrl, headers).then(function (r) {
                                            return r.text();
                                        })];
                                    case 1:
                                        listBody = _a.sent();
                                        loadedCheerio = (0, cheerio_1.load)(listBody);
                                        chapter = [];
                                        loadedCheerio('div.ch-list')
                                            .find('a.ch-link')
                                            .each(function (i, el) {
                                            var chapterName = loadedCheerio(el).text().replace('~ ', '');
                                            var releaseDate = null;
                                            var chapterUrl = loadedCheerio(el).attr('href');
                                            if (!chapterUrl)
                                                return;
                                            chapter.push({
                                                path: chapterUrl.replace(_this.mainUrl, '').replace(_this.site, ''),
                                                name: chapterName,
                                                releaseTime: releaseDate,
                                            });
                                        });
                                        return [2 /*return*/, chapter.reverse()];
                                }
                            });
                        }); };
                        _a = novel;
                        return [4 /*yield*/, getChapters()];
                    case 2:
                        _a.chapters = _b.sent();
                        if (novel.genres) {
                            genresArray = novel.genres.split(', ');
                            genresArray.pop();
                            novel.genres = genresArray.join(', ');
                        }
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    MTLNovelPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.safeFecth(this.site + chapterPath).then(function (r) {
                            return r.text();
                        })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio('div.par').html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    MTLNovelPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var searchUrl, res, result, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (pageNo !== 1)
                            return [2 /*return*/, []];
                        searchUrl = this.site +
                            'wp-admin/admin-ajax.php?action=autosuggest&q=' +
                            encodeURIComponent(searchTerm);
                        return [4 /*yield*/, this.safeFecth(searchUrl)];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 2:
                        result = _a.sent();
                        novels = [];
                        result.items[0].results.map(function (item) {
                            var novelName = item.title.replace(/<\/?strong>/g, '');
                            var novelCover = item.thumbnail;
                            var novelUrl = item.permalink
                                .replace(_this.mainUrl, '')
                                .replace(_this.site, '');
                            var novel = { name: novelName, cover: novelCover, path: novelUrl };
                            novels.push(novel);
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return MTLNovelPlugin;
}());
