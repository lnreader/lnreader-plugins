"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
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
Object.defineProperty(exports, "__esModule", { value: true });
require('module-alias/register');
var fs = __importStar(require("fs"));
var cheerio = __importStar(require("cheerio"));
var path = __importStar(require("path"));
var filterInputs_1 = require("@libs/filterInputs");
var type = ['genres', 'status', 'sort'];
function getFilters(name, url) {
    return __awaiter(this, void 0, void 0, function () {
        var html, $, filters, response, loadedCheerio, allPage, _loop_1, i;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, fetch(url + '/list/all/all-newstime-0.html').then(function (res) {
                        return res.text();
                    })];
                case 1:
                    html = _c.sent();
                    $ = cheerio.load(html);
                    filters = {
                        'sort': {
                            type: filterInputs_1.FilterTypes.Picker,
                            label: 'Sort By',
                            value: 'onclick',
                            options: [],
                        },
                        'status': {
                            type: filterInputs_1.FilterTypes.Picker,
                            label: 'Status',
                            value: 'all',
                            options: [],
                        },
                        'genres': {
                            type: filterInputs_1.FilterTypes.Picker,
                            label: 'Genre / Category',
                            value: '',
                            options: [],
                        },
                        'tags': {
                            type: filterInputs_1.FilterTypes.Picker,
                            label: 'Tags',
                            value: '',
                            options: [{ label: 'NONE', value: '' }],
                        },
                    };
                    (_b = (_a = $('ul.proplist')) === null || _a === void 0 ? void 0 : _a.each) === null || _b === void 0 ? void 0 : _b.call(_a, function (index, ulElement) {
                        if (!type[index])
                            return;
                        $(ulElement)
                            .find('li > a')
                            .each(function (indx, liElement) {
                            return filters[type[index]].options.push({
                                label: $(liElement).text(),
                                value: $(liElement).attr('href'),
                            });
                        });
                        filters[type[index]].options = filters[type[index]].options.map(function (item) {
                            var res = item.value;
                            if (index == 0)
                                res = item.value.split('/')[2];
                            if (index == 1)
                                res = item.value.replace(/\/list\/all\/(.*?)-.*$/, '$1');
                            if (index == 2)
                                res = item.value.replace(/.*\/all-(.*?)-.*/, '$1');
                            return {
                                label: item.label,
                                value: res,
                            };
                        });
                        filters[type[index]].options.sort(function (a, b) {
                            if (a.label === 'All') {
                                return -1;
                            }
                            else if (b.label === 'All') {
                                return 1;
                            }
                            return a.label.localeCompare(b.label);
                        });
                    });
                    return [4 /*yield*/, fetch(url + '/browsetags/').then(function (res) { return res.text(); })];
                case 2:
                    response = _c.sent();
                    loadedCheerio = cheerio.load(response);
                    allPage = loadedCheerio('.tag-letters > a')
                        .map(function (index, element) { return loadedCheerio(element).attr('href'); })
                        .get();
                    _loop_1 = function (i) {
                        var resTags, $_1, nextPage, allpage, _loop_2, pageNo;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    console.log('fetch', url + allPage[i]);
                                    return [4 /*yield*/, fetch(url + allPage[i]).then(function (res) { return res.text(); })];
                                case 1:
                                    resTags = _d.sent();
                                    $_1 = cheerio.load(resTags);
                                    $_1('.tag-items > li > a').each(function (index, element) {
                                        var _a, _b, _c, _d;
                                        return filters['tags'].options.push({
                                            label: (_a = $_1(element).text()) === null || _a === void 0 ? void 0 : _a.trim(),
                                            value: (_d = (_c = (_b = $_1(element)
                                                .attr('href')) === null || _b === void 0 ? void 0 : _b.split('/')) === null || _c === void 0 ? void 0 : _c.pop()) === null || _d === void 0 ? void 0 : _d.replace('-0.html', ''),
                                        });
                                    });
                                    nextPage = $_1('.pagination > li:last-child > a').attr('href');
                                    if (!nextPage) return [3 /*break*/, 5];
                                    allpage = parseInt(nextPage.replace(/[^0-9]/g, '') || '0', 10);
                                    _loop_2 = function (pageNo) {
                                        var resTags_1, $_2;
                                        return __generator(this, function (_e) {
                                            switch (_e.label) {
                                                case 0: return [4 /*yield*/, sleep(3000)];
                                                case 1:
                                                    _e.sent();
                                                    console.log('fetch', url + allPage[i].replace('-0.html', "-".concat(pageNo + 1, ".html")));
                                                    return [4 /*yield*/, fetch(url + allPage[i].replace('-0.html', "-".concat(pageNo + 1, ".html"))).then(function (res) { return res.text(); })];
                                                case 2:
                                                    resTags_1 = _e.sent();
                                                    $_2 = cheerio.load(resTags_1);
                                                    $_2('.tag-items > li > a').each(function (index, element) {
                                                        var _a, _b, _c, _d, _e;
                                                        return filters['tags'].options.push({
                                                            label: (_a = $_2(element).text()) === null || _a === void 0 ? void 0 : _a.trim(),
                                                            value: (_e = (_d = (_c = (_b = $_2(element).attr('href')) === null || _b === void 0 ? void 0 : _b.split('/')) === null || _c === void 0 ? void 0 : _c.pop()) === null || _d === void 0 ? void 0 : _d.split('-')) === null || _e === void 0 ? void 0 : _e[0],
                                                        });
                                                    });
                                                    return [2 /*return*/];
                                            }
                                        });
                                    };
                                    pageNo = 0;
                                    _d.label = 2;
                                case 2:
                                    if (!(pageNo < allpage)) return [3 /*break*/, 5];
                                    return [5 /*yield**/, _loop_2(pageNo)];
                                case 3:
                                    _d.sent();
                                    _d.label = 4;
                                case 4:
                                    pageNo++;
                                    return [3 /*break*/, 2];
                                case 5: return [4 /*yield*/, sleep(3000)];
                                case 6:
                                    _d.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _c.label = 3;
                case 3:
                    if (!(i < allPage.length)) return [3 /*break*/, 6];
                    return [5 /*yield**/, _loop_1(i)];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6:
                    fs.writeFileSync(path.join(__dirname, 'filters', name + '.json'), JSON.stringify({ filters: filters }, null, 2));
                    console.log("\u2705Filters created successfully for ".concat(name, "\u2705"));
                    return [2 /*return*/];
            }
        });
    });
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
function askGetFilter() {
    return __awaiter(this, void 0, void 0, function () {
        var readline, EREASE_PREV_LINE;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    readline = require('readline').createInterface({
                        input: process.stdin,
                        output: process.stdout,
                    });
                    EREASE_PREV_LINE = '\x1b[1A\r\x1b[2K';
                    return [4 /*yield*/, readline.question('Enter the id of the site (same one as in sources.json): ', function (name) { return __awaiter(_this, void 0, void 0, function () {
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, readline.question(EREASE_PREV_LINE + 'Enter the URL (same one as in sources.json): ', function (url) { return __awaiter(_this, void 0, void 0, function () {
                                            var e_1;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0:
                                                        _a.trys.push([0, 2, , 3]);
                                                        return [4 /*yield*/, getFilters(name, url)];
                                                    case 1:
                                                        _a.sent();
                                                        return [3 /*break*/, 3];
                                                    case 2:
                                                        e_1 = _a.sent();
                                                        console.error('Error while getting filters from', url);
                                                        console.log(e_1.message || e_1);
                                                        return [3 /*break*/, 3];
                                                    case 3:
                                                        readline.close();
                                                        return [2 /*return*/];
                                                }
                                            });
                                        }); })];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
askGetFilter();
