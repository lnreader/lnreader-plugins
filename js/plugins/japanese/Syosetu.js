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
const fetch_1 = require("@libs/fetch");
const defaultCover_1 = require("@libs/defaultCover");
// const novelStatus = require('@libs/novelStatus');
// const isUrlAbsolute = require('@libs/isAbsoluteUrl');
// const parseDate = require('@libs/parseDate');
const pluginId = "yomou.syosetu";
exports.id = pluginId;
exports.name = "Syosetu";
exports.icon = "src/jp/syosetu/icon.png";
exports.version = "1.0.0";
exports.site = "https//yomou.syosetu.com/";
exports.protected = false;
const searchUrl = (pagenum, order) => {
    return `https://yomou.syosetu.com/search.php?order=${order || "hyoka"}${pagenum !== undefined
        ? `&p=${pagenum <= 1 || pagenum > 100 ? "1" : pagenum}` // check if pagenum is between 1 and 100
        : "" // if isn't don't set ?p
    }`;
};
const popularNovels = function (pageNo) {
    return __awaiter(this, void 0, void 0, function* () {
        function getNovelsFromPage(pagenumber) {
            return __awaiter(this, void 0, void 0, function* () {
                // load page
                const result = yield (0, fetch_1.fetchApi)(searchUrl(pagenumber));
                const body = yield result.text();
                // Cheerio it!
                const cheerioQuery = (0, cheerio_1.load)(body, { decodeEntities: false });
                let pageNovels = [];
                // find class=searchkekka_box
                cheerioQuery(".searchkekka_box").each(function (i, e) {
                    // get div with link and name
                    const novelDIV = cheerioQuery(this).find(".novel_h");
                    // get link element
                    const novelA = novelDIV.children()[0];
                    // add new novel to array
                    pageNovels.push({
                        name: novelDIV.text(),
                        url: novelA.attribs.href,
                        cover: defaultCover_1.defaultCover,
                    });
                });
                // return all novels from this page
                return pageNovels;
            });
        }
        const novels = yield getNovelsFromPage(pageNo);
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        let chapters = [];
        const result = yield (0, fetch_1.fetchApi)(novelUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body, { decodeEntities: false });
        // create novel object
        let novel = {
            url: novelUrl,
            name: loadedCheerio(".novel_title").text(),
            author: loadedCheerio(".novel_writername")
                .text()
                .replace("作者：", ""),
            cover: defaultCover_1.defaultCover,
        };
        // Get all the chapters
        const cqGetChapters = loadedCheerio(".novel_sublist2");
        if (cqGetChapters.length !== 0) {
            // has more than 1 chapter
            novel.summary = loadedCheerio("#novel_ex")
                .text()
                .replace(/<\s*br.*?>/g, "\n");
            cqGetChapters.each(function (i, e) {
                const chapterA = loadedCheerio(this).find("a");
                const [chapterName, releaseDate, chapterUrl] = [
                    // set the variables
                    chapterA.text(),
                    loadedCheerio(this)
                        .find("dt") // get title
                        .text() // get text
                        .replace(/（.）/g, "") // remove "(edited)" mark
                        .trim(),
                    "https://ncode.syosetu.com" + chapterA.attr("href"),
                ];
                chapters.push({
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                });
            });
        }
        else {
            /**
             * Because there are oneshots on the site, they have to be treated with special care
             * that's what pisses me off in Shosetsu app. They have this extension,
             * but every oneshot is set as "there are no chapters" and all contents are thrown into the description!!
             */
            // get summary for oneshot chapter
            const nameResult = yield (0, fetch_1.fetchApi)(searchUrl() + `&word=${novel.name}`);
            const nameBody = yield nameResult.text();
            const summaryQuery = (0, cheerio_1.load)(nameBody, {
                decodeEntities: false,
            });
            const foundText = summaryQuery(".searchkekka_box")
                .first()
                .find(".ex")
                .text()
                .replace(/\s{2,}/g, "\n");
            novel.summary = foundText;
            // add single chapter
            chapters.push({
                name: "Oneshot",
                releaseTime: loadedCheerio("head")
                    .find("meta[name='WWWC']")
                    .attr("content"),
                url: novelUrl, // set chapterUrl to oneshot so that chapterScraper knows it's a one-shot,
            });
        }
        novel.chapters = chapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        // create cheerioQuery
        const cheerioQuery = (0, cheerio_1.load)(body, {
            decodeEntities: false,
        });
        let chapterText = cheerioQuery("#novel_honbun") // get chapter text
            .html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        let novels = [];
        // returns list of novels from given page
        function getNovelsFromPage(pagenumber) {
            return __awaiter(this, void 0, void 0, function* () {
                // load page
                const result = yield (0, fetch_1.fetchApi)(searchUrl(pagenumber) + `&word=${searchTerm}`);
                const body = yield result.text();
                // Cheerio it!
                const cheerioQuery = (0, cheerio_1.load)(body, { decodeEntities: false });
                let pageNovels = [];
                // find class=searchkekka_box
                cheerioQuery(".searchkekka_box").each(function (i, e) {
                    // get div with link and name
                    const novelDIV = cheerioQuery(this).find(".novel_h");
                    // get link element
                    const novelA = novelDIV.children()[0];
                    // add new novel to array
                    pageNovels.push({
                        name: novelDIV.text(),
                        url: novelA.attribs.href,
                        cover: defaultCover_1.defaultCover,
                    });
                });
                // return all novels from this page
                return pageNovels;
            });
        }
        // counter of loaded pages
        // let pagesLoaded = 0;
        // do {
        //     // always load first one
        //     novels.push(...(await getNovelsFromPage(pagesLoaded + 1)));
        //     pagesLoaded++;
        // } while (pagesLoaded < maxPageLoad && isNext); // check if we should load more
        novels = yield getNovelsFromPage(1);
        /** Use
         * novels.push(...(await getNovelsFromPage(pageNumber)))
         * if you want to load more
         */
        // respond with novels!
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = function (url) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, fetch_1.fetchFile)(url);
    });
};
exports.fetchImage = fetchImage;
