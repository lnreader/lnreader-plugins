import { Plugin } from '@/types/plugin';
import { StoreCreator } from '.';
import { getPlugin } from '@/provider/plugins';
import plugins from '@plugins/index';

export type PluginStore = {
  pluginItem?: Plugin.PluginItem;
  plugin?: Plugin.PluginBase;
  selectPlugin(plugin: Plugin.PluginItem, updateURL?: boolean): void;
};

const loadPluginFromURL = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pluginId = urlParams.get('plugin');
  if (pluginId) {
    const pluginItem = plugins.find(p => p.id === pluginId);
    if (pluginItem) {
      return {
        pluginItem,
        plugin: getPlugin(pluginItem.id),
      };
    }
  }
  return {};
};

/**
 * @param set State setter for use inside actions
 * @param get State getter for use inside actions, outside of State setter
 */
export const PluginStore: StoreCreator<PluginStore> = set => ({
  ...loadPluginFromURL(),

  selectPlugin(pluginItem, updateURL = true) {
    set(state => ({
      ...state,
      pluginItem,
      plugin: getPlugin(pluginItem.id),
    }));

    if (updateURL) {
      const url = new URL(window.location.href);
      url.searchParams.set('plugin', pluginItem.id);
      window.history.pushState({}, '', url);
    }
  },
});
