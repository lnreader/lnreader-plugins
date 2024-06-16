import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Plugin } from '@typings/plugin';

const initialState: {
  selected?: Plugin.PluginItem;
} = {
  selected: undefined,
};

export const pluginSlice = createSlice({
  name: 'plugin',
  initialState: initialState,
  reducers: {
    selectPlugin(state, acion: PayloadAction<Plugin.PluginItem>) {
      state.selected = acion.payload;
    },
  },
});

export const { selectPlugin } = pluginSlice.actions;

export default pluginSlice.reducer;
