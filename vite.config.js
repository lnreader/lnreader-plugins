import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react({ devTarget: 'es5' })],
  resolve: {
    alias: {
      '@libs': path.resolve(__dirname, './src/libs'),
      '@icons': path.resolve(__dirname, './src/icons'),
      '@components': path.resolve(__dirname, './src/components'),
      '@redux': path.resolve(__dirname, './src/redux'),
      '@provider': path.resolve(__dirname, './src/provider'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@typings': path.resolve(__dirname, './src/types'),
      '@scripts': path.resolve(__dirname, './scripts'),
    },
  },
  server: {
    port: 3000,
  },
});
