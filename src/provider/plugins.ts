import plugins from '../plugins';

export const searchPlugins = (keyword: string) => {
  return plugins.filter(
    f => f.name.includes(keyword) || f.id.includes(keyword),
  );
};

export const getPlugin = (id: string) => plugins.find(f => f.id === id);
