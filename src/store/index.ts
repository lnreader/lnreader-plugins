import { create, StateCreator } from 'zustand';
import { PluginStore } from './pluginStore';
import { DialogStore } from './dialogStore';
import { OverlayStore } from './overlayStore';
import { NavigationStore } from './navigationStore';

export type AppStore = DialogStore &
  OverlayStore &
  PluginStore &
  NavigationStore & {
    useSwitches: boolean;
    setUseSwitches(value: boolean): void;
  };

// Helper types to use "slicing" like in Redux... We could just not use slicing, but eh
export type SetStore = Parameters<StateCreator<AppStore>>[0];
export type GetStore = Parameters<StateCreator<AppStore>>[1];
export type StoreCreator<T> = (s: SetStore, g: GetStore) => T;

export const useAppStore = create<AppStore>((set: SetStore, get: GetStore) => ({
  ...DialogStore(set, get),
  ...OverlayStore(set, get),
  ...PluginStore(set, get),
  ...NavigationStore(set, get),
  useSwitches: !!localStorage.getItem('useSwitches'),
  setUseSwitches(uS: boolean) {
    set(state => ({
      ...state,
      useSwitches: uS,
    }));
    if (uS) localStorage.setItem('useSwitches', 'true');
    else localStorage.removeItem('useSwitches');
  },
}));
