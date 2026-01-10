import { create, StateCreator } from 'zustand';
import { PluginStore } from './pluginStore';
import { NavigationStore } from './navigationStore';

export type AppStore = PluginStore &
  NavigationStore & {
    theme: 'light' | 'dark';
    setTheme(value: 'light' | 'dark'): void;
  };

// Helper types to use "slicing" like in Redux... We could just not use slicing, but eh
export type SetStore = Parameters<StateCreator<AppStore>>[0];
export type GetStore = Parameters<StateCreator<AppStore>>[1];
export type StoreCreator<T> = (s: SetStore, g: GetStore) => T;

const getInitialTheme = (): 'light' | 'dark' => {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'light';
};

export const useAppStore = create<AppStore>((set: SetStore, get: GetStore) => ({
  ...PluginStore(set, get),
  ...NavigationStore(set, get),
  theme: getInitialTheme(),
  setTheme(theme: 'light' | 'dark') {
    set(state => ({
      ...state,
      theme,
    }));
    localStorage.setItem('theme', theme);
  },
}));
