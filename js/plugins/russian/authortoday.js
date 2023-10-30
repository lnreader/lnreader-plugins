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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filters = exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.icon = exports.version = exports.site = exports.name = exports.id = void 0;
const filterInputs_1 = require("@libs/filterInputs");
const defaultCover_1 = require("@libs/defaultCover");
const fetch_1 = require("@libs/fetch");
const novelStatus_1 = require("@libs/novelStatus");
const cheerio_1 = require("cheerio");
const dayjs_1 = __importDefault(require("dayjs"));
exports.id = "AT";
exports.name = "Автор Тудей";
exports.site = "https://author.today";
exports.version = "1.0.0";
exports.icon = "src/ru/authortoday/icon.png";
const apiUrl = "https://api.author.today/";
const token = "Bearer guest";
const popularNovels = function (page, { showLatestNovels, filters }) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let url = apiUrl + "v1/catalog/search?page=" + page;
        if (filters === null || filters === void 0 ? void 0 : filters.genre) {
            url += "&genre=" + filters.genre;
        }
        url +=
            "&sorting=" + (showLatestNovels ? "recent" : (filters === null || filters === void 0 ? void 0 : filters.sort) || "popular");
        url += "&form=" + ((filters === null || filters === void 0 ? void 0 : filters.form) || "any");
        url += "&state=" + ((filters === null || filters === void 0 ? void 0 : filters.state) || "any");
        url += "&series=" + ((filters === null || filters === void 0 ? void 0 : filters.series) || "any");
        url += "&access=" + ((filters === null || filters === void 0 ? void 0 : filters.access) || "any");
        url += "&promo=" + ((filters === null || filters === void 0 ? void 0 : filters.promo) || "hide");
        const result = yield (0, fetch_1.fetchApi)(url, {
            headers: {
                Authorization: token,
            },
        });
        const json = (yield result.json());
        if ((json === null || json === void 0 ? void 0 : json.code) === "NotFound") {
            return [];
        }
        let novels = [];
        (_a = json === null || json === void 0 ? void 0 : json.searchResults) === null || _a === void 0 ? void 0 : _a.forEach((novel) => novels.push({
            name: novel.title,
            cover: (novel === null || novel === void 0 ? void 0 : novel.coverUrl)
                ? "https://cm.author.today/content/" + novel.coverUrl
                : defaultCover_1.defaultCover,
            url: exports.site + "/work/" + novel.id,
        }));
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const workID = novelUrl.split("/")[4];
        let result = yield (0, fetch_1.fetchApi)(`${apiUrl}v1/work/${workID}/details`, {
            headers: {
                Authorization: token,
            },
        });
        let json = (yield result.json());
        let novel = {
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
        // all chapters
        let chaptersRaw = yield (0, fetch_1.fetchApi)(`${apiUrl}v1/work/${workID}/content`, {
            headers: {
                Authorization: token,
            },
        });
        let chaptersJSON = (yield chaptersRaw.json());
        let chapters = [];
        chaptersJSON === null || chaptersJSON === void 0 ? void 0 : chaptersJSON.forEach((chapter, index) => {
            if ((chapter === null || chapter === void 0 ? void 0 : chapter.isAvailable) && !(chapter === null || chapter === void 0 ? void 0 : chapter.isDraft)) {
                chapters.push({
                    name: (chapter === null || chapter === void 0 ? void 0 : chapter.title) || `Глава ${index + 1}`,
                    releaseTime: (0, dayjs_1.default)((chapter === null || chapter === void 0 ? void 0 : chapter.publishTime) || chapter.lastModificationTime).format("LLL"),
                    url: `${apiUrl}v1/work/${workID}/chapter/${chapter.id}/text`,
                });
            }
        });
        novel.chapters = chapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl, {
            headers: {
                Authorization: token,
            },
        });
        const json = (yield result.json());
        if (json === null || json === void 0 ? void 0 : json.code) {
            return json.code + "\n" + (json === null || json === void 0 ? void 0 : json.message);
        }
        let key = json.key.split("").reverse().join("") + "@_@";
        let text = "";
        for (let i = 0; i < json.text.length; i++) {
            text += String.fromCharCode(json.text.charCodeAt(i) ^ key.charCodeAt(Math.floor(i % key.length)));
        }
        const loadedCheerio = (0, cheerio_1.load)(text);
        loadedCheerio("img").each(function () {
            var _a;
            if (!((_a = loadedCheerio(this).attr("src")) === null || _a === void 0 ? void 0 : _a.startsWith("http"))) {
                const src = loadedCheerio(this).attr("src");
                loadedCheerio(this).attr("src", exports.site + src);
            }
        });
        const chapterText = loadedCheerio.html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${exports.site}/search?category=works&q=${searchTerm}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio("div.book-row").each(function () {
            var _a;
            const name = loadedCheerio(this)
                .find('div[class="book-title"] a')
                .text()
                .trim();
            let cover = loadedCheerio(this).find("img").attr("src");
            const url = exports.site +
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
            novels.push({ name, cover, url });
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
exports.filters = [
    {
        key: "sort",
        label: "Сортировка",
        values: [
            { label: "По популярности", value: "popular" },
            { label: "По количеству лайков", value: "likes" },
            { label: "По комментариям", value: "comments" },
            { label: "По новизне", value: "recent" },
            { label: "По просмотрам", value: "views" },
            { label: "Набирающие популярность", value: "trending" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "genre",
        label: "Жанры",
        values: [
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
            {
                label: "Исторические приключения",
                value: "historical-adventure",
            },
            { label: "Исторический детектив", value: "historical-mystery" },
            {
                label: "Исторический любовный роман",
                value: "historical-romance",
            },
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
            {
                label: "Попаданцы в магические миры",
                value: "popadantsy-v-magicheskie-miry",
            },
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
            {
                label: "Современный любовный роман",
                value: "contemporary-romance",
            },
            { label: "Социальная фантастика", value: "sf-social" },
            { label: "Стимпанк", value: "steampunk" },
            { label: "Темное фэнтези", value: "dark-fantasy" },
            { label: "Триллер", value: "thriller" },
            { label: "Ужасы", value: "horror" },
            { label: "Фантастика", value: "sci-fi" },
            {
                label: "Фантастический детектив",
                value: "detective-science-fiction",
            },
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
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "form",
        label: "Форма произведения",
        values: [
            { label: "Любой", value: "any" },
            { label: "Перевод", value: "translation" },
            { label: "Повесть", value: "tale" },
            { label: "Рассказ", value: "story" },
            { label: "Роман", value: "novel" },
            { label: "Сборник поэзии", value: "poetry" },
            { label: "Сборник рассказов", value: "story-book" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "state",
        label: "Статус произведения",
        values: [
            { label: "Любой статус", value: "any" },
            { label: "В процессе", value: "in-progress" },
            { label: "Завершено", value: "finished" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "series",
        label: "Статус цикла",
        values: [
            { label: "Не важно", value: "any" },
            { label: "Вне цикла", value: "out" },
            { label: "Цикл завершен", value: "finished" },
            { label: "Цикл не завершен", value: "unfinished" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "access",
        label: "Тип доступа",
        values: [
            { label: "Любой", value: "any" },
            { label: "Платный", value: "paid" },
            { label: "Бесплатный", value: "free" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "promo",
        label: "Промо-фрагмент",
        values: [
            { label: "Скрывать", value: "hide" },
            { label: "Показывать", value: "show" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
];
