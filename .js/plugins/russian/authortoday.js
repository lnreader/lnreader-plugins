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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var filterInputs_1 = require("@libs/filterInputs");
var defaultCover_1 = require("@libs/defaultCover");
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var cheerio_1 = require("cheerio");
var dayjs_1 = __importDefault(require("dayjs"));
var apiUrl = "https://api.author.today/";
var token = "Bearer guest";
var AuthorToday = /** @class */ (function () {
    function AuthorToday() {
        this.id = "AT";
        this.name = "Автор Тудей";
        this.icon = "src/ru/authortoday/icon.png";
        this.site = "https://author.today";
        this.version = "1.0.0";
        this.userAgent = "";
        this.cookieString = "";
        this.fetchImage = fetch_1.fetchFile;
        this.filters = {
            sort: {
                label: "Сортировка",
                value: "",
                options: [
                    { label: "По популярности", value: "popular" },
                    { label: "По количеству лайков", value: "likes" },
                    { label: "По комментариям", value: "comments" },
                    { label: "По новизне", value: "recent" },
                    { label: "По просмотрам", value: "views" },
                    { label: "Набирающие популярность", value: "trending" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            genre: {
                label: "Жанры",
                value: "",
                options: [
                    { label: "Альтернативная история", value: "sf-history" },
                    { label: "Антиутопия", value: "dystopia" },
                    { label: "Бизнес-литература", value: "biznes-literatura" },
                    { label: "Боевая фантастика", value: "sf-action" },
                    { label: "Боевик", value: "action" },
                    { label: "Боевое фэнтези", value: "fantasy-action" },
                    { label: "Бояръ-Аниме", value: "boyar-anime" },
                    { label: "Героическая фантастика", value: "sf-heroic" },
                    { label: "Героическое фэнтези", value: "heroic-fantasy" },
                    { label: "Городское фэнтези", value: "urban-fantasy" },
                    { label: "Детектив", value: "detective" },
                    { label: "Детская литература", value: "detskaya-literatura" },
                    { label: "Документальная проза", value: "non-fiction" },
                    { label: "Историческая проза", value: "historical-fiction" },
                    { label: "Исторические приключения", value: "historical-adventure" },
                    { label: "Исторический детектив", value: "historical-mystery" },
                    { label: "Исторический любовный роман", value: "historical-romance" },
                    { label: "Историческое фэнтези", value: "historical-fantasy" },
                    { label: "Киберпанк", value: "cyberpunk" },
                    { label: "Короткий любовный роман", value: "short-romance" },
                    { label: "Космическая фантастика", value: "sf-space" },
                    { label: "ЛитРПГ", value: "litrpg" },
                    { label: "Любовное фэнтези", value: "love-fantasy" },
                    { label: "Любовные романы", value: "romance" },
                    { label: "Мистика", value: "paranormal" },
                    { label: "Назад в СССР", value: "back-to-ussr" },
                    { label: "Научная фантастика", value: "science-fiction" },
                    { label: "Подростковая проза", value: "teen-prose" },
                    { label: "Политический роман", value: "political-fiction" },
                    { label: "Попаданцы", value: "popadantsy" },
                    { label: "Попаданцы в космос", value: "popadantsy-v-kosmos" },
                    { label: "Попаданцы в магические миры", value: "popadantsy-v-magicheskie-miry" },
                    { label: "Попаданцы во времени", value: "popadantsy-vo-vremeni" },
                    { label: "Постапокалипсис", value: "postapocalyptic" },
                    { label: "Поэзия", value: "poetry" },
                    { label: "Приключения", value: "adventure" },
                    { label: "Публицистика", value: "publicism" },
                    { label: "Развитие личности", value: "razvitie-lichnosti" },
                    { label: "Разное", value: "other" },
                    { label: "РеалРПГ", value: "realrpg" },
                    { label: "Романтическая эротика", value: "romantic-erotika" },
                    { label: "Сказка", value: "fairy-tale" },
                    { label: "Современная проза", value: "modern-prose" },
                    { label: "Современный любовный роман", value: "contemporary-romance" },
                    { label: "Социальная фантастика", value: "sf-social" },
                    { label: "Стимпанк", value: "steampunk" },
                    { label: "Темное фэнтези", value: "dark-fantasy" },
                    { label: "Триллер", value: "thriller" },
                    { label: "Ужасы", value: "horror" },
                    { label: "Фантастика", value: "sci-fi" },
                    { label: "Фантастический детектив", value: "detective-science-fiction" },
                    { label: "Фанфик", value: "fanfiction" },
                    { label: "Фэнтези", value: "fantasy" },
                    { label: "Шпионский детектив", value: "spy-mystery" },
                    { label: "Эпическое фэнтези", value: "epic-fantasy" },
                    { label: "Эротика", value: "erotica" },
                    { label: "Эротическая фантастика", value: "sf-erotika" },
                    { label: "Эротический фанфик", value: "fanfiction-erotika" },
                    { label: "Эротическое фэнтези", value: "fantasy-erotika" },
                    { label: "Юмор", value: "humor" },
                    { label: "Юмористическая фантастика", value: "sf-humor" },
                    { label: "Юмористическое фэнтези", value: "ironical-fantasy" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            form: {
                label: "Форма произведения",
                value: "",
                options: [
                    { label: "Любой", value: "any" },
                    { label: "Перевод", value: "translation" },
                    { label: "Повесть", value: "tale" },
                    { label: "Рассказ", value: "story" },
                    { label: "Роман", value: "novel" },
                    { label: "Сборник поэзии", value: "poetry" },
                    { label: "Сборник рассказов", value: "story-book" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            state: {
                label: "Статус произведения",
                value: "",
                options: [
                    { label: "Любой статус", value: "any" },
                    { label: "В процессе", value: "in-progress" },
                    { label: "Завершено", value: "finished" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            series: {
                label: "Статус цикла",
                value: "",
                options: [
                    { label: "Не важно", value: "any" },
                    { label: "Вне цикла", value: "out" },
                    { label: "Цикл завершен", value: "finished" },
                    { label: "Цикл не завершен", value: "unfinished" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            access: {
                label: "Тип доступа",
                value: "",
                options: [
                    { label: "Любой", value: "any" },
                    { label: "Платный", value: "paid" },
                    { label: "Бесплатный", value: "free" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            promo: {
                label: "Промо-фрагмент",
                value: "",
                options: [
                    { label: "Скрывать", value: "hide" },
                    { label: "Показывать", value: "show" },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    AuthorToday.prototype.popularNovels = function (pageNo, _a) {
        var _b, _c, _d, _e, _f, _g, _h, _j;
        var showLatestNovels = _a.showLatestNovels, filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var url, result, json, novels;
            var _this = this;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        url = apiUrl + "v1/catalog/search?page=" + pageNo;
                        if ((_b = filters === null || filters === void 0 ? void 0 : filters.genre) === null || _b === void 0 ? void 0 : _b.value) {
                            url += "&genre=" + filters.genre.value;
                        }
                        url +=
                            "&sorting=" + (showLatestNovels ? "recent" : ((_c = filters === null || filters === void 0 ? void 0 : filters.sort) === null || _c === void 0 ? void 0 : _c.value) || "popular");
                        url += "&form=" + (((_d = filters === null || filters === void 0 ? void 0 : filters.form) === null || _d === void 0 ? void 0 : _d.value) || "any");
                        url += "&state=" + (((_e = filters === null || filters === void 0 ? void 0 : filters.state) === null || _e === void 0 ? void 0 : _e.value) || "any");
                        url += "&series=" + (((_f = filters === null || filters === void 0 ? void 0 : filters.series) === null || _f === void 0 ? void 0 : _f.value) || "any");
                        url += "&access=" + (((_g = filters === null || filters === void 0 ? void 0 : filters.access) === null || _g === void 0 ? void 0 : _g.value) || "any");
                        url += "&promo=" + (((_h = filters === null || filters === void 0 ? void 0 : filters.promo) === null || _h === void 0 ? void 0 : _h.value) || "hide");
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, {
                                headers: {
                                    Authorization: token,
                                },
                            })];
                    case 1:
                        result = _k.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_k.sent());
                        novels = [];
                        if ((json === null || json === void 0 ? void 0 : json.code) === "NotFound") {
                            return [2 /*return*/, novels];
                        }
                        (_j = json === null || json === void 0 ? void 0 : json.searchResults) === null || _j === void 0 ? void 0 : _j.forEach(function (novel) {
                            return novels.push({
                                name: novel.title,
                                cover: (novel === null || novel === void 0 ? void 0 : novel.coverUrl)
                                    ? "https://cm.author.today/content/" + novel.coverUrl
                                    : defaultCover_1.defaultCover,
                                url: _this.site + "/work/" + novel.id,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    AuthorToday.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var workID, result, json, novel, chaptersRaw, chaptersJSON, chapters;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        workID = novelUrl.split("/")[4];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)("".concat(apiUrl, "v1/work/").concat(workID, "/details"), {
                                headers: {
                                    Authorization: token,
                                },
                            })];
                    case 1:
                        result = _b.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_b.sent());
                        novel = {
                            url: novelUrl,
                            name: json.title,
                            cover: (json === null || json === void 0 ? void 0 : json.coverUrl) ? json.coverUrl.split("?")[0] : defaultCover_1.defaultCover,
                            author: (json === null || json === void 0 ? void 0 : json.originalAuthor) ||
                                (json === null || json === void 0 ? void 0 : json.authorFIO) ||
                                (json === null || json === void 0 ? void 0 : json.coAuthorFIO) ||
                                (json === null || json === void 0 ? void 0 : json.secondCoAuthorFIO) ||
                                (json === null || json === void 0 ? void 0 : json.translator) ||
                                "",
                            genres: (_a = json === null || json === void 0 ? void 0 : json.tags) === null || _a === void 0 ? void 0 : _a.join(", "),
                            status: (json === null || json === void 0 ? void 0 : json.isFinished) ? novelStatus_1.NovelStatus.Completed : novelStatus_1.NovelStatus.Ongoing,
                        };
                        novel.summary = "";
                        novel.summary += (json === null || json === void 0 ? void 0 : json.annotation) ? json.annotation + "\n" : "";
                        novel.summary += (json === null || json === void 0 ? void 0 : json.authorNotes)
                            ? "Примечания автора:\n" + json.authorNotes
                            : "";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)("".concat(apiUrl, "v1/work/").concat(workID, "/content"), {
                                headers: {
                                    Authorization: token,
                                },
                            })];
                    case 3:
                        chaptersRaw = _b.sent();
                        return [4 /*yield*/, chaptersRaw.json()];
                    case 4:
                        chaptersJSON = (_b.sent());
                        chapters = [];
                        chaptersJSON === null || chaptersJSON === void 0 ? void 0 : chaptersJSON.forEach(function (chapter, index) {
                            if ((chapter === null || chapter === void 0 ? void 0 : chapter.isAvailable) && !(chapter === null || chapter === void 0 ? void 0 : chapter.isDraft)) {
                                chapters.push({
                                    name: (chapter === null || chapter === void 0 ? void 0 : chapter.title) || "\u0413\u043B\u0430\u0432\u0430 ".concat(index + 1),
                                    releaseTime: (0, dayjs_1.default)((chapter === null || chapter === void 0 ? void 0 : chapter.publishTime) || chapter.lastModificationTime).format("LLL"),
                                    url: "".concat(apiUrl, "v1/work/").concat(workID, "/chapter/").concat(chapter.id, "/text"),
                                });
                            }
                        });
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    AuthorToday.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var result, json, key, text, i, loadedCheerio, baseUrl, chapterText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(chapterUrl, {
                            headers: {
                                Authorization: token,
                            },
                        })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_a.sent());
                        if (json === null || json === void 0 ? void 0 : json.code) {
                            return [2 /*return*/, json.code + "\n" + (json === null || json === void 0 ? void 0 : json.message)];
                        }
                        key = json.key.split("").reverse().join("") + "@_@";
                        text = "";
                        for (i = 0; i < json.text.length; i++) {
                            text += String.fromCharCode(json.text.charCodeAt(i) ^ key.charCodeAt(Math.floor(i % key.length)));
                        }
                        loadedCheerio = (0, cheerio_1.load)(text);
                        baseUrl = this.site;
                        loadedCheerio("img").each(function () {
                            var _a;
                            if (!((_a = loadedCheerio(this).attr("src")) === null || _a === void 0 ? void 0 : _a.startsWith("http"))) {
                                var src = loadedCheerio(this).attr("src");
                                loadedCheerio(this).attr("src", baseUrl + src);
                            }
                        });
                        chapterText = loadedCheerio.html();
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    AuthorToday.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            var baseUrl, url, result, body, loadedCheerio, novels;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        baseUrl = this.site;
                        url = baseUrl + "/search?category=works&q=" + searchTerm + "&page=";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url + (pageNo || 1))];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, result.text()];
                    case 2:
                        body = _a.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        novels = [];
                        loadedCheerio("div.book-row").each(function () {
                            var _a;
                            var name = loadedCheerio(this)
                                .find('div[class="book-title"] a')
                                .text()
                                .trim();
                            var cover = loadedCheerio(this).find("img").attr("src");
                            var url = baseUrl +
                                "/work/" +
                                ((_a = loadedCheerio(this)
                                    .find('div[class="book-title"] a')
                                    .attr("href")) === null || _a === void 0 ? void 0 : _a.split("/")[2]);
                            if (cover) {
                                cover = cover.split("?")[0];
                            }
                            else {
                                cover = defaultCover_1.defaultCover;
                            }
                            novels.push({ name: name, cover: cover, url: url });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return AuthorToday;
}());
exports.default = new AuthorToday();
