import fs from "fs";
import { languages } from "@libs/languages";
import path from "path";
import { PluginList } from "@typings/types";
import { Plugin, isPlugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";
const root = path.dirname(require?.main?.filename || "");

export const fetchHeaders: Record<string, string> = {}

export const all_plugins = (): PluginList => {
    const res: PluginList = {};
    for (let languageEnglish in languages) {
        //language with English name
        const languageNative =
            languages[languageEnglish as keyof typeof languages];
        const langPath = path.join(
            root,
            "plugins",
            languageEnglish.toLowerCase()
        );
        if (!fs.existsSync(langPath)) continue;
        const plugins = fs.readdirSync(langPath);
        res[languageNative] = [];
        plugins.forEach((plugin) => {
            if (plugin.startsWith(".")) return;
            const requirePath = `@plugins/${languageEnglish.toLowerCase()}/${
                plugin.split(".")[0]
            }`;
            const instance = require(requirePath).default;
            const { id, name, version, icon } = instance;
            const info: Plugin.PluginItem = {
                id,
                name,
                lang: languageNative,
                version,
                requirePath,
                icon,
            }; // lang: language with native name
            res[info.lang].push(info);
        });
    }
    return res;
};

const getPlugin = async (
    requirePath: string
): Promise<Plugin.PluginBase | null> => {
    console.log("loading plugin", requirePath);
    const plugin = await require(requirePath).default;
    console.log(plugin);
    if (isPlugin(plugin)) return plugin;
    console.log("Not a plugin!");
    return null;
};

export const getFilter = async (pluginRequirePath: string) =>
    (await getPlugin(pluginRequirePath))?.filters;

export const popularNovels = async (
    pluginRequirePath: string,
    options: Plugin.PopularNovelsOptions<Filters>
) => (await getPlugin(pluginRequirePath))?.popularNovels(1, options);

export const searchNovels = async (
    pluginRequirePath: string,
    searchTerm: string
) => (await getPlugin(pluginRequirePath))?.searchNovels(searchTerm, 1);

export const parseNovelAndChapters = async (
    pluginRequirePath: string,
    novelUrl: string
) => (await getPlugin(pluginRequirePath))?.parseNovelAndChapters(novelUrl);

export const parseChapter = async (
    pluginRequirePath: string,
    chapterUrl: string
) => (await getPlugin(pluginRequirePath))?.parseChapter(chapterUrl);

export const fetchImage = async (pluginRequirePath: string, url: string) =>
    (await getPlugin(pluginRequirePath))?.fetchImage(url);
