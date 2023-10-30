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
const fetch_1 = require("@libs/fetch");
exports.id = "skynovels.net";
exports.name = "SkyNovels";
exports.site = "https://www.skynovels.net/";
exports.version = "1.0.0";
exports.icon = "src/es/skynovels/icon.png";
const baseUrl = exports.site;
const popularNovels = function (page) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const url = "https://api.skynovels.net/api/novels?&q";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.json();
        const novels = [];
        (_a = body.novels) === null || _a === void 0 ? void 0 : _a.forEach((res) => {
            const novelName = res.nvl_title;
            const novelCover = "https://api.skynovels.net/api/get-image/" +
                res.image +
                "/novels/false";
            const novelUrl = baseUrl + "novelas/" + res.id + "/" + res.nvl_name + "/";
            const novel = { name: novelName, url: novelUrl, cover: novelCover };
            novels.push(novel);
        });
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novUrl) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const novelId = novUrl.split("/")[4];
        const url = "https://api.skynovels.net/api/novel/" + novelId + "/reading?&q";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.json();
        const item = (_a = body === null || body === void 0 ? void 0 : body.novel) === null || _a === void 0 ? void 0 : _a[0];
        let novel = { url: novUrl };
        novel.name = item === null || item === void 0 ? void 0 : item.nvl_title;
        novel.cover =
            "https://api.skynovels.net/api/get-image/" +
                (item === null || item === void 0 ? void 0 : item.image) +
                "/novels/false";
        let genres = [];
        (_b = item === null || item === void 0 ? void 0 : item.genres) === null || _b === void 0 ? void 0 : _b.forEach((genre) => genres.push(genre.genre_name));
        novel.genres = genres.join(",");
        novel.author = item === null || item === void 0 ? void 0 : item.nvl_writer;
        novel.summary = item === null || item === void 0 ? void 0 : item.nvl_content;
        novel.status = item === null || item === void 0 ? void 0 : item.nvl_status;
        let novelChapters = [];
        (_c = item === null || item === void 0 ? void 0 : item.volumes) === null || _c === void 0 ? void 0 : _c.forEach((volume) => {
            var _a;
            (_a = volume === null || volume === void 0 ? void 0 : volume.chapters) === null || _a === void 0 ? void 0 : _a.forEach((chapter) => {
                const chapterName = chapter.chp_index_title;
                const releaseDate = new Date(chapter.createdAt).toDateString();
                const chapterUrl = novUrl + chapter.id + "/" + chapter.chp_name;
                const chap = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };
                novelChapters.push(chap);
            });
        });
        novel.chapters = novelChapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let chapterId = chapUrl.split("/")[6];
        const url = `https://api.skynovels.net/api/novel-chapter/${chapterId}`;
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.json();
        const item = (_a = body === null || body === void 0 ? void 0 : body.chapter) === null || _a === void 0 ? void 0 : _a[0];
        let chapterText = (item === null || item === void 0 ? void 0 : item.chp_content) || '404';
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        searchTerm = searchTerm.toLowerCase();
        const url = "https://api.skynovels.net/api/novels?&q";
        const result = yield (0, fetch_1.fetchApi)(url);
        const body = yield result.json();
        ;
        let results = (_a = body === null || body === void 0 ? void 0 : body.novels) === null || _a === void 0 ? void 0 : _a.filter((novel) => novel.nvl_title.toLowerCase().includes(searchTerm));
        const novels = [];
        results === null || results === void 0 ? void 0 : results.forEach((res) => {
            const novelName = res.nvl_title;
            const novelCover = "https://api.skynovels.net/api/get-image/" +
                res.image +
                "/novels/false";
            const novelUrl = baseUrl + "novelas/" + res.id + "/" + res.nvl_name + "/";
            const novel = { name: novelName, url: novelUrl, cover: novelCover };
            novels.push(novel);
        });
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
