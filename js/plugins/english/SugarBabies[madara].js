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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.site = exports.version = exports.icon = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const defaultCover_1 = require("@libs/defaultCover");
const novelStatus_1 = require("@libs/novelStatus");
const parseMadaraDate_1 = require("@libs/parseMadaraDate");
const dayjs_1 = __importDefault(require("dayjs"));
exports.id = "sugarbbscan";
exports.name = "Sugar Babies [madara]";
exports.icon = "multisrc/madara/icons/sugarbabies.png";
exports.version = "1.0.0";
exports.site = "https://sugarbbscan.com/";
const baseUrl = exports.site;
const popularNovels = (pageNo, { showLatestNovels }) => __awaiter(void 0, void 0, void 0, function* () {
    const novels = [];
    const sortOrder = showLatestNovels
        ? '?m_orderby=latest'
        : '/?m_orderby=rating';
    let url = exports.site + "series" + '/page/' + pageNo + sortOrder;
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
    if (false) {
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
    const url = baseUrl + "/" + "series" + "/" + chapterUrl;
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
