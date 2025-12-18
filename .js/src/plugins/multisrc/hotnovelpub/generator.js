"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAll = void 0;
var sources_json_1 = __importDefault(require("./sources.json"));
var fs_1 = require("fs");
var url_1 = require("url");
var path_1 = require("path");
var folder = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
var FilterTypes = {
    TextInput: 'Text',
    Picker: 'Picker',
    CheckboxGroup: 'Checkbox',
    Switch: 'Switch',
    ExcludableCheckboxGroup: 'XCheckbox',
};
var lang = {
    en: 'english',
    ru: 'russian',
    es: 'spanish',
    pt: 'portuguese',
    th: 'turkish',
};
var generateAll = function () {
    return sources_json_1.default
        .map(function (p) {
        var filters = {};
        for (var k in p.filters) {
            var f = p.filters[k];
            if (f) {
                filters[k] = __assign(__assign({}, f), { type: FilterTypes.Picker });
            }
        }
        return __assign(__assign({}, p), { filters: filters });
    })
        .map(function (metadata) {
        console.log("[hotnovelpub]: Generating", metadata.id);
        return generator(metadata);
    });
};
exports.generateAll = generateAll;
var generator = function generator(metadata) {
    var _a;
    var HotNovelPubTemplate = (0, fs_1.readFileSync)((0, path_1.join)(folder, 'template.ts'), {
        encoding: 'utf-8',
    });
    var pluginScript = "\n    ".concat(HotNovelPubTemplate, "\nconst plugin = new HotNovelPubPlugin(").concat(JSON.stringify(metadata).replace(/"type":"([^"]+)"/g, '"type":FilterTypes.$1'), ");\nexport default plugin;\n    ").trim();
    return {
        lang: lang[((_a = metadata === null || metadata === void 0 ? void 0 : metadata.options) === null || _a === void 0 ? void 0 : _a.lang) || 'en'] || 'english',
        filename: metadata.sourceName,
        pluginScript: pluginScript,
    };
};
