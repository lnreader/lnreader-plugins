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
var ReadNovelFullPlugin = /** @class */ (function () {
    function ReadNovelFullPlugin(metadata) {
        var _a;
        this.lastSearch = null;
        this.searchInterval = 3400;
        this.id = metadata.id;
        this.name = metadata.sourceName;
        this.icon = "multisrc/readnovelfull/".concat(metadata.id.toLowerCase(), "/icon.png");
        this.site = metadata.sourceSite;
        var versionIncrements = ((_a = metadata.options) === null || _a === void 0 ? void 0 : _a.versionIncrements) || 0;
        this.version = "2.1.".concat(2 + versionIncrements);
        this.options = metadata.options;
        this.filters = metadata.filters;
    }
    ReadNovelFullPlugin.prototype.sleep = function (ms) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
            });
        });
    };
    ReadNovelFullPlugin.prototype.parseNovels = function (html) {
        var _this = this;
        var novels = [];
        var tempNovel = {};
        var depth;
        var stateStack = [ParsingState.Idle];
        var currentState = function () { return stateStack[stateStack.length - 1]; };
        var pushState = function (state) { return stateStack.push(state); };
        var popState = function () {
            return stateStack.length > 1 ? stateStack.pop() : currentState();
        };
        var parser = new htmlparser2_1.Parser({
            onopentag: function (name, attribs) {
                var _a;
                var state = currentState();
                if (((_a = attribs.class) === null || _a === void 0 ? void 0 : _a.includes('archive')) ||
                    attribs.class === 'col-content') {
                    pushState(ParsingState.NovelList);
                    depth = 0;
                }
                if (state !== ParsingState.NovelList &&
                    state !== ParsingState.NovelName)
                    return;
                switch (name) {
                    case 'img':
                        var cover = attribs['data-src'] || attribs.src;
                        if (cover) {
                            tempNovel.cover = new URL(cover, _this.site).href;
                        }
                        break;
                    case 'h3':
                        if (state === ParsingState.NovelList) {
                            pushState(ParsingState.NovelName);
                        }
                        break;
                    case 'a':
                        if (state === ParsingState.NovelName) {
                            var href = attribs.href;
                            if (href) {
                                tempNovel.path = new URL(href, _this.site).pathname.substring(1);
                                tempNovel.name = attribs.title;
                            }
                        }
                        break;
                    case 'div':
                        depth++;
                        break;
                    default:
                        return;
                }
            },
            onclosetag: function (name) {
                var state = currentState();
                if (name === 'a' && state === ParsingState.NovelName) {
                    if (tempNovel.name && tempNovel.path) {
                        novels.push(__assign({}, tempNovel));
                    }
                    tempNovel = {};
                    popState();
                }
                if (name === 'div' && state === ParsingState.NovelList) {
                    depth--;
                    if (depth < 0)
                        popState();
                }
            },
        });
        parser.write(html);
        parser.end();
        return novels;
    };
    ReadNovelFullPlugin.prototype.popularNovels = function (pageNo_1, _a) {
        return __awaiter(this, arguments, void 0, function (pageNo, _b) {
            var _c, _d, pageParam, novelListing, _e, typeParam, latestPage, _f, genreParam, _g, genreKey, langParam, urlLangCode, _h, noPages, _j, pageAsPath, url, params, basePage, result, html;
            var filters = _b.filters, showLatestNovels = _b.showLatestNovels;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        _c = this.options, _d = _c.pageParam, pageParam = _d === void 0 ? 'page' : _d, novelListing = _c.novelListing, _e = _c.typeParam, typeParam = _e === void 0 ? 'type' : _e, latestPage = _c.latestPage, _f = _c.genreParam, genreParam = _f === void 0 ? 'category_novel' : _f, _g = _c.genreKey, genreKey = _g === void 0 ? 'id' : _g, langParam = _c.langParam, urlLangCode = _c.urlLangCode, _h = _c.noPages, noPages = _h === void 0 ? [] : _h, _j = _c.pageAsPath, pageAsPath = _j === void 0 ? false : _j;
                        // Skip Pagination for FWN & LR
                        if (pageNo !== 1 &&
                            !showLatestNovels &&
                            !filters.genres.value.length &&
                            noPages.length > 0 &&
                            noPages.includes(filters.type.value)) {
                            return [2 /*return*/, []];
                        }
                        url = '';
                        if (novelListing) {
                            params = new URLSearchParams();
                            if (showLatestNovels) {
                                params.append(typeParam, latestPage);
                            }
                            else if (filters.genres.value.length) {
                                params.append(typeParam, genreParam);
                                params.append(genreKey, filters.genres.value);
                            }
                            else {
                                params.append(typeParam, filters.type.value);
                            }
                            // Add language parameter if specified
                            if (langParam && urlLangCode) {
                                params.append(langParam, urlLangCode);
                            }
                            params.append(pageParam, pageNo.toString());
                            url = "".concat(this.site).concat(novelListing, "?").concat(params.toString());
                        }
                        else {
                            basePage = showLatestNovels
                                ? latestPage
                                : filters.genres.value.length
                                    ? filters.genres.value
                                    : filters.type.value;
                            if (pageAsPath) {
                                if (pageNo > 1) {
                                    url = "".concat(this.site).concat(basePage, "/").concat(pageNo.toString());
                                }
                                else {
                                    url = "".concat(this.site).concat(basePage);
                                }
                            }
                            else {
                                url = "".concat(this.site).concat(basePage, "?").concat(pageParam, "=").concat(pageNo.toString());
                            }
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _k.sent();
                        if (!result.ok) {
                            throw new Error("Could not reach site (".concat(result.status, ": ").concat(result.statusText, ") try to open in webview."));
                        }
                        return [4 /*yield*/, result.text()];
                    case 2:
                        html = _k.sent();
                        return [2 /*return*/, this.parseNovels(html)];
                }
            });
        });
    };
    ReadNovelFullPlugin.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, novel, summaryParts, statusParts, authorParts, genreArray, infoParts, chapters, novelId, tempChapter, i, depth, stateStack, currentState, pushState, popState, parser, chapterListing, ajaxParam, params, chaptersUrl, ajaxResult, ajaxBody, ajaxChapters_1, tempAjaxChapter_1, ajaxParser;
            var _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        url = this.site + novelPath;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _b.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _b.sent();
                        novel = {
                            path: novelPath,
                            chapters: [],
                        };
                        summaryParts = [];
                        statusParts = [];
                        authorParts = [];
                        genreArray = [];
                        infoParts = [];
                        chapters = [];
                        novelId = null;
                        tempChapter = {};
                        i = 0;
                        stateStack = [ParsingState.Idle];
                        currentState = function () { return stateStack[stateStack.length - 1]; };
                        pushState = function (state) { return stateStack.push(state); };
                        popState = function () {
                            return stateStack.length > 1 ? stateStack.pop() : currentState();
                        };
                        parser = new htmlparser2_1.Parser({
                            onopentag: function (name, attribs) {
                                var _a, _b, _c;
                                var state = currentState();
                                switch (name) {
                                    case 'div':
                                        switch (attribs.class) {
                                            case 'books':
                                            case 'm-imgtxt':
                                                pushState(ParsingState.Cover);
                                                return;
                                            case 'inner':
                                            case 'desc-text':
                                                if (state === ParsingState.Cover)
                                                    popState();
                                                pushState(ParsingState.Summary);
                                                break;
                                            case 'info':
                                                pushState(ParsingState.Info);
                                                depth = 0;
                                                break;
                                        }
                                        if (!_this.options.noAjax && attribs.id === 'rating') {
                                            novelId = attribs['data-novel-id'];
                                        }
                                        if (state === ParsingState.Info)
                                            depth++;
                                        break;
                                    case 'img':
                                        if (state === ParsingState.Cover) {
                                            var cover = (_b = (_a = attribs.src) !== null && _a !== void 0 ? _a : attribs['data-cfsrc']) !== null && _b !== void 0 ? _b : attribs['data-src'];
                                            var name_1 = attribs.title;
                                            if (cover) {
                                                novel.cover = new URL(cover, _this.site).href;
                                            }
                                            if (name_1) {
                                                novel.name = name_1;
                                            }
                                            else {
                                                popState();
                                            }
                                        }
                                        break;
                                    case 'h3':
                                        if (state === ParsingState.Cover) {
                                            pushState(ParsingState.NovelName);
                                        }
                                        break;
                                    case 'span':
                                        if (state === ParsingState.Cover && attribs.title) {
                                            var newState = {
                                                'Genre': ParsingState.Genres,
                                                'Author': ParsingState.Author,
                                                'Status': ParsingState.Status,
                                            }[attribs.title];
                                            if (newState)
                                                pushState(newState);
                                        }
                                        break;
                                    case 'br':
                                        if (state === ParsingState.Summary) {
                                            summaryParts.push('\n');
                                        }
                                        break;
                                    case 'ul':
                                        if ((_c = attribs.class) === null || _c === void 0 ? void 0 : _c.includes('info-meta')) {
                                            pushState(ParsingState.Info);
                                        }
                                        if (_this.options.noAjax && attribs.id === 'idData') {
                                            pushState(ParsingState.ChapterList);
                                        }
                                        break;
                                    case 'a':
                                        if (state === ParsingState.ChapterList) {
                                            i++;
                                            var href = attribs.href;
                                            pushState(ParsingState.Chapter);
                                            tempChapter.name = attribs.title || "Chapter ".concat(i);
                                            tempChapter.releaseTime = null;
                                            tempChapter.chapterNumber = i;
                                            tempChapter.path =
                                                (href === null || href === void 0 ? void 0 : href.substring(1)) ||
                                                    novelPath.replace('.html', "/chapter-".concat(i, ".html"));
                                        }
                                        break;
                                }
                            },
                            ontext: function (data) {
                                var text = data.trim();
                                if (!text)
                                    return;
                                switch (currentState()) {
                                    case ParsingState.NovelName:
                                        novel.name = (novel.name || '') + text;
                                        break;
                                    case ParsingState.Summary:
                                        summaryParts.push(data);
                                        break;
                                    case ParsingState.Info:
                                        infoParts.push(text);
                                        break;
                                    case ParsingState.Genres:
                                        genreArray.push(data);
                                        break;
                                    case ParsingState.Author:
                                        authorParts.push(data);
                                        break;
                                    case ParsingState.Status:
                                        statusParts.push(text);
                                        break;
                                }
                            },
                            onclosetag: function (name) {
                                var state = currentState();
                                switch (name) {
                                    case 'div':
                                        switch (state) {
                                            case ParsingState.Info:
                                                depth--;
                                                infoParts.push('\n');
                                                if (depth < 0) {
                                                    popState();
                                                }
                                                break;
                                            case ParsingState.Genres:
                                            case ParsingState.Author:
                                            case ParsingState.Status:
                                            case ParsingState.Summary:
                                                popState();
                                                break;
                                        }
                                        break;
                                    case 'h3':
                                        if (state === ParsingState.NovelName) {
                                            popState();
                                        }
                                        break;
                                    case 'a':
                                        if (state === ParsingState.Chapter) {
                                            if (tempChapter.name && tempChapter.path) {
                                                chapters.push(__assign({}, tempChapter));
                                            }
                                            tempChapter = {};
                                            popState();
                                        }
                                        break;
                                    case 'li':
                                        if (state === ParsingState.Info) {
                                            infoParts.push('\n');
                                        }
                                        break;
                                    case 'ul':
                                        switch (state) {
                                            case ParsingState.Info:
                                            case ParsingState.ChapterList:
                                                popState();
                                                break;
                                        }
                                        break;
                                    default:
                                        return;
                                }
                            },
                            onend: function () {
                                if (infoParts.length) {
                                    infoParts
                                        .join('')
                                        .split('\n')
                                        .map(function (line) { return line.trim(); })
                                        .filter(function (line) { return line.includes(':'); })
                                        .forEach(function (line) {
                                        var _a;
                                        var parts = line.split(':');
                                        var detailName = parts[0].trim().toLowerCase();
                                        var detail = parts[1]
                                            .split(',')
                                            .map(function (g) { return g.trim(); })
                                            .join(', ');
                                        switch (detailName) {
                                            case 'author':
                                                novel.author = detail;
                                                break;
                                            case 'genre':
                                                novel.genres = detail;
                                                break;
                                            case 'status':
                                                var map = {
                                                    ongoing: novelStatus_1.NovelStatus.Ongoing,
                                                    hiatus: novelStatus_1.NovelStatus.OnHiatus,
                                                    dropped: novelStatus_1.NovelStatus.Cancelled,
                                                    cancelled: novelStatus_1.NovelStatus.Cancelled,
                                                    completed: novelStatus_1.NovelStatus.Completed,
                                                };
                                                novel.status =
                                                    (_a = map[detail.toLowerCase()]) !== null && _a !== void 0 ? _a : novelStatus_1.NovelStatus.Unknown;
                                                break;
                                            default:
                                                return;
                                        }
                                    });
                                    if (!novelId) {
                                        var idMatch = novelPath.match(/\d+/);
                                        novelId = idMatch ? idMatch[0] : null;
                                    }
                                }
                                else {
                                    novel.genres = genreArray.join('').trim();
                                    novel.author = authorParts.join('').trim();
                                    novel.status = statusParts
                                        .join('')
                                        .toLowerCase()
                                        .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
                                }
                                novel.summary = summaryParts.join('\n\n').trim();
                            },
                        });
                        parser.write(body);
                        parser.end();
                        if (!(this.options.noAjax && chapters.length > 0)) return [3 /*break*/, 3];
                        novel.chapters = chapters;
                        return [3 /*break*/, 7];
                    case 3:
                        if (!(novelId !== null)) return [3 /*break*/, 7];
                        chapterListing = this.options.chapterListing || 'ajax/chapter-archive';
                        ajaxParam = this.options.chapterParam || 'novelId';
                        params = new URLSearchParams((_a = {}, _a[ajaxParam] = novelId, _a));
                        chaptersUrl = "".concat(this.site).concat(chapterListing, "?").concat(params.toString());
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chaptersUrl)];
                    case 4:
                        ajaxResult = _b.sent();
                        if (!!ajaxResult.ok) return [3 /*break*/, 5];
                        console.error("Failed to fetch chapters: ".concat(ajaxResult.status));
                        novel.chapters = [];
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, ajaxResult.text()];
                    case 6:
                        ajaxBody = _b.sent();
                        ajaxChapters_1 = [];
                        tempAjaxChapter_1 = {};
                        ajaxParser = new htmlparser2_1.Parser({
                            onopentag: function (name, attribs) {
                                var chapterHref;
                                var initialName;
                                if (name === 'a' && attribs.href) {
                                    chapterHref = attribs.href;
                                    initialName = attribs.title || '';
                                    pushState(ParsingState.Chapter);
                                }
                                else if (name === 'option' && attribs.value) {
                                    chapterHref = attribs.value;
                                    initialName = '';
                                    pushState(ParsingState.Chapter);
                                }
                                if (chapterHref !== undefined) {
                                    var href = new URL(chapterHref, _this.site);
                                    tempAjaxChapter_1.path = href.pathname.substring(1);
                                    tempAjaxChapter_1.name = initialName;
                                }
                            },
                            ontext: function (data) {
                                var text = data.trim();
                                if (currentState() === ParsingState.Chapter &&
                                    !tempAjaxChapter_1.name &&
                                    text) {
                                    tempAjaxChapter_1.name += text;
                                }
                            },
                            onclosetag: function (name) {
                                if ((name === 'a' || name === 'option') &&
                                    currentState() === ParsingState.Chapter) {
                                    if (tempAjaxChapter_1.name && tempAjaxChapter_1.path) {
                                        tempAjaxChapter_1.name = tempAjaxChapter_1.name.trim();
                                        tempAjaxChapter_1.releaseTime = null;
                                        ajaxChapters_1.push(__assign({}, tempAjaxChapter_1));
                                    }
                                    tempAjaxChapter_1 = {};
                                    popState();
                                }
                            },
                        });
                        ajaxParser.write(ajaxBody);
                        ajaxParser.end();
                        novel.chapters = ajaxChapters_1;
                        _b.label = 7;
                    case 7: return [2 /*return*/, novel];
                }
            });
        });
    };
    ReadNovelFullPlugin.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var response, html, depth, depthHide, chapterHtml, skipClosingTag, currentTagToSkip, stateStack, currentState, pushState, popState, escapeRegex, escapeMap, escapeHtml, parser;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + chapterPath)];
                    case 1:
                        response = _a.sent();
                        return [4 /*yield*/, response.text()];
                    case 2:
                        html = _a.sent();
                        chapterHtml = [];
                        skipClosingTag = false;
                        currentTagToSkip = '';
                        stateStack = [ParsingState.Idle];
                        currentState = function () { return stateStack[stateStack.length - 1]; };
                        pushState = function (state) { return stateStack.push(state); };
                        popState = function () {
                            return stateStack.length > 1 ? stateStack.pop() : currentState();
                        };
                        escapeRegex = /[&<>"' ]/g;
                        escapeMap = {
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            '"': '&quot;',
                            "'": '&#39;',
                            ' ': '&nbsp;',
                        };
                        escapeHtml = function (text) {
                            return text.replace(escapeRegex, function (char) { return escapeMap[char]; });
                        };
                        parser = new htmlparser2_1.Parser({
                            onopentag: function (name, attribs) {
                                var _a;
                                var state = currentState();
                                var attrib = (_a = attribs.class) === null || _a === void 0 ? void 0 : _a.trim();
                                switch (state) {
                                    case ParsingState.Idle:
                                        if (attrib === 'txt' ||
                                            attribs.id === 'chr-content' ||
                                            attribs.id === 'chapter-content') {
                                            pushState(ParsingState.Chapter);
                                            depth = 0;
                                        }
                                        break;
                                    case ParsingState.Chapter:
                                        if (name === 'sub') {
                                            pushState(ParsingState.Hidden);
                                        }
                                        else if (name === 'div') {
                                            depth++;
                                            if ((attrib === null || attrib === void 0 ? void 0 : attrib.includes('unlock-buttons')) ||
                                                (attrib === null || attrib === void 0 ? void 0 : attrib.includes('ads'))) {
                                                pushState(ParsingState.Hidden);
                                                depthHide = 0;
                                            }
                                        }
                                        break;
                                    case ParsingState.Hidden:
                                        if (name === 'sub') {
                                            // Allow nesting of hidden states if a sub is inside a div
                                            pushState(ParsingState.Hidden);
                                        }
                                        else if (name === 'div') {
                                            depthHide++;
                                        }
                                        break;
                                    default:
                                        return;
                                }
                                if (currentState() === ParsingState.Chapter) {
                                    var attrKeys = Object.keys(attribs);
                                    if (attrKeys.length === 0) {
                                        chapterHtml.push("<".concat(name, ">"));
                                    }
                                    else if (attrKeys.every(function (key) { return attribs[key].trim() === ''; })) {
                                        // Handle tags with empty attributes as text content
                                        // eg: novel/rising-up-from-a-nobleman-to-intergalactic-warlord/chapter-184
                                        skipClosingTag = true;
                                        currentTagToSkip = name;
                                        var uppercaseName = name.replace(/\b\w/g, function (char) {
                                            return char.toUpperCase();
                                        });
                                        chapterHtml.push(escapeHtml("<".concat(uppercaseName, " ").concat(attrKeys.join(' '), ">")));
                                    }
                                    else {
                                        // Normal tag with attributes
                                        var attrString = attrKeys
                                            .map(function (key) { return " ".concat(key, "=\"").concat(attribs[key].replace(/"/g, '&quot;'), "\""); })
                                            .join('');
                                        chapterHtml.push("<".concat(name).concat(attrString, ">"));
                                    }
                                }
                            },
                            ontext: function (text) {
                                if (currentState() === ParsingState.Chapter) {
                                    chapterHtml.push(escapeHtml(text));
                                }
                            },
                            onclosetag: function (name) {
                                var state = currentState();
                                if (state === ParsingState.Hidden) {
                                    if (name === 'sub') {
                                        popState();
                                    }
                                    else if (name === 'div') {
                                        depthHide--;
                                        if (depthHide < 0) {
                                            popState();
                                            depth--;
                                        }
                                    }
                                }
                                if (state !== ParsingState.Chapter) {
                                    return;
                                }
                                if (!parser['isVoidElement'](name)) {
                                    if (skipClosingTag && name === currentTagToSkip) {
                                        skipClosingTag = false;
                                        currentTagToSkip = '';
                                    }
                                    else {
                                        chapterHtml.push("</".concat(name, ">"));
                                    }
                                }
                                if (name === 'div') {
                                    depth--;
                                    if (depth < 0) {
                                        pushState(ParsingState.Stopped);
                                    }
                                }
                            },
                        });
                        parser.write(html);
                        parser.end();
                        return [2 /*return*/, chapterHtml.join('')];
                }
            });
        });
    };
    ReadNovelFullPlugin.prototype.searchNovels = function (searchTerm, page) {
        return __awaiter(this, void 0, void 0, function () {
            var now, _a, _b, pageParam, _c, searchKey, postSearch, langParam, urlLangCode, searchPage, params, url, fetchOptions, result, html, alertText;
            var _d, _e, _f;
            var _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        now = Date.now();
                        if (!(this.lastSearch && now - this.lastSearch <= this.searchInterval)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.sleep(this.searchInterval)];
                    case 1:
                        _h.sent();
                        _h.label = 2;
                    case 2:
                        _a = this.options, _b = _a.pageParam, pageParam = _b === void 0 ? 'page' : _b, _c = _a.searchKey, searchKey = _c === void 0 ? 'keyword' : _c, postSearch = _a.postSearch, langParam = _a.langParam, urlLangCode = _a.urlLangCode, searchPage = _a.searchPage;
                        params = new URLSearchParams(__assign(__assign((_d = {}, _d[searchKey] = searchTerm, _d), (langParam && urlLangCode && (_e = {}, _e[langParam] = urlLangCode, _e))), (!postSearch && (_f = {}, _f[pageParam] = page.toString(), _f))));
                        url = "".concat(this.site).concat(searchPage).concat(!postSearch ? "?".concat(params.toString()) : '');
                        fetchOptions = postSearch
                            ? {
                                method: 'POST',
                                body: params.toString(),
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            }
                            : undefined;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, fetchOptions)];
                    case 3:
                        result = _h.sent();
                        this.lastSearch = Date.now();
                        if (!result.ok) {
                            throw new Error("Could not reach site ('".concat(result.status, "') try to open in webview."));
                        }
                        return [4 /*yield*/, result.text()];
                    case 4:
                        html = _h.sent();
                        alertText = ((_g = html.match(/alert\((.*?)\)/)) === null || _g === void 0 ? void 0 : _g[1]) || '';
                        if (alertText)
                            throw new Error(alertText);
                        return [2 /*return*/, this.parseNovels(html)];
                }
            });
        });
    };
    return ReadNovelFullPlugin;
}());
var ParsingState;
(function (ParsingState) {
    ParsingState[ParsingState["Idle"] = 0] = "Idle";
    ParsingState[ParsingState["Info"] = 1] = "Info";
    ParsingState[ParsingState["Cover"] = 2] = "Cover";
    ParsingState[ParsingState["Author"] = 3] = "Author";
    ParsingState[ParsingState["Genres"] = 4] = "Genres";
    ParsingState[ParsingState["Status"] = 5] = "Status";
    ParsingState[ParsingState["Hidden"] = 6] = "Hidden";
    ParsingState[ParsingState["Summary"] = 7] = "Summary";
    ParsingState[ParsingState["Stopped"] = 8] = "Stopped";
    ParsingState[ParsingState["Chapter"] = 9] = "Chapter";
    ParsingState[ParsingState["ChapterList"] = 10] = "ChapterList";
    ParsingState[ParsingState["NovelName"] = 11] = "NovelName";
    ParsingState[ParsingState["NovelList"] = 12] = "NovelList";
})(ParsingState || (ParsingState = {}));
