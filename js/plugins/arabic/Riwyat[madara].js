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
exports.id = "riwyat";
exports.name = "Riwyat [madara]";
exports.icon = "multisrc/madara/icons/riwyat.png";
exports.version = "1.0.0";
exports.site = "https://riwyat.com/";
const baseUrl = exports.site;
const popularNovels = (pageNo, { filters, showLatestNovels }) => __awaiter(void 0, void 0, void 0, function* () {
    const novels = [];
    let url = exports.site;
    if (filters === null || filters === void 0 ? void 0 : filters.genres) {
        url += "novel-genre/" + filters.genres + '/';
    }
    else {
        url += "novel/";
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
    const url = baseUrl + "/" + "novel" + "/" + chapterUrl;
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
exports.filters = [{ "key": "sort", "label": "Order by", "values": [{ "label": "Rating", "value": "rating" }, { "label": "A-Z", "value": "alphabet" }, { "label": "Latest", "value": "latest" }, { "label": "Most Views", "value": "views" }, { "label": "New", "value": "new-manga" }, { "label": "Trending", "value": "trending" }], "inputType": filterInputs_1.FilterInputs.Picker }, { "key": "genres", "label": "GENRES", "values": [{ "label": "أكشن", "value": "%d8%a3%d9%83%d8%b4%d9%86" }, { "label": "أيتشي", "value": "%d8%a3%d9%8a%d8%aa%d8%b4%d9%8a" }, { "label": "استراتجي", "value": "%d8%a7%d8%b3%d8%aa%d8%b1%d8%a7%d8%aa%d8%ac%d9%8a" }, { "label": "العصر الحديث", "value": "%d8%a7%d9%84%d8%b9%d8%b5%d8%b1-%d8%a7%d9%84%d8%ad%d8%af%d9%8a%d8%ab" }, { "label": "انتقام", "value": "%d8%a7%d9%86%d8%aa%d9%82%d8%a7%d9%85" }, { "label": "بالغ", "value": "%d8%a8%d8%a7%d9%84%d8%ba" }, { "label": "بناء مملكة", "value": "%d8%a8%d9%86%d8%a7%d8%a1-%d9%85%d9%85%d9%84%d9%83%d8%a9" }, { "label": "بوليسي", "value": "%d8%a8%d9%88%d9%84%d9%8a%d8%b3%d9%8a" }, { "label": "تاريخي", "value": "%d8%aa%d8%a7%d8%b1%d9%8a%d8%ae%d9%8a" }, { "label": "جوسي", "value": "%d8%ac%d9%88%d8%b3%d9%8a" }, { "label": "حريم", "value": "%d8%ad%d8%b1%d9%8a%d9%85" }, { "label": "حياة يومية", "value": "%d8%ad%d9%8a%d8%a7%d8%a9-%d9%8a%d9%88%d9%85%d9%8a%d8%a9" }, { "label": "خيال", "value": "%d8%ae%d9%8a%d8%a7%d9%84" }, { "label": "خيال علمي", "value": "%d8%ae%d9%8a%d8%a7%d9%84-%d8%b9%d9%84%d9%85%d9%8a" }, { "label": "دراما", "value": "%d8%af%d8%b1%d8%a7%d9%85%d8%a7" }, { "label": "رعب", "value": "%d8%b1%d8%b9%d8%a8" }, { "label": "رومانسية", "value": "%d8%b1%d9%88%d9%85%d8%a7%d9%86%d8%b3%d9%8a%d8%a9" }, { "label": "رياضي", "value": "%d8%b1%d9%8a%d8%a7%d8%b6%d9%8a" }, { "label": "زيانشيا", "value": "xianxia" }, { "label": "سنين", "value": "%d8%b3%d9%86%d9%8a%d9%86" }, { "label": "شريحة حياة", "value": "%d8%b4%d8%b1%d9%8a%d8%ad%d8%a9-%d8%ad%d9%8a%d8%a7%d8%a9" }, { "label": "شوانهوان", "value": "xuanhuan" }, { "label": "شوجو", "value": "%d8%b4%d9%88%d8%ac%d9%88" }, { "label": "شونين", "value": "%d8%b4%d9%88%d9%86%d9%8a%d9%86" }, { "label": "شيانشيا", "value": "%d8%b4%d9%8a%d8%a7%d9%86%d8%b4%d9%8a%d8%a7" }, { "label": "عسكري", "value": "%d8%b9%d8%b3%d9%83%d8%b1%d9%8a" }, { "label": "غموض", "value": "%d8%ba%d9%85%d9%88%d8%b6" }, { "label": "فانتازيا", "value": "%d9%81%d8%a7%d9%86%d8%aa%d8%a7%d8%b2%d9%8a%d8%a7" }, { "label": "فنون قتالية", "value": "%d9%81%d9%86%d9%88%d9%86-%d9%82%d8%aa%d8%a7%d9%84%d9%8a%d8%a9" }, { "label": "قوى خارقة", "value": "%d9%82%d9%88%d9%89-%d8%ae%d8%a7%d8%b1%d9%82%d8%a9" }, { "label": "كوميديا", "value": "%d9%83%d9%88%d9%85%d9%8a%d8%af%d9%8a%d8%a7" }, { "label": "كوميك", "value": "%d9%83%d9%88%d9%85%d9%8a%d9%83" }, { "label": "للكبار", "value": "%d9%84%d9%84%d9%83%d8%a8%d8%a7%d8%b1" }, { "label": "مأساة", "value": "%d9%85%d8%a3%d8%b3%d8%a7%d8%a9" }, { "label": "مانجا", "value": "%d9%85%d8%a7%d9%86%d8%ac%d8%a7" }, { "label": "مانها", "value": "%d9%85%d8%a7%d9%86%d9%87%d8%a7" }, { "label": "مانهوا", "value": "%d9%85%d8%a7%d9%86%d9%87%d9%88%d8%a7" }, { "label": "مدرسي", "value": "%d9%85%d8%af%d8%b1%d8%b3%d9%8a" }, { "label": "مصاصي دماء", "value": "%d9%85%d8%b5%d8%a7%d8%b5%d9%8a-%d8%af%d9%85%d8%a7%d8%a1" }, { "label": "مغامرة", "value": "%d9%85%d8%ba%d8%a7%d9%85%d8%b1%d8%a9" }, { "label": "مكتملة", "value": "%d9%85%d9%83%d8%aa%d9%85%d9%84%d8%a9" }, { "label": "نفسي", "value": "%d9%86%d9%81%d8%b3%d9%8a" }, { "label": "نهاية العالم", "value": "%d9%86%d9%87%d8%a7%d9%8a%d8%a9-%d8%a7%d9%84%d8%b9%d8%a7%d9%84%d9%85" }, { "label": "واب تون", "value": "%d9%88%d8%a7%d8%a8-%d8%aa%d9%88%d9%86" }, { "label": "وان شوت", "value": "%d9%88%d8%a7%d9%86-%d8%b4%d9%88%d8%aa" }], "inputType": filterInputs_1.FilterInputs.Picker }];
