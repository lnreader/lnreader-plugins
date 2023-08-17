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
exports.fetchImage = exports.searchNovels = exports.parseChapter = exports.parseNovelAndChapters = exports.popularNovels = exports.icon = exports.version = exports.site = exports.name = exports.id = void 0;
const cheerio_1 = require("cheerio");
const fetch_1 = require("@libs/fetch");
const dayjs_1 = __importDefault(require("dayjs"));
exports.id = "comrademao";
exports.name = "Comrade Mao";
exports.site = "https://comrademao.com/";
exports.version = "1.0.0";
exports.icon = "src/en/comrademao/icon.png";
const popularNovels = function (page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = exports.site + "page/" + page + "/?post_type=novel";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".listupd")
            .find("div.bs")
            .each(function () {
            const novelName = loadedCheerio(this).find(".tt").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl) {
                // TODO: Handle error
                console.error("No novel url!");
                return;
            }
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = novelUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novel = { url };
        novel.name = loadedCheerio(".entry-title").text().trim();
        novel.cover = loadedCheerio("div.thumbook > div > img").attr("src");
        novel.summary = loadedCheerio("div.infox > div:nth-child(6) > span > p")
            .text()
            .trim();
        novel.genres = loadedCheerio("div.infox > div:nth-child(4) > span")
            .text()
            .replace(/\s/g, "");
        novel.status = loadedCheerio("div.infox > div:nth-child(3) > span")
            .text()
            .trim();
        novel.author = loadedCheerio("div.infox > div:nth-child(2) > span")
            .text()
            .trim();
        let novelChapters = [];
        loadedCheerio("#chapterlist")
            .find("li")
            .each(function () {
            const releaseDate = (0, dayjs_1.default)(loadedCheerio(this).find(".chapterdate").text()).format("LL");
            const chapterName = loadedCheerio(this)
                .find(".chapternum")
                .text();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");
            if (!chapterUrl) {
                // TODO: Handle error
                console.error("No chapter url!");
                return;
            }
            novelChapters.push({
                name: chapterName,
                url: chapterUrl,
                releaseTime: releaseDate,
            });
        });
        novel.chapters = novelChapters.reverse();
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = chapterUrl;
        const result = yield (0, fetch_1.fetchApi)(url);
        if (!result.ok) {
            const err = yield result.text();
            console.error(err);
            // TODO: Cloudflare protection or other error
            return "Error!" + err;
        }
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let chapterText = loadedCheerio("#chaptercontent").html();
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = exports.site + "?s=" + searchTerm + "&post_type=novel";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.text();
        const loadedCheerio = (0, cheerio_1.load)(body);
        let novels = [];
        loadedCheerio(".listupd")
            .find("div.bs")
            .each(function () {
            const novelName = loadedCheerio(this).find(".tt").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl) {
                // TODO: Handle error
                console.error("No novel url!");
                return;
            }
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
            novels.push(novel);
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
const fetchImage = (...args) => (0, fetch_1.fetchFile)(...args);
exports.fetchImage = fetchImage;
exports.protected = false;
