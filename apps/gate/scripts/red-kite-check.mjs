// Actual Gate UI + WebGL integration. No provider calls, no credential output, no client-state setters.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const origin = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
const auth = JSON.parse(readFileSync('.logs/red-kite-demo-room.json', 'utf8'));
const out = 'evidence/red-kite'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await owner.addInitScript(s => localStorage.setItem('mg.red-kite.session.' + s.code, JSON.stringify({ code: s.code, token: s.token, role: 'family' })), auth);
await owner.addInitScript(() => {
  if (!window.speechSynthesis) return;
  window.__rkSpeech = { speak: 0, cancel: 0, last: null };
  const speak = speechSynthesis.speak.bind(speechSynthesis), cancel = speechSynthesis.cancel.bind(speechSynthesis);
  speechSynthesis.speak = u => { window.__rkSpeech.speak++; window.__rkSpeech.last = u; speak(u); };
  speechSynthesis.cancel = () => { window.__rkSpeech.cancel++; cancel(); };
});
const viewer = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
const a = await owner.newPage(), b = await viewer.newPage(), errors = [], checks = [], snapshots = {};
for (const p of [a, b]) p.on('pageerror', e => errors.push(e.message.slice(0, 300)));
const ready = p => expect(p.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 60000 });
const snap = p => p.evaluate(() => window.__redKite3D.snapshot());
const settle = p => p.waitForFunction(() => window.__redKite3D?.snapshot().phase === 'idle');
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
async function options(p, open) {
  const details = p.getByTestId('scene-options');
  if ((await details.getAttribute('open') !== null) !== open) await details.locator('summary').click();
}
try {
  await check('actual cached meadow and all five GLBs load in Gate', async () => {
    await a.goto(`${origin}/?story=red-kite&room=${auth.code}`); await ready(a);
    await expect(a.getByTestId('restart-story')).toBeEnabled({ timeout: 15000 });
    await options(a, true);
    await a.getByTestId('restart-story').click();
    await options(a, false);
    await expect(a.getByTestId('story-quote')).toContainText('Rosa and I used to run');
    await a.screenshot({ path: `${out}/01-elena-open.png` });
  });
  await check('desktop drag looks around and keyboard steps move within the memory', async () => {
    const before = await snap(a);
    await a.mouse.move(720, 220); await a.mouse.down();
    await a.mouse.move(850, 245, { steps: 8 }); await a.mouse.up();
    await a.waitForTimeout(150);
    const looked = await snap(a);
    assert(Math.abs(looked.spoolScreen[0] - before.spoolScreen[0]) > .04, 'dragging the sky must change the actual camera view');
    await a.keyboard.down('KeyW'); await a.waitForTimeout(2100); await a.keyboard.up('KeyW');
    const walked = await snap(a);
    assert(Math.hypot(walked.camera[0] - looked.camera[0], walked.camera[2] - looked.camera[2]) > 2, 'W must traverse metres of real terrain, not a tiny anchor radius');
    assert(walked.traversal.grounded, 'the real character controller must keep the visitor grounded');
    await a.keyboard.press('Space'); await a.waitForTimeout(280);
    assert((await snap(a)).camera[1] > walked.camera[1] + .25, 'Space must jump the real character');
    await a.waitForTimeout(900); assert((await snap(a)).traversal.grounded);
    await a.keyboard.press('KeyR'); await settle(a);
    const home = await snap(a);
    assert(Math.hypot(home.camera[0], home.camera[2] - .25) < .02, 'R returns to the story entrance behind the mask');
    snapshots.traversal = { before, walked, home };
  });
  await check('compact panels can disappear without stopping the scene, and motion can be explicitly selected', async () => {
    const bounds = await a.locator('.rk-story').boundingBox();
    assert(bounds.width <= 365 && bounds.height < 330, 'the story must leave most of the meadow visible');
    await a.getByTestId('toggle-panels').click(); await expect(a.getByTestId('story-quote')).toBeHidden();
    const start = await snap(a); await a.waitForTimeout(180); assert((await snap(a)).simulationTime > start.simulationTime);
    await a.getByTestId('toggle-panels').click(); await expect(a.getByTestId('story-quote')).toBeVisible();
    await options(a, true); await a.getByTestId('ambient-motion').uncheck();
    await a.waitForTimeout(100); const first = await snap(a); await a.waitForTimeout(150);
    assert.equal((await snap(a)).simulationTime, first.simulationTime);
    await a.getByTestId('ambient-motion').check(); await options(a, false);
    await a.waitForTimeout(100); assert((await snap(a)).simulationTime > first.simulationTime);
  });
  await check('viewer may choose Rosa locally but cannot author details', async () => {
    await b.goto(`${origin}/?story=red-kite&room=${auth.code}&lite=1`); await ready(b);
    await b.getByTestId('perspective-rosa').click(); await settle(b);
    await expect(b.getByTestId('red-kite-experience')).toHaveAttribute('data-perspective', 'rosa');
    await expect(b.getByTestId('next-line')).toBeDisabled(); await expect(b.getByTestId('use-look')).toHaveCount(0);
    await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-perspective', 'elena');
  });
  await check('Elena can leave color unknown then choose red with her source attached', async () => {
    await a.getByTestId('next-line').click(); await expect(a.getByTestId('story-quote')).toContainText("can't remember");
    await a.screenshot({ path: `${out}/02-elena-possibility.png` });
    await a.getByTestId('use-look').click(); await expect(a.getByTestId('visual-status')).toContainText('color left open');
    await a.getByTestId('next-line').click(); await expect(a.getByTestId('story-quote')).toContainText('It was red');
    await expect(a.getByTestId('visual-status')).toContainText('color left open');
    await a.getByTestId('use-look').click(); await expect(a.getByTestId('visual-status')).toContainText('red');
    await a.locator('.rk-source summary').click(); await expect(a.locator('.rk-source')).toContainText('Elena · fictional sample, line 3');
    await a.locator('.rk-source summary').click(); await a.waitForTimeout(1100);
    await a.screenshot({ path: `${out}/03-elena-red.png` }); snapshots.elena = await snap(a);
    await expect(b.getByTestId('visual-status')).not.toContainText('red');
  });
  await check('breeze and real pointer capture lift the world-space spool, then release it', async () => {
    const before = await snap(a); await a.getByTestId('catch-breeze').click();
    await a.waitForTimeout(150); assert.equal((await snap(a)).lifts, before.lifts + 1);
    const p = (await snap(a)).spoolScreen, x = (p[0] + 1) * 720, y = (1 - p[1]) * 450;
    assert(x > 0 && x < 1440 && y > 0 && y < 900, 'spool must be visible and reachable in the desktop view');
    await a.mouse.move(x, y); await a.mouse.down(); await a.waitForTimeout(80);
    assert.equal((await snap(a)).held, true, 'actual R3F pointer event must capture the spool');
    const heldView = (await snap(a)).viewDirection;
    await a.mouse.move(x + 35, y - 80, { steps: 8 }); await a.waitForTimeout(150);
    const raised = await snap(a);
    assert(raised.spool[1] > .85, 'lifting the captured pointer must lift the spool');
    assert(raised.held, 'camera gesture handling must not release the captured spool during a drag');
    assert.deepEqual(raised.viewDirection, heldView, 'dragging a prop must not also rotate the camera');
    const beforeStep = raised.camera;
    await a.keyboard.down('KeyW'); await a.waitForTimeout(220); await a.keyboard.up('KeyW');
    const whileHeld = await snap(a);
    assert(whileHeld.held && Math.hypot(whileHeld.camera[0] - beforeStep[0], whileHeld.camera[2] - beforeStep[2]) > .15, 'holding the spool must not freeze walking or gravity');
    await a.mouse.up(); await a.waitForTimeout(650); assert.equal((await snap(a)).held, false);
    await a.keyboard.press('KeyR'); await settle(a);
  });
  await check('Rosa keeps her unknown color and may decline or choose her orange illustration', async () => {
    await a.getByTestId('perspective-rosa').click(); await settle(a);
    await expect(a.getByTestId('story-quote')).toContainText('From beside the oak');
    await expect(a.getByTestId('visual-status')).not.toContainText('red');
    await a.getByTestId('next-line').click(); await a.getByTestId('use-look').click();
    await a.getByTestId('next-line').click(); await expect(a.getByTestId('story-quote')).toContainText('orange');
    await a.getByTestId('leave-open').click(); await expect(a.getByTestId('visual-status')).toContainText('color left open');
    await a.getByTestId('use-look').click(); await expect(a.getByTestId('visual-status')).toContainText('orange');
    await expect(b.getByTestId('visual-status')).toContainText('orange');
    await a.waitForTimeout(1000); await a.screenshot({ path: `${out}/04-rosa-orange.png` }); snapshots.rosa = await snap(a);
  });
  await check('switching preserves both source-linked illustrations and never moves the other viewer', async () => {
    const other = await snap(b);
    await a.getByTestId('perspective-elena').click(); await settle(a);
    await expect(a.getByTestId('visual-status')).toContainText('red');
    const after = await snap(b); assert.equal(after.selected, 'rosa'); assert.deepEqual(after.origin, other.origin);
    await a.getByTestId('compare').click(); await expect(a.getByTestId('compare-elena')).toContainText('red'); await expect(a.getByTestId('compare-rosa')).toContainText('orange');
    await a.screenshot({ path: `${out}/05-both-tellings.png` }); await a.getByTestId('close-compare').click();
  });
  await check('switching while a real pointer holds the spool releases capture and docks it', async () => {
    const p = (await snap(a)).spoolScreen;
    await a.mouse.move((p[0] + 1) * 720, (1 - p[1]) * 450); await a.mouse.down();
    await a.waitForFunction(() => window.__redKite3D.snapshot().held);
    await a.getByTestId('perspective-rosa').focus(); await a.keyboard.press('Enter'); await settle(a);
    assert.equal((await snap(a)).held, false); await a.mouse.up();
    await expect(a.getByTestId('visual-status')).toContainText('orange');
    await a.getByTestId('perspective-elena').click(); await settle(a);
  });
  await check('the real browser speech API is invoked and a late sample event cannot revive voice after rest', async () => {
    const before = await a.evaluate(() => ({ ...window.__rkSpeech, last: undefined }));
    await a.getByTestId('sample-play').click(); assert.equal((await a.evaluate(() => window.__rkSpeech.speak)), before.speak + 1);
    await a.getByTestId('rest').click(); await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    // Deliberately deliver an old callback as a race regression; native speak/cancel above are passed through.
    await a.evaluate(() => window.__rkSpeech.last?.onstart?.({}));
    await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-speaking', 'false');
    assert((await a.evaluate(() => window.__rkSpeech.cancel)) > before.cancel);
    await a.getByTestId('rest').click(); await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'false');
  });
  await check('rest freezes simulation and commands, and a paused reload reopens without unpausing', async () => {
    await a.getByTestId('rest').click(); await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    await a.waitForTimeout(150); const first = await snap(a); await a.waitForTimeout(300); const second = await snap(a);
    if (first.simulationTime !== second.simulationTime) console.log('REST TRACE', JSON.stringify({ first, second, domPaused: await a.getByTestId('red-kite-experience').getAttribute('data-paused') }));
    assert.equal(first.simulationTime, second.simulationTime); assert.equal(second.held, false);
    await expect(a.getByTestId('next-line')).toBeDisabled(); await expect(a.getByTestId('perspective-rosa')).toBeDisabled();
    await a.reload(); await ready(a); await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    await a.getByTestId('rest').click(); await expect(a.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'false');
    await expect(a.getByTestId('visual-status')).toContainText('red');
  });
  await check('disconnect disables new story commands and reconnect preserves both tellings', async () => {
    await owner.setOffline(true); await expect(a.getByTestId('next-line')).toBeDisabled({ timeout: 15000 });
    await owner.setOffline(false); await expect(a.getByTestId('next-line')).toBeEnabled({ timeout: 20000 });
    await expect(a.getByTestId('visual-status')).toContainText('red');
  });
  await check('local viewpoint survives reload, and the 100k meadow works on a narrow screen', async () => {
    await b.reload(); await ready(b); await expect(b.getByTestId('red-kite-experience')).toHaveAttribute('data-perspective', 'rosa');
    await b.setViewportSize({ width: 390, height: 844 }); await b.emulateMedia({ reducedMotion: 'reduce' }); await b.waitForTimeout(600);
    assert(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile must not overflow horizontally');
    const still = await snap(b); await b.waitForTimeout(300); const later = await snap(b);
    assert.equal(later.simulationTime, still.simulationTime); assert.deepEqual(later.kite, still.kite);
    assert.deepEqual(later.kiteRotation, still.kiteRotation); assert.deepEqual(later.tailRotation, still.tailRotation);
    await b.emulateMedia({ reducedMotion: 'no-preference' }); await b.waitForTimeout(200);
    assert((await snap(b)).simulationTime > later.simulationTime, 'normal idle motion resumes when the preference is disabled');
    await b.emulateMedia({ reducedMotion: 'reduce' });
    await expect(b.getByTestId('mobile-rest')).toBeVisible(); await b.getByTestId('mobile-rest').click();
    await expect(b.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'true');
    await b.getByTestId('mobile-rest').click(); await expect(b.getByTestId('red-kite-experience')).toHaveAttribute('data-paused', 'false');
    await b.screenshot({ path: `${out}/06-mobile-rosa.png` });
  });
  assert.equal(errors.length, 0, 'browser page errors: ' + errors.join('; '));
  const report = { date: new Date().toISOString(), origin, fixture: 'The Red Kite fictional sample', paidGenerationCalls: 0, checks, snapshots, pageErrors: errors, sampleVoice: 'Native browser API invoked; one delayed callback deliberately injected as a race test. Audible quality not measured. No family recording.', physicalQuestTested: false };
  writeFileSync(`${out}/browser-report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, pageErrors: errors.length, physicalQuestTested: false }));
} catch (e) {
  await a.screenshot({ path: `${out}/zz-failure.png` }).catch(() => undefined);
  console.error(JSON.stringify({ passed: checks, pageErrors: errors, notice: await a.getByTestId('story-notice').textContent().catch(() => null) }));
  throw e;
} finally { await browser.close(); }
