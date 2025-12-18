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
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
// type GeneratedScript = {
//   lang: string;
//   filename: string;
//   pluginScript: string;
// };
// export type ScrpitGeneratorFunction = () => GeneratedScript[];
var isScriptGenerator = function (s) {
    return !!s && typeof s === 'function';
};
var generate = function (name) { return __awaiter(void 0, void 0, void 0, function () {
    var generateAll, sources, _i, sources_1, source, lang, filename, pluginScript, pluginsDir, filePath, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, Promise.resolve("".concat("./".concat(name, "/generator.js"))).then(function (s) { return __importStar(require(s)); })];
            case 1:
                generateAll = (_a.sent()).generateAll;
                if (!isScriptGenerator(generateAll))
                    return [2 /*return*/, false];
                sources = generateAll();
                for (_i = 0, sources_1 = sources; _i < sources_1.length; _i++) {
                    source = sources_1[_i];
                    lang = source.lang, filename = source.filename, pluginScript = source.pluginScript;
                    if (!lang || !filename || !pluginScript) {
                        console.warn(name, ': lang, filename, pluginScript are required!');
                        continue;
                    }
                    pluginsDir = './plugins';
                    filePath = path_1.default.join(pluginsDir, lang.toLowerCase(), filename.replace(/[\s-.]+/g, '') + "[".concat(name, "].ts"));
                    fs_1.default.writeFileSync(filePath, pluginScript, { encoding: 'utf-8' });
                }
                return [2 /*return*/, true];
            case 2:
                e_1 = _a.sent();
                console.log("".concat(name, " is broken! ").concat(e_1, "\n"));
                return [2 /*return*/, false];
            case 3: return [2 /*return*/];
        }
    });
}); };
var MULTISRC_DIR = './plugins/multisrc';
var run = function () { return __awaiter(void 0, void 0, void 0, function () {
    var sources, _i, sources_2, name_1, success;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sources = fs_1.default
                    .readdirSync(MULTISRC_DIR)
                    .filter(function (name) {
                    return fs_1.default.lstatSync(path_1.default.join(MULTISRC_DIR, name)).isDirectory() &&
                        !name.endsWith('.broken');
                });
                _i = 0, sources_2 = sources;
                _a.label = 1;
            case 1:
                if (!(_i < sources_2.length)) return [3 /*break*/, 4];
                name_1 = sources_2[_i];
                return [4 /*yield*/, generate(name_1)];
            case 2:
                success = _a.sent();
                if (success)
                    console.log("[".concat(name_1, "] OK"));
                _a.label = 3;
            case 3:
                _i++;
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}); };
run();
