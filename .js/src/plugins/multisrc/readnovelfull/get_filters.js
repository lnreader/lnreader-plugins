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
function extractValueFromHref(href, baseUrl, name, isGenre) {
    if (isGenre === void 0) { isGenre = false; }
    var fullUrl = new URL(decodeURI(href), baseUrl);
    var params = fullUrl.searchParams;
    if (isGenre && params.get('type') === 'category_novel' && params.has('id')) {
        return params.get('id');
    }
    var value = params.has('type')
        ? params.get('type')
        : fullUrl.pathname.substring(1) || '';
    if (!value) {
        console.warn("Skipping option for ".concat(name, ": Could not determine value from href \"").concat(href, "\""));
    }
    return value;
}
function getFilters(name, html, baseUrl) {
    var _a;
    var $ = cheerio.load(html);
    var filters = {
        filters: {
            'type': {
                type: 'Picker',
                label: 'Novel Listing',
                value: '',
                options: [],
            },
            'genres': {
                type: 'Picker',
                label: 'Genre',
                value: '',
                options: [],
            },
        },
    };
    var baseSelector = 'div.navbar-collapse li.dropdown';
    // --- Type Filters ---
    var defaultValue = null;
    var typeOptions = [];
    $("".concat(baseSelector, ":eq(0) li a")).each(function (_, el) {
        var $el = $(el);
        var title = $el.attr('title');
        var label = $el.text().trim();
        var href = $el.attr('href');
        if (!href || !label || title === 'Latest Release')
            return;
        var value = extractValueFromHref(href, baseUrl, name);
        if (value) {
            typeOptions.push({ label: label, value: value });
            if (title === 'Most Popular') {
                defaultValue = value;
            }
        }
    });
    filters.filters.type.options = typeOptions;
    filters.filters.type.value = defaultValue !== null && defaultValue !== void 0 ? defaultValue : (((_a = typeOptions[0]) === null || _a === void 0 ? void 0 : _a.value) || ''); // Set default: Popular > First > Empty
    // --- Genres Filters ---
    var genreOptions = [];
    $("".concat(baseSelector, ":eq(1) li a")).each(function (_, el) {
        var $el = $(el);
        var label = $el.text().trim();
        var href = $el.attr('href');
        if (!href || !label)
            return;
        var value = extractValueFromHref(href, baseUrl, name, true);
        if (value) {
            genreOptions.push({ label: label, value: value });
        }
    });
    filters.filters.genres.options = genreOptions; // Genre has no default
    // --- Validation and Saving ---
    if (filters.filters.type.options.length === 0 ||
        filters.filters.genres.options.length === 0) {
        console.warn("\uD83D\uDEA8Warning for ".concat(name, ": Type or Genre options might be incomplete or empty. (").concat(path.join(__dirname, 'filters', name + '.json'), ")\uD83D\uDEA8"));
    }
    try {
        var filtersDir = path.join(__dirname, 'filters');
        if (!fs.existsSync(filtersDir))
            fs.mkdirSync(filtersDir, { recursive: true });
        fs.writeFileSync(path.join(filtersDir, name + '.json'), JSON.stringify(filters, null, 2));
        console.log("\u2705Filters created successfully for ".concat(name, "\u2705"));
    }
    catch (error) {
        console.error("\uD83D\uDEA8Error writing filters file for ".concat(name, ": ").concat(error.message, "\uD83D\uDEA8"));
    }
}
function getFiltersFromURL(name, url) {
    return __awaiter(this, void 0, void 0, function () {
        var response, html;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url)];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("HTTP error! status: ".concat(response.status, ", while fetching ").concat(response.url));
                    }
                    return [4 /*yield*/, response.text()];
                case 2:
                    html = _a.sent();
                    try {
                        getFilters(name, html, url);
                    }
                    catch (e) {
                        console.error('Error while getting filters from', url, e);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
var EREASE_PREV_LINE = '\x1b[1A\r\x1b[2K';
var rl = readline.createInterface({
    input: process_1.default.stdin,
    output: process_1.default.stdout,
});
function askGetFilter() {
    return __awaiter(this, void 0, void 0, function () {
        var sources_1;
        var _this = this;
        return __generator(this, function (_a) {
            try {
                sources_1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf-8'));
                rl.question('Enter the id of the site (same one as in sources.json): ', function (name) { return __awaiter(_this, void 0, void 0, function () {
                    var baseUrl;
                    var _this = this;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, getBaseUrl(name, sources_1)];
                            case 1:
                                baseUrl = _a.sent();
                                rl.question(EREASE_PREV_LINE +
                                    "Do you want to get the filters from a URL or the html text? (if url doesn't work try html) (url/html): ", function (method) { return __awaiter(_this, void 0, void 0, function () {
                                    var e_1;
                                    var _this = this;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                if (!(method.toLowerCase() === 'url')) return [3 /*break*/, 7];
                                                if (!baseUrl) return [3 /*break*/, 5];
                                                console.log('Getting filters from', baseUrl);
                                                _a.label = 1;
                                            case 1:
                                                _a.trys.push([1, 3, , 4]);
                                                return [4 /*yield*/, getFiltersFromURL(name, baseUrl)];
                                            case 2:
                                                _a.sent();
                                                return [3 /*break*/, 4];
                                            case 3:
                                                e_1 = _a.sent();
                                                console.error('Error while getting filters from', baseUrl);
                                                console.log(e_1.message || e_1);
                                                return [3 /*break*/, 4];
                                            case 4: return [3 /*break*/, 6];
                                            case 5:
                                                console.error('Cannot get filters from URL: Base URL is not available.');
                                                _a.label = 6;
                                            case 6:
                                                rl.close();
                                                return [3 /*break*/, 8];
                                            case 7:
                                                rl.question(EREASE_PREV_LINE + 'Enter the absolute path to the HTML file: ', function (filePath) { return __awaiter(_this, void 0, void 0, function () {
                                                    var html;
                                                    return __generator(this, function (_a) {
                                                        try {
                                                            html = fs.readFileSync(filePath, 'utf-8');
                                                            if (baseUrl) {
                                                                console.log('Using base URL:', baseUrl);
                                                            }
                                                            else {
                                                                console.error('Cannot get filters from HTML: Base URL is not available.');
                                                            }
                                                            getFilters(name, html, baseUrl);
                                                        }
                                                        catch (e) {
                                                            console.error('Error reading HTML file or getting filters:', e.message || e);
                                                        }
                                                        finally {
                                                            rl.close();
                                                        }
                                                        return [2 /*return*/];
                                                    });
                                                }); });
                                                _a.label = 8;
                                            case 8: return [2 /*return*/];
                                        }
                                    });
                                }); });
                                return [2 /*return*/];
                        }
                    });
                }); });
            }
            catch (e) {
                console.error('Error reading sources.json:', e.message || e);
                rl.close();
            }
            return [2 /*return*/];
        });
    });
}
askGetFilter();
function getBaseUrl(name, sources) {
    return __awaiter(this, void 0, void 0, function () {
        var source;
        return __generator(this, function (_a) {
            source = sources.find(function (s) { return s.id === name; });
            if (source && source.sourceSite) {
                console.log('Using base URL from sources.json:', source.sourceSite);
                return [2 /*return*/, source.sourceSite];
            }
            else {
                console.warn("Source with id \"".concat(name, "\" not found or missing sourceSite in sources.json."));
                return [2 /*return*/, new Promise(function (resolve) {
                        rl.question(EREASE_PREV_LINE + 'Enter the base URL for the site: ', function (manualBaseUrl) {
                            resolve(manualBaseUrl);
                        });
                    })];
            }
            return [2 /*return*/];
        });
    });
}
