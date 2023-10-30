import fs from "fs";
import { languages } from "@libs/languages";
import path from "path";
import { PluginList } from "@typings/types";
import { Plugin, isPlugin } from "@typings/plugin";
const root = path.dirname(require?.main?.filename || "");

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
            const instance = require(requirePath);
            const { id, name, version, icon } = instance;
            const info: Plugin.Info = {
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
): Promise<Plugin.instance | null> => {
    const plugin = await require(requirePath);
    if (isPlugin(plugin)) return plugin;
    return null;
};

export const popularNovels = async (
    pluginRequirePath: string,
    options: Plugin.Options
) => {
    const plugin = await getPlugin(pluginRequirePath);
    if (!plugin) return null;
    const popularNovels = await plugin.popularNovels(1, options);
    return popularNovels;
};

export const searchNovels = async (
    pluginRequirePath: string,
    searchTerm: string
) => (await getPlugin(pluginRequirePath))?.searchNovels(searchTerm);

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
