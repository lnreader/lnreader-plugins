import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import { proxyHandlerMiddle, proxySettingMiddleware } from './proxy';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    nodePolyfills(),
    react({ devTarget: 'es5' }),
    {
      name: 'proxy',
      configureServer: server => {
        server.middlewares.use('/settings', proxySettingMiddleware);
        server.middlewares.use('/https:', proxyHandlerMiddle);
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@plugins': path.resolve(dirname, './plugins'),
      '@libs': path.resolve(dirname, './src/libs'),
    },
  },
  server: {
    port: 3000,
    host: true,
    open: true,
  },
});
