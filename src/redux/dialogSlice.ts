import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export enum EDialog {}

interface DialogState {
  activeDialogs: EDialog[];
}

const initialState: DialogState = { activeDialogs: [] };

export const dialogSlice = createSlice({
  name: 'dialog',
  initialState: initialState,
  reducers: {
    showDialog(state, action: PayloadAction<EDialog>) {
      state.activeDialogs = [...state.activeDialogs, action.payload];
    },
    hideDialog(state, action: PayloadAction<EDialog>) {
      state.activeDialogs = state.activeDialogs.filter(
        dialog => dialog !== action.payload,
      );
    },
    hideAllDialogs(state) {
      state.activeDialogs = [];
    },
  },
});

export const { showDialog, hideDialog } = dialogSlice.actions;

export default dialogSlice.reducer;
