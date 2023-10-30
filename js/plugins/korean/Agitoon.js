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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.icon = exports.version = exports.site = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
exports.id = "agit.xyz";
exports.name = "Agitoon";
exports.site = "https://agit501.xyz/";
exports.version = "1.0.0";
exports.icon = "src/kr/agitoon/agit.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const list_limit = 20 * (page - 1);
        const day = new Date().getDay();
        const res = yield (0, fetch_1.fetchApi)(baseUrl + "novel/index.update.php", {
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: `mode=get_data_novel_list_p&novel_menu=3&np_day=${day}&np_rank=1&np_distributor=0&np_genre=00&np_order=1&np_genre_ex_1=00&np_genre_ex_2=00&list_limit=${list_limit}&is_query_first=true`,
            method: "POST",
        });
        const resJson = yield res.json();
        const novels = [];
        (_a = resJson === null || resJson === void 0 ? void 0 : resJson.list) === null || _a === void 0 ? void 0 : _a.forEach((novel) => {
            novels.push({
                url: baseUrl + "novel/list/" + novel.wr_id,
                name: novel.wr_subject,
                cover: baseUrl + novel.np_dir + "/thumbnail/" + novel.np_thumbnail,
            });
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const novelId = novelUrl.split("/").reverse()[0];
        // cheerio
        const result = yield (0, fetch_1.fetchApi)(novelUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body, { decodeEntities: false });
        const name = loadedCheerio("h5.pt-2").text();
        const summary = loadedCheerio(".pt-1.mt-1.pb-1.mb-1").text();
        const author = loadedCheerio(".post-item-list-cate-v")
            .first()
            .text()
            .split(" : ")
            .reverse()[0];
        const cover = baseUrl.slice(0, baseUrl.length - 1) +
            loadedCheerio("div.col-5.pr-0.pl-0 img").attr("src");
        const genresTag = loadedCheerio(".col-7 > .post-item-list-cate > span");
        let genres = "";
        genresTag.each((_, element) => {
            genres += loadedCheerio(element).text();
            genres += ", ";
        });
        genres = genres.slice(0, genres.length - 2);
        // normal REST HTTP requests
        let chapters = [];
        const res = yield (0, fetch_1.fetchApi)(baseUrl + "novel/list.update.php", {
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: `mode=get_data_novel_list_c&wr_id_p=${novelId}&page_no=1&cnt_list=10000&order_type=Asc`,
            method: "POST",
        });
        const resJson = yield res.json();
        (_a = resJson === null || resJson === void 0 ? void 0 : resJson.list) === null || _a === void 0 ? void 0 : _a.forEach((chapter) => {
            chapters.push({
                name: chapter.wr_subject,
                url: baseUrl + `novel/view/${chapter.wr_id}/2`,
                releaseTime: chapter.wr_datetime,
            });
        });
        const novel = {
            url: novelUrl,
            name,
            cover,
            summary,
            author,
            status: "",
            genres: genres,
            chapters,
        };
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)(chapterUrl);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        const contentTag = loadedCheerio("#id_wr_content > p");
        let content = "";
        contentTag.each((_, element) => {
            content += loadedCheerio(element).text();
            content += "<br />";
        });
        // gets rid of the popup thingy
        content = content.replace("팝업메뉴는 빈공간을 더치하거나 스크룰시 사라집니다", "");
        return content;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const rawResults = yield (0, fetch_1.fetchApi)("https://agit501.xyz/novel/search.php", {
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: `mode=get_data_novel_list_p_sch&search_novel=${searchTerm}&list_limit=0`,
            method: "POST",
        });
        const resJson = yield rawResults.json();
        const novels = [];
        (_a = resJson === null || resJson === void 0 ? void 0 : resJson.list) === null || _a === void 0 ? void 0 : _a.forEach((novel) => {
            novels.push({
                url: baseUrl + "novel/list/" + novel.wr_id,
                name: novel.wr_subject,
                cover: baseUrl + novel.np_dir + "/thumbnail/" + novel.np_thumbnail,
            });
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
