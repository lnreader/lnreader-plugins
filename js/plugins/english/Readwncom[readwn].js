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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.version = exports.icon = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
// import dayjs from 'dayjs';
const fetch_1 = require("@libs/fetch");
// import { parseMadaraDate } from "@libs/parseMadaraDate";
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { showToast } from "@libs/showToast";
// import { Filter, FilterInputs } from "@libs/filterInputs";
// import { NovelStatus } from '@libs/novelStatus';
// import { defaultCover } from "@libs/defaultCover";
exports.id = "Readwn.com";
exports.name = "Readwn.com";
exports.icon = "multisrc/readwn/icon/readwn.png";
exports.version = "1.0.0";
exports.site = "https://www.readwn.com/";
// export const filters: Filter[] = [];
const baseUrl = exports.site;
const popularNovels = function (page, { filters, showLatestNovels }) {
    return __awaiter(this, void 0, void 0, function* () {
        const novels = [];
        const pageNo = page - 1;
        const url = baseUrl + 'list/all/all-onclick-' + pageNo + '.html';
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        loadedCheerio('li.novel-item').each(function () {
            const novelName = loadedCheerio(this).find('h4').text();
            const novelUrl = baseUrl + loadedCheerio(this).find('a').attr('href');
            const coverUri = loadedCheerio(this)
                .find('.novel-cover > img')
                .attr('data-src');
            const novelCover = baseUrl + coverUri;
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
        novel.cover = baseUrl + coverUri;
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
        const novelId = novelUrl.replace('.html', '').replace(baseUrl, '');
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
            const chapterUrl = baseUrl + ((_a = loadedCheerio(this).find('a').attr('href')) === null || _a === void 0 ? void 0 : _a.trim());
            const releaseDate = loadedCheerio(this)
                .find('a .chapter-update')
                .text()
                .trim();
            lastChapterNo = parseInt(loadedCheerio(this).find('a .chapter-no').text().trim());
            const chapter = { name: chapterName, releaseTime: releaseDate, url: chapterUrl };
            novelChapters.push(chapter);
        });
        // Itterate once more before loop to finish off
        lastChapterNo++;
        for (let i = lastChapterNo; i <= latestChapterNo; i++) {
            const chapterName = 'Chapter ' + i;
            const chapterUrl = baseUrl + novelId + '_' + i + '.html';
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
    const searchUrl = baseUrl + 'e/search/index.php';
    const result = yield (0, fetch_1.fetchApi)(searchUrl, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: baseUrl + 'search.html',
            Origin: baseUrl,
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
        const novelUrl = baseUrl + loadedCheerio(this).find('a').attr('href');
        const coverUri = baseUrl + loadedCheerio(this).find('img').attr('data-src');
        const novelCover = baseUrl + coverUri;
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
    return yield (0, fetch_1.fetchFile)(url, {});
});
exports.fetchImage = fetchImage;
