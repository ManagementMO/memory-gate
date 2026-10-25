// Browser regression for the real room event handler, caption components and voice selection. No provider keys or
// backend needed: the gateway is covered by memory-translation.test.ts; here only the voice engine is a test double.
// Start Gate, then: node apps/gate/scripts/translation-check.mjs [http://localhost:5180]
import assert from 'node:assert/strict';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { launchBrowser } from './browser.mjs';

const base = process.argv[2] ?? 'https://localhost:5180';
const harness = new URL('../.translation-check.html', import.meta.url);
const output = process.env.TRANSLATION_CHECK_OUTPUT;
const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#141326"><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Captions } from './src/ui/Captions';
import { useGate } from './src/state/store';
import { useSocial } from './src/social/store';
import { socialLink } from './src/social/link';
import { flow } from './src/flow/controller';
import './src/styles/tokens.css';
import './src/styles/glass.css';
import './src/styles/app.css';
window.voiced = [];
flow.engine = { say: async (text, language) => { window.voiced.push({ text, language }); }, hush() {} };
useSocial.setState({ memberId: 'lily' });
useGate.setState({ stage: 'gathering' });
window.testRoom = { receive: (m) => socialLink.receive(m), gate: useGate, social: useSocial };
createRoot(document.getElementById('root')).render(React.createElement(Captions));
</script></body></html>`;

const words = { id: 'spanish-memory', memberId: 'rosa', name: 'Rosa', text: 'Mi abuela tenía una cocina amarilla.', language: 'es', english: 'My grandmother had a yellow kitchen.' };
const line = { type: 'companion', id: 'reply', text: 'La cocina amarilla, un lugar especial.', intent: 'chat', scripted: true, language: 'es', speakIn: 'es', replyEnglish: 'The yellow kitchen, a special place.', intentFor: 'rosa' };
let browser, created = false;
try {
  await writeFile(harness, html, { flag: 'wx' });
  created = true;
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/.translation-check.html`);
  await page.waitForFunction(() => !!window.testRoom);

  await page.evaluate((heard) => window.testRoom.receive({ type: 'translation', heard: [heard] }), words);
  await expect(page.getByTestId('memory-english')).toContainText(words.english);
  await expect(page.locator('[lang="es"]')).toHaveText(`“${words.text}”`);
  assert.equal(await page.evaluate(() => window.testRoom.gate.getState().spoken), 'en');
  // A translation event alone must display words, even if the companion has no reply.
  assert.deepEqual(await page.evaluate(() => window.voiced), []);
  await page.evaluate((message) => window.testRoom.receive(message), line);
  await expect(page.getByTestId('companion-line')).toHaveAttribute('data-full', line.replyEnglish);
  await expect(page.getByTestId('companion-line')).toHaveAttribute('lang', 'en');
  assert.deepEqual(await page.evaluate(() => window.voiced[0]), { text: line.replyEnglish, language: 'en' });
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: `${output}/translation-desktop.png` }); }

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.getByTestId('memory-translations').boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  if (output) await page.screenshot({ path: `${output}/translation-mobile.png` });

  // The Spanish speaker's own device follows their words, keeps Spanish playback, and shows no self-translation.
  await page.evaluate(() => { window.testRoom.social.setState({ memberId: 'rosa' }); window.voiced = []; });
  await page.evaluate((heard) => window.testRoom.receive({ type: 'translation', heard: [heard] }), words);
  assert.equal(await page.evaluate(() => window.testRoom.gate.getState().spoken), 'es');
  await expect(page.getByTestId('memory-translations')).toHaveCount(0);
  await page.evaluate((message) => window.testRoom.receive(message), line);
  await expect(page.getByTestId('companion-line')).toHaveAttribute('data-full', line.text);
  await expect(page.getByTestId('companion-line')).toHaveAttribute('lang', 'es');
  assert.deepEqual(await page.evaluate(() => window.voiced[0]), { text: line.text, language: 'es' });

  await page.evaluate(() => { window.testRoom.social.setState({ memberId: 'lily' }); window.testRoom.gate.getState().setLanguage('en'); });
  await page.evaluate((heard) => window.testRoom.receive({ type: 'translation', heard: [{ ...heard, english: null }] }), words);
  await expect(page.getByTestId('memory-english')).toHaveText('English translation is unavailable right now.');
  await page.evaluate(() => window.testRoom.gate.getState().clearLines());
  await expect(page.getByTestId('memory-translations')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS: English captions and voice, Spanish speaker isolation, quiet translation, mobile bounds, missing translation, and reset; no browser errors.');
} finally {
  await browser?.close();
  if (created) await unlink(harness);
}
