import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  loading: false,
};

export const overlaySlice = createSlice({
  name: 'overlay',
  initialState: initialState,
  reducers: {
    showLoading(state) {
      state.loading = true;
    },
    hideLoading(state) {
      state.loading = false;
    },
  },
});

export const { showLoading, hideLoading } = overlaySlice.actions;

export default overlaySlice.reducer;
