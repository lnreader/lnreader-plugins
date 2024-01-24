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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
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
var filterInputs_1 = require("@libs/filterInputs");
var NovelUpdates = /** @class */ (function () {
    function NovelUpdates() {
        this.id = "novelupdates";
        this.name = "Novel Updates";
        this.version = "0.5.0";
        this.icon = "src/en/novelupdates/icon.png";
        this.site = "https://www.novelupdates.com/";
        this.filters = {
            sort: {
                label: "Sort Results By",
                value: "sdate",
                options: [
                    { label: "Last Updated", value: "sdate" },
                    { label: "Rating", value: "srate" },
                    { label: "Rank", value: "srank" },
                    { label: "Reviews", value: "sreview" },
                    { label: "Chapters", value: "srel" },
                    { label: "Title", value: "abc" },
                    { label: "Readers", value: "sread" },
                    { label: "Frequency", value: "sfrel" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            order: {
                label: "Order",
                value: "desc",
                options: [
                    { label: "Descending", value: "desc" },
                    { label: "Ascending", value: "asc" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            storyStatus: {
                label: "Story Status (Translation)",
                value: "",
                options: [
                    { label: "All", value: "" },
                    { label: "Completed", value: "2" },
                    { label: "Ongoing", value: "3" },
                    { label: "Hiatus", value: "4" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            language: {
                label: "Language",
                value: [],
                options: [
                    { label: "None", value: "" },
                    { label: "Chinese", value: "495" },
                    { label: "Filipino", value: "9181" },
                    { label: "Indonesian", value: "9179" },
                    { label: "Japanese", value: "496" },
                    { label: "Khmer", value: "18657" },
                    { label: "Korean", value: "497" },
                    { label: "Malaysian", value: "9183" },
                    { label: "Thai", value: "9954" },
                    { label: "Vietnamese", value: "9177" },
                ],
                type: filterInputs_1.FilterTypes.CheckboxGroup,
            },
            novelType: {
                label: "Novel Type",
                value: [],
                options: [
                    { label: "Light Novel", value: "2443" },
                    { label: "Published Novel", value: "26874" },
                    { label: "Web Novel", value: "2444" },
                ],
                type: filterInputs_1.FilterTypes.CheckboxGroup,
            },
            genres: {
                label: "Genres",
                type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup,
                value: {
                    include: [],
                    exclude: [],
                },
                options: [
                    { label: "Action", value: "8" },
                    { label: "Adult", value: "280" },
                    { label: "Adventure", value: "13" },
                    { label: "Comedy", value: "17" },
                    { label: "Drama", value: "9" },
                    { label: "Ecchi", value: "292" },
                    { label: "Fantasy", value: "5" },
                    { label: "Gender Bender", value: "168" },
                    { label: "Harem", value: "3" },
                    { label: "Historical", value: "330" },
                    { label: "Horror", value: "343" },
                    { label: "Josei", value: "324" },
                    { label: "Martial Arts", value: "14" },
                    { label: "Mature", value: "4" },
                    { label: "Mecha", value: "10" },
                    { label: "Mystery", value: "245" },
                    { label: "Psychoical", value: "486" },
                    { label: "Romance", value: "15" },
                    { label: "School Life", value: "6" },
                    { label: "Sci-fi", value: "11" },
                    { label: "Seinen", value: "18" },
                    { label: "Shoujo", value: "157" },
                    { label: "Shoujo Ai", value: "851" },
                    { label: "Shounen", value: "12" },
                    { label: "Shounen Ai", value: "1692" },
                    { label: "Slice of Life", value: "7" },
                    { label: "Smut", value: "281" },
                    { label: "Sports", value: "1357" },
                    { label: "Supernatural", value: "16" },
                    { label: "Tragedy", value: "132" },
                    { label: "Wuxia", value: "479" },
                    { label: "Xianxia", value: "480" },
                    { label: "Xuanhuan", value: "3954" },
                    { label: "Yaoi", value: "560" },
                    { label: "Yuri", value: "922" },
                ],
            },
            genre_operator: {
                label: "Genre (AND/OR)",
                value: "and",
                options: [
                    { label: "AND", value: "and" },
                    { label: "OR", value: "or" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    NovelUpdates.prototype.parseNovels = function (loadedCheerio) {
        var novels = [];
        loadedCheerio("div.search_main_box_nu").each(function (idx, ele) {
            var novelCover = loadedCheerio(ele).find("img").attr("src");
            var novelName = loadedCheerio(ele).find(".search_title > a").text();
            var novelUrl = loadedCheerio(ele)
                .find(".search_title > a")
                .attr("href");
            if (!novelUrl)
                return;
            var novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        return novels;
    };
    NovelUpdates.prototype.popularNovels = function (page, _a) {
        var _b, _c, _d, _e, _f, _g;
        var showLatestNovels = _a.showLatestNovels, filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var link, headers, body, loadedCheerio;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        link = "".concat(this.site);
                        if (filters.language.value.length ||
                            filters.novelType.value.length ||
                            ((_b = filters.genres.value.include) === null || _b === void 0 ? void 0 : _b.length) ||
                            ((_c = filters.genres.value.exclude) === null || _c === void 0 ? void 0 : _c.length) ||
                            filters.storyStatus.value.length) {
                            link += "series-finder/?sf=1";
                        }
                        else if (showLatestNovels) {
                            link += "latest-series/?st=1";
                        }
                        else {
                            link += "series-ranking/?rank=week";
                        }
                        ;
                        if (filters.language.value.length)
                            link += '&org=' + filters.language.value.join(',');
                        if (filters.novelType.value.length)
                            link += '&nt=' + filters.novelType.value.join(',');
                        if ((_d = filters.genres.value.include) === null || _d === void 0 ? void 0 : _d.length)
                            link += '&gi=' + filters.genres.value.include.join(',');
                        if ((_e = filters.genres.value.exclude) === null || _e === void 0 ? void 0 : _e.length)
                            link += '&ge=' + filters.genres.value.exclude.join(',');
                        if (((_f = filters.genres.value.include) === null || _f === void 0 ? void 0 : _f.length) || ((_g = filters.genres.value.exclude) === null || _g === void 0 ? void 0 : _g.length))
                            link += '&mgi=' + filters.genre_operator.value;
                        if (filters.storyStatus.value.length)
                            link += '&ss=' + filters.storyStatus.value;
                        link += '&sort=' + filters.sort.value;
                        link += '&order=' + filters.order.value;
                        link += '&pg=' + page;
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link, { headers: headers }).then(function (result) {
                                return result.text();
                            })];
                    case 1:
                        body = _h.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    NovelUpdates.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var url, result, body, loadedCheerio, novel, type, summary, chapter, novelId, formData, link, text;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = novelUrl;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: url,
                            chapters: [],
                        };
                        novel.name = loadedCheerio(".seriestitlenu").text();
                        novel.cover = loadedCheerio(".seriesimg > img").attr("src");
                        novel.author = loadedCheerio("#showauthors").text().trim();
                        novel.genres = loadedCheerio("#seriesgenre")
                            .children("a")
                            .map(function (i, el) { return loadedCheerio(el).text(); })
                            .toArray()
                            .join(",");
                        novel.status = loadedCheerio("#editstatus").text().includes("Ongoing")
                            ? "Ongoing"
                            : "Completed";
                        type = loadedCheerio("#showtype").text().trim();
                        summary = loadedCheerio("#editdescription").text().trim();
                        novel.summary = summary + "\n\nType: ".concat(type);
                        chapter = [];
                        novelId = loadedCheerio("input#mypostid").attr("value");
                        formData = new FormData();
                        formData.append("action", "nd_getchapters");
                        formData.append("mygrr", "0");
                        formData.append("mypostid", novelId);
                        link = "".concat(this.site, "wp-admin/admin-ajax.php");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(link, {
                                method: "POST",
                                body: formData,
                            }).then(function (data) { return data.text(); })];
                    case 3:
                        text = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(text);
                        loadedCheerio("li.sp_li_chp").each(function () {
                            var chapterName = loadedCheerio(this).text().trim();
                            var releaseDate = null;
                            var chapterUrl = "https:" +
                                loadedCheerio(this).find("a").first().next().attr("href");
                            chapter.push({
                                name: chapterName,
                                releaseTime: releaseDate,
                                url: chapterUrl,
                            });
                        });
                        novel.chapters = chapter.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    NovelUpdates.prototype.getLocation = function (href) {
        var match = href.match(/^(https?:)\/\/(([^:/?#]*)(?::([0-9]+))?)([/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
        return match && "".concat(match[1], "//").concat(match[3]);
    };
    NovelUpdates.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var chapterText, result, body, loadedCheerio, isWuxiaWorld, isBlogspot, isTumblr, isWattpad, isLightNovelsTls, isiNovelTranslation, isTravisTranslation, isWordPressStr, isWordPress, isRainOfSnow, isWebNovel, isHostedNovel, isScribbleHub, bloatClasses, tags;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        chapterText = "";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        isWuxiaWorld = chapterUrl.toLowerCase().includes("wuxiaworld");
                        isBlogspot = chapterUrl.toLowerCase().includes("blogspot");
                        isTumblr = chapterUrl.toLowerCase().includes("tumblr");
                        isWattpad = chapterUrl.toLowerCase().includes("wattpad");
                        isLightNovelsTls = chapterUrl
                            .toLowerCase()
                            .includes("lightnovelstranslations");
                        isiNovelTranslation = chapterUrl
                            .toLowerCase()
                            .includes("inoveltranslation");
                        isTravisTranslation = chapterUrl
                            .toLowerCase()
                            .includes("travistranslations");
                        isWordPressStr = loadedCheerio('meta[name="generator"]').attr("content") ||
                            loadedCheerio("footer").text();
                        isWordPress = false;
                        if (isWordPressStr) {
                            isWordPress =
                                isWordPressStr.toLowerCase().includes("wordpress") ||
                                    isWordPressStr.includes("Site Kit by Google") ||
                                    loadedCheerio(".powered-by")
                                        .text()
                                        .toLowerCase()
                                        .includes("wordpress");
                        }
                        isRainOfSnow = chapterUrl.toLowerCase().includes("rainofsnow");
                        isWebNovel = chapterUrl.toLowerCase().includes("webnovel");
                        isHostedNovel = chapterUrl.toLowerCase().includes("hostednovel");
                        isScribbleHub = chapterUrl.toLowerCase().includes("scribblehub");
                        if (isWuxiaWorld) {
                            chapterText = loadedCheerio("#chapter-content").html();
                        }
                        else if (isRainOfSnow) {
                            chapterText = loadedCheerio("div.content").html();
                        }
                        else if (isTumblr) {
                            chapterText = loadedCheerio(".post").html();
                        }
                        else if (isBlogspot) {
                            loadedCheerio(".post-share-buttons").remove();
                            chapterText = loadedCheerio(".entry-content").html();
                        }
                        else if (isHostedNovel) {
                            chapterText = loadedCheerio(".chapter").html();
                        }
                        else if (isScribbleHub) {
                            chapterText = loadedCheerio("div.chp_raw").html();
                        }
                        else if (isWattpad) {
                            chapterText = loadedCheerio(".container  pre").html();
                        }
                        else if (isTravisTranslation) {
                            chapterText = loadedCheerio(".reader-content").html();
                        }
                        else if (isLightNovelsTls) {
                            chapterText = loadedCheerio(".text_story").html();
                        }
                        else if (isiNovelTranslation) {
                            chapterText = loadedCheerio(".chakra-skeleton").html();
                        }
                        else if (isWordPress) {
                            bloatClasses = [
                                ".c-ads",
                                "#madara-comments",
                                "#comments",
                                ".content-comments",
                                ".sharedaddy",
                                ".wp-dark-mode-switcher",
                                ".wp-next-post-navi",
                                ".wp-block-buttons",
                                ".wp-block-columns",
                                ".post-cats",
                                ".sidebar",
                                ".author-avatar",
                                ".ezoic-ad",
                            ];
                            bloatClasses.map(function (tag) { return loadedCheerio(tag).remove(); });
                            chapterText =
                                loadedCheerio(".entry-content").html() ||
                                    loadedCheerio(".single_post").html() ||
                                    loadedCheerio(".post-entry").html() ||
                                    loadedCheerio(".main-content").html() ||
                                    loadedCheerio("article.post").html() ||
                                    loadedCheerio(".content").html() ||
                                    loadedCheerio("#content").html() ||
                                    loadedCheerio(".page-body").html() ||
                                    loadedCheerio(".td-page-content").html();
                        }
                        else if (isWebNovel) {
                            chapterText = loadedCheerio(".cha-words").html();
                            if (!chapterText) {
                                chapterText = loadedCheerio("._content").html();
                            }
                        }
                        else {
                            tags = ["nav", "header", "footer", ".hidden"];
                            tags.map(function (tag) { return loadedCheerio(tag).remove(); });
                            chapterText = loadedCheerio("body").html();
                        }
                        if (chapterText) {
                            /**
                             * Convert relative urls to absolute
                             */
                            chapterText = chapterText.replace(/href="\//g, "href=\"".concat(this.getLocation(chapterUrl), "/"));
                        }
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    NovelUpdates.prototype.searchNovels = function (searchTerm, page) {
        return __awaiter(this, void 0, void 0, function () {
            var url, headers, result, body, loadedCheerio;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "page/").concat(page, "/?s=").concat(searchTerm, "&post_type=seriesplans");
                        headers = new Headers();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, { headers: headers })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        return [2 /*return*/, this.parseNovels(loadedCheerio)];
                }
            });
        });
    };
    NovelUpdates.prototype.fetchImage = function (url) {
        return (0, fetch_1.fetchFile)(url);
    };
    return NovelUpdates;
}());
exports.default = new NovelUpdates();
