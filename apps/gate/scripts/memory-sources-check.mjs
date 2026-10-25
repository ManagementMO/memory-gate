// Real browser → local Convex → approved source → native XR scene. No paid provider calls.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const browser = await launchBrowser(), origin = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
const host = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await host.addInitScript(() => Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }));
const page = await host.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
const out = '.logs/apify-evidence'; mkdirSync(out, { recursive: true });
const check = async (name, fn) => {
  try { await fn(); checks.push(name); console.log('PASS ' + name); }
  catch (error) { writeFileSync(`${out}/failure.json`, JSON.stringify({ check: name, state: await page.evaluate(() => window.__redKite3D?.snapshot()).catch(() => null) }, null, 2)); throw error; }
};
async function button(hand, key) {
  await page.evaluate(({ hand, key }) => window.__redKite3D.emulator().controllers[hand].updateButtonValue(key, 1), { hand, key });
  await page.waitForTimeout(200);
  await page.evaluate(({ hand, key }) => window.__redKite3D.emulator().controllers[hand].updateButtonValue(key, 0), { hand, key });
  await page.waitForTimeout(200);
}
try {
  await page.goto(`${origin}/?story=red-kite&emulate=1`);
  await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 90000 });
  let viewer, visitor;
  await check('offline example opens, requires permission, and persists a private photo preview', async () => {
    await page.getByTestId('photo-sources').click();
    await expect(page.getByTestId('sample-source')).toBeDisabled();
    await page.getByLabel('I have permission').check();
    await expect(page.getByTestId('import-posts')).toBeDisabled();
    await page.getByTestId('sample-source').click();
    await expect(page.getByTestId('draft-source')).toHaveCount(1);
    await expect(page.getByTestId('draft-source')).toContainText('Fictional example');
    const img = page.getByTestId('draft-source').locator('img'); await expect(img).toBeVisible();
    assert(await img.evaluate(i => i.complete && i.naturalWidth > 0));
    // Use the ordinary viewer link and independently joined browser, never a copied author token.
    const code = await page.evaluate(() => JSON.parse(localStorage.getItem('mg.red-kite.session.owner')).code);
    visitor = await browser.newContext({ ignoreHTTPSErrors: true }); viewer = await visitor.newPage();
    await viewer.goto(`${origin}/?story=red-kite&room=${code}&lite=1`);
    await expect(viewer.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 90000 });
    await viewer.getByTestId('photo-sources').click(); await expect(viewer.getByTestId('draft-source')).toHaveCount(0);
    await expect(viewer.getByTestId('sample-source')).toHaveCount(0);
  });
  await check('family approval shares the photo with a note, source label and chosen perspective', async () => {
    await page.getByLabel('A detail to talk about').fill('The cream ribbon reminds me of the one we tied together.');
    await page.getByTestId('attach-source').click(); await expect(page.getByTestId('approved-source')).toHaveCount(1);
    await expect(viewer.getByTestId('approved-source')).toContainText('cream ribbon');
    await page.screenshot({ path: `${out}/reviewed-source.png` });
    await page.getByRole('button', { name: 'Close photo sources' }).click();
    await page.reload(); await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 90000 });
    await expect(page.getByTestId('photo-sources')).toContainText('1');
  });
  await check('actual immersive rendering contains the photo and source card without a DOM overlay', async () => {
    await page.waitForFunction(() => window.__redKite3D?.emulator());
    await page.evaluate(() => { const d = window.__redKite3D.emulator(); if (d.devui) { d.devui.devUIContainer.style.display = 'none'; d.devui.render = () => undefined; } d.ipd = .064; d.stereoEnabled = true; });
    await page.getByTestId('enter-vr').click(); await page.waitForFunction(() => window.__redKite3D.snapshot().xr);
    await page.waitForFunction(() => window.__redKite3D.snapshot().inputSources.filter(s => s.type === 'controller').length === 2);
    // Native ray hits the existing centre-bottom "Photo sources" button.
    await page.evaluate(() => { const c = window.__redKite3D.emulator().controllers.right; c.position.set(0, .67, -.9); c.quaternion.set(0, 0, 0, 1); });
    await page.waitForTimeout(300); await button('right', 'trigger');
    await page.waitForFunction(() => window.__redKite3D.snapshot().sourcePanel?.sourceId != null);
    await page.waitForFunction(() => window.__redKite3D.snapshot().sourcePhotoReady);
    const frame = await page.evaluate(() => window.__redKite3D.snapshot().frames);
    await page.waitForFunction(frame => window.__redKite3D.snapshot().frames > frame + 10, frame);
    assert.equal(await page.getByTestId('source-library').count(), 0);
    await page.screenshot({ path: `${out}/native-photo.png` });
    await button('right', 'b-button'); await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    const before = await page.evaluate(() => window.__redKite3D.snapshot()); await page.waitForTimeout(350);
    const after = await page.evaluate(() => window.__redKite3D.snapshot()); assert.equal(after.simulationTime, before.simulationTime);
    await button('right', 'b-button');
    await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'false');
    await button('left', 'x-button');
    await page.waitForFunction(() => { const s = window.__redKite3D.snapshot(); return s.selected === 'rosa' && s.phase === 'idle' && s.sourcePanel?.sourceId === null; });
    await button('left', 'y-button'); await page.waitForFunction(() => !window.__redKite3D.snapshot().xr);
  });
  await check('removing the source updates the joined viewer immediately', async () => {
    await expect(page.getByTestId('source-library')).toBeVisible();
    await page.getByRole('button', { name: 'Remove from memory' }).click();
    await expect(viewer.getByTestId('approved-source')).toHaveCount(0);
  });
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors, note: 'Offline fixture, actual Convex and IWER. Live Apify and physical Quest unverified.' }, null, 2));
} finally { await browser.close(); }
