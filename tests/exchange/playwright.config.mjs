import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.mjs', timeout: 60_000, workers: 1,
  use: { baseURL: process.env.PHONE_URL ?? 'http://127.0.0.1:5173', ignoreHTTPSErrors: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  outputDir: '../../test-results/exchange', reporter: [['list']],
});
