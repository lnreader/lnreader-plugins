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
exports.filters = exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.version = exports.icon = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const filterInputs_1 = require("@libs/filterInputs");
const defaultCover_1 = require("@libs/defaultCover");
const novelStatus_1 = require("@libs/novelStatus");
const parseMadaraDate_1 = require("@libs/parseMadaraDate");
const dayjs_1 = __importDefault(require("dayjs"));
exports.id = "hizomanga";
exports.name = "HizoManga [madara]";
exports.icon = "multisrc/madara/icons/hizomanga.png";
exports.version = "1.0.0";
exports.site = "https://hizomanga.com/";
const baseUrl = exports.site;
const popularNovels = (pageNo, { filters, showLatestNovels }) => __awaiter(void 0, void 0, void 0, function* () {
    const novels = [];
    let url = exports.site;
    if (filters === null || filters === void 0 ? void 0 : filters.genres) {
        url += "manga-genre/" + filters.genres + '/';
    }
    else {
        url += "serie/";
    }
    url += '/page/' + pageNo + '/' +
        '?m_orderby=' + (showLatestNovels ? 'latest' : ((filters === null || filters === void 0 ? void 0 : filters.sort) || 'rating'));
    const body = yield (0, fetch_1.fetchApi)(url).then(res => res.text());
    const loadedCheerio = (0, cheerio_1.load)(body);
    loadedCheerio('.manga-title-badges').remove();
    loadedCheerio('.page-item-detail').each(function () {
        const novelName = loadedCheerio(this).find('.post-title').text().trim();
        let image = loadedCheerio(this).find('img');
        const novelCover = image.attr('data-src') || image.attr('src');
        let novelUrl = loadedCheerio(this).find('.post-title')
            .find('a')
            .attr('href') || '';
        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };
        novels.push(novel);
    });
    return novels;
});
exports.popularNovels = popularNovels;
const parseNovelAndChapters = (novelUrl) => __awaiter(void 0, void 0, void 0, function* () {
    const novel = {
        url: novelUrl,
    };
    const body = yield (0, fetch_1.fetchApi)(novelUrl).then(res => res.text());
    let loadedCheerio = (0, cheerio_1.load)(body);
    loadedCheerio('.manga-title-badges').remove();
    novel.name = loadedCheerio('.post-title h1').text().trim();
    novel.cover =
        loadedCheerio('.summary_image > a > img').attr('data-lazy-src') ||
            loadedCheerio('.summary_image > a > img').attr('data-src') ||
            loadedCheerio('.summary_image > a > img').attr('src') ||
            defaultCover_1.defaultCover;
    loadedCheerio('.post-content_item, .post-content').each(function () {
        const detailName = loadedCheerio(this).find('h5').text().trim();
        const detail = loadedCheerio(this).find('.summary-content').text().trim();
        switch (detailName) {
            case 'Genre(s)':
            case 'التصنيفات':
                novel.genres = detail.replace(/[\t\n]/g, ',');
                break;
            case 'Author(s)':
            case 'المؤلف':
            case 'المؤلف (ين)':
                novel.author = detail;
                break;
            case 'Status':
            case 'الحالة':
                novel.status =
                    detail.includes('OnGoing') || detail.includes('مستمرة')
                        ? novelStatus_1.NovelStatus.Ongoing
                        : novelStatus_1.NovelStatus.Completed;
                break;
        }
    });
    loadedCheerio('div.summary__content .code-block,script').remove();
    novel.summary = loadedCheerio('div.summary__content').text().trim();
    let html;
    if (true) {
        const novelId = loadedCheerio('.rating-post-id').attr('value') ||
            loadedCheerio('#manga-chapters-holder').attr('data-id') || '';
        const body = {
            action: "manga_get_chapters",
            manga: novelId,
        };
        html = yield (0, fetch_1.fetchApi)(baseUrl + 'wp-admin/admin-ajax.php', {
            method: 'POST',
            body: JSON.stringify(body),
        })
            .then(res => res.text());
    }
    else {
        html = yield (0, fetch_1.fetchApi)(baseUrl + 'ajax/chapters/', { method: 'POST' })
            .then(res => res.text());
    }
    if (html !== '0') {
        loadedCheerio = (0, cheerio_1.load)(html);
    }
    const chapters = [];
    loadedCheerio('.wp-manga-chapter').each(function () {
        const chapterName = loadedCheerio(this).find('a').text().trim();
        let releaseDate = null;
        releaseDate = loadedCheerio(this)
            .find('span.chapter-release-date')
            .text()
            .trim();
        if (releaseDate) {
            releaseDate = (0, parseMadaraDate_1.parseMadaraDate)(releaseDate);
        }
        else {
            /**
             * Insert current date
             */
            releaseDate = (0, dayjs_1.default)().format('LL');
        }
        let chapterUrl = loadedCheerio(this).find('a').attr('href') || '';
        chapters.push({ name: chapterName, releaseTime: releaseDate, url: chapterUrl });
    });
    novel.chapters = chapters.reverse();
    return novel;
});
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = (chapterUrl) => __awaiter(void 0, void 0, void 0, function* () {
    const url = baseUrl + "/" + "serie" + "/" + chapterUrl;
    const body = yield (0, fetch_1.fetchApi)(chapterUrl).then(res => res.text());
    const loadedCheerio = (0, cheerio_1.load)(body);
    const chapterText = loadedCheerio('.text-left').html() ||
        loadedCheerio('.text-right').html() ||
        loadedCheerio('.entry-content').html();
    return chapterText;
});
exports.parseChapter = parseChapter;
const searchNovels = (searchTerm) => __awaiter(void 0, void 0, void 0, function* () {
    const novels = [];
    const url = baseUrl + "?s=" + searchTerm + "&post_type=wp-manga";
    const body = yield (0, fetch_1.fetchApi)(url).then(res => res.text());
    const loadedCheerio = (0, cheerio_1.load)(body);
    loadedCheerio('.c-tabs-item__content').each(function () {
        const novelName = loadedCheerio(this).find('.post-title').text().trim();
        let image = loadedCheerio(this).find('img');
        const novelCover = image.attr('data-src') || image.attr('src');
        let novelUrl = loadedCheerio(this)
            .find('.post-title')
            .find('a')
            .attr('href') || '';
        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };
        novels.push(novel);
    });
    return novels;
});
exports.searchNovels = searchNovels;
const fetchImage = (url) => __awaiter(void 0, void 0, void 0, function* () {
    return yield (0, fetch_1.fetchFile)(url);
});
exports.fetchImage = fetchImage;
exports.filters = [{ "key": "sort", "label": "ترتيب حسب", "values": [{ "label": "A-Z", "value": "alphabet" }, { "label": "New", "value": "new-manga" }, { "label": "الأحدث", "value": "latest" }, { "label": "الأكثر مشاهدة", "value": "views" }, { "label": "التقييم", "value": "rating" }, { "label": "الرائج", "value": "trending" }], "inputType": filterInputs_1.FilterInputs.Picker }, { "key": "genres", "label": "التصنيفات", "values": [{ "label": "آلات", "value": "mechanisms" }, { "label": "أكشن", "value": "action" }, { "label": "إثارة", "value": "excitement" }, { "label": "إيسكاي", "value": "%d8%a5%d9%8a%d8%b3%d9%83%d8%a7%d9%8a" }, { "label": "الحياة اليومية", "value": "slice-of-life" }, { "label": "الحياة مدرسية", "value": "school-life" }, { "label": "تاريخي", "value": "historical" }, { "label": "تراجيدي", "value": "tragic" }, { "label": "جريمة", "value": "%d8%ac%d8%b1%d9%8a%d9%85%d8%a9" }, { "label": "جندر بندر", "value": "%d8%ac%d9%86%d8%af%d8%b1-%d8%a8%d9%86%d8%af%d8%b1" }, { "label": "جوسي", "value": "josei" }, { "label": "حريم", "value": "harem" }, { "label": "خارق للطبيعة", "value": "supernatural" }, { "label": "خيال", "value": "fantasy" }, { "label": "خيال علمي", "value": "sci-fi" }, { "label": "دراما", "value": "drama" }, { "label": "دموي", "value": "%d8%af%d9%85%d9%88%d9%8a" }, { "label": "راشد", "value": "mature" }, { "label": "رعب", "value": "horror" }, { "label": "رومانسي", "value": "romance" }, { "label": "رياضة", "value": "sports" }, { "label": "زمنكاني", "value": "my-time" }, { "label": "زومبي", "value": "%d8%b2%d9%88%d9%85%d8%a8%d9%8a" }, { "label": "سينين", "value": "seinen" }, { "label": "شريحة من الحياة", "value": "%d8%b4%d8%b1%d9%8a%d8%ad%d8%a9-%d9%85%d9%86-%d8%a7%d9%84%d8%ad%d9%8a%d8%a7%d8%a9" }, { "label": "شوجو", "value": "shoujo" }, { "label": "شونين", "value": "shounen" }, { "label": "طبي", "value": "%d8%b7%d8%a8%d9%8a" }, { "label": "غموض", "value": "ambiguity" }, { "label": "فنون قتالية", "value": "martial-arts" }, { "label": "قوة خارقة", "value": "superpower" }, { "label": "كوميدي", "value": "comedy" }, { "label": "مغامرات", "value": "adventure" }, { "label": "نفسي", "value": "psychological" }], "inputType": filterInputs_1.FilterInputs.Picker }];
