import { defineConfig } from 'vite';

// One id per build: baked into the bundle as __BUILD_ID__ and emitted to
// dist/version.json. The running app compares the two to detect a new deploy.
const BUILD_ID = String(Date.now());

// Single-page app: root index.html is Vite's default entry.
// Config is .mjs (ESM) on purpose so package.json can stay CommonJS-default,
// which keeps the Netlify functions in netlify/functions/*.js (exports.handler) working.
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
  build: {
    outDir: 'dist',
  },
  test: {
    // Pure logic only — no DOM needed.
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
