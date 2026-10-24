// Playwright e2e for the phone app against the RUNNING local Convex backend (live flags: the typed line goes to
// Claude). The phone dev server is started here if it isn't already running (it binds 0.0.0.0:5173 and proxies /api).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.mjs$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: path.join(repoRoot, 'test-results', 'e2e'),
  use: {
    baseURL: process.env.PHONE_URL ?? 'http://127.0.0.1:5173',
    browserName: 'chromium',
    // The bundled Chromium (revision 1248) is installed; set E2E_CHANNEL=chrome to use the system Chrome instead.
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm --prefix apps/phone run dev',
    cwd: repoRoot,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
