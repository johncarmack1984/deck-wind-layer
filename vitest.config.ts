import { defineConfig } from 'vitest/config';

// Unit tests run from the repo root (the demo's vite.config.ts sets root:
// 'examples', which isn't what we want here). The GLSL `?raw` imports resolve
// through vitest's built-in vite pipeline.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
