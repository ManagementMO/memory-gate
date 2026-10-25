// Headset rehearsal in the emulated Quest 3 (IWER via @react-three/xr): the Enter button appears, entering begins the
// conversation, captions render in 3D, the memory forms around the wearer, seeing through the grandchild's eyes puts
// the wearer's eyes at 1.1 m (the world scales around their feet), and reaching the album ends the session.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';

/** Mean brightness (0-255) of a screenshot: a headset view that draws nothing is near the clear colour (about 6). */
function brightness(buf) {
  const png = PNG.sync.read(buf);
  let sum = 0, n = 0;
  for (let i = 0; i < png.data.length; i += 4 * 97) { sum += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++; }
  return sum / Math.max(1, n);
}
let failed = false;
/** Saves the shot and fails the check if the wearer would see black (the scene isn't being drawn into the headset). */
async function view(page, file, label) {
  const buf = await page.screenshot({ path: file });
  const b = brightness(buf);
  console.log(`   ${label}: brightness ${b.toFixed(0)}${b < 30 ? '  ← BLACK: nothing is drawn in the headset' : ''}`);
  if (b < 30) failed = true;
}
const out = process.argv[2] ?? 'apps/gate/.shots/xr';
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const world = arg('world', 'palace');
const q = arg('q', null); // e.g. --q 0.15 renders at the headset's own quality
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
// Headless Chrome ships a WebXR object with no device; hide it so the emulated Quest 3 (IWER) installs instead.
await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }); } catch { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 600)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const t0 = Date.now();
const note = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
const st = () => page.evaluate(() => { const g = window.__gate.store.getState(); return { stage: g.stage, xr: g.xr, said: g.companionLine?.text ?? null }; });
try {
  await page.goto(`https://localhost:5180/?emulate=1&mode=offline&voice=off&world=${world}${q ? `&q=${q}` : ''}`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const enter = page.getByTestId('enter-vr');
  note(`enter button visible: ${await enter.isVisible().catch(() => false)}`);
  await page.screenshot({ path: `${out}/01-portal-with-enter.png` });
  await enter.click();
  await page.waitForFunction(() => window.__gate.store.getState().xr === true, null, { timeout: 15000 });
  note(`in XR: ${JSON.stringify(await st())}`);
  const f0 = await page.evaluate(() => window.__gateFrames ?? 0);
  await page.waitForTimeout(3000);
  const f1 = await page.evaluate(() => window.__gateFrames ?? 0);
  note(`XR frames rendered in 3 s: ${f1 - f0}`);
  // Hide the emulator's control panels so the screenshot shows what the wearer sees.
  await page.evaluate(() => { for (const el of document.querySelectorAll('body > div')) { const s = getComputedStyle(el); if (el.id !== 'root' && (s.position === 'fixed' || s.position === 'absolute') && el.querySelector('canvas') === null) el.style.display = 'none'; } });
  await page.waitForTimeout(6000);
  await view(page, `${out}/02-xr-greeting.png`, 'headset view at the greeting');
  note(`state: ${JSON.stringify(await st())}`);
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'gathering', null, { timeout: 40000 });
  await page.evaluate(() => window.__gate.flow.testHear('A cabin by the lake at dusk, with a wooden dock and a little rowboat.'));
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__gate.flow.testHear('Yes please.'));
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 60000 });
  await page.waitForTimeout(5000);
  await view(page, `${out}/03-xr-memory.png`, 'headset view in the memory');
  note(`state: ${JSON.stringify(await st())}`);
  // Perspectives: through the grandchild's eyes the world grows around the wearer until their eyes are at 1.1 m.
  const eyes = () => page.evaluate(() => {
    const s = window.__social.store.getState();
    return { viewing: s.viewing, measured: s.xr.measured, k: s.xr.k };
  });
  await page.waitForFunction(() => window.__social.store.getState().xr.measured !== null, null, { timeout: 10000 }).catch(() => undefined);
  const before = await eyes();
  note(`perspective ${before.viewing}: measured eye ${before.measured?.toFixed(2)} m, world scale ${before.k.toFixed(2)}`);
  await page.evaluate(() => window.__social.setViewing('child'));
  await page.waitForFunction(() => Math.abs(window.__social.store.getState().xr.k - 1) > 0.05, null, { timeout: 5000 }).catch(() => undefined);
  const after = await eyes();
  const seenAt = after.measured ? after.measured * after.k : null;
  note(`${seenAt && Math.abs(seenAt - 1.1) < 0.03 ? 'PASS' : 'FAIL'} grandchild's eyes: world scale ${after.k.toFixed(2)}, eyes at ${seenAt?.toFixed(2)} m in the memory`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/03b-xr-grandchild-eyes.png` });
  // Two people in the room: the wearer now stands where the grandchild stands, facing the grandparent across it.
  const placedAt = await page.evaluate(() => {
    const cam = window.__socialCamera?.() ?? null;
    return { cam, spot: window.__social.spot('child'), other: window.__social.spot('grandparent'), standIns: window.__socialDrawn.standIns };
  });
  if (placedAt.cam) {
    const off = Math.hypot(placedAt.cam.x - placedAt.spot.world.x, placedAt.cam.z - placedAt.spot.world.z);
    const turn = Math.abs(Math.atan2(Math.sin(placedAt.cam.yaw - placedAt.spot.facing), Math.cos(placedAt.cam.yaw - placedAt.spot.facing)));
    note(`${off < 0.05 && turn < 0.1 ? 'PASS' : 'FAIL'} the wearer stands at the grandchild's spot (${off.toFixed(3)} m off), facing the grandparent (${turn.toFixed(3)} rad off)`);
  }
  note(`${placedAt.standIns.includes('grandparent') ? 'PASS' : 'FAIL'} the grandparent waits across the room (stand-ins: ${placedAt.standIns.join(', ') || 'none'})`);
  await page.evaluate(() => window.__social.setViewing('grandparent'));
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({ cam: window.__socialCamera?.() ?? null, spot: window.__social.spot('grandparent'), standIns: window.__socialDrawn.standIns }));
  const backOff = back.cam ? Math.hypot(back.cam.x - back.spot.world.x, back.cam.z - back.spot.world.z) : NaN;
  note(`${backOff < 0.05 && back.standIns.includes('child') ? 'PASS' : 'FAIL'} back to the grandparent's eyes: world scale ${(await eyes()).k.toFixed(2)}, at the grandparent's spot (${backOff.toFixed(3)} m off), the grandchild across the room`);
  await page.evaluate(() => window.__gate.flow.leave());
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'album', null, { timeout: 40000 });
  await page.waitForTimeout(6000);
  note(`after album: ${JSON.stringify(await st())}`);
  await page.screenshot({ path: `${out}/04-after-album.png` });
} catch (e) {
  note(`FAILED: ${String(e).slice(0, 300)}`);
  note(`state at failure: ${JSON.stringify(await page.evaluate(() => { const g = window.__gate.store.getState(); return { stage: g.stage, xr: g.xr, enterProgress: g.enterProgress, said: g.companionLine?.text ?? null, heard: g.heardLine?.text ?? null }; }).catch(() => null))}`);
  await page.screenshot({ path: `${out}/zz-failure.png` }).catch(() => undefined);
}
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 12)) note(`  ${e}`);
await browser.close();
if (failed) { note('FAILED: the headset view was black'); process.exitCode = 1; }
