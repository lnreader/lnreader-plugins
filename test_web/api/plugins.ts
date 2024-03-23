import fs from 'fs';
import { languages } from '@libs/languages';
import path from 'path';
import { PluginList } from '@typings/types';
import { Plugin } from '@typings/plugin';
import { Filters } from '@libs/filterInputs';
const root = path.dirname(require?.main?.filename || '');

export const fetchHeaders: Record<string, string> = {};

export const all_plugins = (): PluginList => {
  const res: PluginList = {};
  for (let languageEnglish in languages) {
    //language with English name
    const languageNative = languages[languageEnglish as keyof typeof languages];
    const langPath = path.join(root, 'plugins', languageEnglish.toLowerCase());
    if (!fs.existsSync(langPath)) continue;
    const plugins = fs.readdirSync(langPath);
    res[languageEnglish] = [];
    plugins.forEach(plugin => {
      if (plugin.startsWith('.')) return;
      const requirePath = `@plugins/${languageEnglish.toLowerCase()}/${
        plugin.split('.')[0]
      }`;
      const instance = require(requirePath).default;
      const { id, name, version, icon } = instance;
      const info: Plugin.PluginItem = {
        id,
        name: name + (plugin.match(/(\[.+\])/)?.[1] || ''),
        lang: languageNative,
        version,
        requirePath,
        icon,
      }; // lang: language with native name
      res[languageEnglish].push(info);
    });
  }
  return res;
};

const getPlugin = async (
  requirePath: string,
): Promise<Plugin.PluginBase | Plugin.PagePlugin | null> => {
  const plugin = await require(requirePath).default;
  return plugin;
};

export const getFilter = async (pluginRequirePath: string) =>
  (await getPlugin(pluginRequirePath))?.filters;

export const popularNovels = async (
  pluginRequirePath: string,
  page: number,
  options: Plugin.PopularNovelsOptions<Filters>,
) => (await getPlugin(pluginRequirePath))?.popularNovels(page, options);

export const searchNovels = async (
  pluginRequirePath: string,
  page: number,
  searchTerm: string,
) => (await getPlugin(pluginRequirePath))?.searchNovels(searchTerm, page);

export const parseNovel = async (
  pluginRequirePath: string,
  novelPath: string,
) => (await getPlugin(pluginRequirePath))?.parseNovel(novelPath);

export const hasParsePage = async (pluginRequirePath: string) =>
  ((await getPlugin(pluginRequirePath)) as Plugin.PagePlugin | null)?.parsePage;

export const parsePage = async (
  pluginRequirePath: string,
  novelPath: string,
  page: string,
) =>
  ((await getPlugin(pluginRequirePath)) as Plugin.PagePlugin | null)?.parsePage(
    novelPath,
    page,
  );

export const parseChapter = async (
  pluginRequirePath: string,
  chapterPath: string,
) => (await getPlugin(pluginRequirePath))?.parseChapter(chapterPath);

export const fetchImage = async (pluginRequirePath: string, url: string) =>
  (await getPlugin(pluginRequirePath))?.fetchImage(url);

export const resolveUrl = async (
  pluginRequirePath: string,
  path: string,
  isNovel?: boolean,
) => {
  const plugin = await getPlugin(pluginRequirePath);
  if (!plugin) return path;
  if (plugin.resolveUrl) return plugin.resolveUrl(path, isNovel);
  return plugin.site + path;
};
