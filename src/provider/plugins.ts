import { Plugin } from '@/types/plugin';
import plugins from '@plugins/index';

export const searchPlugins = (keyword: string) => {
  return (plugins as Plugin.PluginItem[]).filter(
    f =>
      f.name.toLowerCase().includes(keyword.toLowerCase()) ||
      f.id.toLowerCase().includes(keyword.toLowerCase()),
  );
};

export const getPlugin = (id: string) =>
  (plugins as Plugin.PluginItem[]).find(f => f.id === id);
