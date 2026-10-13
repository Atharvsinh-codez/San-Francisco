import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0
  }
});
