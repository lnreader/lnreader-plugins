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
var fetch_1 = require("@libs/fetch");
var filterInputs_1 = require("@libs/filterInputs");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var IfreedomPlugin = /** @class */ (function () {
    function IfreedomPlugin(metadata) {
        this.fetchImage = fetch_1.fetchFile;
        this.id = metadata.id;
        this.name = metadata.sourceName + "[ifreedom]";
        this.icon = "multisrc/ifreedom/icons/".concat(metadata.id, ".png");
        this.site = metadata.sourceSite;
        this.version = "1.0.0";
        this.userAgent = "";
        this.cookieString = "";
        this.filters = metadata.filters;
    }
    IfreedomPlugin.prototype.popularNovels = function (page, _a) {
        var _b, _c, _d, _e;
        var filters = _a.filters, showLatestNovels = _a.showLatestNovels;
        return __awaiter(this, void 0, void 0, function () {
            var url, body, loadedCheerio, novels;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        url = this.site + "/vse-knigi/?sort=" +
                            (showLatestNovels ? "По дате обновления" : ((_b = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _b === void 0 ? void 0 : _b.value) || "По рейтингу");
                        if (((_c = filters === null || filters === void 0 ? void 0 : filters.status) === null || _c === void 0 ? void 0 : _c.value) instanceof Array) {
                            url += filters.status.value.map(function (i) { return "&status[]=" + i; }).join("");
                        }
                        if (((_d = filters === null || filters === void 0 ? void 0 : filters.lang) === null || _d === void 0 ? void 0 : _d.value) instanceof Array) {
                            url += filters.lang.value.map(function (i) { return "&lang[]=" + i; }).join("");
                        }
                        if (((_e = filters === null || filters === void 0 ? void 0 : filters.genre) === null || _e === void 0 ? void 0 : _e.value) instanceof Array) {
                            url += filters.genre.value.map(function (i) { return "&genre[]=" + i; }).join("");
                        }
                        url += "&bpage=" + page;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body = _f.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = loadedCheerio("div.one-book-home > div.img-home a")
                            .map(function (index, element) { return ({
                            name: loadedCheerio(element).attr("title") || "",
                            cover: loadedCheerio(element).find("img").attr("src"),
                            url: loadedCheerio(element).attr("href") || "",
                        }); })
                            .get()
                            .filter(function (novel) { return novel.name && novel.url; });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    IfreedomPlugin.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, novel, chapters;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(novelUrl).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novel = {
                            url: novelUrl,
                            name: loadedCheerio(".entry-title").text(),
                            cover: loadedCheerio(".img-ranobe > img").attr("src"),
                            summary: loadedCheerio('meta[name="description"]').attr("content"),
                        };
                        loadedCheerio("div.data-ranobe").each(function () {
                            switch (loadedCheerio(this).find("b").text()) {
                                case "Автор":
                                    novel.author = loadedCheerio(this)
                                        .find("div.data-value")
                                        .text()
                                        .trim();
                                    break;
                                case "Жанры":
                                    novel.genres = loadedCheerio("div.data-value > a")
                                        .map(function (index, element) { var _a; return (_a = loadedCheerio(element).text()) === null || _a === void 0 ? void 0 : _a.trim(); })
                                        .get()
                                        .join(",");
                                    break;
                                case "Статус книги":
                                    novel.status = loadedCheerio("div.data-value")
                                        .text()
                                        .includes("активен")
                                        ? novelStatus_1.NovelStatus.Ongoing
                                        : novelStatus_1.NovelStatus.Completed;
                                    break;
                            }
                        });
                        if (novel.author == "Не указан")
                            delete novel.author;
                        chapters = [];
                        loadedCheerio("div.li-ranobe").each(function () {
                            var name = loadedCheerio(this).find("a").text();
                            var url = loadedCheerio(this).find("a").attr("href");
                            if (!loadedCheerio(this).find("label.buy-ranobe").length && name && url) {
                                var releaseTime = loadedCheerio(this)
                                    .find("div.li-col2-ranobe").text().trim();
                                chapters.push({ name: name, releaseTime: releaseTime, url: url });
                            }
                        });
                        novel.chapters = chapters.reverse();
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    IfreedomPlugin.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl).then(function (res) { return res.text(); })];
                    case 1:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        loadedCheerio(".entry-content img").each(function () {
                            var _a, _b;
                            var srcset = (_b = (_a = loadedCheerio(this).attr("srcset")) === null || _a === void 0 ? void 0 : _a.split) === null || _b === void 0 ? void 0 : _b.call(_a, " ");
                            if (srcset === null || srcset === void 0 ? void 0 : srcset.length) {
                                var bestlink = srcset.filter(function (url) { return url.startsWith("http"); }).unshift();
                                if (typeof bestlink == 'string')
                                    loadedCheerio(this).attr("src", bestlink);
                            }
                        });
                        chapterText = loadedCheerio(".entry-content").html() || "";
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    IfreedomPlugin.prototype.searchNovels = function (searchTerm, page) {
        if (page === void 0) { page = 1; }
        return __awaiter(this, void 0, void 0, function () {
            var url, result, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = this.site + "/vse-knigi/?searchname=" + searchTerm + "&bpage=" + page;
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        result = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(result);
                        novels = loadedCheerio("div.one-book-home > div.img-home a")
                            .map(function (index, element) { return ({
                            name: loadedCheerio(element).attr("title") || "",
                            cover: loadedCheerio(element).find("img").attr("src"),
                            url: loadedCheerio(element).attr("href") || "",
                        }); })
                            .get()
                            .filter(function (novel) { return novel.name && novel.url; });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return IfreedomPlugin;
}());
var plugin = new IfreedomPlugin({ "id": "bookhamster", "sourceSite": "https://bookhamster.ru", "sourceName": "Bookhamster", "filters": { "sort": { "type": filterInputs_1.FilterTypes.Picker, "label": "Сортировка:", "options": [{ "label": "По дате добавления", "value": "По дате добавления" }, { "label": "По дате обновления", "value": "По дате обновления" }, { "label": "По количеству глав", "value": "По количеству глав" }, { "label": "По названию", "value": "По названию" }, { "label": "По просмотрам", "value": "По просмотрам" }, { "label": "По рейтингу", "value": "По рейтингу" }], "value": "По рейтингу" }, "status": { "type": filterInputs_1.FilterTypes.CheckboxGroup, "label": "Статус:", "options": [{ "label": "Перевод активен", "value": "Перевод активен" }, { "label": "Перевод приостановлен", "value": "Перевод приостановлен" }, { "label": "Произведение завершено", "value": "Произведение завершено" }], "value": [] }, "lang": { "type": filterInputs_1.FilterTypes.CheckboxGroup, "label": "Язык:", "options": [{ "label": "Английский", "value": "Английский" }, { "label": "Китайский", "value": "Китайский" }, { "label": "Корейский", "value": "Корейский" }, { "label": "Японский", "value": "Японский" }], "value": [] }, "genre": { "type": filterInputs_1.FilterTypes.CheckboxGroup, "label": "Жанры:", "options": [{ "label": "Боевик", "value": "Боевик" }, { "label": "Боевые Искусства", "value": "Боевые Искусства" }, { "label": "Вампиры", "value": "Вампиры" }, { "label": "Виртуальный Мир", "value": "Виртуальный Мир" }, { "label": "Гарем", "value": "Гарем" }, { "label": "Героическое фэнтези", "value": "Героическое фэнтези" }, { "label": "Детектив", "value": "Детектив" }, { "label": "Дзёсэй", "value": "Дзёсэй" }, { "label": "Драма", "value": "Драма" }, { "label": "Игра", "value": "Игра" }, { "label": "История", "value": "История" }, { "label": "Киберпанк", "value": "Киберпанк" }, { "label": "Комедия", "value": "Комедия" }, { "label": "ЛитРПГ", "value": "ЛитРПГ" }, { "label": "Меха", "value": "Меха" }, { "label": "Милитари", "value": "Милитари" }, { "label": "Мистика", "value": "Мистика" }, { "label": "Научная Фантастика", "value": "Научная Фантастика" }, { "label": "Повседневность", "value": "Повседневность" }, { "label": "Постапокалипсис", "value": "Постапокалипсис" }, { "label": "Приключения", "value": "Приключения" }, { "label": "Психология", "value": "Психология" }, { "label": "Романтика", "value": "Романтика" }, { "label": "Сверхъестественное", "value": "Сверхъестественное" }, { "label": "Сёдзё", "value": "Сёдзё" }, { "label": "Сёнэн", "value": "Сёнэн" }, { "label": "Сёнэн-ай", "value": "Сёнэн-ай" }, { "label": "Спорт", "value": "Спорт" }, { "label": "Сэйнэн", "value": "Сэйнэн" }, { "label": "Сюаньхуа", "value": "Сюаньхуа" }, { "label": "Трагедия", "value": "Трагедия" }, { "label": "Триллер", "value": "Триллер" }, { "label": "Ужасы", "value": "Ужасы" }, { "label": "Фантастика", "value": "Фантастика" }, { "label": "Фэнтези", "value": "Фэнтези" }, { "label": "Школьная жизнь", "value": "Школьная жизнь" }, { "label": "Экшн", "value": "Экшн" }, { "label": "Эротика", "value": "Эротика" }, { "label": "Этти", "value": "Этти" }, { "label": "Яой", "value": "Яой" }, { "label": "Adult", "value": "Adult" }, { "label": "Mature", "value": "Mature" }, { "label": "Xianxia", "value": "Xianxia" }, { "label": "Xuanhuan", "value": "Xuanhuan" }], "value": [] } } });
exports.default = plugin;
