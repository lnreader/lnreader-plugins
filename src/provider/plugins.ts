import plugins from '@plugins/index';

export const searchPlugins = (keyword: string) => {
  return plugins.filter(
    f =>
      f.name.toLowerCase().includes(keyword.toLowerCase()) ||
      f.id.toLowerCase().includes(keyword.toLowerCase()),
  );
};

export const getPlugin = (id: string) => plugins.find(f => f.id === id);
