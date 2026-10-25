// Hands only, in the emulated Quest 3 (IWER), the way a wearer without controllers does it: the hand's own ray is aimed
// and pinched (real select events through the XR pointer layer, nothing called directly). Inside the memory a pinch
// held on the ground walks you there; a quick pinch on Rest, Resume and Leave presses them.
//   node apps/gate/scripts/pinch-check.mjs [--base https://localhost:4180] [--online] [--say "words for the place"]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const base = arg('base', (process.env.GATE_URL ?? 'https://localhost:4180')).replace(/\/$/, '');
const online = process.argv.includes('--online');
const say = arg('say', 'We flew a red kite on this hill with my grandma, by the old oak.');
const out = arg('out', 'apps/gate/.shots/pinch');
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const note = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
let failed = false;
const check = (ok, s) => { if (!ok) failed = true; note(`${ok ? 'PASS' : 'FAIL'} ${s}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }); } catch { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
const st = () => page.evaluate(() => { const g = window.__gate.store.getState(); return { stage: g.stage, xr: g.xr, resting: g.resting, said: g.companionLine?.text ?? null }; });

/** The rotation that turns -Z (where a ray points) toward d. */
function towards([dx, dy, dz]) {
  const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  const q = [dy, -dx, 0, 1 - dz], m = Math.hypot(...q);
  return q.map((v) => v / m);
}
const HAND = [0.12, -0.28, -0.28]; // where the right hand is held, from the eyes (tracked metres)
/** Hold the right hand where a wearer would and point its ray at `at` (a named thing, or a world point). */
async function aim(at) {
  const local = await page.evaluate((a) => window.__aim(a), at);
  if (!local) return null;
  const q = towards([local[0] - HAND[0], local[1] - HAND[1], local[2] - HAND[2]]);
  await page.evaluate(({ h, q }) => {
    const dev = window.__social.emulator(), r = dev.hands.right;
    dev.quaternion.set(0, 0, 0, 1);
    r.position.set(dev.position.x + h[0], dev.position.y + h[1], dev.position.z + h[2]);
    r.quaternion.set(q[0], q[1], q[2], q[3]);
  }, { h: HAND, q });
  await page.waitForTimeout(250); // a few frames for the ray to settle on it
  return local;
}
const pinch = async (ms) => {
  await page.evaluate(() => window.__social.emulator().hands.right.updatePinchValue(1));
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__social.emulator().hands.right.updatePinchValue(0));
};
const head = () => page.evaluate(() => window.__xrHead);

try {
  await page.goto(`${base}/?emulate=1&voice=off&lite=1&q=0.15${online ? '' : '&mode=offline'}`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const dev = window.__social.emulator();
    if (dev.devui) { dev.devui.devUIContainer.style.display = 'none'; dev.devui.devUICanvas.style.display = 'none'; dev.devui.render = () => undefined; }
    dev.position.y = 1.2; // seated
  });
  await page.getByTestId('enter-vr').click();
  await page.waitForFunction(() => window.__gate.store.getState().xr === true, null, { timeout: 20000 });
  await page.evaluate(() => { window.__social.emulator().primaryInputMode = 'hand'; });
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'gathering', null, { timeout: 60000 });
  note(`gathering; saying: "${say}"`);
  await page.evaluate((t) => window.__gate.flow.testHear(t), say);
  await page.waitForTimeout(7000);
  const asked = (await st()).said ?? '';
  note(`companion: ${asked}`);
  check(!/who was there/i.test(asked) || !/grand|granma|gramma|nana/i.test(say), 'it does not ask who was there after being told');
  if (/who was there/i.test(asked)) { await page.evaluate(() => window.__gate.flow.testHear('My grandma.')); await page.waitForTimeout(5000); note(`companion: ${(await st()).said}`); }
  const yesAt = Date.now();
  await page.evaluate(() => window.__gate.flow.testHear('Yes.'));
  await page.waitForFunction(() => window.__gate.store.getState().stage !== 'gathering', null, { timeout: 20000 });
  note(`   "yes" to stepping through: ${((Date.now() - yesAt) / 1000).toFixed(1)} s (${(await st()).stage})`);
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 120000 });
  note(`   "yes" to inside the memory: ${((Date.now() - yesAt) / 1000).toFixed(1)} s`);
  await page.waitForFunction(() => window.__walk?.active === true, null, { timeout: 30000 }).catch(() => undefined);
  const where = await page.evaluate(() => { const m = window.__gate.memoryStore.getState(); return { place: m.place, showcase: m.showcase ?? null, photoWorld: !!window.__gate.store.getState().photoWorld, standIns: window.__socialDrawn?.standIns ?? [] }; });
  note(`   in the memory: ${JSON.stringify(where)}`);
  check(await page.evaluate(() => window.__walk?.active === true), `walking is on in the memory (${where.place ?? where.showcase ?? 'a sketch'})`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/1-memory.png` });

  // A pinch held on the ground 2.5 m ahead: you are there.
  for (const [i, ahead, side] of [[1, 2.5, 0], [2, 2.0, 0.8]]) {
    const a = await head();
    const target = [a[0] - Math.sin(a[3]) * ahead + Math.cos(a[3]) * side, 0, a[2] - Math.cos(a[3]) * ahead - Math.sin(a[3]) * side];
    const downs = await page.evaluate(() => window.__walk.downs);
    await aim(target);
    await pinch(750);
    await page.waitForTimeout(900);
    const b = await head();
    const moved = Math.hypot(b[0] - a[0], b[2] - a[2]), off = Math.hypot(b[0] - target[0], b[2] - target[2]);
    const reached = await page.evaluate(() => window.__walk.downs);
    note(`   ground presses seen: ${reached - downs}`);
    check(moved > 1.2 && off < 0.6, `pinch held on the ground walks you there (step ${i}: moved ${moved.toFixed(2)} m, ${off.toFixed(2)} m from the spot)`);
  }
  await page.screenshot({ path: `${out}/2-walked.png` });

  // A quick pinch on the ground stays a "here", never a step.
  { const a = await head(); await aim([a[0] - Math.sin(a[3]) * 2, 0, a[2] - Math.cos(a[3]) * 2]); await pinch(120); await page.waitForTimeout(700); const b = await head();
    check(Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.05, 'a quick pinch on the ground does not walk'); }

  // The dock: Rest, then Resume, then Leave, each with one quick pinch. After walking it comes round to where you are
  // (a moment), then holds still under the hand.
  await page.waitForTimeout(1500);
  for (const [id, want] of [['xr-rest', (s) => s.resting], ['xr-resume', (s) => !s.resting], ['xr-leave', (s) => s.stage === 'leaving' || s.stage === 'album']]) {
    await page.waitForFunction((n) => !!window.__aim(n), id, { timeout: 8000 }).catch(() => undefined);
    const at = await aim(id);
    if (!at) { check(false, `${id} is shown (${JSON.stringify(await st())}, dock: ${await page.evaluate(() => JSON.stringify(window.__aim('xr-rest')))})`); continue; }
    await pinch(120);
    // Rest says its line before resting; Leave says goodbye on the way out.
    let ok = false;
    for (const t1 = Date.now(); Date.now() - t1 < 6000 && !ok; await page.waitForTimeout(200)) ok = want(await st());
    check(ok, `a pinch on ${id.replace('xr-', '')} presses it (${at.map((v) => v.toFixed(2)).join(', ')} from the eyes)`);
    if (id === 'xr-rest') await page.screenshot({ path: `${out}/3-resting.png` });
  }
} catch (e) {
  failed = true;
  note(`FAILED: ${String(e).slice(0, 300)}`);
  note(`state: ${JSON.stringify(await st().catch(() => null))}`);
  await page.screenshot({ path: `${out}/zz-failure.png` }).catch(() => undefined);
}
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 8)) note(`  ${e}`);
await browser.close();
note(failed ? 'pinch: FAILED' : 'pinch: all checks passed');
process.exitCode = failed ? 1 : 0;
