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
var cheerio_1 = require("cheerio");
var defaultCover_1 = require("@libs/defaultCover");
var novelStatus_1 = require("@libs/novelStatus");
var dayjs_1 = __importDefault(require("dayjs"));
var storage_1 = require("@libs/storage");
var includesAny = function (str, keywords) {
    return new RegExp(keywords.join('|')).test(str);
};
var MadaraPlugin = /** @class */ (function () {
    function MadaraPlugin(metadata) {
        var _a, _b;
        this.hideLocked = storage_1.storage.get('hideLocked');
        this.parseData = function (date) {
            var _a;
            var dayJSDate = (0, dayjs_1.default)(); // today
            var timeAgo = ((_a = date.match(/\d+/)) === null || _a === void 0 ? void 0 : _a[0]) || '';
            var timeAgoInt = parseInt(timeAgo, 10);
            if (!timeAgo)
                return date; // there is no number!
            if (includesAny(date, ['detik', 'segundo', 'second', 'วินาที'])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'second'); // go back N seconds
            }
            else if (includesAny(date, [
                'menit',
                'dakika',
                'min',
                'minute',
                'minuto',
                'นาที',
                'دقائق',
            ])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'minute'); // go back N minute
            }
            else if (includesAny(date, [
                'jam',
                'saat',
                'heure',
                'hora',
                'hour',
                'ชั่วโมง',
                'giờ',
                'ore',
                'ساعة',
                '小时',
            ])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'hours'); // go back N hours
            }
            else if (includesAny(date, [
                'hari',
                'gün',
                'jour',
                'día',
                'dia',
                'day',
                'วัน',
                'ngày',
                'giorni',
                'أيام',
                '天',
            ])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'days'); // go back N days
            }
            else if (includesAny(date, ['week', 'semana'])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'week'); // go back N a week
            }
            else if (includesAny(date, ['month', 'mes'])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'month'); // go back N months
            }
            else if (includesAny(date, ['year', 'año'])) {
                dayJSDate = dayJSDate.subtract(timeAgoInt, 'year'); // go back N years
            }
            else {
                if ((0, dayjs_1.default)(date).format('LL') !== 'Invalid Date') {
                    return (0, dayjs_1.default)(date).format('LL');
                }
                return date;
            }
            return dayJSDate.format('LL');
        };
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/madara/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        var versionIncrements = ((_a = metadata.options) === null || _a === void 0 ? void 0 : _a.versionIncrements) || 0;
        this.version = "1.0.".concat(8 + versionIncrements);
        this.options = metadata.options;
        this.filters = metadata.filters;
        if ((_b = this.options) === null || _b === void 0 ? void 0 : _b.hasLocked) {
            this.pluginSettings = {
                hideLocked: {
                    value: '',
                    label: 'Hide locked chapters',
                    type: 'Switch',
                },
            };
        }
    }
    MadaraPlugin.prototype.translateDragontea = function (text) {
        var _a;
        if (this.id !== 'dragontea')
            return text;
        var $ = (0, cheerio_1.load)(((_a = text
            .html()) === null || _a === void 0 ? void 0 : _a.replace('\n', '').replace(/<br\s*\/?>/g, '\n')) || '');
        var reverseAlpha = 'zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA';
        var forwardAlpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        text.html($.html());
        text
            .find('*')
            .addBack()
            .contents()
            .filter(function (_, el) { return el.nodeType === 3; })
            .each(function (_, el) {
            var $el = $(el);
            var translated = $el
                .text()
                .normalize('NFD')
                .split('')
                .map(function (char) {
                var base = char.normalize('NFC');
                var idx = forwardAlpha.indexOf(base);
                return idx >= 0
                    ? reverseAlpha[idx] + char.slice(base.length)
                    : char;
            })
                .join('');
            $el.replaceWith(translated.replace('\n', '<br>'));
        });
        return text;
    };
    MadaraPlugin.prototype.getHostname = function (url) {
        url = url.split('/')[2];
        var url_parts = url.split('.');
        url_parts.pop(); // remove TLD
        return url_parts.join('.');
    };
    MadaraPlugin.prototype.getCheerio = function (url, search) {
        return __awaiter(this, void 0, void 0, function () {
            var r, $, _a, title;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        r = _b.sent();
                        if (!r.ok && search != true)
                            throw new Error('Could not reach site (' + r.status + ') try to open in webview.');
                        _a = cheerio_1.load;
                        return [4 /*yield*/, r.text()];
                    case 2:
                        $ = _a.apply(void 0, [_b.sent()]);
                        title = $('title').text().trim();
                        if (this.getHostname(url) != this.getHostname(r.url) ||
                            title == 'Bot Verification' ||
                            title == 'You are being redirected...' ||
                            title == 'Un instant...' ||
                            title == 'Just a moment...' ||
                            title == 'Redirecting...')
                            throw new Error('Captcha error, please open in webview');
                        return [2 /*return*/, $];
                }
            });
        });
    };
    MadaraPlugin.prototype.parseNovels = function (loadedCheerio) {
        var novels = [];
        loadedCheerio('.manga-title-badges').remove();
        loadedCheerio('.page-item-detail, .c-tabs-item__content').each(function (index, element) {
            var novelName = loadedCheerio(element)
                .find('.post-title')
                .text()
                .trim();
            var novelUrl = loadedCheerio(element).find('.post-title').find('a').attr('href') ||
                '';
            if (!novelName || !novelUrl)
                return;
            var image = loadedCheerio(element).find('img');
            var novelCover = image.attr('data-src') ||
                image.attr('src') ||
                image.attr('data-lazy-srcset') ||
                defaultCover_1.defaultCover;
            var novel = {
                name: novelName,
                cover: novelCover,
                path: novelUrl.replace(/https?:\/\/.*?\//, '/'),
            };
            novels.push(novel);
        });
        return novels;
    };
    MadaraPlugin.prototype.popularNovels = function (pageNo_1, _a) {
        return __awaiter(this, arguments, void 0, function (pageNo, _b) {
            var url, key, _i, _c, value, loadedCheerio;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        url = this.site + '/page/' + pageNo + '/?s=&post_type=wp-manga';
                        if (!filters)
                            filters = this.filters || {};
                        if (showLatestNovels)
                            url += '&m_orderby=latest';
                        for (key in filters) {
                            if (typeof filters[key].value === 'object')
                                for (_i = 0, _c = filters[key].value; _i < _c.length; _i++) {
                                    value = _c[_i];
                                    url += "&".concat(key, "=").concat(value);
                                }
                            else if (filters[key].value)
                                url += "&".concat(key, "=").concat(filters[key].value);
                        }
                        return [4 /*yield*/, this.getCheerio(url, pageNo != 1)];
                    case 1:
                        loadedCheerio = _d.sent();
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    MadaraPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var loadedCheerio, novel, chapters, html, novelId, formData, totalChapters;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getCheerio(this.site + novelPath, false)];
                    case 1:
                        loadedCheerio = _b.sent();
                        loadedCheerio('.manga-title-badges, #manga-title span').remove();
                        novel = {
                            path: novelPath,
                            name: loadedCheerio('.post-title h1').text().trim() ||
                                loadedCheerio('#manga-title h1').text().trim() ||
                                loadedCheerio('.manga-title').text().trim() ||
                                '',
                        };
                        novel.cover =
                            loadedCheerio('.summary_image > a > img').attr('data-lazy-src') ||
                                loadedCheerio('.summary_image > a > img').attr('data-src') ||
                                loadedCheerio('.summary_image > a > img').attr('src') ||
                                defaultCover_1.defaultCover;
                        loadedCheerio('.post-content_item, .post-content').each(function () {
                            var detailName = loadedCheerio(this).find('h5').text().trim();
                            var detail = loadedCheerio(this).find('.summary-content') ||
                                loadedCheerio(this).find('.summary_content');
                            switch (detailName) {
                                case 'Genre(s)':
                                case 'Genre':
                                case 'Tags(s)':
                                case 'Tag(s)':
                                case 'Tags':
                                case 'Género(s)':
                                case 'Kategori':
                                case 'التصنيفات':
                                    if (novel.genres)
                                        novel.genres +=
                                            ', ' +
                                                detail
                                                    .find('a')
                                                    .map(function (i, el) { return loadedCheerio(el).text(); })
                                                    .get()
                                                    .join(', ');
                                    else
                                        novel.genres = detail
                                            .find('a')
                                            .map(function (i, el) { return loadedCheerio(el).text(); })
                                            .get()
                                            .join(', ');
                                    break;
                                case 'Author(s)':
                                case 'Author':
                                case 'Autor(es)':
                                case 'المؤلف':
                                case 'المؤلف (ين)':
                                    novel.author = detail.text().trim();
                                    break;
                                case 'Status':
                                case 'Novel':
                                case 'Estado':
                                case 'Durum':
                                    novel.status =
                                        detail.text().trim().includes('OnGoing') ||
                                            detail.text().trim().includes('مستمرة')
                                            ? novelStatus_1.NovelStatus.Ongoing
                                            : novelStatus_1.NovelStatus.Completed;
                                    break;
                                case 'Artist(s)':
                                    novel.artist = detail.text().trim();
                                    break;
                            }
                        });
                        // Checks for "Madara NovelHub" version
                        {
                            if (!novel.genres)
                                novel.genres = loadedCheerio('.genres-content').text().trim();
                            if (!novel.status)
                                novel.status = loadedCheerio('.manga-status')
                                    .text()
                                    .trim()
                                    .includes('OnGoing')
                                    ? novelStatus_1.NovelStatus.Ongoing
                                    : novelStatus_1.NovelStatus.Completed;
                            if (!novel.author)
                                novel.author = loadedCheerio('.manga-author a').text().trim();
                            if (!novel.rating)
                                novel.rating = parseFloat(loadedCheerio('.post-rating span').text().trim());
                        }
                        if (!novel.author)
                            novel.author = loadedCheerio('.manga-authors').text().trim();
                        loadedCheerio('div.summary__content .code-block,script,noscript').remove();
                        novel.summary =
                            this.translateDragontea(loadedCheerio('div.summary__content'))
                                .text()
                                .trim() ||
                                loadedCheerio('#tab-manga-about').text().trim() ||
                                loadedCheerio('.post-content_item h5:contains("Summary")')
                                    .next()
                                    .find('span')
                                    .map(function (i, el) { return loadedCheerio(el).text(); })
                                    .get()
                                    .join('\n\n')
                                    .trim() ||
                                loadedCheerio('.manga-summary p')
                                    .map(function (i, el) { return loadedCheerio(el).text(); })
                                    .get()
                                    .join('\n\n')
                                    .trim() ||
                                loadedCheerio('.manga-excerpt p')
                                    .map(function (i, el) { return loadedCheerio(el).text(); })
                                    .get()
                                    .join('\n\n')
                                    .trim();
                        chapters = [];
                        html = '';
                        if (!((_a = this.options) === null || _a === void 0 ? void 0 : _a.useNewChapterEndpoint)) return [3 /*break*/, 3];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + novelPath + 'ajax/chapters/', {
                                method: 'POST',
                                referrer: this.site + novelPath,
                            }).then(function (res) { return res.text(); })];
                    case 2:
                        html = _b.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        novelId = loadedCheerio('.rating-post-id').attr('value') ||
                            loadedCheerio('#manga-chapters-holder').attr('data-id') ||
                            '';
                        formData = new FormData();
                        formData.append('action', 'manga_get_chapters');
                        formData.append('manga', novelId);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + 'wp-admin/admin-ajax.php', {
                                method: 'POST',
                                body: formData,
                            }).then(function (res) { return res.text(); })];
                    case 4:
                        html = _b.sent();
                        _b.label = 5;
                    case 5:
                        if (html !== '0') {
                            loadedCheerio = (0, cheerio_1.load)(html);
                        }
                        totalChapters = loadedCheerio('.wp-manga-chapter').length;
                        loadedCheerio('.wp-manga-chapter').each(function (chapterIndex, element) {
                            var chapterName = loadedCheerio(element).find('a').text().trim();
                            var locked = element.attribs['class'].includes('premium-block');
                            if (locked) {
                                chapterName = '🔒 ' + chapterName;
                            }
                            var releaseDate = loadedCheerio(element)
                                .find('span.chapter-release-date')
                                .text()
                                .trim();
                            if (releaseDate) {
                                releaseDate = _this.parseData(releaseDate);
                            }
                            else {
                                releaseDate = (0, dayjs_1.default)().format('LL');
                            }
                            var chapterUrl = loadedCheerio(element).find('a').attr('href') || '';
                            if (chapterUrl && chapterUrl != '#' && !(locked && _this.hideLocked)) {
                                chapters.push({
                                    name: chapterName,
                                    path: chapterUrl.replace(/https?:\/\/.*?\//, '/'),
                                    releaseTime: releaseDate || null,
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
    MadaraPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var loadedCheerio, chapterText;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getCheerio(this.site + chapterPath, false)];
                    case 1:
                        loadedCheerio = _b.sent();
                        chapterText = loadedCheerio('.text-left') ||
                            loadedCheerio('.text-right') ||
                            loadedCheerio('.entry-content') ||
                            loadedCheerio('.c-blog-post > div > div:nth-child(2)');
                        if ((_a = this.options) === null || _a === void 0 ? void 0 : _a.customJs) {
                            try {
                                // CustomJS HERE
                            }
                            catch (error) {
                                console.error('Error executing customJs:', error);
                                throw error;
                            }
                        }
                        return [2 /*return*/, this.translateDragontea(chapterText).html() || ''];
                }
            });
        });
    };
    MadaraPlugin.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var url, loadedCheerio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site +
                            '/page/' +
                            pageNo +
                            '/?s=' +
                            encodeURIComponent(searchTerm) +
                            '&post_type=wp-manga';
                        return [4 /*yield*/, this.getCheerio(url, true)];
                    case 1:
                        loadedCheerio = _a.sent();
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    return MadaraPlugin;
}());
