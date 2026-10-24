// Smoke tests: convex-test runs every Convex function in-process (no backend binary, no network). Flags default to
// all false here, so every provider call takes its mock/fixture path (CLAUDE.md "Convex -> Tests", V19).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    include: ['tests/smoke/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
