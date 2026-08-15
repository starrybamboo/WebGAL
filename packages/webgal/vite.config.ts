/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import loadVersion from 'vite-plugin-package-version';
import { resolve } from 'path';
import Info from 'unplugin-info/vite';
import viteCompression from 'vite-plugin-compression';

// https://vitejs.dev/config/

// @ts-ignore
const env = process.env.NODE_ENV;
console.log(env);

export default defineConfig({
  plugins: [
    react(),
    loadVersion(),
    Info(),
    viteCompression({
      filter: /^(.*assets).*\.(js|css|ttf)$/,
    }),
    // @ts-ignore
    // visualizer(),
  ],
  resolve: {
    alias: {
      '@': resolve('src'),
    },
  },
  build: {
    // sourcemap: true,
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'c8',
      all: true,
      include: [
        'src/Core/character/characterFigureService.ts',
        'src/Core/character/characterFacialRig.ts',
        'src/Core/character/characterFigureSource.ts',
        'src/Core/character/characterFigureSourceSync.ts',
        'src/Core/character/characterImageComposer.ts',
        'src/Core/character/characterTemplate.ts',
        'src/Core/controller/stage/pixi/BitmapFaceAdapter.ts',
        'src/Core/figure/figureFaceRuntime.ts',
        'src/Core/figure/speechSignal.ts',
        'src/Core/figure/deferredFigurePresentation.ts',
        'src/Core/figure/deferredFigurePresentationRuntime.ts',
        'src/Core/figure/figureTarget.ts',
        'src/Core/gameScripts/character.ts',
        'src/Core/gameScripts/pixi/index.ts',
        'src/Core/gameScripts/say.ts',
        'src/Core/gameScripts/vocal/index.ts',
        'src/Core/util/pixiPerformManager/pixiPerformManager.ts',
        'src/Core/util/pixiPerformManager/runtimePixiPerformLoader.ts',
        'src/Core/util/prefetcher/characterPrefetcher.ts',
      ],
      lines: 70,
      branches: 70,
      functions: 70,
      statements: 70,
    },
  },
});
