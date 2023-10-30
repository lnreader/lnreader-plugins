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
const fetch_1 = require("@libs/fetch");
const novelStatus_1 = require("@libs/novelStatus");
const dayjs_1 = __importDefault(require("dayjs"));
exports.id = "smakolykytl";
exports.name = "Смаколики";
exports.site = "https://smakolykytl.site/";
exports.version = "1.0.0";
exports.icon = "src/ua/smakolykytl/icon.png";
const popularNovels = function (page, { showLatestNovels }) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const url = showLatestNovels
            ? "https://api.smakolykytl.site/api/user/updates"
            : "https://api.smakolykytl.site/api/user/projects";
        const result = yield (0, fetch_1.fetchApi)(url);
        const json = (yield result.json());
        let novels = [];
        (_a = ((json === null || json === void 0 ? void 0 : json.projects) || (json === null || json === void 0 ? void 0 : json.updates))) === null || _a === void 0 ? void 0 : _a.forEach((novel) => novels.push({
            name: novel.title,
            cover: novel.image.url,
            url: exports.site + "titles/" + novel.id,
        }));
        return novels;
    });
};
exports.popularNovels = popularNovels;
const parseNovelAndChapters = function (novelUrl) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    return __awaiter(this, void 0, void 0, function* () {
        const id = novelUrl.split("/").pop();
        const result = yield (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/projects/" + id);
        const book = (yield result.json());
        let novel = {
            url: novelUrl,
            name: (_a = book === null || book === void 0 ? void 0 : book.project) === null || _a === void 0 ? void 0 : _a.title,
            cover: (_c = (_b = book === null || book === void 0 ? void 0 : book.project) === null || _b === void 0 ? void 0 : _b.image) === null || _c === void 0 ? void 0 : _c.url,
            summary: (_d = book === null || book === void 0 ? void 0 : book.project) === null || _d === void 0 ? void 0 : _d.description,
            author: (_e = book === null || book === void 0 ? void 0 : book.project) === null || _e === void 0 ? void 0 : _e.author,
            status: ((_f = book === null || book === void 0 ? void 0 : book.project) === null || _f === void 0 ? void 0 : _f.status_translate.includes("Триває"))
                ? novelStatus_1.NovelStatus.Ongoing
                : novelStatus_1.NovelStatus.Completed,
        };
        let tags = [(_g = book === null || book === void 0 ? void 0 : book.project) === null || _g === void 0 ? void 0 : _g.genres, (_h = book === null || book === void 0 ? void 0 : book.project) === null || _h === void 0 ? void 0 : _h.tags]
            .flat()
            .map((tags) => tags === null || tags === void 0 ? void 0 : tags.title)
            .filter((tags) => tags);
        if (tags.length > 0) {
            novel.genres = tags.join(", ");
        }
        let chapters = [];
        const res = yield (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/projects/" + id + "/books");
        const data = (yield res.json());
        (_j = data === null || data === void 0 ? void 0 : data.books) === null || _j === void 0 ? void 0 : _j.forEach((volume) => {
            var _a;
            return (_a = volume === null || volume === void 0 ? void 0 : volume.chapters) === null || _a === void 0 ? void 0 : _a.map((chapter) => chapters.push({
                name: volume.title + " " + chapter.title,
                releaseTime: (0, dayjs_1.default)(chapter.modifiedAt).format("LLL"),
                url: exports.site + "read/" + chapter.id,
            }));
        });
        novel.chapters = chapters;
        return novel;
    });
};
exports.parseNovelAndChapters = parseNovelAndChapters;
const parseChapter = function (chapterUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const id = chapterUrl.split("/").pop();
        const result = yield (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/chapters/" + id);
        const json = (yield result.json());
        const chapterRaw = JSON.parse(((_a = json === null || json === void 0 ? void 0 : json.chapter) === null || _a === void 0 ? void 0 : _a.content) || "{}");
        const chapterText = jsonToHtml(chapterRaw);
        return chapterText;
    });
};
exports.parseChapter = parseChapter;
const searchNovels = function (searchTerm) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/projects");
        const json = (yield result.json());
        let novels = [];
        (_b = (_a = json === null || json === void 0 ? void 0 : json.projects) === null || _a === void 0 ? void 0 : _a.filter((novel) => novel.title.includes(searchTerm) || String(novel.id) === searchTerm)) === null || _b === void 0 ? void 0 : _b.forEach((novel) => novels.push({
            name: novel.title,
            cover: novel.image.url,
            url: exports.site + "titles/" + novel.id,
        }));
        return novels;
    });
};
exports.searchNovels = searchNovels;
exports.fetchImage = fetch_1.fetchFile;
function jsonToHtml(json, html = "") {
    json.forEach((element) => {
        switch (element.type) {
            case "hardBreak":
                html += "<br>";
                break;
            case "horizontalRule":
                html += "<hr>";
                break;
            case "image":
                if (element.attrs) {
                    const attrs = Object.entries(element.attrs)
                        .filter((attr) => attr === null || attr === void 0 ? void 0 : attr[1])
                        .map((attr) => `${attr[0]}="${attr[1]}"`);
                    html += "<img " + attrs.join("; ") + ">";
                }
                break;
            case "paragraph":
                html +=
                    "<p>" + (element.content ? jsonToHtml(element.content) : "<br>") + "</p>";
                break;
            case "text":
                html += element.text;
                break;
            default:
                html += JSON.stringify(element, null, "\t"); //maybe I missed something.
                break;
        }
    });
    return html;
}
