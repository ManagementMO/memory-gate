// Real browser inputs for the local 2D concept. No backend or paid provider calls.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.REHEARSAL_URL || 'http://127.0.0.1:4187/rehearsal.html';
const out = new URL('../docs/red-kite/', import.meta.url);
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || 'chrome', headless: true });
const results = [], errors = [], externalRequests = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(String(e)));
page.on('request', r => { if (new URL(r.url()).origin !== new URL(base).origin) externalRequests.push(r.url()); });
const snap = () => page.evaluate(() => window.__redKite.snapshot());
const button = (name) => page.getByRole('button', { name, exact: true });
const next = () => page.getByRole('button', { name: 'Next story line' }).click();
const record = (name, evidence) => results.push({ name, status: 'passed', evidence });
try {
  await page.goto(base);
  await page.waitForFunction(() => window.__redKite);
  assert.equal((await snap()).identity, 'absent');
  await button('Try an uncertain object').click();
  assert.equal((await snap()).identity, 'absent');
  assert.equal((await snap()).proposal, null);
  assert.equal(await page.locator('#kite').getAttribute('opacity'), '0');
  record('Uncertain object identity does not create a kite', await snap());

  await button('Start again').click();
  await next();
  assert.equal((await snap()).identity, 'proposed');
  assert.equal((await snap()).color, null);
  await button('Use this look').click();
  assert.equal((await snap()).identitySource, 'fictional-02');
  assert.equal((await snap()).color, null);
  await next();
  assert.equal((await snap()).proposal, 'details');
  assert.equal((await snap()).color, null);
  await button('Leave this open').click();
  assert.equal((await snap()).color, null);
  assert.equal((await snap()).identity, 'accepted');
  record('Unknown color stays open, including after declining a detail proposal', await snap());

  await button('Start again').click();
  await next(); await button('Use this look').click();
  await next(); await button('Use this look').click();
  const chosen = await snap();
  assert.equal(chosen.color, 'red'); assert.equal(chosen.ribbon, 'cream');
  assert.equal(chosen.detailSource, 'fictional-03');
  assert.equal(chosen.choices.at(-1).meaning, 'illustration choice, not historical verification');
  record('Choosing an illustration retains its exact fictional source', chosen);

  const handle = await page.locator('#spool-handle').boundingBox();
  assert(handle);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 10, handle.y + handle.height / 2 - 90, { steps: 10 });
  const held = await snap();
  assert.equal(held.held, true); assert(held.spool.y < 620);
  await page.mouse.up();
  await page.waitForFunction(() => { const s = window.__redKite.snapshot(); return !s.held && s.spool.y >= 676; });
  assert.equal((await snap()).flying, true);
  record('Pointer grab and lift catches the breeze; release returns the spool to its dock', { held, released: await snap() });
  await page.screenshot({ path: new URL('references/rehearsal-chosen.png', out).pathname, fullPage: true });

  await button('Read sample aloud').click();
  await button('Pause').click();
  const paused = await snap();
  await page.waitForTimeout(180);
  assert.equal((await snap()).simulationSeconds, paused.simulationSeconds);
  assert.equal((await snap()).sampleSpeech, 'idle');
  assert.equal(await page.evaluate(() => window.speechSynthesis.pending), false);
  assert.equal(await page.locator('#accept').isEnabled(), false);
  assert.equal(await button('Start again').isEnabled(), false);
  record('Pause freezes motion, cancels sample speech and disables story changes', paused);
  await button('Continue when ready').click();
  assert.equal((await snap()).paused, false);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const b = document.getElementById('spool-handle').getBoundingClientRect();
    return b.width > 0 && b.left >= 0 && b.right <= innerWidth;
  }, null, { timeout: 3000 });
  assert.equal((await snap()).reducedMotion, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const mobileHandle = await page.locator('#spool-handle').boundingBox();
  assert(mobileHandle && mobileHandle.x >= 0 && mobileHandle.x + mobileHandle.width <= 390);
  await page.screenshot({ path: new URL('references/rehearsal-mobile.png', out).pathname, fullPage: true });
  record('Mobile layout has no horizontal overflow and keeps the spool accessible; reduced-motion mode is detected', { viewport: [390, 844], handle: mobileHandle });

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  record('No page errors or external service requests', { errors, externalRequests });
} finally {
  writeFileSync(new URL('rehearsal-check.json', out), JSON.stringify({ kind: 'Actual Playwright input in local 2D concept; not an XR or clinical evaluation', at: new Date().toISOString(), results, errors, externalRequests }, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ passed: results.length, errors: errors.length, report: 'docs/red-kite/rehearsal-check.json' }));
