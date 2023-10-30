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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchImage = exports.filters = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.icon = exports.version = exports.site = exports.name = exports.id = void 0;
const filterInputs_1 = require("@libs/filterInputs");
const fetch_1 = require("@libs/fetch");
const cheerio_1 = require("cheerio");
exports.id = "freedlit.space";
exports.name = "LitSpace";
exports.site = "https://freedlit.space";
exports.version = "1.0.0";
exports.icon = "src/ru/freedlit/icon.png";
const popularNovels = function (page, { showLatestNovels, filters }) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = exports.site + "/books/";
        url += ((filters === null || filters === void 0 ? void 0 : filters.genre) || "all") + "?sort=";
        url += showLatestNovels ? "recent" : (filters === null || filters === void 0 ? void 0 : filters.sort) || "popular";
        url += "&status=" + ((filters === null || filters === void 0 ? void 0 : filters.status) || "all");
        url += "&access=" + ((filters === null || filters === void 0 ? void 0 : filters.access) || "all");
        url += "&adult=" + ((filters === null || filters === void 0 ? void 0 : filters.adult) || "hide");
        url += "&page=" + page;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#bookListBlock > div > div").each(function () {
            var _a, _b, _c;
            const name = (_a = loadedCheerio(this).find("div > h4 > a").text()) === null || _a === void 0 ? void 0 : _a.trim();
            const cover = (_b = loadedCheerio(this).find("div > a > img").attr("src")) === null || _b === void 0 ? void 0 : _b.trim();
            const url = (_c = loadedCheerio(this).find("div > h4 > a").attr("href")) === null || _c === void 0 ? void 0 : _c.trim();
            if (!name || !url)
                return;
            novels.push({ name, cover, url });
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(novelUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url: novelUrl,
            name: loadedCheerio(".book-info > h4").text(),
            cover: (_a = loadedCheerio(".book-cover > div > img").attr("src")) === null || _a === void 0 ? void 0 : _a.trim(),
            summary: (_b = loadedCheerio("#nav-home").text()) === null || _b === void 0 ? void 0 : _b.trim(),
            author: loadedCheerio(".book-info > h5 > a").text(),
            genres: loadedCheerio(".genre-list > a")
                .map((index, element) => loadedCheerio(element).text()).get().join(","),
        };
        let chapters = [];
        loadedCheerio("#nav-contents > div").each(function () {
            const name = loadedCheerio(this).find("a").text();
            const releaseTime = loadedCheerio(this).find('span[class="date"]').text();
            const url = loadedCheerio(this).find("a").attr("href");
            if (!name || !url)
                return;
            chapters.push({ name, releaseTime, url });
        });
        novel.chapters = chapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio('div[class="standart-block"]').remove();
        loadedCheerio('div[class="mobile-block"]').remove();
        const chapterText = loadedCheerio('div[class="chapter"]').html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${exports.site}/search?query=${searchTerm}&type=all`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("#bookListBlock > div").each(function () {
            var _a, _b, _c;
            const name = (_a = loadedCheerio(this).find("h4 > a").text()) === null || _a === void 0 ? void 0 : _a.trim();
            const cover = (_b = loadedCheerio(this).find("a > img").attr("src")) === null || _b === void 0 ? void 0 : _b.trim();
            const url = (_c = loadedCheerio(this).find("h4 > a").attr("href")) === null || _c === void 0 ? void 0 : _c.trim();
            if (!name || !url)
                return;
            novels.push({ name, cover, url });
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.filters = [
    {
        key: "sort",
        label: "Сортировка:",
        values: [
            { label: "По популярности", value: "popular" },
            { label: "По количеству комментариев", value: "comments" },
            { label: "По количеству лайков", value: "likes" },
            { label: "По новизне", value: "recent" },
            { label: "По просмотрам", value: "views" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "genre",
        label: "Жанры:",
        values: [
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
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "status",
        label: "Статус:",
        values: [
            { label: "Любой статус", value: "all" },
            { label: "В процессе", value: "in-process" },
            { label: "Завершено", value: "finished" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "access",
        label: "Доступ:",
        values: [
            { label: "Любой доступ", value: "all" },
            { label: "Бесплатные", value: "free" },
            { label: "Платные", value: "paid" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "adult",
        label: "Возрастные ограничения:",
        values: [
            { label: "Скрыть 18+", value: "hide" },
            { label: "Показать +18", value: "show" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
];
exports.fetchImage = fetch_1.fetchFile;
