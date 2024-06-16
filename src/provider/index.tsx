import React, { ReactNode, useEffect } from 'react';
import DialogProvider from './DialogProvider';
import { Backdrop, Box, CircularProgress, Container } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '@redux/store';
import { loadPlugins } from './plugins';
import { hideLoading } from '@redux/overlaySlice';

export default function AppProvider() {
  const loading = useSelector((state: AppState) => state.overlay.loading);
  const dispatch = useDispatch();

  useEffect(() => {
    loadPlugins().then(() => dispatch(hideLoading()));
  }, []);
  return (
    <Container sx={{ position: 'absolute' }}>
      <Backdrop
        open={loading}
        sx={{ color: '#fff', zIndex: theme => theme.zIndex.appBar + 1 }}
      >
        <Box sx={{ p: 4, bgcolor: 'InfoBackground' }}>
          <CircularProgress color="primary" />
        </Box>
      </Backdrop>
      <DialogProvider />
    </Container>
  );
}
