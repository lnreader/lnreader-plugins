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
var RulatePlugin = /** @class */ (function () {
    function RulatePlugin(metadata) {
        this.parseDate = function (dateString) {
            if (dateString === void 0) { dateString = ''; }
            var months = {
                'янв.': 1,
                'февр.': 2,
                'мар.': 3,
                'апр.': 4,
                мая: 5,
                'июн.': 6,
                'июл.': 7,
                'авг.': 8,
                'сент.': 9,
                'окт.': 10,
                'нояб.': 11,
                'дек.': 12,
            };
            var _a = dateString.split(' '), day = _a[0], month = _a[1], year = _a[2], time = _a[4];
            if (day && months[month] && year && time) {
                return (0, dayjs_1.default)(year + '-' + months[month] + '-' + day + ' ' + time).format('LLL');
            }
            return dateString || null;
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/rulate/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        this.version = '1.0.' + (2 + metadata.versionIncrements);
        this.filters = metadata.filters;
    }
    RulatePlugin.prototype.popularNovels = function (pageNo_1, _a) {
        return __awaiter(this, arguments, void 0, function (pageNo, _b) {
            var novels, url, body, loadedCheerio;
            var _this = this;
            var _c, _d, _e, _f, _g, _h, _j;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        novels = [];
                        url = this.site + '/search?t=';
                        url += '&cat=' + (((_c = filters === null || filters === void 0 ? void 0 : filters.cat) === null || _c === void 0 ? void 0 : _c.value) || '0');
                        url += '&s_lang=' + (((_d = filters === null || filters === void 0 ? void 0 : filters.s_lang) === null || _d === void 0 ? void 0 : _d.value) || '0');
                        url += '&t_lang=' + (((_e = filters === null || filters === void 0 ? void 0 : filters.t_lang) === null || _e === void 0 ? void 0 : _e.value) || '0');
                        url += '&type=' + (((_f = filters === null || filters === void 0 ? void 0 : filters.type) === null || _f === void 0 ? void 0 : _f.value) || '0');
                        url += '&sort=' + (showLatestNovels ? '4' : ((_g = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _g === void 0 ? void 0 : _g.value) || '6');
                        url += '&atmosphere=' + (((_h = filters === null || filters === void 0 ? void 0 : filters.atmosphere) === null || _h === void 0 ? void 0 : _h.value) || '0');
                        url += '&adult=' + (((_j = filters === null || filters === void 0 ? void 0 : filters.adult) === null || _j === void 0 ? void 0 : _j.value) || '0');
                        Object.entries(filters || {}).forEach(function (_a) {
                            var type = _a[0], value = _a[1].value;
                            if (value instanceof Array && value.length) {
                                url +=
                                    '&' +
                                        value
                                            .map(function (val) { return (type == 'extra' ? val + '=1' : type + '[]=' + val); })
                                            .join('&');
                            }
                        });
                        url += '&Book_page=' + pageNo;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _k.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio('ul[class="search-results"] > li:not([class="ad_type_catalog"])').each(function (index, element) {
                            loadedCheerio(element).find('p > a').text();
                            var name = loadedCheerio(element).find('p > a').text();
                            var cover = loadedCheerio(element).find('img').attr('src');
                            var path = loadedCheerio(element).find('p > a').attr('href');
                            if (!name || !path)
                                return;
                            novels.push({ name: name, cover: _this.site + cover, path: path });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    RulatePlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var result, formData, body, loadedCheerio, novel, genres, chapters;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + novelPath)];
                    case 1:
                        result = _c.sent();
                        if (!result.url.includes('mature?path=')) return [3 /*break*/, 3];
                        formData = new FormData();
                        formData.append('path', novelPath);
                        formData.append('ok', 'Да');
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(result.url, {
                                method: 'POST',
                                body: formData,
                            })];
                    case 2:
                        result = _c.sent();
                        _c.label = 3;
                    case 3: return [4 /*yield*/, result.text()];
                    case 4:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            path: novelPath,
                            name: loadedCheerio('.span8 > h1, .book__title').text().trim(),
                        };
                        if ((_b = (_a = novel.name) === null || _a === void 0 ? void 0 : _a.includes) === null || _b === void 0 ? void 0 : _b.call(_a, '[')) {
                            novel.name = novel.name.split('[')[0].trim();
                        }
                        novel.cover =
                            this.site +
                                loadedCheerio('div[class="images"] > div img, .book__cover > img').attr('src');
                        novel.summary = loadedCheerio('#Info > div:nth-child(4) > p:nth-child(1), .book__description')
                            .text()
                            .trim();
                        genres = [];
                        loadedCheerio('div.span5 > p').each(function () {
                            switch (loadedCheerio(this).find('strong').text()) {
                                case 'Автор:':
                                    novel.author = loadedCheerio(this).find('em > a').text().trim();
                                    break;
                                case 'Выпуск:':
                                    novel.status =
                                        loadedCheerio(this).find('em').text().trim() === 'продолжается'
                                            ? novelStatus_1.NovelStatus.Ongoing
                                            : novelStatus_1.NovelStatus.Completed;
                                    break;
                                case 'Тэги:':
                                    loadedCheerio(this)
                                        .find('em > a')
                                        .each(function () {
                                        genres.push(loadedCheerio(this).text());
                                    });
                                    break;
                                case 'Жанры:':
                                    loadedCheerio(this)
                                        .find('em > a')
                                        .each(function () {
                                        genres.push(loadedCheerio(this).text());
                                    });
                                    break;
                            }
                        });
                        if (genres.length) {
                            novel.genres = genres.reverse().join(',');
                        }
                        chapters = [];
                        if (this.id === 'rulate') {
                            loadedCheerio('table > tbody > tr.chapter_row').each(function (chapterIndex, element) {
                                var _a;
                                var chapterName = loadedCheerio(element)
                                    .find('td[class="t"] > a')
                                    .text()
                                    .trim();
                                var releaseDate = (_a = loadedCheerio(element)
                                    .find('td > span')
                                    .attr('title')) === null || _a === void 0 ? void 0 : _a.trim();
                                var chapterUrl = loadedCheerio(element)
                                    .find('td[class="t"] > a')
                                    .attr('href');
                                if (!loadedCheerio(element).find('td > span[class="disabled"]')
                                    .length &&
                                    releaseDate &&
                                    chapterUrl) {
                                    chapters.push({
                                        name: chapterName,
                                        path: chapterUrl,
                                        releaseTime: _this.parseDate(releaseDate),
                                        chapterNumber: chapterIndex + 1,
                                    });
                                }
                            });
                        }
                        else {
                            loadedCheerio('a.chapter').each(function (chapterIndex, element) {
                                var chapterName = loadedCheerio(element)
                                    .find('div:nth-child(1) > span:nth-child(2)')
                                    .text()
                                    .trim();
                                var chapterUrl = loadedCheerio(element).attr('href');
                                var isPaid = loadedCheerio(element).find('span[data-can-buy="true"]').length;
                                if (!isPaid && chapterUrl) {
                                    chapters.push({
                                        name: chapterName,
                                        path: chapterUrl,
                                        chapterNumber: chapterIndex + 1,
                                    });
                                }
                            });
                        }
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    RulatePlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var result, formData, body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + chapterPath)];
                    case 1:
                        result = _a.sent();
                        if (!result.url.includes('mature?path=')) return [3 /*break*/, 3];
                        formData = new FormData();
                        formData.append('path', chapterPath.split('/').slice(0, 3).join('/'));
                        formData.append('ok', 'Да');
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(result.url, {
                                method: 'POST',
                                body: formData,
                            })];
                    case 2:
                        result = _a.sent();
                        _a.label = 3;
                    case 3: return [4 /*yield*/, result.text()];
                    case 4:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio('.content-text, #read-text').html();
                        return [2 /*return*/, chapterText || ''];
                }
            });
        });
    };
    RulatePlugin.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var novels, result;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        novels = [];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site +
                                '/search/autocomplete?query=' +
                                encodeURIComponent(searchTerm)).then(function (res) { return res.json(); })];
                    case 1:
                        result = _a.sent();
                        result.forEach(function (novel) {
                            var name = novel.title_one + ' / ' + novel.title_two;
                            if (!novel.url)
                                return;
                            novels.push({
                                name: name,
                                cover: _this.site + novel.img,
                                path: novel.url,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return RulatePlugin;
}());
