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
var filterInputs_1 = require("@libs/filterInputs");
var fetch_1 = require("@libs/fetch");
var cheerio_1 = require("cheerio");
var freedlit = /** @class */ (function () {
    function freedlit() {
        this.id = "freedlit.space";
        this.name = "LitSpace";
        this.site = "https://freedlit.space";
        this.version = "1.0.0";
        this.icon = "src/ru/freedlit/icon.png";
        this.userAgent = "";
        this.cookieString = "";
        this.fetchImage = fetch_1.fetchFile;
        this.filters = {
            sort: {
                label: "Сортировка:",
                value: "",
                options: [
                    { label: "По популярности", value: "popular" },
                    { label: "По количеству комментариев", value: "comments" },
                    { label: "По количеству лайков", value: "likes" },
                    { label: "По новизне", value: "recent" },
                    { label: "По просмотрам", value: "views" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            genre: {
                label: "Жанры:",
                value: { include: [], exclude: [] },
                options: [
                    { label: "Любой жанр", value: "all" },
                    { label: "Альтернативная история", value: "alternative-history" },
                    { label: "Антиутопия", value: "dystopia" },
                    { label: "Бизнес-литература", value: "business-literature" },
                    { label: "Боевая фантастика", value: "combat-fiction" },
                    { label: "Боевик", value: "action" },
                    { label: "Боевое фэнтези", value: "combat-fantasy" },
                    { label: "Бояръ-Аниме", value: "boyar-anime" },
                    { label: "Героическая фантастика", value: "heroic-fiction" },
                    { label: "Героическое фэнтези", value: "heroic-fantasy" },
                    { label: "Городское фэнтези", value: "urban-fantasy" },
                    { label: "Гримдарк", value: "grimdark" },
                    { label: "Детектив", value: "mystery" },
                    { label: "Детская литература", value: "kids-literature" },
                    { label: "Документальная проза", value: "biography" },
                    { label: "Историческая проза", value: "historical-fiction" },
                    { label: "Исторический детектив", value: "historical-mystery" },
                    { label: "Исторический любовный роман", value: "historical-romantic-novel" },
                    { label: "Историческое фэнтези", value: "historical-fantasy" },
                    { label: "Киберпанк", value: "cyberpunk" },
                    { label: "Космическая фантастика", value: "cosmic-fiction" },
                    { label: "ЛитРПГ", value: "litrpg" },
                    { label: "Лоу / Низкое фэнтези", value: "low-fantasy" },
                    { label: "Любовное фэнтези", value: "romantic-fantasy" },
                    { label: "Любовный роман", value: "romantic-novel" },
                    { label: "Мистика", value: "mystic" },
                    { label: "Мистический детектив", value: "mystic-detective" },
                    { label: "Научная фантастика", value: "science-fiction" },
                    { label: "Подростковая проза", value: "young-adult" },
                    { label: "Политический роман", value: "political-romance" },
                    { label: "Попаданцы", value: "accidental-travel" },
                    { label: "Попаданцы в магические миры", value: "magic-worlds-travel" },
                    { label: "Попаданцы во времени", value: "time-travel" },
                    { label: "Порнотика", value: "pornotica" },
                    { label: "Постапокалипсис", value: "post-apocalypse" },
                    { label: "Поэзия", value: "poetry" },
                    { label: "Приключения", value: "adventure" },
                    { label: "Публицистика", value: "journalism" },
                    { label: "Пьеса", value: "play" },
                    { label: "Развитие личности", value: "how-to-book" },
                    { label: "Разное", value: "other" },
                    { label: "Реализм", value: "Realism" },
                    { label: "РеалРПГ", value: "realrpg" },
                    { label: "Репликация", value: "replication" },
                    { label: "Романтическая эротика", value: "romantic-erotic-fiction" },
                    { label: "Сказка", value: "fairy-tale" },
                    { label: "Слэш", value: "slash" },
                    { label: "Современная проза", value: "modern-prose" },
                    { label: "Современный любовный роман", value: "modern-romantic-novel" },
                    { label: "Социальная фантастика", value: "social-fiction" },
                    { label: "Стимпанк", value: "steampunk" },
                    { label: "Сценарий", value: "scenario" },
                    { label: "Сюаньхуань", value: "xuanhuan" },
                    { label: "Сянься", value: "xianxia" },
                    { label: "Тёмное фэнтези", value: "dark-fantasy" },
                    { label: "Триллер", value: "thriller" },
                    { label: "Уся", value: "wuxia" },
                    { label: "Фантастика", value: "fiction" },
                    { label: "Фантастический детектив", value: "mystery-fiction" },
                    { label: "Фанфик", value: "fan-fiction" },
                    { label: "Фемслэш", value: "femslash" },
                    { label: "Фэнтези", value: "fantasy" },
                    { label: "Хоррор", value: "horror" },
                    { label: "Шпионский детектив", value: "spy-crime" },
                    { label: "Эпическое фэнтези", value: "epic-fantasy" },
                    { label: "Эротика", value: "erotic-fiction" },
                    { label: "Эротическая фантастика", value: "erotic-fiction" },
                    { label: "Эротический фанфик", value: "erotic-fan-fiction" },
                    { label: "Эротическое фэнтези", value: "erotic-fantasy" },
                    { label: "Этническое фэнтези", value: "ethnic-fantasy" },
                    { label: "Юмор", value: "humor" },
                    { label: "Юмористическая фантастика", value: "humor-fiction" },
                    { label: "Юмористическое фэнтези", value: "humor-fantasy" },
                    { label: "RPS", value: "rps" },
                ],
                type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup,
            },
            status: {
                label: "Статус:",
                value: "",
                options: [
                    { label: "Любой статус", value: "all" },
                    { label: "В процессе", value: "in-process" },
                    { label: "Завершено", value: "finished" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            access: {
                label: "Доступ:",
                value: "",
                options: [
                    { label: "Любой доступ", value: "all" },
                    { label: "Бесплатные", value: "free" },
                    { label: "Платные", value: "paid" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            adult: {
                label: "Возрастные ограничения:",
                value: "",
                options: [
                    { label: "Скрыть 18+", value: "hide" },
                    { label: "Показать +18", value: "show" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    freedlit.prototype.popularNovels = function (page, _a) {
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        var showLatestNovels = _a.showLatestNovels, filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_m) {
                switch (_m.label) {
                    case 0:
                        url = this.site + "/get-books/all/list/" + page + "?sort=";
                        url += showLatestNovels ? "recent" : ((_b = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _b === void 0 ? void 0 : _b.value) || "popular";
                        url += "&status=" + (((_c = filters === null || filters === void 0 ? void 0 : filters.status) === null || _c === void 0 ? void 0 : _c.value) || "all");
                        url += "&access=" + (((_d = filters === null || filters === void 0 ? void 0 : filters.access) === null || _d === void 0 ? void 0 : _d.value) || "all");
                        url += "&adult=" + (((_e = filters === null || filters === void 0 ? void 0 : filters.adult) === null || _e === void 0 ? void 0 : _e.value) || "hide");
                        if ((_h = (_g = (_f = filters === null || filters === void 0 ? void 0 : filters.genre) === null || _f === void 0 ? void 0 : _f.value) === null || _g === void 0 ? void 0 : _g.include) === null || _h === void 0 ? void 0 : _h.length) {
                            url += filters.genre.value.include
                                .map(function (id) { return '&genres_included[]=' + id; }).join("");
                        }
                        if ((_l = (_k = (_j = filters === null || filters === void 0 ? void 0 : filters.genre) === null || _j === void 0 ? void 0 : _j.value) === null || _k === void 0 ? void 0 : _k.exclude) === null || _l === void 0 ? void 0 : _l.length) {
                            url += filters.genre.value.exclude
                                .map(function (id) { return '&genres_excluded[]=' + id; }).join("");
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _m.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("#bookListBlock > div > div").each(function () {
                            var _a, _b, _c;
                            var name = (_a = loadedCheerio(this).find("div > h4 > a").text()) === null || _a === void 0 ? void 0 : _a.trim();
                            var cover = (_b = loadedCheerio(this)
                                .find("div > a > img")
                                .attr("src")) === null || _b === void 0 ? void 0 : _b.trim();
                            var url = (_c = loadedCheerio(this).find("div > h4 > a").attr("href")) === null || _c === void 0 ? void 0 : _c.trim();
                            if (!name || !url)
                                return;
                            novels.push({ name: name, cover: cover, url: url });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    freedlit.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, novel, chapters;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(novelUrl).then(function (res) { return res.text(); })];
                    case 1:
                        body = _c.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: novelUrl,
                            name: loadedCheerio(".book-info h4").text(),
                            cover: (_a = loadedCheerio(".book-cover > div > img").attr("src")) === null || _a === void 0 ? void 0 : _a.trim(),
                            summary: (_b = loadedCheerio("#nav-home").text()) === null || _b === void 0 ? void 0 : _b.trim(),
                            author: loadedCheerio(".book-info h5 > a").text(),
                            genres: loadedCheerio(".genre-list > a")
                                .map(function (index, element) { return loadedCheerio(element).text(); })
                                .get()
                                .join(","),
                        };
                        chapters = [];
                        loadedCheerio("a.chapter-line").each(function () {
                            var name = loadedCheerio(this).find("h6").text();
                            var releaseTime = loadedCheerio(this).find('span[class="date"]').text();
                            var url = loadedCheerio(this).attr("href");
                            if (!name || !url)
                                return;
                            chapters.push({ name: name, releaseTime: releaseTime, url: url });
                        });
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    freedlit.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio("div.mobile-block").remove();
                        loadedCheerio("div.standart-block").remove();
                        chapterText = loadedCheerio('div[class="chapter"]').html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    freedlit.prototype.searchNovels = function (searchTerm) {
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.site, "/search?query=").concat(searchTerm, "&type=all");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("#bookListBlock > div").each(function () {
                            var _a, _b, _c;
                            var name = (_a = loadedCheerio(this).find("h4 > a").text()) === null || _a === void 0 ? void 0 : _a.trim();
                            var cover = (_b = loadedCheerio(this).find("a > img").attr("src")) === null || _b === void 0 ? void 0 : _b.trim();
                            var url = (_c = loadedCheerio(this).find("h4 > a").attr("href")) === null || _c === void 0 ? void 0 : _c.trim();
                            if (!name || !url)
                                return;
                            novels.push({ name: name, cover: cover, url: url });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return freedlit;
}());
exports.default = new freedlit();
