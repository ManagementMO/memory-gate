// Actual UI, Convex, cached GLBs and IWER. All external paid providers stay off.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const browser = await launchBrowser(), base = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
const out = '.logs/place-object-evidence'; mkdirSync(out, { recursive: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }));
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
const snap = p => p.evaluate(() => window.__memoryObjectScene?.snapshot() ?? []);
const ready = p => expect(p.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 90000 });
const check = async (name, fn) => { try { await fn(); checks.push(name); console.log('PASS ' + name); } catch (e) { writeFileSync(`${out}/failure.json`, JSON.stringify({ name, error: String(e), objects: await snap(page), story: await page.evaluate(() => window.__redKite3D?.snapshot()) }, null, 2)); throw e; } };
async function button(hand, key) {
  await page.evaluate(({ hand, key }) => window.__redKite3D.emulator().controllers[hand].updateButtonValue(key, 1), { hand, key }); await page.waitForTimeout(200);
  await page.evaluate(({ hand, key }) => window.__redKite3D.emulator().controllers[hand].updateButtonValue(key, 0), { hand, key }); await page.waitForTimeout(200);
}
let viewer, modelId;
try {
  await page.goto(`${base}/?story=red-kite&emulate=1&objects=1`); await ready(page);
  await check('place references require review and optional models start as private previews', async () => {
    await expect(page.getByTestId('object-workshop')).toBeVisible(); await expect(page.getByTestId('find-place')).toBeDisabled();
    await page.getByTestId('sample-place').click(); await expect(page.getByTestId('place-result')).toHaveCount(1);
    await page.getByTestId('approve-place').click(); await expect(page.getByTestId('approved-place')).toHaveCount(1);
    const code = await page.evaluate(() => JSON.parse(localStorage.getItem('mg.red-kite.session.owner')).code);
    viewer = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await viewer.goto(`${base}/?story=red-kite&room=${code}&lite=1`); await ready(viewer);
    await page.getByTestId('object-note').fill('The little bridge reminds me of walking to the park together.');
    await page.getByTestId('create-object').click(); await expect(page.getByTestId('model-preview')).toContainText('Private preview');
    await page.waitForFunction(() => window.__memoryObjectScene?.snapshot().some(o => o.loaded && o.preview));
    modelId = (await snap(page))[0].id; assert.equal((await snap(viewer)).length, 0);
    const frame = await page.evaluate(() => window.__redKite3D.snapshot().frames);
    await page.waitForFunction(frame => window.__redKite3D.snapshot().frames > frame + 30, frame);
    await page.screenshot({ path: `${out}/private-bridge.png` });
  });
  await check('explicit placement shares the real model and switching POV preserves the other viewer', async () => {
    await page.getByTestId('approve-preview').click(); await expect(page.getByTestId('model-preview')).toContainText('Reviewed illustration');
    await viewer.waitForFunction(id => window.__memoryObjectScene?.snapshot().some(o => o.id === id && o.loaded && !o.preview), modelId);
    await page.getByRole('button', { name: 'Close preview', exact: true }).click();
    await page.getByTestId('perspective-rosa').click(); await page.waitForFunction(() => window.__redKite3D.snapshot().selected === 'rosa' && window.__redKite3D.snapshot().phase === 'idle');
    assert.equal((await snap(page)).length, 0); assert.equal((await snap(viewer)).length, 1);
    await page.getByTestId('perspective-elena').click(); await page.waitForFunction(() => window.__redKite3D.snapshot().selected === 'elena' && window.__redKite3D.snapshot().phase === 'idle');
    await page.waitForFunction(() => window.__memoryObjectScene.snapshot().length === 1);
  });
  await check('a real controller ray selects the placed model and opens its source inside VR', async () => {
    await page.waitForFunction(() => window.__redKite3D.emulator());
    await page.evaluate(() => { const d = window.__redKite3D.emulator(); if (d.devui) { d.devui.devUIContainer.style.display = 'none'; d.devui.render = () => undefined; } d.ipd = .064; d.stereoEnabled = true; });
    await page.getByTestId('enter-vr').click(); await page.waitForFunction(() => window.__redKite3D.snapshot().xr && window.__redKite3D.snapshot().inputSources.filter(s => s.type === 'controller').length === 2);
    await page.evaluate(() => {
      const o = window.__memoryObjectScene.snapshot()[0], s = window.__redKite3D.snapshot(), c = window.__redKite3D.emulator().controllers.right;
      const dx = o.position[0] - s.origin[0], dz = o.position[2] - s.origin[2], cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      const x = cy * dx - sy * dz, y = o.position[1] + .4, z = sy * dx + cy * dz;
      c.position.set(.3, 1.1, -.5); const vx = x - .3, vy = y - 1.1, vz = z + .5, len = Math.hypot(vx, vy, vz);
      const qx = vy / len, qy = -vx / len, qw = 1 - vz / len, norm = Math.hypot(qx, qy, qw); c.quaternion.set(qx / norm, qy / norm, 0, qw / norm);
    });
    await page.waitForTimeout(400); await button('right', 'trigger');
    await page.waitForFunction(id => window.__redKite3D.snapshot().sourcePanel?.sourceId === id, modelId);
    await page.screenshot({ path: `${out}/vr-bridge-source.png` });
    await button('right', 'b-button'); await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    await button('right', 'b-button'); await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'false');
    await button('left', 'x-button'); await page.waitForFunction(() => window.__redKite3D.snapshot().selected === 'rosa' && window.__redKite3D.snapshot().phase === 'idle' && window.__memoryObjectScene.snapshot().length === 0);
    await button('left', 'y-button'); await page.waitForFunction(() => !window.__redKite3D.snapshot().xr);
  });
  await check('hide and source removal update another device and preserve the kite story', async () => {
    await page.getByTestId('places-objects').click(); await page.getByTestId('hide-object').click();
    await viewer.waitForFunction(() => window.__memoryObjectScene.snapshot().length === 0);
    await page.getByRole('button', { name: 'Remove place and its objects' }).click(); await expect(page.getByTestId('object-candidate')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close places and objects' }).click();
    await expect(page.getByTestId('story-quote')).toContainText('From beside the oak');
  });
  await check('a direct family photo is stored privately and can be approved without Apify', async () => {
    await page.getByTestId('photo-sources').click(); await page.getByLabel('I have permission').check();
    await page.getByTestId('family-photo').setInputFiles('fixtures/sample-photo-1938.jpg');
    await page.getByTestId('upload-family-photo').click(); await expect(page.getByTestId('draft-source')).toContainText('Family photo · direct upload');
    await viewer.getByTestId('photo-sources').click(); await expect(viewer.getByTestId('draft-source')).toHaveCount(0);
    await page.getByTestId('attach-source').click(); await expect(viewer.getByTestId('approved-source')).toContainText('Family photo');
    await page.getByTestId('photo-to-object').click(); await expect(page.getByTestId('object-workshop')).toBeVisible();
    await expect(page.getByTestId('object-reference')).toHaveValue(/photo:/);
    await page.getByTestId('object-model').selectOption('image'); await expect(page.getByTestId('create-object')).toBeDisabled();
  });
  assert.deepEqual(errors, []); writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors, paidCalls: 0, note: 'Actual Convex, original GLBs and IWER. Live Apify/Tripo and physical Quest are not verified.' }, null, 2));
} finally { await browser.close(); }
