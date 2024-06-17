import React, { ReactNode, useEffect } from 'react';
import DialogProvider from './DialogProvider';
import { Backdrop, Box, CircularProgress, Container } from '@mui/material';
import { useSelector } from 'react-redux';
import { AppState } from '@redux/store';

export default function AppProvider() {
  const loading = useSelector((state: AppState) => state.overlay.loading);
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
