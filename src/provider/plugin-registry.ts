import type { Plugin } from '@/types/plugin';

const pluginModules = import.meta.glob<Plugin.PluginBase>(
  ['/plugins/*/*.ts', '!/plugins/**/*.broken.ts', '!/plugins/multisrc/**'],
  {
    eager: true,
    import: 'default',
  },
);

const plugins = Object.entries(pluginModules)
  .sort(([firstPath], [secondPath]) =>
    firstPath < secondPath ? -1 : firstPath > secondPath ? 1 : 0,
  )
  .map(([, plugin]) => plugin);

export default plugins;
