// Headset rehearsal in the emulated Quest 3 (IWER via @react-three/xr): the Enter button appears, entering begins the
// conversation, captions render in 3D, the memory forms around the wearer, and reaching the album ends the session.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'apps/gate/.shots/xr';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
// Headless Chrome ships a WebXR object with no device; hide it so the emulated Quest 3 (IWER) installs instead.
await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }); } catch { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const t0 = Date.now();
const note = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
const st = () => page.evaluate(() => { const g = window.__gate.store.getState(); return { stage: g.stage, xr: g.xr, said: g.companionLine?.text ?? null }; });
try {
  await page.goto('https://localhost:5180/?emulate=1&mode=offline&voice=off', { waitUntil: 'load' });
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
  await page.screenshot({ path: `${out}/02-xr-greeting.png` });
  note(`state: ${JSON.stringify(await st())}`);
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'gathering', null, { timeout: 40000 });
  await page.evaluate(() => window.__gate.flow.testHear('A cabin by the lake at dusk, with a wooden dock and a little rowboat.'));
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__gate.flow.testHear('Yes please.'));
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/03-xr-memory.png` });
  note(`state: ${JSON.stringify(await st())}`);
  await page.evaluate(() => window.__gate.flow.leave());
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'album', null, { timeout: 40000 });
  await page.waitForTimeout(6000);
  note(`after album: ${JSON.stringify(await st())}`);
  await page.screenshot({ path: `${out}/04-after-album.png` });
} catch (e) { note(`FAILED: ${String(e).slice(0, 300)}`); await page.screenshot({ path: `${out}/zz-failure.png` }).catch(() => undefined); }
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 12)) note(`  ${e}`);
await browser.close();
