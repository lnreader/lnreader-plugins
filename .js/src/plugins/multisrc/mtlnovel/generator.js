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
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = (0, path_1.dirname)(__filename);
var generateAll = function () {
    sources_json_1.default.sort(function (a, b) { return a.id.length - b.id.length; });
    return sources_json_1.default.map(function (source) {
        try {
            var filters = JSON.parse((0, fs_1.readFileSync)("".concat(__dirname, "/filters/mtlnovel.json"), 'utf-8'));
            source.filters = filters;
        }
        catch (e) { }
        console.log("[mtlnovel] Generating: ".concat(source.id).padEnd(35), source.filters ? '🔎with filters🔍' : '🚫 no filters 🚫');
        return generator(source);
    });
};
exports.generateAll = generateAll;
var generator = function generator(source) {
    var _a;
    var MTLNovelTemplate = (0, fs_1.readFileSync)(__dirname + '/template.ts', {
        encoding: 'utf-8',
    });
    var pluginScript = "\n  ".concat(MTLNovelTemplate, "\n\nconst plugin = new MTLNovelPlugin(").concat(JSON.stringify(source), ");\nexport default plugin;\n    ").trim();
    return {
        lang: ((_a = source.options) === null || _a === void 0 ? void 0 : _a.lang) || 'English',
        filename: source.sourceName,
        pluginScript: pluginScript,
    };
};
