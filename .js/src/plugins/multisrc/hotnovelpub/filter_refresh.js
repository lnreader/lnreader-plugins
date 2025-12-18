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
var fs = __importStar(require("fs"));
var cheerio = __importStar(require("cheerio"));
var path = __importStar(require("path"));
var sources_json_1 = __importDefault(require("./sources.json"));
function getFilters(sources) {
    return __awaiter(this, void 0, void 0, function () {
        var filters, body, $, apiSite, jsonRaw, json;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    filters = {
                        sort: {
                            type: 'Picker',
                            label: 'Order',
                            value: 'hot',
                            options: [],
                        },
                        category: {
                            type: 'Picker',
                            label: 'category',
                            value: '',
                            options: [{ label: 'NONE', value: '' }],
                        },
                    };
                    return [4 /*yield*/, fetch(sources.sourceSite).then(function (res) { return res.text(); })];
                case 1:
                    body = _c.sent();
                    $ = cheerio.load(body);
                    $('.new-update').remove();
                    $('section > div').each(function (i, el) {
                        var id = $(el).find('a[class="see-all"]').attr('href');
                        if (id) {
                            filters.sort.options.push({
                                label: $(el).find('[class="section-title"]').text().trim(),
                                value: id.split('/').pop(),
                            });
                        }
                    });
                    filters.category.label = $('.category-title').text().trim();
                    apiSite = sources.sourceSite.replace('://', '://api.');
                    return [4 /*yield*/, fetch(apiSite + '/categories', {
                            headers: {
                                lang: ((_a = sources.options) === null || _a === void 0 ? void 0 : _a.lang) || 'en',
                            },
                        })];
                case 2:
                    jsonRaw = _c.sent();
                    return [4 /*yield*/, jsonRaw.json()];
                case 3:
                    json = (_c.sent());
                    if ((_b = json.data) === null || _b === void 0 ? void 0 : _b.length) {
                        json.data
                            .sort(function (a, b) { return a.name.localeCompare(b.name); })
                            .forEach(function (category) {
                            return filters.category.options.push({
                                label: category.name,
                                value: category.slug,
                            });
                        });
                    }
                    return [2 /*return*/, filters];
            }
        });
    });
}
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var result, _i, list_1, sources, NewFilters;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    result = [];
                    _i = 0, list_1 = sources_json_1.default;
                    _a.label = 1;
                case 1:
                    if (!(_i < list_1.length)) return [3 /*break*/, 4];
                    sources = list_1[_i];
                    console.log('updating the filters in', sources.sourceName);
                    return [4 /*yield*/, getFilters(sources)];
                case 2:
                    NewFilters = _a.sent();
                    sources.filters = NewFilters;
                    result.push(sources);
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    fs.writeFileSync(path.join(__dirname, 'sources.json'), JSON.stringify(result, null, 2));
                    return [2 /*return*/];
            }
        });
    });
}
start();
