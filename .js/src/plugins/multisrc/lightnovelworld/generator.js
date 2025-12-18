"use strict";
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
var generateAll = function () {
    return sources_json_1.default.map(function (source) {
        var exist = (0, fs_1.existsSync)((0, path_1.join)(folder, 'filters', source.id + '.json'));
        if (exist) {
            var filters = (0, fs_1.readFileSync)((0, path_1.join)(folder, 'filters', source.id + '.json'));
            source.filters = JSON.parse(filters);
        }
        console.log("[lightnovelworld] Generating: ".concat(source.id).concat(' '.repeat(20 - source.id.length), " ").concat(source.filters ? '🔎with filters🔍' : '🚫no filters🚫'));
        return generator(source);
    });
};
exports.generateAll = generateAll;
var generator = function generator(source) {
    var _a;
    var LightNovelWPTemplate = (0, fs_1.readFileSync)((0, path_1.join)(folder, 'template.ts'), {
        encoding: 'utf-8',
    });
    var pluginScript = "\n".concat(LightNovelWPTemplate, "\nconst plugin = new LightNovelWorld(").concat(JSON.stringify(source), ");\nexport default plugin;\n    ").trim();
    return {
        lang: ((_a = source.options) === null || _a === void 0 ? void 0 : _a.lang) || 'English',
        filename: source.sourceName,
        pluginScript: pluginScript,
    };
};
