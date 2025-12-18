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
var filterInputs_1 = require("@libs/filterInputs");
var dayjs_1 = __importDefault(require("dayjs"));
var NovelCoolPlugin = /** @class */ (function () {
    function NovelCoolPlugin(metadata) {
        var _this = this;
        var _a;
        this.resolveUrl = function (path, isNovel) {
            return _this.site + (isNovel ? '/novel/' : '/chapter/') + path.split('?id=')[0];
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.site = metadata.sourceSite;
        this.icon = 'multisrc/novelcool/novelcool/icon.png';
        this.mainUrl = 'https://api.novelcool.com';
        this.version = '1.0.0';
        this.options = (_a = metadata.options) !== null && _a !== void 0 ? _a : {};
        this.filters = {
            sortby: {
                label: 'Order by',
                value: 'hot',
                options: [
                    { label: 'Hottest', value: 'hot' },
                    { label: 'Latest', value: 'latest' },
                    { label: 'New Books', value: 'new_book' },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    NovelCoolPlugin.prototype.popularNovels = function (page_1, _a) {
        return __awaiter(this, arguments, void 0, function (page, _b) {
            var sortby, list, novels;
            var _c;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        sortby = showLatestNovels
                            ? 'latest'
                            : ((_c = filters === null || filters === void 0 ? void 0 : filters.sortby) === null || _c === void 0 ? void 0 : _c.value) || 'hot';
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.mainUrl + '/elite/' + sortby, {
                                headers: {
                                    'User-Agent': this.options.app.userAgent,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                method: 'post',
                                body: new URLSearchParams({
                                    appId: this.options.app.appId,
                                    secret: this.options.app.secret,
                                    package_name: this.options.app.package_name,
                                    lc_type: 'novel',
                                    lang: this.options.langCode,
                                    page: page.toString(),
                                    page_size: '20',
                                }).toString(),
                            }).then(function (res) { return res.json(); })];
                    case 1:
                        list = (_d.sent()).list;
                        novels = [];
                        list.forEach(function (novel) {
                            return novels.push({
                                name: novel.name,
                                cover: novel.cover,
                                path: novel.visit_path + '?id=' + novel.id,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    NovelCoolPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var book_id, info, novel, chapters, list;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        book_id = novelPath.split('?id=')[1];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.mainUrl + '/book/info/', {
                                headers: {
                                    'User-Agent': this.options.app.userAgent,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                method: 'post',
                                body: new URLSearchParams({
                                    book_id: book_id,
                                    appId: this.options.app.appId,
                                    secret: this.options.app.secret,
                                    package_name: this.options.app.package_name,
                                    lang: this.options.langCode,
                                }).toString(),
                            }).then(function (res) { return res.json(); })];
                    case 1:
                        info = (_a.sent()).info;
                        novel = {
                            path: novelPath,
                            name: info.name,
                            cover: info.cover,
                            genres: info.category_list.join(','),
                            summary: info.intro,
                            author: info.author,
                            artist: info.artist,
                            status: info.completed === 'YES' ? novelStatus_1.NovelStatus.Completed : novelStatus_1.NovelStatus.Ongoing,
                            rating: (info.rate_star && parseFloat(info.rate_star)) || undefined,
                        };
                        chapters = [];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.mainUrl + '/chapter/book_list/', {
                                headers: {
                                    'User-Agent': this.options.app.userAgent,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                method: 'post',
                                body: new URLSearchParams({
                                    book_id: book_id,
                                    appId: this.options.app.appId,
                                    secret: this.options.app.secret,
                                    package_name: this.options.app.package_name,
                                    lang: this.options.langCode,
                                }).toString(),
                            }).then(function (res) { return res.json(); })];
                    case 2:
                        list = (_a.sent()).list;
                        list.forEach(function (chapter) {
                            if (!chapter.is_locked) {
                                chapters.push({
                                    name: chapter.title,
                                    path: chapter.book_id + '/' + chapter.id,
                                    releaseTime: (0, dayjs_1.default)(parseInt(chapter.last_modify, 10) * 1000).format('LLL'),
                                    chapterNumber: parseInt(chapter.order_id, 10),
                                });
                            }
                        });
                        novel.chapters = chapters.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    NovelCoolPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, chapter_id, info;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = chapterPath.split('/'), chapter_id = _a[1];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.mainUrl + '/chapter/info/', {
                                headers: {
                                    'User-Agent': this.options.app.userAgent,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                method: 'post',
                                body: new URLSearchParams({
                                    chapter_id: chapter_id,
                                    appId: this.options.app.appId,
                                    secret: this.options.app.secret,
                                    package_name: this.options.app.package_name,
                                    lang: this.options.langCode,
                                }).toString(),
                            }).then(function (res) { return res.json(); })];
                    case 1:
                        info = (_b.sent()).info;
                        return [2 /*return*/, info.content];
                }
            });
        });
    };
    NovelCoolPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var list, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.mainUrl + '/book/search/', {
                            headers: {
                                'User-Agent': this.options.app.userAgent,
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            method: 'post',
                            body: new URLSearchParams({
                                appId: this.options.app.appId,
                                secret: this.options.app.secret,
                                package_name: this.options.app.package_name,
                                keyword: searchTerm,
                                lc_type: 'novel',
                                lang: this.options.langCode,
                                page: pageNo.toString(),
                                page_size: '20',
                            }).toString(),
                        }).then(function (res) { return res.json(); })];
                    case 1:
                        list = (_a.sent()).list;
                        novels = [];
                        list.forEach(function (novel) {
                            return novels.push({
                                name: novel.name,
                                cover: novel.cover,
                                path: novel.visit_path + '?id=' + novel.id,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return NovelCoolPlugin;
}());
