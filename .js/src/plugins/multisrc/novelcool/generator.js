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
// https://app.novelcool.com/
var app = {
    userAgent: 'Android/Package:com.zuoyou.novel - Version Name:2.3 - Phone Info:sdk_gphone_x86_64(Android Version:13)',
    package_name: 'com.zuoyou.novel',
    appId: '202201290625004',
    secret: 'c73a8590641781f203660afca1d37ada',
};
var generateAll = function () {
    sources_json_1.default.sort(function (a, b) { return a.id.length - b.id.length; });
    return sources_json_1.default.map(function (source) { return generator(source); });
};
exports.generateAll = generateAll;
var generator = function generator(source) {
    var NovelCoolTemplate = (0, fs_1.readFileSync)(__dirname + '/template.ts', {
        encoding: 'utf-8',
    });
    source.options.app = app;
    var pluginScript = "\n  ".concat(NovelCoolTemplate, "\n\nconst plugin = new NovelCoolPlugin(").concat(JSON.stringify(source), ");\nexport default plugin;\n    ").trim();
    return {
        lang: source.options.lang,
        filename: source.sourceName,
        pluginScript: pluginScript,
    };
};
