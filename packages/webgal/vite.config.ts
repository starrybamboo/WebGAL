import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import loadVersion from 'vite-plugin-package-version';
import { resolve } from 'path';
import Info from 'unplugin-info/vite';
import viteCompression from 'vite-plugin-compression';

// https://vitejs.dev/config/

// @ts-ignore
const env = process.env.NODE_ENV;
const sharedEngineMode =
  process.env.WEBGAL_BUILD_TARGET === 'shared-engine' || process.env.npm_lifecycle_event === 'build:shared-engine';
console.log(env);

export default defineConfig({
  plugins: [
    react(),
    loadVersion(),
    Info(),
    !sharedEngineMode
      ? viteCompression({
          filter: /^(.*assets).*\.(js|css|ttf)$/,
        })
      : undefined,
    // @ts-ignore
    // visualizer(),
  ],
  css: sharedEngineMode
    ? {
        preprocessorOptions: {
          scss: {
            additionalData: '',
          },
        },
      }
    : undefined,
  resolve: {
    alias: {
      '@': resolve('src'),
    },
  },
  build: {
    // sourcemap: true,
  },
});
