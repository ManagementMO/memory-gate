import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRoomWithConsent, deleteOwnedRoom, repoRoot } from './helpers.mjs';

test('phone microphone sends real recognized words and a replayable original clip; cancel discards a turn', async () => {
  test.skip(process.env.E2E_LIVE !== '1', 'Explicit live-provider check: npm run e2e:live.');
  test.setTimeout(75_000);
  const file = path.join(repoRoot, 'evidence/raw/voice-check-mic-16k.wav');
  test.skip(!existsSync(file), 'Run the live voice-check script first to create the synthesized speech fixture.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`] });
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5173' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await createRoomWithConsent(page, { title: 'Synthetic phone speech test', name: 'Ana (synthetic test)',
      scopes: { voice_recording: true, vendor_upload_modal: false, vendor_upload_worldlabs: false } });
    await page.getByTestId('tab-story').click();
    await page.getByTestId('voice-enable').click();
    await expect(page.getByTestId('voice-record')).toBeVisible({ timeout: 35_000 });
    await page.getByTestId('voice-record').click();
    await expect(page.getByTestId('story-recorder')).toHaveAttribute('data-state', 'listening');
    await page.waitForTimeout(7200); // one complete spoken fixture loop, with silence at either end
    await page.getByTestId('voice-record').click();
    const utterance = page.getByTestId('utterance-item').first();
    await expect(utterance.getByTestId('utterance-text')).toContainText(/piano/i, { timeout: 20_000 });
    await expect(utterance).toContainText('Ana (synthetic test)');
    await expect(utterance.getByTestId('replay')).toBeVisible();
    const count = await page.getByTestId('utterance-item').count();
    await expect(page.getByTestId('story-recorder')).toHaveAttribute('data-state', 'idle');
    await page.getByTestId('voice-record').click();
    await page.waitForTimeout(600);
    await page.getByTestId('voice-disconnect').click();
    await expect(page.getByTestId('voice-enable')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('utterance-item')).toHaveCount(count);
    expect(errors).toEqual([]);
  } finally { await deleteOwnedRoom(page); await browser.close(); }
});
