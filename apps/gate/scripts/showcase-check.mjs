// A showcase place in the emulated Quest 3, as a visit reaches it: described at the gate, "yes", and in. Reports how long
// it takes to stand in it after "yes", what one frame costs to draw (triangles, draw calls), what it holds back and
// whether naming each brings it in, and where a held pinch on the ground takes you (inside the place, never through
// its walls). Screenshots on arrival and after each thing comes in.
//   node apps/gate/scripts/showcase-check.mjs --name room-kit --say "Our living room, with the fireplace" [--base https://localhost:4180]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const base = arg('base', 'https://localhost:4180').replace(/\/$/, '');
const name = arg('name', 'room-kit');
const say = arg('say', 'Our living room, with the fireplace and the old sofa.');
const out = arg('out', `apps/gate/.shots/showcase-${name}`);
mkdirSync(out, { recursive: true });
const spec = JSON.parse(readFileSync(new URL(`../src/showcase/scenes/${name}.json`, import.meta.url), 'utf8'));
const held = (spec.items ?? []).map((it, i) => ({ i, m: it.m, say: it.say })).filter((x) => x.say);
const t0 = Date.now();
const note = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
let failed = false;
const check = (ok, s) => { if (!ok) failed = true; note(`${ok ? 'PASS' : 'FAIL'} ${s}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
// --quest: the Quest browser's user agent, so the place is built as it is for a headset (less grass, its own budgets).
const QUEST_UA = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/154.0.0.55.15 Chrome/154.0.8037.57 VR Safari/537.36';
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true, ...(process.argv.includes('--quest') ? { userAgent: QUEST_UA } : {}) });
await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }); } catch { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 300)));
const st = () => page.evaluate(() => { const g = window.__gate.store.getState(), m = window.__gate.memoryStore.getState(); return { stage: g.stage, showcase: m.showcase ?? null, ready: !!m.showcaseReady, revealed: m.revealed ?? [], said: g.companionLine?.text ?? null }; });
const head = () => page.evaluate(() => window.__xrHead);

try {
  await page.goto(`${base}/?emulate=1&voice=off&mode=offline&q=0.3&showcase=${name}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__social?.emulator?.(), null, { timeout: 60000 });
  await page.evaluate(() => {
    const dev = window.__social.emulator();
    if (dev.devui) { dev.devui.devUIContainer.style.display = 'none'; dev.devui.devUICanvas.style.display = 'none'; dev.devui.render = () => undefined; }
    dev.position.y = 1.2; // seated
  });
  await page.getByTestId('enter-vr').click();
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'gathering', null, { timeout: 90000 });
  await page.evaluate(() => { window.__social.emulator().primaryInputMode = 'hand'; });
  await page.evaluate((t) => window.__gate.flow.testHear(t), say);
  await page.waitForTimeout(6000);
  note(`companion: ${(await st()).said}`);
  if (/who was there/i.test((await st()).said ?? '')) { await page.evaluate(() => window.__gate.flow.testHear('My parents.')); await page.waitForTimeout(4000); note(`companion: ${(await st()).said}`); }
  const yes = Date.now();
  await page.evaluate(() => window.__gate.flow.testHear('Yes.'));
  await page.waitForFunction(() => window.__gate.memoryStore.getState().showcaseReady === true, null, { timeout: 120000 });
  note(`   "yes" to standing in the ${name}: ${((Date.now() - yes) / 1000).toFixed(1)} s`);
  await page.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const cost = await page.evaluate(() => window.__glInfo?.());
  note(`   one frame (both eyes): ${JSON.stringify(cost)}`);
  for (const r of await page.evaluate(() => window.__heaviest?.(12) ?? [])) note(`     ${(r.tris / 1000).toFixed(0).padStart(6)}k  ${r.meshes} mesh(es)  ${r.name}`);
  if (process.argv.includes('--meshes')) for (const r of await page.evaluate(() => window.__heaviestMeshes?.(18) ?? [])) note(`     ${(r.tris / 1000).toFixed(0).padStart(6)}k  ${r.what}`);
  check(cost && cost.triangles < 3_000_000, `it draws under 3 M triangles a frame (${((cost?.triangles ?? 0) / 1e6).toFixed(2)} M)`);
  await page.screenshot({ path: `${out}/1-arrived.png` });
  check((await st()).revealed.length === 0, `nothing held back is there on arrival (${held.length} held: ${held.map((h) => h.say[0]).join(', ')})`);

  // Each held thing comes in when it's named inside, turning you to face it.
  const kinds = [...new Map(held.map((h) => [h.say[0], h])).values()];
  for (const [k, h] of kinds.entries()) {
    const before = (await st()).revealed.length;
    await page.evaluate((t) => window.__gate.flow.testHear(t), `There was a ${h.say[0]} here.`);
    await page.waitForTimeout(3500);
    const now = (await st()).revealed;
    check(now.length > before && now.includes(h.i), `saying "${h.say[0]}" brings it in (${now.length - before} came)`);
    if (k < 4) await page.screenshot({ path: `${out}/2-${h.say[0].replace(/\W+/g, '-')}.png` });
  }

  // A held pinch on the ground takes you there, and never through the place's walls or off its ground.
  const HAND = [0.12, -0.28, -0.28];
  const towards = ([dx, dy, dz]) => { const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n; const q = [dy, -dx, 0, 1 - dz], m = Math.hypot(...q); return q.map((v) => v / m); };
  for (const ahead of [2.0, 6.0]) {
    const a = await head();
    const target = [a[0] - Math.sin(a[3]) * ahead, 0, a[2] - Math.cos(a[3]) * ahead];
    const local = await page.evaluate((p) => window.__aim(p), target);
    const q = towards([local[0] - HAND[0], local[1] - HAND[1], local[2] - HAND[2]]);
    await page.evaluate(({ h, q }) => { const dev = window.__social.emulator(), r = dev.hands.right; dev.quaternion.set(0, 0, 0, 1); r.position.set(dev.position.x + h[0], dev.position.y + h[1], dev.position.z + h[2]); r.quaternion.set(q[0], q[1], q[2], q[3]); }, { h: HAND, q });
    await page.waitForTimeout(250);
    const d0 = await page.evaluate(() => window.__walk?.downs ?? 0);
    await page.evaluate(() => window.__social.emulator().hands.right.updatePinchValue(1));
    await page.waitForTimeout(400);
    const mid = await page.evaluate(() => ({ held: !!window.__walk?.held, active: window.__walk?.active }));
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__social.emulator().hands.right.updatePinchValue(0));
    await page.waitForTimeout(900);
    const b = await head(), d1 = await page.evaluate(() => window.__walk?.downs ?? 0);
    note(`   pinch held ${ahead} m ahead: moved ${Math.hypot(b[0] - a[0], b[2] - a[2]).toFixed(2)} m (to ${b[0].toFixed(2)}, ${b[2].toFixed(2)}); ground presses ${d1 - d0}, mid-hold ${JSON.stringify(mid)}`);
  }
  await page.screenshot({ path: `${out}/3-walked.png` });
} catch (e) {
  failed = true;
  note(`FAILED: ${String(e).slice(0, 300)}`);
  note(`state: ${JSON.stringify(await st().catch(() => null))}`);
  await page.screenshot({ path: `${out}/zz-failure.png` }).catch(() => undefined);
}
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 6)) note(`  ${e}`);
await browser.close();
note(failed ? `${name}: FAILED` : `${name}: all checks passed`);
process.exitCode = failed ? 1 : 0;
