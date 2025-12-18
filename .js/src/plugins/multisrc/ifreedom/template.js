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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var dayjs_1 = __importDefault(require("dayjs"));
var IfreedomPlugin = /** @class */ (function () {
    function IfreedomPlugin(metadata) {
        this.parseDate = function (dateString) {
            if (dateString === void 0) { dateString = ''; }
            var months = {
                января: 1,
                февраля: 2,
                марта: 3,
                апреля: 4,
                мая: 5,
                июня: 6,
                июля: 7,
                августа: 8,
                сентября: 9,
                октября: 10,
                ноября: 11,
                декабря: 12,
            };
            if (dateString.includes('.')) {
                var _a = dateString.split('.'), day = _a[0], month = _a[1], year = _a[2];
                if (day && month && year) {
                    return (0, dayjs_1.default)(year + '-' + month + '-' + day).format('LL');
                }
            }
            else if (dateString.includes(' ')) {
                var _b = dateString.split(' '), day = _b[0], month = _b[1];
                if (day && months[month]) {
                    var year = new Date().getFullYear();
                    return (0, dayjs_1.default)(year + '-' + months[month] + '-' + day).format('LL');
                }
            }
            return dateString || null;
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/ifreedom/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        this.version = '1.0.2';
        this.filters = metadata.filters;
    }
    IfreedomPlugin.prototype.popularNovels = function (page_1, _a) {
        return __awaiter(this, arguments, void 0, function (page, _b) {
            var url, body, loadedCheerio, novels;
            var _this = this;
            var _c;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        url = this.site +
                            '/vse-knigi/?sort=' +
                            (showLatestNovels
                                ? 'По дате обновления'
                                : ((_c = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _c === void 0 ? void 0 : _c.value) || 'По рейтингу');
                        Object.entries(filters || {}).forEach(function (_a) {
                            var type = _a[0], value = _a[1].value;
                            if (value instanceof Array && value.length) {
                                url += '&' + type + '[]=' + value.join('&' + type + '[]=');
                            }
                        });
                        url += '&bpage=' + page;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _d.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = loadedCheerio('div.one-book-home > div.img-home a')
                            .map(function (index, element) {
                            var _a, _b;
                            return ({
                                name: loadedCheerio(element).attr('title') || '',
                                cover: loadedCheerio(element).find('img').attr('src'),
                                path: ((_b = (_a = loadedCheerio(element).attr('href')) === null || _a === void 0 ? void 0 : _a.replace) === null || _b === void 0 ? void 0 : _b.call(_a, _this.site, '')) || '',
                            });
                        })
                            .get()
                            .filter(function (novel) { return novel.name && novel.path; });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    IfreedomPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, novel, chapters, totalChapters;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + novelPath).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            path: novelPath,
                            name: loadedCheerio('.entry-title').text(),
                            cover: loadedCheerio('.img-ranobe > img').attr('src'),
                            summary: loadedCheerio('meta[name="description"]').attr('content'),
                        };
                        loadedCheerio('div.data-ranobe').each(function () {
                            switch (loadedCheerio(this).find('b').text()) {
                                case 'Автор':
                                    novel.author = loadedCheerio(this)
                                        .find('div.data-value')
                                        .text()
                                        .trim();
                                    break;
                                case 'Жанры':
                                    novel.genres = loadedCheerio('div.data-value > a')
                                        .map(function (index, element) { var _a; return (_a = loadedCheerio(element).text()) === null || _a === void 0 ? void 0 : _a.trim(); })
                                        .get()
                                        .join(',');
                                    break;
                                case 'Статус книги':
                                    novel.status = loadedCheerio('div.data-value')
                                        .text()
                                        .includes('активен')
                                        ? novelStatus_1.NovelStatus.Ongoing
                                        : novelStatus_1.NovelStatus.Completed;
                                    break;
                            }
                        });
                        if (novel.author == 'Не указан')
                            delete novel.author;
                        chapters = [];
                        totalChapters = loadedCheerio('div.li-ranobe').length;
                        loadedCheerio('div.li-ranobe').each(function (chapterIndex, element) {
                            var name = loadedCheerio(element).find('a').text();
                            var url = loadedCheerio(element).find('a').attr('href');
                            if (!loadedCheerio(element).find('label.buy-ranobe').length &&
                                name &&
                                url) {
                                var releaseDate = loadedCheerio(element)
                                    .find('div.li-col2-ranobe')
                                    .text()
                                    .trim();
                                chapters.push({
                                    name: name,
                                    path: url.replace(_this.site, ''),
                                    releaseTime: _this.parseDate(releaseDate),
                                    chapterNumber: totalChapters - chapterIndex,
                                });
                            }
                        });
                        novel.chapters = chapters.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    IfreedomPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, chapterText;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + chapterPath).then(function (res) {
                            return res.text();
                        })];
                    case 1:
                        body = _b.sent();
                        chapterText = ((_a = body.match(/<article id="([\s\S]*?)<\/article>/)) === null || _a === void 0 ? void 0 : _a[0]) || '';
                        chapterText = chapterText.replace(/<script[^>]*>[\s\S]*?<\/script>/gim, '');
                        if (chapterText.includes('<img')) {
                            return [2 /*return*/, chapterText.replace(/srcset="([^"]+)"/g, function (match, src) {
                                    if (!src)
                                        return match;
                                    var bestlink = src
                                        .split(' ')
                                        .filter(function (url) { return url.startsWith('http'); })
                                        .pop();
                                    if (bestlink) {
                                        return "src=\"".concat(bestlink, "\"");
                                    }
                                    return match;
                                })];
                        }
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    IfreedomPlugin.prototype.searchNovels = function (searchTerm_1) {
        return __awaiter(this, arguments, void 0, function (searchTerm, page) {
            var url, result, loadedCheerio, novels;
            var _this = this;
            if (page === void 0) { page = 1; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site +
                            '/vse-knigi/?searchname=' +
                            encodeURIComponent(searchTerm) +
                            '&bpage=' +
                            page;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        result = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(result);
                        novels = loadedCheerio('div.one-book-home > div.img-home a')
                            .map(function (index, element) {
                            var _a, _b;
                            return ({
                                name: loadedCheerio(element).attr('title') || '',
                                cover: loadedCheerio(element).find('img').attr('src'),
                                path: ((_b = (_a = loadedCheerio(element).attr('href')) === null || _a === void 0 ? void 0 : _a.replace) === null || _b === void 0 ? void 0 : _b.call(_a, _this.site, '')) || '',
                            });
                        })
                            .get()
                            .filter(function (novel) { return novel.name && novel.path; });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return IfreedomPlugin;
}());
