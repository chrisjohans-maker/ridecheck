import { defineConfig } from 'vite';

// Single-page app: root index.html is Vite's default entry.
// Config is .mjs (ESM) on purpose so package.json can stay CommonJS-default,
// which keeps the Netlify functions in netlify/functions/*.js (exports.handler) working.
export default defineConfig({
  build: {
    outDir: 'dist',
  },
});
