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
exports.filters = exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.version = exports.icon = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
// import dayjs from 'dayjs';
const fetch_1 = require("@libs/fetch");
const parseMadaraDate_1 = require("@libs/parseMadaraDate");
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { showToast } from "@libs/showToast";
const filterInputs_1 = require("@libs/filterInputs");
// import { NovelStatus } from '@libs/novelStatus';
// import { defaultCover } from "@libs/defaultCover";
exports.id = "Readwn.com";
exports.name = "Readwn.com";
exports.icon = "multisrc/readwn/icons/readwn.png";
exports.version = "1.0.0";
exports.site = "https://www.readwn.com/";
const popularNovels = function (page, { filters, showLatestNovels }) {
    return __awaiter(this, void 0, void 0, function* () {
        const novels = [];
        const pageNo = page - 1;
        let url = exports.site + 'list/';
        url += ((filters === null || filters === void 0 ? void 0 : filters.genres) || 'all') + '/';
        url += ((filters === null || filters === void 0 ? void 0 : filters.status) || 'all') + '-';
        url += (showLatestNovels ? 'lastdotime' : (filters === null || filters === void 0 ? void 0 : filters.sort) || 'newstime') + '-';
        url += pageNo + '.html';
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio('li.novel-item').each(function () {
            const novelName = loadedCheerio(this).find('h4').text();
            const novelUrl = exports.site + loadedCheerio(this).find('a').attr('href');
            const coverUri = loadedCheerio(this)
                .find('.novel-cover > img')
                .attr('data-src');
            const novelCover = exports.site + coverUri;
            const novel = { name: novelName, cover: novelCover, url: novelUrl };
            novels.push(novel);
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(novelUrl);
        const body = yield result.text();
        let loadedCheerio = (0, cheerio_1.load)(body);
        const novel = {
            url: novelUrl,
            chapters: [],
        };
        novel.name = loadedCheerio('h1.novel-title').text();
        const coverUri = loadedCheerio('figure.cover > img').attr('data-src');
        novel.cover = exports.site + coverUri;
        novel.summary = loadedCheerio('.summary')
            .text()
            .replace('Summary', '')
            .trim();
        novel.genres = '';
        loadedCheerio('div.categories > ul > li').each(function () {
            novel.genres += loadedCheerio(this).text().trim() + ',';
        });
        loadedCheerio('div.header-stats > span').each(function () {
            if (loadedCheerio(this).find('small').text() === 'Status') {
                novel.status = loadedCheerio(this).find('strong').text();
            }
        });
        novel.genres = novel.genres.slice(0, -1);
        novel.author = loadedCheerio('span[itemprop=author]').text();
        let novelChapters = [];
        const novelId = novelUrl.replace('.html', '').replace(exports.site, '');
        const latestChapterNo = parseInt(loadedCheerio('.header-stats')
            .find('span > strong')
            .first()
            .text()
            .trim());
        let lastChapterNo = 1;
        loadedCheerio('.chapter-list li').each(function () {
            var _a;
            const chapterName = loadedCheerio(this)
                .find('a .chapter-title')
                .text()
                .trim();
            const chapterUrl = exports.site + ((_a = loadedCheerio(this).find('a').attr('href')) === null || _a === void 0 ? void 0 : _a.trim());
            const releaseDate = loadedCheerio(this)
                .find('a .chapter-update')
                .text()
                .trim();
            lastChapterNo = parseInt(loadedCheerio(this).find('a .chapter-no').text().trim());
            const chapter = { name: chapterName, releaseTime: (0, parseMadaraDate_1.parseMadaraDate)(releaseDate), url: chapterUrl };
            novelChapters.push(chapter);
        });
        // Itterate once more before loop to finish off
        lastChapterNo++;
        for (let i = lastChapterNo; i <= latestChapterNo; i++) {
            const chapterName = 'Chapter ' + i;
            const chapterUrl = exports.site + novelId + '_' + i + '.html';
            const releaseDate = null;
            const chapter = { name: chapterName, releaseTime: releaseDate, url: chapterUrl };
            novelChapters.push(chapter);
        }
        novel.chapters = novelChapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const chapterText = loadedCheerio('.chapter-content').html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = (searchTerm) => __awaiter(void 0, void 0, void 0, function* () {
    const novels = [];
    const searchUrl = exports.site + 'e/search/index.php';
    const result = yield (0, fetch_1.fetchApi)(searchUrl, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: exports.site + 'search.html',
            Origin: exports.site,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36',
        },
        method: 'POST',
        body: JSON.stringify({
            show: 'title',
            tempid: 1,
            tbname: 'news',
            keyboard: searchTerm,
        }),
    });
    const body = yield result.text();
    const loadedCheerio = (0, cheerio_1.load)(body);
    loadedCheerio('li.novel-item').each(function () {
        const novelName = loadedCheerio(this).find('h4').text();
        const novelUrl = exports.site + loadedCheerio(this).find('a').attr('href');
        const coverUri = exports.site + loadedCheerio(this).find('img').attr('data-src');
        const novelCover = exports.site + coverUri;
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
exports.fetchImage = fetch_1.fetchFile;
exports.filters = [{ "key": "sort", "label": "Sort By", "values": [{ "label": "New", "value": "newstime" }, { "label": "Popular", "value": "onclick" }, { "label": "Updates", "value": "lastdotime" }], "inputType": filterInputs_1.FilterInputs.Picker }, { "key": "status", "label": "Status", "values": [{ "label": "All", "value": "all" }, { "label": "Completed", "value": "Completed" }, { "label": "Ongoing", "value": "Ongoing" }], "inputType": filterInputs_1.FilterInputs.Picker }, { "key": "genres", "label": "Genre / Category", "values": [{ "label": "All", "value": "all" }, { "label": "Action", "value": "action" }, { "label": "Adventure", "value": "adventure" }, { "label": "Chinese", "value": "chinese" }, { "label": "Comedy", "value": "comedy" }, { "label": "Contemporary Romance", "value": "contemporary-romance" }, { "label": "Drama", "value": "drama" }, { "label": "Eastern Fantasy", "value": "eastern-fantasy" }, { "label": "Ecchi", "value": "ecchi" }, { "label": "Erciyuan", "value": "erciyuan" }, { "label": "Faloo", "value": "faloo" }, { "label": "Fan-Fiction", "value": "fan-fiction" }, { "label": "Fantasy", "value": "fantasy" }, { "label": "Fantasy Romance", "value": "fantasy-romance" }, { "label": "Game", "value": "game" }, { "label": "Gender Bender", "value": "gender-bender" }, { "label": "Harem", "value": "harem" }, { "label": "Hentai", "value": "hentai" }, { "label": "Historical", "value": "historical" }, { "label": "Horror", "value": "horror" }, { "label": "Isekai", "value": "isekai" }, { "label": "Japanese", "value": "japanese" }, { "label": "Josei", "value": "josei" }, { "label": "Korean", "value": "korean" }, { "label": "Lolicon", "value": "lolicon" }, { "label": "Magic", "value": "magic" }, { "label": "Magical Realism", "value": "magical-realism" }, { "label": "Martial Arts", "value": "martial-arts" }, { "label": "Mecha", "value": "mecha" }, { "label": "Military", "value": "military" }, { "label": "Mystery", "value": "mystery" }, { "label": "Official Circles", "value": "official_circles" }, { "label": "Psychological", "value": "psychological" }, { "label": "Romance", "value": "romance" }, { "label": "School Life", "value": "school-life" }, { "label": "Sci-fi", "value": "sci-fi" }, { "label": "Science Fiction", "value": "science_fiction" }, { "label": "Seinen", "value": "seinen" }, { "label": "Shoujo", "value": "shoujo" }, { "label": "Shoujo Ai", "value": "shoujo-ai" }, { "label": "Shounen", "value": "shounen" }, { "label": "Shounen Ai", "value": "shounen-ai" }, { "label": "Slice of Life", "value": "slice-of-life" }, { "label": "Sports", "value": "sports" }, { "label": "Supernatural", "value": "supernatural" }, { "label": "Suspense Thriller", "value": "suspense_thriller" }, { "label": "Tragedy", "value": "tragedy" }, { "label": "Travel Through Time", "value": "travel_through_time" }, { "label": "Two-dimensional", "value": "two-dimensional" }, { "label": "Urban", "value": "urban" }, { "label": "Urban Life", "value": "urban-life" }, { "label": "Video Games", "value": "video-games" }, { "label": "Virtual Reality", "value": "virtual-reality" }, { "label": "Wuxia", "value": "wuxia" }, { "label": "Wuxia Xianxia", "value": "wuxia_xianxia" }, { "label": "Xianxia", "value": "xianxia" }, { "label": "Xuanhuan", "value": "xuanhuan" }, { "label": "Yaoi", "value": "yaoi" }, { "label": "Yuri", "value": "yuri" }], "inputType": filterInputs_1.FilterInputs.Picker }];
