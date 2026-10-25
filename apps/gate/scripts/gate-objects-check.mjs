// The general Gate journey, not the dedicated kite route. All provider flags are forced off by the room.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const browser = await launchBrowser(), base = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }));
const page = await context.newPage();
const errors = [], checks = [], out = '.logs/place-object-evidence'; mkdirSync(out, { recursive: true });
page.on('pageerror', error => errors.push(error.message));
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
try {
  await page.goto(`${base}/?mode=offline&voice=off&memory=red-kite&emulate=1`); await page.getByTestId('begin').click();
  await page.waitForFunction(() => window.__gate?.store.getState().stage === 'gathering', null, { timeout: 30000 });
  await page.getByTestId('choose-grandparent').click();
  await page.waitForFunction(() => window.__social.store.getState().status === 'live', null, { timeout: 20000 });
  await page.evaluate(() => window.__gate.flow.testHear('Our afternoon in the park, with flowers and a wooden bench.'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__gate.flow.testHear('Yes, let us go there together.'));
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 90000 });
  await check('the main memory experience exposes the optional place/object workflow over live Spacetime perspectives', async () => {
    await page.getByTestId('places-objects').click(); await expect(page.getByTestId('object-workshop')).toBeVisible();
    await page.getByTestId('sample-place').click(); await page.getByTestId('approve-place').click();
    await page.getByTestId('object-model').selectOption('builtin:bench');
    await page.getByTestId('object-note').fill('A bench to talk about our afternoons together.');
    await page.getByTestId('create-object').click(); await expect(page.getByTestId('gate-object-source')).toContainText('Private model preview');
    await page.waitForFunction(() => window.__memoryObjectScene?.snapshot().some(o => o.loaded && o.preview));
    await page.getByRole('button', { name: 'Place this object', exact: true }).click();
    await page.waitForFunction(() => window.__memoryObjectScene.snapshot().some(o => o.loaded && !o.preview));
  });
  await check('the main POV picker hides the grandparent model from the grandchild view', async () => {
    await page.getByRole('button', { name: 'Close source' }).click();
    // Drive the same exported perspective action as the wrist and existing X-controller button.
    await page.evaluate(() => window.__social.setViewing('child'));
    await page.waitForFunction(() => window.__social.store.getState().viewing === 'child' && window.__memoryObjectScene.snapshot().length === 0);
    await page.evaluate(() => window.__social.setViewing('grandparent'));
    await page.waitForFunction(() => window.__memoryObjectScene.snapshot().length === 1);
    await page.screenshot({ path: `${out}/main-gate-object.png` });
  });
  await check('the main experience renders the selected object source inside an actual immersive session', async () => {
    await page.getByTestId('places-objects').click(); await page.getByTestId('preview-object').click();
    await expect(page.getByTestId('gate-object-source')).toBeVisible();
    await page.waitForFunction(() => window.__memoryObjectScene.emulator());
    await page.evaluate(() => { const d = window.__memoryObjectScene.emulator(); if (d.devui) { d.devui.devUIContainer.style.display = 'none'; d.devui.render = () => undefined; } d.ipd = .064; d.stereoEnabled = true; });
    await page.getByTestId('enter-vr').click(); await page.waitForFunction(() => window.__memoryObjectScene.xr() && window.__memoryObjectScene.sourcePanel()?.sourceId);
    await expect(page.getByTestId('gate-object-source')).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.__memoryObjectScene.companionCaptions()), false, 'companion captions must not draw over the source');
    await page.waitForTimeout(700); await page.screenshot({ path: `${out}/main-vr-source.png` });
  });
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/main-checks.json`, JSON.stringify({ checks, errors, perspectiveBackend: 'SpacetimeDB', room: 'immutable offline sample', paidCalls: 0 }, null, 2));
} catch (error) {
  writeFileSync(`${out}/main-failure.json`, JSON.stringify({ error: String(error), stage: await page.evaluate(() => window.__gate?.store.getState().stage), notice: await page.locator('[role=alert]').allTextContents(), errors }, null, 2)); throw error;
} finally { await browser.close(); }
