// Shared e2e helpers: evidence screenshots, the LAN address, a direct Convex client for setup, and a tiny WAV.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');
export const SCREENS = path.join(repoRoot, 'evidence', 'review-2026-10-23', 'screens');

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
export const IPHONE_13 = iphone; // 390 × 844 at 3×, touch, mobile UA (run in Chromium)

/** Full-page evidence shot from the top of the page, with transient toasts hidden. */
export async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SCREENS, `phone-${name}.png`), fullPage: true, animations: 'disabled', style: '.toasts{display:none!important}' });
}

export function backend() {
  const env = readFileSync(path.join(repoRoot, '.env.local'), 'utf8');
  const url = env.match(/^CONVEX_URL=(.+)$/m)?.[1]?.trim() ?? 'http://127.0.0.1:3210';
  return { client: new ConvexHttpClient(url), api };
}

export function lanIp() {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  for (const name of ['en0', 'en1', ...Object.keys(os.networkInterfaces())]) {
    const hit = (os.networkInterfaces()[name] ?? []).find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    if (hit) return hit.address;
  }
  return null;
}

/** 0.8 s, 16 kHz mono PCM WAV (a soft 440 Hz tone) standing in for a recorded clip. */
export function wav(seconds = 0.8, rate = 16000) {
  const n = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000 * Math.min(1, i / 800, (n - i) / 800)), 44 + i * 2);
  return b;
}

/** Create a room on the phone UI and give consent. Returns the room code. */
export async function createRoomWithConsent(page, { title, name, scopes = {}, sample = false }) {
  await page.goto(process.env.E2E_LIVE === '1' ? '/' : '/?mode=offline');
  await expect(page.getByTestId('welcome')).toBeVisible();
  if (sample) await page.getByTestId('create-sample').check();
  if (title) await page.getByTestId('create-title').fill(title);
  await page.getByTestId('create-name').fill(name);
  await page.getByTestId('create-submit').click();
  await expect(page.getByTestId('consent-screen')).toBeVisible();
  for (const [scope, on] of Object.entries(scopes)) await page.getByTestId(`scope-${scope}`).setChecked(on);
  await page.getByTestId('consent-submit').click();
  await expect(page.getByTestId('consent-row').first()).toContainText(name);
  return page.getByTestId('room-code').getAttribute('data-code');
}

export const objectItem = (page, label) => page.locator(`[data-testid="object-item"][data-label="${label}"]`);

/** Delete the room this page owns (keeps the shared local backend tidy). Set E2E_KEEP_ROOMS=1 to keep them. */
export async function deleteOwnedRoom(page) {
  if (process.env.E2E_KEEP_ROOMS) return;
  const raw = await page.evaluate(() => window.localStorage.getItem('memorygate.session.v1')).catch(() => null);
  if (!raw) return;
  const s = JSON.parse(raw);
  const { client, api } = backend();
  await client.mutation(api.consents.deleteMemory, { code: s.code, token: s.token, confirmText: s.code }).catch(() => {});
}

/** True when the page scrolls sideways (a layout defect on a narrow phone). */
export const overflowsX = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
