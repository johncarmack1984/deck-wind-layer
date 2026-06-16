import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Port 7373 is deliberately outside the crowded 51xx range that other ~/coding
// projects (stormdeck et al.) use; strictPort makes the dev loop fail loudly
// rather than silently drift onto a neighbour's port.
export default defineConfig({
  // The demo lives in examples/; the library build (vite.lib.config.ts) builds src/.
  root: 'examples',
  resolve: {
    alias: {
      // The example imports the package by name, exactly as a consumer would.
      // In this repo that name resolves to the live source so the dev loop has
      // no build step; published, it resolves to the package's dist.
      'deck-wind-layer': fileURLToPath(
        new URL('./src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 7373,
    strictPort: true,
  },
});
