require("module-alias/register");

import * as fs from "fs";
import { languages } from "@libs/languages";
import * as path from "path";
import { Plugin, isPlugin } from "@typings/plugin";

import config from "./../config.json";

const root = path.dirname(__dirname);
const outRoot = path.join(root, "..");
const username = config.githubUsername;
const repo = config.githubRepository;
const branch = config.githubBranch;
if (!username || !repo || !branch) {
    console.error("config.json not provided!");
    process.exit(1);
}
if (!fs.existsSync(path.join(outRoot, "dist", username))) {
    fs.mkdirSync(path.join(outRoot, "dist", username));
}
const githubIconsLink = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/icons`;
const githubPluginsLink = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/js/plugins`;

const json: {
    [key: string]: {
        id: string;
        name: string;
        site: string;
        lang: string;
        version: string;
        url: string;
        iconUrl: string;
    }[];
} = {};
const jsonPath = path.join(outRoot, "dist", username, "plugins.json");
const jsonMinPath = path.join(outRoot, "dist", username, "plugins.min.json");
const pluginSet = new Set();

for (let language in languages) {
    // language with English name
    const languageNative = languages[language as keyof typeof languages];
    const langPath = path.join(root, "plugins", language.toLowerCase());
    if (!fs.existsSync(langPath)) continue;
    const plugins = fs.readdirSync(langPath);
    json[languageNative] = [];
    plugins.forEach((plugin) => {
        if (plugin.startsWith(".")) return;
        const instance:
            | Plugin.instance
            | unknown = require(`../plugins/${language.toLowerCase()}/${
            plugin.split(".")[0]
        }`);

        if (!isPlugin(instance)) {
            console.log(plugin);
            return;
        }

        const { id, name, site, version, icon } = instance;
        const info = {
            id,
            name,
            site,
            lang: languageNative,
            version,
            url: `${githubPluginsLink}/${language.toLowerCase()}/${plugin}`,
            iconUrl: `${githubIconsLink}/${icon}`,
        } as const;

        if (pluginSet.has(id)) {
            console.log("There's already a plugin with id:", id);
            throw new Error("2 or more plugins have the same id");
        } else {
            pluginSet.add(id);
        }

        json[languageNative].push(info);
        console.log(name, "✅");
    });
}

for (let lang in json) json[lang].sort((a, b) => a.id.localeCompare(b.id));

fs.writeFileSync(jsonMinPath, JSON.stringify(json));
fs.writeFileSync(jsonPath, JSON.stringify(json, null, "\t"));

// check for broken plugins
for (let language in languages) {
    const tsFiles = fs.readdirSync(
        path.join(root, "..", "plugins", language.toLocaleLowerCase())
    );
    tsFiles
        .filter((f) => f.endsWith(".broken.ts"))
        .forEach((fn) => {
            console.error(
                language.toLocaleLowerCase() +
                    "/" +
                    fn.replace(".broken.ts", "") +
                    " ❌"
            );
        });
}

console.log(jsonPath);
console.log("Done ✅");
