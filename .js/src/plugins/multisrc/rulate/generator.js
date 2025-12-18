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
var settings_json_1 = __importDefault(require("./settings.json"));
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
var generateAll = function () {
    return sources_json_1.default
        .map(function (p) {
        var _a;
        if (p.filters) {
            (_a = p.filters.cat.options).unshift.apply(_a, settings_json_1.default.filters.cat.options);
        }
        p.filters = Object.assign(settings_json_1.default.filters, p.filters);
        var d = false;
        var filters = {};
        for (var k in p.filters) {
            var f = p.filters[k];
            if (f) {
                filters[k] = __assign(__assign({}, f), { type: FilterTypes[f.type] });
            }
        }
        return __assign(__assign({}, p), { filters: d ? undefined : filters });
    })
        .map(function (source) {
        console.log("[rulate]: Generating", source.id);
        return generator(source);
    });
};
exports.generateAll = generateAll;
var generator = function generator(source) {
    var rulateTemplate = (0, fs_1.readFileSync)((0, path_1.join)(folder, 'template.ts'), {
        encoding: 'utf-8',
    });
    var pluginScript = "\n  ".concat(rulateTemplate, "\nconst plugin = new RulatePlugin(").concat(JSON.stringify(source)
        .replace(/"type":"([^"]+)"/g, '"type":FilterTypes.$1')
        .replace(/\.XCheckbox/g, '.ExcludableCheckboxGroup') //remember to redo
        .replace(/\.Checkbox/g, '.CheckboxGroup'), ");\nexport default plugin;\n    ").trim();
    return {
        lang: 'russian',
        filename: source.sourceName,
        pluginScript: pluginScript,
    };
};
