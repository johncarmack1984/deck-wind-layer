import { defineConfig } from 'vite';

// Library build: a single ESM bundle of the layer, with deck.gl / luma.gl (and
// their math/loader peers) left external — consumers bring their own. Types are
// emitted separately by `tsc -p tsconfig.build.json`. The demo dev server lives
// in vite.config.ts.
export default defineConfig({
  // Don't copy the demo's public/ (sample wind.png) into the library dist.
  publicDir: false,
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        /^@deck\.gl\//,
        /^@luma\.gl\//,
        /^@math\.gl\//,
        /^@loaders\.gl\//,
        /^@probe\.gl\//,
      ],
    },
    sourcemap: false,
    // Ship readable, unminified ESM — it's a small layer and being inspectable
    // is worth more than a few saved kB.
    minify: false,
    emptyOutDir: true,
    target: 'es2022',
  },
});
