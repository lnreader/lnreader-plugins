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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fetch_1 = require("@libs/fetch");
var novelStatus_1 = require("@libs/novelStatus");
var dayjs_1 = __importDefault(require("dayjs"));
var Smakolykytl = /** @class */ (function () {
    function Smakolykytl() {
        this.id = "smakolykytl";
        this.name = "Смаколики";
        this.site = "https://smakolykytl.site/";
        this.version = "1.0.0";
        this.icon = "src/ua/smakolykytl/icon.png";
        this.userAgent = "";
        this.cookieString = "";
        this.fetchImage = fetch_1.fetchFile;
    }
    Smakolykytl.prototype.popularNovels = function (pageNo, _a) {
        var _b;
        var showLatestNovels = _a.showLatestNovels, filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            var url, result, json, novels;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        url = showLatestNovels
                            ? "https://api.smakolykytl.site/api/user/updates"
                            : "https://api.smakolykytl.site/api/user/projects";
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url)];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_c.sent());
                        novels = [];
                        (_b = ((json === null || json === void 0 ? void 0 : json.projects) || (json === null || json === void 0 ? void 0 : json.updates))) === null || _b === void 0 ? void 0 : _b.forEach(function (novel) {
                            return novels.push({
                                name: novel.title,
                                cover: novel.image.url,
                                url: _this.site + "titles/" + novel.id,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    Smakolykytl.prototype.parseNovelAndChapters = function (novelUrl) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __awaiter(this, void 0, void 0, function () {
            var id, result, book, novel, tags, chapters, res, data;
            var _this = this;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        id = novelUrl.split("/").pop();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/projects/" + id)];
                    case 1:
                        result = _k.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        book = (_k.sent());
                        novel = {
                            url: novelUrl,
                            name: (_a = book === null || book === void 0 ? void 0 : book.project) === null || _a === void 0 ? void 0 : _a.title,
                            cover: (_c = (_b = book === null || book === void 0 ? void 0 : book.project) === null || _b === void 0 ? void 0 : _b.image) === null || _c === void 0 ? void 0 : _c.url,
                            summary: (_d = book === null || book === void 0 ? void 0 : book.project) === null || _d === void 0 ? void 0 : _d.description,
                            author: (_e = book === null || book === void 0 ? void 0 : book.project) === null || _e === void 0 ? void 0 : _e.author,
                            status: ((_f = book === null || book === void 0 ? void 0 : book.project) === null || _f === void 0 ? void 0 : _f.status_translate.includes("Триває"))
                                ? novelStatus_1.NovelStatus.Ongoing
                                : novelStatus_1.NovelStatus.Completed,
                        };
                        tags = [(_g = book === null || book === void 0 ? void 0 : book.project) === null || _g === void 0 ? void 0 : _g.genres, (_h = book === null || book === void 0 ? void 0 : book.project) === null || _h === void 0 ? void 0 : _h.tags]
                            .flat()
                            .map(function (tags) { return tags === null || tags === void 0 ? void 0 : tags.title; })
                            .filter(function (tags) { return tags; });
                        if (tags.length) {
                            novel.genres = tags.join(", ");
                        }
                        chapters = [];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/projects/" + id + "/books")];
                    case 3:
                        res = _k.sent();
                        return [4 /*yield*/, res.json()];
                    case 4:
                        data = (_k.sent());
                        (_j = data === null || data === void 0 ? void 0 : data.books) === null || _j === void 0 ? void 0 : _j.forEach(function (volume) {
                            var _a;
                            return (_a = volume === null || volume === void 0 ? void 0 : volume.chapters) === null || _a === void 0 ? void 0 : _a.map(function (chapter) {
                                return chapters.push({
                                    name: volume.title + " " + chapter.title,
                                    releaseTime: (0, dayjs_1.default)(chapter.modifiedAt).format("LLL"),
                                    url: _this.site + "read/" + chapter.id,
                                });
                            });
                        });
                        novel.chapters = chapters;
                        return [2 /*return*/, novel];
                }
            });
        });
    };
    Smakolykytl.prototype.parseChapter = function (chapterUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var id, result, json, chapterRaw, chapterText;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        id = chapterUrl.split("/").pop();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/chapters/" + id)];
                    case 1:
                        result = _b.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_b.sent());
                        chapterRaw = JSON.parse(((_a = json === null || json === void 0 ? void 0 : json.chapter) === null || _a === void 0 ? void 0 : _a.content) || "[]");
                        chapterText = jsonToHtml(chapterRaw);
                        return [2 /*return*/, chapterText];
                }
            });
        });
    };
    Smakolykytl.prototype.searchNovels = function (searchTerm) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            var result, json, novels;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)("https://api.smakolykytl.site/api/user/projects")];
                    case 1:
                        result = _c.sent();
                        return [4 /*yield*/, result.json()];
                    case 2:
                        json = (_c.sent());
                        novels = [];
                        (_b = (_a = json === null || json === void 0 ? void 0 : json.projects) === null || _a === void 0 ? void 0 : _a.filter(function (novel) {
                            return novel.title.includes(searchTerm) || String(novel.id) === searchTerm;
                        })) === null || _b === void 0 ? void 0 : _b.forEach(function (novel) {
                            return novels.push({
                                name: novel.title,
                                cover: novel.image.url,
                                url: _this.site + "titles/" + novel.id,
                            });
                        });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    return Smakolykytl;
}());
exports.default = new Smakolykytl();
function jsonToHtml(json, html) {
    if (html === void 0) { html = ""; }
    json.forEach(function (element) {
        switch (element.type) {
            case "hardBreak":
                html += "<br>";
                break;
            case "horizontalRule":
                html += "<hr>";
                break;
            case "image":
                if (element.attrs) {
                    var attrs = Object.entries(element.attrs)
                        .filter(function (attr) { return attr === null || attr === void 0 ? void 0 : attr[1]; })
                        .map(function (attr) { return "".concat(attr[0], "=\"").concat(attr[1], "\""); });
                    html += "<img " + attrs.join("; ") + ">";
                }
                break;
            case "paragraph":
                html +=
                    "<p>" +
                        (element.content ? jsonToHtml(element.content) : "<br>") +
                        "</p>";
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
