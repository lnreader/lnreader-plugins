import { AppState } from '@redux/store';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Plugin } from '@typings/plugin';
import { getPlugin } from '@provider/plugins';

export default function usePlugin() {
  const selectedPluginItem = useSelector(
    (state: AppState) => state.plugin.selected,
  );
  const [plugin, setPlugin] = useState<Plugin.PluginBase | undefined>();
  useEffect(() => {
    if (selectedPluginItem) {
      setPlugin(getPlugin(selectedPluginItem.id));
    }
  }, [selectedPluginItem]);
  return plugin;
}
