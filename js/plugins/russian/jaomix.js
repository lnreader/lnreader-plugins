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
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const novelStatus_1 = require("@libs/novelStatus");
const filterInputs_1 = require("@libs/filterInputs");
exports.id = "jaomix.ru";
exports.name = "Jaomix";
exports.site = "https://jaomix.ru";
exports.version = "1.0.0";
exports.icon = "src/ru/jaomix/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page, { showLatestNovels, filters }) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = baseUrl + "/?searchrn&sortby=";
        url += showLatestNovels ? "upd" : (filters === null || filters === void 0 ? void 0 : filters.sort) || "count";
        if (filters) {
            if (Array.isArray(filters.type) && filters.type.length) {
                url += filters.type.map((i) => `&lang[]=${i}`).join("");
            }
            if (Array.isArray(filters.genres) && filters.genres.length) {
                url += filters.genres.map((i) => `&genre[]=${i}`).join("");
            }
        }
        url += `&page=${page}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        let body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio('div[class="block-home"] > div[class="one"]').each(function () {
            var _a;
            const name = loadedCheerio(this)
                .find('div[class="img-home"] > a')
                .attr("title");
            const cover = (_a = loadedCheerio(this)
                .find('div[class="img-home"] > a > img')
                .attr("src")) === null || _a === void 0 ? void 0 : _a.replace("-150x150", "");
            const url = loadedCheerio(this)
                .find('div[class="img-home"] > a')
                .attr("href");
            if (!name || !url)
                return;
            novels.push({ name, cover, url });
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(novelUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novel = {
            url: novelUrl,
        };
        novel.name = loadedCheerio('div[class="desc-book"] > h1').text().trim();
        novel.cover = loadedCheerio('div[class="img-book"] > img').attr("src");
        novel.summary = loadedCheerio('div[id="desc-tab"]').text().trim();
        loadedCheerio("#info-book > p").each(function () {
            let text = loadedCheerio(this).text().replace(/,/g, "").split(" ");
            if (text[0] === "Автор:") {
                novel.author = text.splice(1).join(" ");
            }
            else if (text[0] === "Жанры:") {
                novel.genres = text.splice(1).join(",");
            }
            else if (text[0] === "Статус:") {
                novel.status = text.includes("продолжается")
                    ? novelStatus_1.NovelStatus.Ongoing
                    : novelStatus_1.NovelStatus.Completed;
            }
        });
        const chapters = [];
        loadedCheerio(".download-chapter div.title").each(function () {
            chapters.push({
                name: loadedCheerio(this).find("a").attr("title"),
                releaseTime: loadedCheerio(this).find("time").text(),
                url: loadedCheerio(this).find("a").attr("href"),
            });
        });
        novel.chapters = chapters.reverse();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio('div[class="adblock-service"]').remove();
        const chapterText = loadedCheerio('div[class="entry-content"]').html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${baseUrl}/?searchrn=${searchTerm}&but=Поиск по названию&sortby=upd`;
        const result = yield (0, fetch_1.fetchApi)(url);
        let body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio('div[class="block-home"] > div[class="one"]').each(function () {
            var _a;
            const name = loadedCheerio(this)
                .find('div[class="img-home"] > a')
                .attr("title");
            const cover = (_a = loadedCheerio(this)
                .find('div[class="img-home"] > a > img')
                .attr("src")) === null || _a === void 0 ? void 0 : _a.replace("-150x150", "");
            const url = loadedCheerio(this)
                .find('div[class="img-home"] > a')
                .attr("href");
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
        label: "Сортировка",
        values: [
            { label: "Имя", value: "alphabet" },
            { label: "Просмотры", value: "count" },
            { label: "Дате добавления", value: "new" },
            { label: "Дате обновления", value: "upd" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
    {
        key: "type",
        label: "Тип",
        values: [
            { label: "Английский", value: "Английский" },
            { label: "Китайский", value: "Китайский" },
            { label: "Корейский", value: "Корейский" },
            { label: "Японский", value: "Японский" },
        ],
        inputType: filterInputs_1.FilterInputs.Checkbox,
    },
    {
        key: "genres",
        label: "Жанры",
        values: [
            { label: "Боевые Искусства", value: "Боевые Искусства" },
            { label: "Виртуальный Мир", value: "Виртуальный Мир" },
            { label: "Гарем", value: "Гарем" },
            { label: "Детектив", value: "Детектив" },
            { label: "Драма", value: "Драма" },
            { label: "Игра", value: "Игра" },
            { label: "Истории из жизни", value: "Истории из жизни" },
            { label: "Исторический", value: "Исторический" },
            { label: "История", value: "История" },
            { label: "Исэкай", value: "Исэкай" },
            { label: "Комедия", value: "Комедия" },
            { label: "Меха", value: "Меха" },
            { label: "Мистика", value: "Мистика" },
            { label: "Научная Фантастика", value: "Научная Фантастика" },
            { label: "Повседневность", value: "Повседневность" },
            { label: "Постапокалипсис", value: "Постапокалипсис" },
            { label: "Приключения", value: "Приключения" },
            { label: "Психология", value: "Психология" },
            { label: "Романтика", value: "Романтика" },
            { label: "Сверхъестественное", value: "Сверхъестественное" },
            { label: "Сёнэн", value: "Сёнэн" },
            { label: "Сёнэн-ай", value: "Сёнэн-ай" },
            { label: "Спорт", value: "Спорт" },
            { label: "Сэйнэн", value: "Сэйнэн" },
            { label: "Сюаньхуа", value: "Сюаньхуа" },
            { label: "Трагедия", value: "Трагедия" },
            { label: "Триллер", value: "Триллер" },
            { label: "Фантастика", value: "Фантастика" },
            { label: "Фэнтези", value: "Фэнтези" },
            { label: "Хоррор", value: "Хоррор" },
            { label: "Школьная жизнь", value: "Школьная жизнь" },
            { label: "Шоунен", value: "Шоунен" },
            { label: "Экшн", value: "Экшн" },
            { label: "Этти", value: "Этти" },
            { label: "Юри", value: "Юри" },
            { label: "Adult", value: "Adult" },
            { label: "Ecchi", value: "Ecchi" },
            { label: "Josei", value: "Josei" },
            { label: "Lolicon", value: "Lolicon" },
            { label: "Mature", value: "Mature" },
            { label: "Shoujo", value: "Shoujo" },
            { label: "Wuxia", value: "Wuxia" },
            { label: "Xianxia", value: "Xianxia" },
            { label: "Xuanhuan", value: "Xuanhuan" },
            { label: "Yaoi", value: "Yaoi" },
        ],
        inputType: filterInputs_1.FilterInputs.Checkbox,
    },
];
exports.fetchImage = fetch_1.fetchFile;
