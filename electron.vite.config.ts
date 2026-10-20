import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    build: {
      // A sandboxed preload script must be a single CommonJS file with no external imports.
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
});
