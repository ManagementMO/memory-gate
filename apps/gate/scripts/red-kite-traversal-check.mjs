// Real DOM/input, WebGL and WASM acceptance; local cached assets only.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const auth = JSON.parse(readFileSync('.logs/red-kite-demo-room.json', 'utf8'));
const origin = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const out = 'evidence/red-kite'; mkdirSync(out, { recursive: true });
const errors = [], checks = [], metrics = {};
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
const context = async (extra = {}) => {
  const c = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, ...extra });
  await c.addInitScript(s => localStorage.setItem('mg.red-kite.session.' + s.code, JSON.stringify({ code: s.code, token: s.token, role: 'family' })), auth);
  return c;
};
const open = async c => {
  const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  await p.goto(`${origin}/?story=red-kite&room=${auth.code}`);
  return p;
};
const ready = p => expect(p.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 60000 });
const snap = p => p.evaluate(() => window.__redKite3D.snapshot());
try {
  await check('a held run survives looking and releasing the mouse', async () => {
    const c = await context(), p = await open(c); await ready(p);
    await p.locator('canvas').focus(); await p.keyboard.down('ShiftLeft'); await p.keyboard.down('KeyW');
    await p.mouse.move(720, 210); await p.mouse.down(); await p.mouse.move(780, 210, { steps: 5 }); await p.mouse.up();
    await p.waitForTimeout(80); const start = await snap(p); await p.waitForTimeout(550); const end = await snap(p);
    await p.keyboard.up('KeyW'); await p.keyboard.up('ShiftLeft');
    const speed = (end.traversal.distance - start.traversal.distance) / (end.simulationTime - start.simulationTime);
    assert(speed > 2.6, 'releasing look-drag must not clear W or the held Shift modifier: ' + speed);
    metrics.runSpeed = speed; await p.screenshot({ path: `${out}/10-desktop-exploring.png` }); await c.close();
  });
  await check('all scenery quality modes render while retaining the real walking surface', async () => {
    const c = await context(), p = await open(c); await ready(p);
    await p.getByTestId('scene-options').locator('summary').click();
    for (const [quality, detail] of [['balanced', '500k'], ['lite', '100k'], ['detail', 'adaptive-full']]) {
      await p.getByTestId('meadow-detail').selectOption(quality);
      await p.waitForFunction(detail => window.__redKite3D?.snapshot().meadow?.detail === detail, detail);
      await ready(p);
      const s = await snap(p);
      assert(s.meadow.activeSplats > 10000 && s.meadow.opacity > .65, 'readiness must mean visible scenery, not only a parsed file');
      assert.equal(s.traversal.triangles, 51610); assert(s.traversal.grounded);
    }
    await p.getByTestId('scene-options').locator('summary').click();
    await p.locator('canvas').focus(); const before = await snap(p);
    await p.keyboard.down('KeyW'); await p.waitForTimeout(350); await p.keyboard.up('KeyW');
    assert((await snap(p)).traversal.distance - before.traversal.distance > .25, 'quality changes must not disable traversal');
    await c.close();
  });
  await check('a rejected collision surface remains an actionable error after the visual meadow loads', async () => {
    const c = await context();
    const broken = Buffer.from(readFileSync('apps/gate/public/red-kite/meadow-collider.glb'));
    const n = broken.readUInt32LE(12), j = JSON.parse(broken.subarray(20, 20 + n).toString());
    const a = j.accessors[j.meshes[0].primitives[0].attributes.POSITION], v = j.bufferViews[a.bufferView];
    const positions = new Float32Array(broken.buffer, broken.byteOffset + 28 + n + (v.byteOffset ?? 0) + (a.byteOffset ?? 0), a.count * 3);
    for (let i = 1; i < positions.length; i += 3) positions[i] += 1000;
    await c.route('**/red-kite/meadow-collider.glb', r => r.fulfill({ body: broken, contentType: 'model/gltf-binary' }));
    await c.route('**/api/storage/**', async r => { const response = await r.fetch(); await new Promise(resolve => setTimeout(resolve, 1300)); await r.fulfill({ response }); });
    const p = await open(c);
    await expect(p.getByTestId('story-notice')).toContainText('walking surface could not open', { timeout: 30000 });
    await p.waitForFunction(() => window.__redKite3D?.snapshot().meadow?.ready === true, null, { timeout: 60000 });
    await expect(p.getByTestId('story-notice')).toContainText('walking surface could not open');
    await expect(p.getByRole('button', { name: 'Retry scene' })).toBeVisible();
    await c.close();
  });
  await check('touch movement traverses real ground and releases cleanly', async () => {
    const c = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await open(c); await ready(p); await expect(p.getByTestId('walk-pad')).toBeVisible();
    const box = await p.getByTestId('walk-pad').boundingBox(), before = await snap(p);
    const client = await c.newCDPSession(p);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width/2, y: box.y + 10 }] });
    await p.waitForTimeout(1250);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(120); const after = await snap(p);
    assert(after.traversal.distance - before.traversal.distance > 1, 'touch pad must move the real character');
    await p.waitForTimeout(200); const released = await snap(p);
    assert(Math.hypot(released.origin[0] - after.origin[0], released.origin[2] - after.origin[2]) < .01, 'touch release must stop walking');
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    metrics.touchDistance = after.traversal.distance - before.traversal.distance;
    await p.screenshot({ path: `${out}/11-mobile-touch.png` });
    await p.getByTestId('toggle-panels').click(); await expect(p.getByTestId('story-quote')).toBeHidden();
    await p.screenshot({ path: `${out}/12-quiet-panels.png` }); await c.close();
  });
  assert.equal(errors.length, 0, errors.join('; '));
  writeFileSync(`${out}/traversal-browser-report.json`, JSON.stringify({ date: new Date().toISOString(), checks, metrics, pageErrors: errors, physicalQuestTested: false, providerCalls: 0 }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, metrics, pageErrors: errors.length }));
} finally { await browser.close(); }
