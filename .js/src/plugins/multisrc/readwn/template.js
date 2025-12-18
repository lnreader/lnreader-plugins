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
var ReadwnPlugin = /** @class */ (function () {
    function ReadwnPlugin(metadata) {
        var _a;
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/readwn/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        var versionIncrements = ((_a = metadata.options) === null || _a === void 0 ? void 0 : _a.versionIncrements) || 0;
        this.version = "1.0.".concat(2 + versionIncrements);
        this.filters = metadata.filters;
    }
    ReadwnPlugin.prototype.popularNovels = function (pageNo_1, _a) {
        return __awaiter(this, arguments, void 0, function (pageNo, _b) {
            var url, body, loadedCheerio, novels;
            var _this = this;
            var _c, _d, _e, _f;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        url = this.site + '/list/';
                        url += (((_c = filters === null || filters === void 0 ? void 0 : filters.genres) === null || _c === void 0 ? void 0 : _c.value) || 'all') + '/';
                        url += (((_d = filters === null || filters === void 0 ? void 0 : filters.status) === null || _d === void 0 ? void 0 : _d.value) || 'all') + '-';
                        url += showLatestNovels ? 'lastdotime' : ((_e = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _e === void 0 ? void 0 : _e.value) || 'newstime';
                        url += '-' + (pageNo - 1) + '.html';
                        if ((_f = filters === null || filters === void 0 ? void 0 : filters.tags) === null || _f === void 0 ? void 0 : _f.value) {
                            //only 1 page
                            url = this.site + '/tags/' + filters.tags.value + '-0.html';
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _g.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = loadedCheerio('li.novel-item')
                            .map(function (index, element) { return ({
                            name: loadedCheerio(element).find('h4').text() || '',
                            cover: _this.site +
                                loadedCheerio(element).find('.novel-cover > img').attr('data-src'),
                            path: loadedCheerio(element).find('a').attr('href') || '',
                        }); })
                            .get()
                            .filter(function (novel) { return novel.name && novel.path; });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    ReadwnPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, novel, latestChapterNo, chapters, lastChapterNo, i;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + novelPath).then(function (res) { return res.text(); })];
                    case 1:
                        body = _b.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            path: novelPath,
                            name: loadedCheerio('h1.novel-title').text() || '',
                        };
                        novel.author = loadedCheerio('span[itemprop=author]').text();
                        novel.cover =
                            this.site + loadedCheerio('figure.cover > img').attr('data-src');
                        novel.summary = loadedCheerio('.summary')
                            .text()
                            .replace('Summary', '')
                            .trim();
                        novel.genres = loadedCheerio('div.categories > ul > li')
                            .map(function (index, element) { var _a; return (_a = loadedCheerio(element).text()) === null || _a === void 0 ? void 0 : _a.trim(); })
                            .get()
                            .join(',');
                        loadedCheerio('div.header-stats > span').each(function () {
                            if (loadedCheerio(this).find('small').text() === 'Status') {
                                novel.status =
                                    loadedCheerio(this).find('strong').text() === 'Ongoing'
                                        ? novelStatus_1.NovelStatus.Ongoing
                                        : novelStatus_1.NovelStatus.Completed;
                            }
                        });
                        latestChapterNo = parseInt(loadedCheerio('.header-stats')
                            .find('span > strong')
                            .first()
                            .text()
                            .trim());
                        chapters = loadedCheerio('.chapter-list li')
                            .map(function (chapterIndex, element) {
                            var _a, _b, _c;
                            var name = loadedCheerio(element)
                                .find('a .chapter-title')
                                .text()
                                .trim();
                            var path = (_a = loadedCheerio(element).find('a').attr('href')) === null || _a === void 0 ? void 0 : _a.trim();
                            if (!name || !path)
                                return null;
                            var releaseTime = loadedCheerio(element)
                                .find('a .chapter-update')
                                .text()
                                .trim();
                            if ((_b = releaseTime === null || releaseTime === void 0 ? void 0 : releaseTime.includes) === null || _b === void 0 ? void 0 : _b.call(releaseTime, 'ago')) {
                                var timeAgo = ((_c = releaseTime.match(/\d+/)) === null || _c === void 0 ? void 0 : _c[0]) || '0';
                                var timeAgoInt = parseInt(timeAgo, 10);
                                if (timeAgoInt) {
                                    var dayJSDate = (0, dayjs_1.default)(); // today
                                    if (releaseTime.includes('hours ago') ||
                                        releaseTime.includes('hour ago')) {
                                        dayJSDate.subtract(timeAgoInt, 'hours'); // go back N hours
                                    }
                                    if (releaseTime.includes('days ago') ||
                                        releaseTime.includes('day ago')) {
                                        dayJSDate.subtract(timeAgoInt, 'days'); // go back N days
                                    }
                                    if (releaseTime.includes('months ago') ||
                                        releaseTime.includes('month ago')) {
                                        dayJSDate.subtract(timeAgoInt, 'months'); // go back N months
                                    }
                                    releaseTime = dayJSDate.format('LL');
                                }
                            }
                            return {
                                name: name,
                                path: path,
                                releaseTime: releaseTime,
                                chapterNumber: chapterIndex + 1,
                            };
                        })
                            .get()
                            .filter(function (chapter) { return chapter; });
                        if (latestChapterNo > chapters.length) {
                            lastChapterNo = parseInt(((_a = chapters[chapters.length - 1].path.match(/_(\d+)\.html/)) === null || _a === void 0 ? void 0 : _a[1]) || '', 10);
                            for (i = (lastChapterNo || chapters.length) + 1; i <= latestChapterNo; i++) {
                                chapters.push({
                                    name: 'Chapter ' + i,
                                    path: novelPath.replace('.html', '_' + i + '.html'),
                                    releaseTime: null,
                                    chapterNumber: i,
                                });
                            }
                        }
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    ReadwnPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + chapterPath).then(function (res) {
                            return res.text();
                        })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        chapterText = loadedCheerio('.chapter-content').html() || '';
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    ReadwnPlugin.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var result, loadedCheerio, novels;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + '/e/search/index.php', {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                Referer: this.site + '/search.html',
                                Origin: this.site,
                            },
                            method: 'POST',
                            body: new URLSearchParams({
                                show: 'title',
                                tempid: 1,
                                tbname: 'news',
                                keyboard: searchTerm,
                            }).toString(),
                        }).then(function (res) { return res.text(); })];
                    case 1:
                        result = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(result);
                        novels = loadedCheerio('li.novel-item')
                            .map(function (index, element) { return ({
                            name: loadedCheerio(element).find('h4').text() || '',
                            cover: _this.site + loadedCheerio(element).find('img').attr('data-src'),
                            path: loadedCheerio(element).find('a').attr('href') || '',
                        }); })
                            .get()
                            .filter(function (novel) { return novel.name && novel.path; });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return ReadwnPlugin;
}());
