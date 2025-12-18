"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var htmlparser2_1 = require("htmlparser2");
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var RanobesPlugin = /** @class */ (function () {
    function RanobesPlugin(metadata) {
        var _this = this;
        this.parseDate = function (date) {
            var now = new Date();
            if (!date)
                return now.toISOString();
            if (_this.id === 'ranobes-ru') {
                if (date.includes(' в '))
                    return date.replace(' в ', ' г., ');
                var _a = date.split(', '), when = _a[0], time = _a[1];
                if (!time)
                    return now.toISOString();
                var _b = time.split(':'), h = _b[0], m = _b[1];
                switch (when) {
                    case 'Сегодня':
                        now.setHours(parseInt(h, 10));
                        now.setMinutes(parseInt(m, 10));
                        break;
                    case 'Вчера':
                        now.setDate(now.getDate() - 1);
                        now.setHours(parseInt(h, 10));
                        now.setMinutes(parseInt(m, 10));
                        break;
                    default:
                        return now.toISOString();
                }
            }
            else {
                var _c = date.split(' '), num = _c[0], xz = _c[1], ago = _c[2];
                if (ago !== 'ago')
                    return now.toISOString();
                switch (xz) {
                    case 'minutes':
                        now.setMinutes(parseInt(num, 10));
                        break;
                    case 'hour':
                    case 'hours':
                        now.setHours(parseInt(num, 10));
                        break;
                    case 'day':
                    case 'days':
                        now.setDate(now.getDate() - parseInt(num, 10));
                        break;
                    case 'month':
                    case 'months':
                        now.setMonth(now.getMonth() - parseInt(num, 10));
                        break;
                    case 'year':
                    case 'years':
                        now.setFullYear(now.getFullYear() - parseInt(num, 10));
                        break;
                    default:
                        return now.toISOString();
                }
            }
            return now.toISOString();
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = 'multisrc/ranobes/ranobes/icon.png';
        this.site = metadata.sourceSite;
        this.version = '2.0.2';
        this.options = metadata.options;
    }
    RanobesPlugin.prototype.safeFecth = function (url_1) {
        return __awaiter(this, arguments, void 0, function (url, init) {
            var r, data, title;
            var _a, _b;
            if (init === void 0) { init = {}; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url, init)];
                    case 1:
                        r = _c.sent();
                        if (!r.ok)
                            throw new Error('Could not reach site (' + r.status + ') try to open in webview.');
                        return [4 /*yield*/, r.text()];
                    case 2:
                        data = _c.sent();
                        title = (_b = (_a = data.match(/<title>(.*?)<\/title>/)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.trim();
                        if (title &&
                            (title == 'Bot Verification' ||
                                title == 'You are being redirected...' ||
                                title == 'Un instant...' ||
                                title == 'Just a moment...' ||
                                title == 'Redirecting...'))
                            throw new Error('Captcha error, please open in webview');
                        return [2 /*return*/, data];
                }
            });
        });
    };
    RanobesPlugin.prototype.parseNovels = function (html) {
        var novels = [];
        var tempNovel = {};
        tempNovel.name = '';
        var baseUrl = this.site;
        var isParsingNovel = false;
        var isTitleTag = false;
        var isNovelName = false;
        var parser = new htmlparser2_1.Parser({
            onopentag: function (name, attribs) {
                var _a, _b;
                if ((_a = attribs['class']) === null || _a === void 0 ? void 0 : _a.includes('short-cont')) {
                    isParsingNovel = true;
                }
                if (isParsingNovel) {
                    if (name === 'h2' && ((_b = attribs['class']) === null || _b === void 0 ? void 0 : _b.includes('title'))) {
                        isTitleTag = true;
                    }
                    if (isTitleTag && name === 'a') {
                        tempNovel.path = attribs['href'].slice(baseUrl.length);
                        isNovelName = true;
                    }
                    if (name === 'figure') {
                        tempNovel.cover = attribs['style'].replace(/.*url\((.*?)\)./g, '$1');
                    }
                    if (tempNovel.path && tempNovel.cover) {
                        novels.push(tempNovel);
                        tempNovel = {};
                        tempNovel.name = '';
                    }
                }
            },
            ontext: function (data) {
                if (isNovelName) {
                    tempNovel.name += data;
                }
            },
            onclosetag: function (name) {
                if (name === 'h2') {
                    isNovelName = false;
                    isTitleTag = false;
                }
                if (name === 'figure') {
                    isParsingNovel = false;
                }
            },
        });
        parser.write(html);
        parser.end();
        return novels;
    };
    RanobesPlugin.prototype.parseChapters = function (data) {
        var _this = this;
        var chapter = [];
        data.chapters.map(function (item) {
            chapter.push({
                name: item.title,
                releaseTime: new Date(item.date).toISOString(),
                path: item.link.slice(_this.site.length),
            });
        });
        return chapter.reverse();
    };
    RanobesPlugin.prototype.popularNovels = function (page) {
        return __awaiter(this, void 0, void 0, function () {
            var link, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        link = "".concat(this.site, "/").concat(this.options.path, "/page/").concat(page, "/");
                        return [4 /*yield*/, this.safeFecth(link)];
                    case 1:
                        body = _a.sent();
                        return [2 /*return*/, this.parseNovels(body)];
                }
            });
        });
    };
    RanobesPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var baseUrl, html, novel, isCover, isAuthor, isSummary, isStatus, isStatusText, isGenres, isGenresText, isMaxChapters, isChapter, isChapterTitle, isChapterDate, genreArray, chapters, tempchapter, maxChapters, fixDate, parser;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        baseUrl = this.site;
                        return [4 /*yield*/, this.safeFecth(baseUrl + novelPath)];
                    case 1:
                        html = _a.sent();
                        novel = {
                            path: novelPath,
                            name: '',
                            summary: '',
                            chapters: [],
                            totalPages: 1,
                        };
                        isCover = false;
                        isAuthor = false;
                        isSummary = false;
                        isStatus = false;
                        isStatusText = false;
                        isGenres = false;
                        isGenresText = false;
                        isMaxChapters = false;
                        isChapter = false;
                        isChapterTitle = false;
                        isChapterDate = false;
                        genreArray = [];
                        chapters = [];
                        tempchapter = {};
                        maxChapters = 0;
                        fixDate = this.parseDate;
                        parser = new htmlparser2_1.Parser({
                            onopentag: function (name, attribs) {
                                if (attribs['class'] === 'poster') {
                                    isCover = true;
                                }
                                if (isCover && name === 'img') {
                                    novel.name = attribs['alt'];
                                    novel.cover = baseUrl + attribs['src'];
                                }
                                if ((name === 'div' &&
                                    attribs['class'] === 'moreless cont-text showcont-h') ||
                                    (attribs['class'] === 'cont-text showcont-h' &&
                                        attribs['itemprop'] === 'description')) {
                                    isSummary = true;
                                }
                                if (name === 'li' &&
                                    attribs['title'] &&
                                    (attribs['title'].includes('Original status') ||
                                        attribs['title'].includes('Статус оригинала'))) {
                                    isStatus = true;
                                }
                                if (name === 'a' && attribs['rel'] === 'chapter') {
                                    isChapter = true;
                                    tempchapter.path = attribs['href'].replace(baseUrl, '');
                                }
                                if (isChapter &&
                                    name === 'span' &&
                                    attribs['class'] === 'title ellipses') {
                                    isChapterTitle = true;
                                }
                                if (isChapter && name === 'span' && attribs['class'] === 'grey') {
                                    isChapterDate = true;
                                }
                                if (name === 'li' &&
                                    (attribs['title'] ==
                                        'Glossary + illustrations + division of chapters, etc.' ||
                                        attribs['title'] ===
                                            'Глоссарий + иллюстраций + разделение глав и т.д.')) {
                                    isMaxChapters = true;
                                }
                            },
                            onopentagname: function (name) {
                                if (isSummary && name === 'br') {
                                    novel.summary += '\n';
                                }
                                if (isStatus && name === 'a') {
                                    isStatusText = true;
                                }
                                if (isGenres && name === 'a') {
                                    isGenresText = true;
                                }
                            },
                            onattribute: function (name, value) {
                                if (name === 'itemprop' && value === 'creator') {
                                    isAuthor = true;
                                }
                                if (name === 'id' && value === 'mc-fs-genre') {
                                    isGenres = true;
                                }
                            },
                            ontext: function (data) {
                                if (isAuthor) {
                                    novel.author = data;
                                }
                                if (isSummary) {
                                    novel.summary += data.trim();
                                }
                                if (isStatusText) {
                                    novel.status =
                                        data === 'Ongoing' || data == 'В процессе'
                                            ? novelStatus_1.NovelStatus.Ongoing
                                            : novelStatus_1.NovelStatus.Completed;
                                }
                                if (isGenresText) {
                                    genreArray.push(data);
                                }
                                if (isMaxChapters) {
                                    var isNumber = data.replace(/\D/g, '');
                                    if (isNumber) {
                                        maxChapters = parseInt(isNumber, 10);
                                    }
                                }
                                if (isChapter) {
                                    if (isChapterTitle)
                                        tempchapter.name = data.trim();
                                    if (isChapterDate)
                                        tempchapter.releaseTime = fixDate(data.trim());
                                }
                            },
                            onclosetag: function (name) {
                                if (name === 'a') {
                                    isCover = false;
                                    isAuthor = false;
                                    isStatusText = false;
                                    isGenresText = false;
                                    isStatus = false;
                                }
                                if (name === 'div') {
                                    isSummary = false;
                                    isGenres = false;
                                }
                                if (name === 'li') {
                                    isMaxChapters = false;
                                }
                                if (name === 'a') {
                                    isChapter = false;
                                    if (tempchapter.name) {
                                        chapters.push(__assign(__assign({}, tempchapter), { page: '1' }));
                                        tempchapter = {};
                                    }
                                }
                                if (name === 'span') {
                                    if (isChapterTitle)
                                        isChapterTitle = false;
                                    if (isChapterDate)
                                        isChapterDate = false;
                                }
                            },
                        });
                        parser.write(html);
                        parser.end();
                        novel.genres = genreArray.join(', ');
                        novel.totalPages = Math.ceil((maxChapters || 1) / 25);
                        novel.chapters = chapters;
                        if (novel.chapters[0].path) {
                            novel.latestChapter = novel.chapters[0];
                        }
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    RanobesPlugin.prototype.parsePage = function (novelPath, page) {
        return __awaiter(this, void 0, void 0, function () {
            var pagePath, firstUrl, pageBody, baseUrl, isScript, isChapter, isChapterInfo, isChapterDate, chapters, tempchapter, fixDate, dataJson, parser;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        pagePath = this.id == 'ranobes'
                            ? novelPath.split('-')[0]
                            : '/' + novelPath.split('-').slice(1).join('-').split('.')[0];
                        firstUrl = this.site + '/chapters' + pagePath.replace(this.options.path + '/', '');
                        return [4 /*yield*/, this.safeFecth(firstUrl + '/page/' + page)];
                    case 1:
                        pageBody = _b.sent();
                        baseUrl = this.site;
                        isScript = false;
                        isChapter = false;
                        isChapterInfo = false;
                        isChapterDate = false;
                        chapters = [];
                        tempchapter = {};
                        fixDate = this.parseDate;
                        dataJson = { pages_count: '', chapters: [] };
                        parser = new htmlparser2_1.Parser({
                            onopentag: function (name, attribs) {
                                if (name === 'div' && attribs['class'] === 'cat_block cat_line') {
                                    isChapter = true;
                                }
                                if (isChapter && name === 'a' && attribs['title'] && attribs['href']) {
                                    tempchapter.name = attribs['title'];
                                    tempchapter.path = attribs['href'].replace(baseUrl, '');
                                }
                                if (name === 'span' && attribs['class'] === 'grey small') {
                                    isChapterInfo = true;
                                }
                                if (name === 'small' && isChapterInfo) {
                                    isChapterDate = true;
                                }
                            },
                            ontext: function (data) {
                                if (isChapterDate)
                                    tempchapter.releaseTime = fixDate(data.trim());
                                if (isScript) {
                                    if (data.includes('window.__DATA__ =')) {
                                        dataJson = JSON.parse(data.replace('window.__DATA__ =', ''));
                                    }
                                }
                            },
                            onclosetag: function (name) {
                                if (name === 'a' && tempchapter.name) {
                                    chapters.push(tempchapter);
                                    tempchapter = {};
                                }
                                if (name === 'div') {
                                    isChapter = false;
                                }
                                if (name === 'span') {
                                    isChapterInfo = false;
                                }
                                if (name === 'small') {
                                    isChapterDate = false;
                                }
                                if (name === 'main') {
                                    isScript = true;
                                }
                                if (name === 'script') {
                                    isScript = false;
                                }
                            },
                        });
                        parser.write(pageBody);
                        parser.end();
                        if ((_a = dataJson.chapters) === null || _a === void 0 ? void 0 : _a.length) {
                            chapters = this.parseChapters(dataJson);
                        }
                        return [2 /*return*/, {
                                chapters: chapters,
                            }];
                }
            });
        });
    };
    RanobesPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var html, indexA, indexB, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.safeFecth(this.site + chapterPath)];
                    case 1:
                        html = _a.sent();
                        indexA = html.indexOf('<div class="text" id="arrticle">');
                        indexB = html.indexOf('<div class="category grey ellipses">', indexA);
                        chapterText = html.substring(indexA, indexB);
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    RanobesPlugin.prototype.searchNovels = function (searchTerm, page) {
        return __awaiter(this, void 0, void 0, function () {
            var html, link;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.id === 'ranobes-ru')) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.safeFecth(this.site + '/index.php?do=search', {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    Referer: this.site + '/',
                                },
                                method: 'POST',
                                body: new URLSearchParams({
                                    do: 'search',
                                    subaction: 'search',
                                    search_start: page.toString(),
                                    story: searchTerm,
                                }).toString(),
                            })];
                    case 1:
                        html = _a.sent();
                        return [3 /*break*/, 4];
                    case 2:
                        link = "".concat(this.site, "/search/").concat(searchTerm, "/page/").concat(page);
                        return [4 /*yield*/, this.safeFecth(link)];
                    case 3:
                        html = _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/, this.parseNovels(html)];
                }
            });
        });
    };
    return RanobesPlugin;
}());
