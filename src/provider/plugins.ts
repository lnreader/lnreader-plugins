import { Plugin } from '@typings/plugin';

const plugins: Plugin.PluginBase[] = [];

export const loadPlugins = async () => {
  const paths = await fetch('pluginPaths').then(res => res.json());
  const fetchedPlugins: Plugin.PluginBase[] = [];
  for (const path of paths) {
    const relativePath = '../plugins/' + path;
    const plugin: Plugin.PluginBase = (
      await import(/* @vite-ignore */ relativePath)
    ).default;
    fetchedPlugins.push(plugin);
  }
  plugins.splice(0, plugins.length, ...fetchedPlugins);
};

export const searchPlugins = (keyword: string) => {
  return plugins.filter(
    f => f.name.includes(keyword) || f.id.includes(keyword),
  );
};

export const getPlugin = (id: string) => plugins.find(f => f.id === id);
