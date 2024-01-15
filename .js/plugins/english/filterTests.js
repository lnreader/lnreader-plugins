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
Object.defineProperty(exports, "__esModule", { value: true });
var fetch_1 = require("@libs/fetch");
var filterInputs_1 = require("@libs/filterInputs");
var FTest = /** @class */ (function () {
    function FTest() {
        this.id = "ftest";
        this.name = "Filter Test";
        this.icon = "src/en/noblemtl/icon.png";
        this.site = "https://noblemtl.com/";
        this.version = "1.0.0";
        this.userAgent = "";
        this.filters = {
            picker: {
                type: filterInputs_1.FilterTypes.Picker,
                label: "Picker",
                options: [
                    { label: "A", value: "a" },
                    { label: "B", value: "b" },
                ],
                value: "a",
            },
            nd_picker: {
                type: filterInputs_1.FilterTypes.Picker,
                label: "ND_Picker",
                options: [
                    { label: "A", value: "a" },
                    { label: "B", value: "b" },
                ],
                value: "b",
            },
            checkbox: {
                type: filterInputs_1.FilterTypes.CheckboxGroup,
                label: "Checkbox",
                options: [
                    { label: "A", value: "a" },
                    { label: "B", value: "b" },
                ],
                value: [],
            },
            nd_checkbox: {
                type: filterInputs_1.FilterTypes.CheckboxGroup,
                label: "ND_Checkbox",
                options: [
                    { label: "A", value: "a" },
                    { label: "B", value: "b" },
                ],
                value: ["a"],
            },
            switch: {
                type: filterInputs_1.FilterTypes.Switch,
                label: "Switch",
                value: false,
            },
            nd_switch: {
                type: filterInputs_1.FilterTypes.Switch,
                label: "ND_Switch",
                value: true,
            },
            text: {
                type: filterInputs_1.FilterTypes.TextInput,
                label: "Text",
                value: "",
            },
            nd_text: {
                type: filterInputs_1.FilterTypes.TextInput,
                label: "ND_Text",
                value: "some default value",
            },
            xcheckbox: {
                type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup,
                label: "XCheckbox",
                options: [
                    { label: "A", value: "a" },
                    { label: "C", value: "c" },
                    { label: "B", value: "b" },
                ],
                value: {},
            },
            nd_xcheckbox: {
                type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup,
                label: "ND_XCheckbox",
                options: [
                    { label: "A", value: "a" },
                    { label: "C", value: "c" },
                    { label: "B", value: "b" },
                ],
                value: { exclude: ["a"], include: ["b"] },
            },
        };
    }
    FTest.prototype.popularNovels = function (pageNo, _a) {
        var filters = _a.filters;
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_b) {
                return [2 /*return*/, []];
            });
        });
    };
    FTest.prototype.parseNovelAndChapters = function (novelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, { url: "" }];
            });
        });
    };
    FTest.prototype.parseChapter = function (chapterUrl) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, "Empty chapter"];
            });
        });
    };
    FTest.prototype.searchNovels = function (searchTerm, pageNo) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, []];
            });
        });
    };
    FTest.prototype.fetchImage = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchFile)(url)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return FTest;
}());
var Test = new FTest();
exports.default = new FTest();
