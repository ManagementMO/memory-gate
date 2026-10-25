// IWER's actual controller input and tracked poses drive the same XR event path as the app.
// This is emulated input evidence, never a physical Quest performance/comfort result.
import { expect } from '@playwright/test';
import { launchBrowser } from './browser.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const auth = JSON.parse(readFileSync('.logs/red-kite-demo-room.json', 'utf8'));
const origin = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
const lite = process.env.RED_KITE_LITE === '1';
const out = lite ? 'evidence/red-kite/lite' : 'evidence/red-kite'; mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await ctx.addInitScript(s => {
  Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true });
  localStorage.setItem('mg.red-kite.session.' + s.code, JSON.stringify({ code: s.code, token: s.token, role: 'family' }));
  sessionStorage.setItem('mg.red-kite.view.' + s.code, 'elena');
}, auth);
const page = await ctx.newPage(), errors = [], checks = [], samples = [];
page.on('pageerror', e => errors.push(e.message.slice(0, 400)));
const snap = () => page.evaluate(() => window.__redKite3D.snapshot());
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
async function button(hand, key, target = page) {
  await target.evaluate(({ hand, key }) => { window.__redKite3D.emulator().controllers[hand].updateButtonValue(key, 1); }, { hand, key });
  await target.waitForTimeout(160);
  await target.evaluate(({ hand, key }) => { window.__redKite3D.emulator().controllers[hand].updateButtonValue(key, 0); }, { hand, key });
  await target.waitForTimeout(160);
}
try {
  await page.goto(`${origin}/?story=red-kite&room=${auth.code}&emulate=1&lite=${lite ? 1 : 0}`);
  await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 60000 });
  await page.waitForFunction(() => window.__redKite3D.emulator() != null);
  await page.evaluate(() => {
    const dev = window.__redKite3D.emulator();
    // This pinned DevUI copies manual gizmo poses onto the device every frame. Disable only that
    // emulator UI while automated tracked poses drive real XR frames and pointer events.
    if (dev.devui) { dev.devui.devUIContainer.style.display = 'none'; dev.devui.devUICanvas.style.display = 'none'; dev.devui.render = () => undefined; }
    dev.ipd = .064; dev.stereoEnabled = true; // DevUI's constructor otherwise resets IPD to zero.
  });
  await expect(page.getByTestId('restart-story')).toBeEnabled(); await page.getByTestId('restart-story').click();
  await expect(page.getByTestId('story-quote')).toContainText('Rosa and I used to run');
  await page.getByTestId('next-line').click(); await page.getByTestId('use-look').click();
  await page.getByTestId('next-line').click(); await page.getByTestId('use-look').click();
  await expect(page.getByTestId('visual-status')).toContainText('red');
  await check('Enter Quest VR starts a real emulated immersive session with advancing frames', async () => {
    await page.getByTestId('enter-vr').click(); await page.waitForFunction(() => window.__redKite3D?.snapshot().xr === true);
    const first = await snap(); await page.waitForTimeout(800); const next = await snap();
    assert(next.frames > first.frames + 5); samples.push(next);
    await page.evaluate(() => { window.__redKite3D.emulator().devui?.devUIContainer?.setAttribute('style', 'display:none'); });
    await page.waitForFunction(() => window.__redKite3D.snapshot().inputSources.filter(s => s.type === 'controller').length === 2);
    await page.screenshot({ path: `${out}/07-xr-elena.png` });
  });
  await check('X controller input switches only after the XR mask covers both eyes', async () => {
    await button('left', 'x-button');
    await page.waitForFunction(() => { const s = window.__redKite3D.snapshot(); return s.selected === 'rosa' && s.phase === 'idle'; });
    const s = await snap(); assert.deepEqual(s.origin, [-2, 0, -4]); assert.equal(s.moves.at(-1).opacity, 1); samples.push(s);
    await page.screenshot({ path: `${out}/08-xr-rosa.png` });
  });
  await check('A controller input advances Rosa and native ray selection accepts her color-open kite', async () => {
    await button('right', 'a-button'); await expect(page.getByTestId('story-quote')).toContainText('I was holding');
    await page.evaluate(() => { const c = window.__redKite3D.emulator().controllers.right; c.position.set(-.38, .67, -.9); c.quaternion.set(0, 0, 0, 1); });
    await page.waitForTimeout(200); await button('right', 'trigger');
    await expect(page.getByTestId('visual-status')).toContainText('color left open');
    await button('right', 'a-button'); await expect(page.getByTestId('story-quote')).toContainText('orange');
    await button('right', 'trigger'); await expect(page.getByTestId('visual-status')).toContainText('orange');
    await page.screenshot({ path: `${out}/08-xr-rosa.png` });
  });
  await check('tracked head turns reveal the meadow periphery without moving its landmarks or selected origin', async () => {
    const before = await snap();
    for (const [name, yaw] of [['left', .9], ['right', -.9]]) {
      await page.evaluate(yaw => { const dev = window.__redKite3D.emulator(); dev.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)); }, yaw);
      await page.waitForTimeout(450); await page.screenshot({ path: `${out}/09-xr-rosa-${name}.png` });
      assert.deepEqual((await snap()).origin, before.origin);
    }
    await page.evaluate(() => window.__redKite3D.emulator().quaternion.set(0, 0, 0, 1));
  });
  await check('native controller pointer captures, lifts and safely releases the same spool', async () => {
    await button('left', 'x-button'); await page.waitForFunction(() => { const s = window.__redKite3D.snapshot(); return s.selected === 'elena' && s.phase === 'idle'; });
    await page.evaluate(() => {
      const s = window.__redKite3D.snapshot(), c = window.__redKite3D.emulator().controllers.right;
      const dx = s.spool[0] - s.origin[0], dz = s.spool[2] - s.origin[2], cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      c.position.set(cy * dx - sy * dz, s.spool[1], sy * dx + cy * dz + .4); c.quaternion.set(0, 0, 0, 1);
    });
    await page.waitForTimeout(180);
    await page.evaluate(() => window.__redKite3D.emulator().controllers.right.updateButtonValue('trigger', 1));
    await page.waitForFunction(() => window.__redKite3D.snapshot().held === true, null, { timeout: 5000 });
    await page.evaluate(() => { window.__redKite3D.emulator().controllers.right.position.y += .18; });
    await page.waitForTimeout(250); assert((await snap()).spool[1] > .9);
    await page.evaluate(() => window.__redKite3D.emulator().controllers.right.updateButtonValue('trigger', 0));
    await page.waitForTimeout(700); const s = await snap(); assert.equal(s.held, false); assert(s.grabs >= 1); samples.push(s);
    await page.evaluate(() => { window.__redKite3D.emulator().controllers.right.position.z -= .4; });
    await page.waitForTimeout(180);
    await page.evaluate(() => window.__redKite3D.emulator().controllers.right.updateButtonValue('squeeze', 1));
    await page.waitForFunction(() => window.__redKite3D.snapshot().held === true, null, { timeout: 5000 });
    await page.evaluate(() => { window.__redKite3D.emulator().controllers.right.position.y += .15; });
    await page.waitForTimeout(250); assert((await snap()).spool[1] > .9);
    await page.evaluate(() => window.__redKite3D.emulator().controllers.right.updateButtonValue('squeeze', 0));
    await page.waitForTimeout(500); assert.equal((await snap()).held, false);
  });
  await check('B controller input rests the actual simulation and locks perspective changes', async () => {
    await button('right', 'b-button');
    await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    const paused = await snap(); await page.waitForTimeout(300); assert.equal((await snap()).simulationTime, paused.simulationTime);
    await button('left', 'x-button'); assert.equal((await snap()).selected, 'elena');
  });
  await check('a read-only XR viewer cannot resume a host-paused scene with B; the host can continue', async () => {
    const peerContext = await browser.newContext({ viewport: { width: 1000, height: 700 }, ignoreHTTPSErrors: true });
    await peerContext.addInitScript(() => Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }));
    const peer = await peerContext.newPage(); peer.on('pageerror', e => errors.push(e.message.slice(0, 300)));
    try {
      await peer.goto(`${origin}/?story=red-kite&room=${auth.code}&emulate=1&lite=1`);
      await expect(peer.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 60000 });
      await peer.waitForFunction(() => window.__redKite3D.emulator() != null);
      await peer.evaluate(() => { const d = window.__redKite3D.emulator(); if (d.devui) { d.devui.devUIContainer.style.display = 'none'; d.devui.devUICanvas.style.display = 'none'; d.devui.render = () => undefined; } });
      await peer.getByTestId('enter-vr').click(); await peer.waitForFunction(() => window.__redKite3D.snapshot().xr);
      await peer.waitForFunction(() => window.__redKite3D.snapshot().inputSources.length === 2);
      await button('right', 'b-button', peer);
      await expect(peer.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
      const first = await peer.evaluate(() => window.__redKite3D.snapshot()); await peer.waitForTimeout(250);
      const next = await peer.evaluate(() => window.__redKite3D.snapshot());
      assert.equal(next.simulationTime, first.simulationTime); assert.equal(next.propsResting, true);
    } finally { await peerContext.close(); }
    await button('right', 'b-button'); await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'false');
  });
  await check('Y controller input leaves immersive mode', async () => {
    await button('left', 'y-button'); await page.waitForFunction(() => window.__redKite3D.snapshot().xr === false);
  });
  assert.equal(errors.length, 0, 'page errors: ' + errors.join('; '));
  writeFileSync(`${out}/xr-report.json`, JSON.stringify({ date: new Date().toISOString(), emulatedDevice: 'Meta Quest 3 via IWER', stereo: true, ipdMeters: .064, splats: lite ? 100000 : 500000, physicalQuestTested: false, checks, samples, pageErrors: errors }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, pageErrors: errors.length, physicalQuestTested: false }));
} catch (e) {
  await page.screenshot({ path: `${out}/zz-xr-failure.png` }).catch(() => undefined);
  console.error(JSON.stringify({ checks, errors, state: await snap().catch(() => null), notice: await page.getByTestId('story-notice').textContent().catch(() => null) })); throw e;
} finally { await browser.close(); }
