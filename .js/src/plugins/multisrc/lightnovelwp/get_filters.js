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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFiltersFromURL = getFiltersFromURL;
var fs = __importStar(require("fs"));
var cheerio = __importStar(require("cheerio"));
var path = __importStar(require("path"));
var readline = __importStar(require("readline"));
var process_1 = __importDefault(require("process"));
var url_1 = require("url");
var path_1 = require("path");
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = (0, path_1.dirname)(__filename);
function getFilters(name, html) {
    var $ = cheerio.load(html);
    var filters = {
        filters: {
            'genre[]': {
                type: 'Checkbox',
                label: 'Genre',
                value: [],
                options: [],
            },
            'type[]': {
                type: 'Checkbox',
                label: 'Type',
                value: [],
                options: [],
            },
            'status': {
                type: 'Picker',
                label: 'Status',
                value: '',
                options: [],
            },
            'order': {
                type: 'Picker',
                label: 'Order',
                value: '',
                options: [],
            },
        },
    };
    var filtersContainer = $('div.quickfilter').find('ul');
    filtersContainer.each(function (i, el) {
        var filterName = Object.keys(filters.filters)[i];
        if (filterName) {
            filters.filters[filterName].label = $(el)
                .prev()
                .contents()
                .first()
                .text()
                .trim();
            $(el)
                .find('li')
                .each(function (j, li) {
                filters.filters[filterName].options.push({
                    label: $(li).text().trim(),
                    value: decodeURI($(li).find('input').attr('value') || ''),
                });
            });
        }
    });
    if (filters.filters['genre[]'].options.length == 0 ||
        filters.filters['type[]'].options.length == 0 ||
        filters.filters['status'].options.length == 0 ||
        filters.filters['order'].options.length == 0) {
        console.error("\uD83D\uDEA8Error in filters for ".concat(name, " please fix manually (").concat(path.join(__dirname, 'filters', name + '.json'), ")\uD83D\uDEA8"));
    }
    fs.writeFileSync(path.join(__dirname, 'filters', name + '.json'), JSON.stringify(filters, null, 2));
    console.log("\u2705Filters created successfully for ".concat(name, "\u2705"));
}
function getFiltersFromURL(name, url) {
    return __awaiter(this, void 0, void 0, function () {
        var response, html;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url + '/series/')];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("HTTP error! status: ".concat(response.status, ", while fetching ").concat(response.url));
                    }
                    return [4 /*yield*/, response.text()];
                case 2:
                    html = _a.sent();
                    try {
                        getFilters(name, html);
                    }
                    catch (e) {
                        console.error('Error while getting filters from', url);
                        console.error('(' + e + ')');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function askGetFilter() {
    return __awaiter(this, void 0, void 0, function () {
        var rl, EREASE_PREV_LINE;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    rl = readline.createInterface({
                        input: process_1.default.stdin,
                        output: process_1.default.stdout,
                    });
                    EREASE_PREV_LINE = '\x1b[1A\r\x1b[2K';
                    return [4 /*yield*/, rl.question('Enter the id of the site (same one as in sources.json): ', function (name) { return __awaiter(_this, void 0, void 0, function () {
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, rl.question(EREASE_PREV_LINE +
                                            "Do you want to get the filters from a URL or the html text? (if url dosen't work try html) (url/html): ", function (method) { return __awaiter(_this, void 0, void 0, function () {
                                            var sources, source, e_1, html_1;
                                            var _this = this;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0:
                                                        if (!(method.toLowerCase() === 'url')) return [3 /*break*/, 8];
                                                        sources = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf-8'));
                                                        source = sources.find(function (s) { return s.id === name; });
                                                        if (!(source && source.sourceSite)) return [3 /*break*/, 5];
                                                        console.log('Getting filters from', source.sourceSite);
                                                        _a.label = 1;
                                                    case 1:
                                                        _a.trys.push([1, 3, , 4]);
                                                        return [4 /*yield*/, getFiltersFromURL(name, source.sourceSite)];
                                                    case 2:
                                                        _a.sent();
                                                        return [3 /*break*/, 4];
                                                    case 3:
                                                        e_1 = _a.sent();
                                                        console.error('Error while getting filters from', source.sourceSite);
                                                        console.log(e_1.message || e_1);
                                                        return [3 /*break*/, 4];
                                                    case 4:
                                                        rl.close();
                                                        return [3 /*break*/, 7];
                                                    case 5: return [4 /*yield*/, rl.question(EREASE_PREV_LINE +
                                                            'Enter the URL (same one as in sources.json): ', function (url) { return __awaiter(_this, void 0, void 0, function () {
                                                            var e_2;
                                                            return __generator(this, function (_a) {
                                                                switch (_a.label) {
                                                                    case 0:
                                                                        rl.close();
                                                                        _a.label = 1;
                                                                    case 1:
                                                                        _a.trys.push([1, 3, , 4]);
                                                                        return [4 /*yield*/, getFiltersFromURL(name, url)];
                                                                    case 2:
                                                                        _a.sent();
                                                                        return [3 /*break*/, 4];
                                                                    case 3:
                                                                        e_2 = _a.sent();
                                                                        console.error('Error while getting filters from', url);
                                                                        console.log(e_2.message || e_2);
                                                                        return [3 /*break*/, 4];
                                                                    case 4: return [2 /*return*/];
                                                                }
                                                            });
                                                        }); })];
                                                    case 6:
                                                        _a.sent();
                                                        _a.label = 7;
                                                    case 7: return [3 /*break*/, 9];
                                                    case 8:
                                                        process_1.default.stdout.write(EREASE_PREV_LINE +
                                                            "Enter the html text from the page at {sourceSite}/series (at the end press ENTER then press CTRL+C)\n(to make it faster you can run `$(\"div.quickfilter\").parent().html()` in the console to get only the important html part): ");
                                                        html_1 = '';
                                                        rl.on('SIGINT', function () {
                                                            console.log('Stopeed reading input, creating filters file');
                                                            getFilters(name, html_1);
                                                            rl.close();
                                                        });
                                                        rl.on('line', function (line) {
                                                            html_1 += line + '\n';
                                                        });
                                                        _a.label = 9;
                                                    case 9: return [2 /*return*/];
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
