import { AppState } from '@redux/store';
import React from 'react';
import { useSelector } from 'react-redux';

export default function DialogProvider() {
  const activeDialogs = useSelector(
    (state: AppState) => state.dialog.activeDialogs,
  );

  return <></>;
}
