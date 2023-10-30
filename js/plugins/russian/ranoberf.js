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
exports.id = "RNRF";
exports.name = "РанобэРФ";
exports.site = "https://ранобэ.рф";
exports.version = "1.0.0";
exports.icon = "src/ru/ranoberf/icon.png";
const popularNovels = function (page, { showLatestNovels, filters }) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        let url = exports.site + "/books?order=";
        url += showLatestNovels ? "lastPublishedChapter" : (filters === null || filters === void 0 ? void 0 : filters.sort) || "popular";
        url += "&page=" + page;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const jsonRaw = loadedCheerio("#__NEXT_DATA__").html();
        let json = JSON.parse(jsonRaw || '{}');
        let novels = [];
        (_c = (_b = (_a = json.props.pageProps) === null || _a === void 0 ? void 0 : _a.totalData) === null || _b === void 0 ? void 0 : _b.items) === null || _c === void 0 ? void 0 : _c.forEach((novel) => {
            var _a;
            return novels.push({
                name: novel.title,
                cover: ((_a = novel === null || novel === void 0 ? void 0 : novel.verticalImage) === null || _a === void 0 ? void 0 : _a.url)
                    ? exports.site + novel.verticalImage.url
                    : defaultCover_1.defaultCover,
                url: exports.site + "/" + novel.slug,
            });
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
        const jsonRaw = loadedCheerio("#__NEXT_DATA__").html();
        const book = JSON.parse(jsonRaw || '{}').props.pageProps.book;
        let novel = {
            url: novelUrl,
            name: book === null || book === void 0 ? void 0 : book.title,
            cover: ((_a = book === null || book === void 0 ? void 0 : book.verticalImage) === null || _a === void 0 ? void 0 : _a.url)
                ? exports.site + book.verticalImage.url
                : defaultCover_1.defaultCover,
            summary: book === null || book === void 0 ? void 0 : book.description,
            author: (book === null || book === void 0 ? void 0 : book.author) || "",
            genres: book === null || book === void 0 ? void 0 : book.genres.map((item) => item.title).join(", "),
            status: (book === null || book === void 0 ? void 0 : book.additionalInfo.includes("Активен"))
                ? novelStatus_1.NovelStatus.Ongoing
                : novelStatus_1.NovelStatus.Completed,
        };
        let chapters = [];
        (_b = book === null || book === void 0 ? void 0 : book.chapters) === null || _b === void 0 ? void 0 : _b.forEach((chapter) => {
            if (!(chapter === null || chapter === void 0 ? void 0 : chapter.isDonate) || (chapter === null || chapter === void 0 ? void 0 : chapter.isUserPaid)) {
                chapters.push({
                    name: chapter.title,
                    releaseTime: (0, dayjs_1.default)(chapter.publishedAt).format("LLL"),
                    url: exports.site + chapter.url,
                });
            }
        });
        novel.chapters = chapters.reverse();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        let jsonRaw = loadedCheerio("#__NEXT_DATA__").html();
        let json = JSON.parse(jsonRaw || '{}');
        loadedCheerio = (0, cheerio_1.load)(((_c = (_b = (_a = json.props.pageProps) === null || _a === void 0 ? void 0 : _a.chapter) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.text) || "");
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
        const url = `${exports.site}/v3/books?filter[or][0][title][like]=${searchTerm}&filter[or][1][titleEn][like]=${searchTerm}&filter[or][2][fullTitle][like]=${searchTerm}&filter[status][]=active&filter[status][]=abandoned&filter[status][]=completed&expand=verticalImage`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = (yield result.json());
        let novels = [];
        body.items.forEach((novel) => {
            var _a;
            return novels.push({
                name: novel.title,
                cover: ((_a = novel === null || novel === void 0 ? void 0 : novel.verticalImage) === null || _a === void 0 ? void 0 : _a.url)
                    ? exports.site + novel.verticalImage.url
                    : defaultCover_1.defaultCover,
                url: exports.site + "/" + novel.slug,
            });
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
            { label: "Рейтинг", value: "popular" },
            { label: "Дате добавления", value: "new" },
            { label: "Дате обновления", value: "lastPublishedChapter" },
            { label: "Законченные", value: "completed" },
        ],
        inputType: filterInputs_1.FilterInputs.Picker,
    },
];
