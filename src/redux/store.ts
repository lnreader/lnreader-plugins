import { configureStore } from '@reduxjs/toolkit';
import dialogReducer from './dialogSlice';
import overlaySlice from './overlaySlice';
import pluginReducer from './pluginSlice';

const store = configureStore({
  reducer: {
    dialog: dialogReducer,
    overlay: overlaySlice,
    plugin: pluginReducer,
  },
});

export default store;
export type AppState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
