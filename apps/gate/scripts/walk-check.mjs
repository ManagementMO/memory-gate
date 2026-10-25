// Two people walking in the meadow, live: the laptop sees through the grandchild's eyes, an emulated Meta Quest 3
// through the grandparent's. The host's words call up the prepared meadow and the headset, already in VR at the gate,
// follows into it. Each sees the other as their person (the boy, the grandmother); when the laptop walks (W) the Quest
// sees the boy walking, and stopping; he stops short of her; when the Quest steps back with its stick the laptop sees
// her walking. Before that, the laptop's keys: W A S D and the arrows each go the right way, Shift hurries, R goes
// back to your place, and typing in a note never walks. Reads what each device draws from window.__people.
//   node apps/gate/scripts/walk-check.mjs [outDir]   (needs npm run local:up, node scripts/red-kite-room.mjs, the gate dev server)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'apps/gate/.shots/walk';
mkdirSync(out, { recursive: true });
const base = process.env.GATE_URL ?? 'https://localhost:5180/';
const t0 = Date.now();
const note = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
let failed = false;
const check = (ok, s) => { if (!ok) failed = true; note(`${ok ? 'PASS' : 'FAIL'} ${s}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const laptop = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const questCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
// Headless Chrome ships a WebXR object with no device; hide it so the emulated Quest 3 (IWER) installs instead.
await questCtx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }); } catch { /* ignore */ } });
const quest = await questCtx.newPage();
const errors = [];
for (const [p, who] of [[laptop, 'laptop'], [quest, 'quest']]) p.on('pageerror', (e) => errors.push(`${who} ${String(e).slice(0, 200)}`));
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png`, timeout: 45000 }).catch(() => undefined);
/** The one other person this device draws: which person, how much of the walk, how fast, where. */
const other = (p) => p.evaluate(() => [...window.__people.values()][0] ?? null);
const fmt = (o) => (o ? `${o.model}, walk ${o.walking.toFixed(2)}, ${o.speed.toFixed(2)} m/s` : 'nobody');

try {
  await laptop.goto(`${base}?voice=off&memory=red-kite`); await laptop.waitForTimeout(3000); await laptop.click('[data-testid=begin]');
  await laptop.waitForSelector('[data-testid=perspective-picker]'); await laptop.fill('[data-testid=social-name]', 'Lily'); await laptop.click('[data-testid=choose-child]');
  await laptop.click('[data-testid=child-voice-words]', { timeout: 5000 }).catch(() => undefined); // words only (no guardian here)
  await quest.goto(`${base}?voice=off&emulate=1`); await quest.waitForSelector('[data-testid=join-nearby]', { timeout: 30000 }); await quest.click('[data-testid=join-nearby]');
  // The grandparent chooses her eyes and name on the page (the picker isn't shown in VR), then goes into VR.
  if (await quest.waitForSelector('[data-testid=perspective-picker]', { timeout: 20000 }).then(() => true, () => false)) {
    await quest.fill('[data-testid=social-name]', 'Rosa'); await quest.click('[data-testid=choose-grandparent]');
  }
  await quest.getByTestId('enter-vr').click({ timeout: 10000 }).catch(() => undefined);
  await quest.waitForFunction(() => window.__gate.store.getState().xr === true, null, { timeout: 15000 }).catch(() => undefined);
  await quest.evaluate(() => window.__social.emulator?.()?.devui?.devUIContainer?.setAttribute('style', 'display:none'));
  await laptop.evaluate(() => window.__gate.flow.testHear('We flew a red kite in a big meadow by an old oak tree, on a warm afternoon with the hills all golden.'));
  await laptop.waitForTimeout(8000);
  await laptop.evaluate(() => window.__gate.flow.testHear('Yes, let’s go there together.'));
  await laptop.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 90000 });
  await quest.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 60000 }).catch(() => undefined);
  check(await quest.evaluate(() => window.__gate.store.getState().stage === 'memory' && window.__gate.store.getState().xr), 'the headset, in VR at the gate, follows the host into the prepared meadow');
  await laptop.evaluate(() => window.__social.store.getState().set({ view: 'first' }));
  await laptop.waitForFunction(() => window.__people.size > 0 && [...window.__people.values()][0].model !== 'placeholder', null, { timeout: 30000 }).catch(() => undefined);
  await quest.waitForFunction(() => window.__people.size > 0 && [...window.__people.values()][0].model !== 'placeholder', null, { timeout: 30000 }).catch(() => undefined);
  await laptop.waitForTimeout(4000);
  const sees = await other(laptop), seen = await other(quest);
  check(sees?.model === 'grandma', `the laptop (the boy's eyes) sees the grandmother (${fmt(sees)})`);
  check(seen?.model === 'boy', `the Quest (the grandmother's eyes) sees the boy (${fmt(seen)})`);
  const eyes = await laptop.evaluate(() => window.__socialCamera().y - window.__social.walk.y);
  check(Math.abs(eyes - 1.21) < 0.02, `the laptop sees from the boy's eyes, ${eyes.toFixed(2)} m above the ground`);
  await shot(laptop, '1-laptop-grandchild-sees-grandma');
  await shot(quest, '2-quest-grandparent-sees-the-boy');

  // The keys, each from the grandchild's spot (R puts you back there): which way they carry you, seen from where you look.
  await laptop.focus('canvas').catch(() => undefined);
  const where = () => laptop.evaluate(() => ({ ...window.__social.walk.offset, yaw: window.__socialCamera().yaw }));
  const home = async () => { await laptop.keyboard.press('KeyR'); await laptop.waitForTimeout(400); };
  const press = async (keys, ms = 600) => {
    await home();
    const a = await where();
    for (const k of keys) await laptop.keyboard.down(k);
    await laptop.waitForTimeout(ms);
    for (const k of [...keys].reverse()) await laptop.keyboard.up(k);
    await laptop.waitForTimeout(200);
    const b = await where(), dx = b.x - a.x, dz = b.z - a.z;
    return { forward: -dx * Math.sin(a.yaw) - dz * Math.cos(a.yaw), right: dx * Math.cos(a.yaw) - dz * Math.sin(a.yaw) };
  };
  const way = (m) => `${m.forward.toFixed(2)} m forward, ${m.right.toFixed(2)} m right`;
  for (const [keys, label, ok] of [
    [['KeyW'], 'W walks forward', (m) => m.forward > 0.5 && Math.abs(m.right) < 0.15],
    [['KeyS'], 'S walks back', (m) => m.forward < -0.5 && Math.abs(m.right) < 0.15],
    [['KeyA'], 'A steps left', (m) => m.right < -0.5 && Math.abs(m.forward) < 0.15],
    [['KeyD'], 'D steps right', (m) => m.right > 0.5 && Math.abs(m.forward) < 0.15],
    [['ArrowUp'], 'the up arrow walks forward', (m) => m.forward > 0.5],
    [['ArrowDown'], 'the down arrow walks back', (m) => m.forward < -0.5],
    [['ArrowLeft'], 'the left arrow steps left', (m) => m.right < -0.5],
    [['ArrowRight'], 'the right arrow steps right', (m) => m.right > 0.5],
  ]) { const m = await press(keys); check(ok(m), `${label} (${way(m)})`); }
  const walked = await press(['KeyW']), hurried = await press(['ShiftLeft', 'KeyW']);
  check(hurried.forward > walked.forward * 1.5, `Shift hurries (${walked.forward.toFixed(2)} m → ${hurried.forward.toFixed(2)} m in the same time)`);
  await home();
  const atHome = await where();
  check(Math.hypot(atHome.x, atHome.z) < 0.05, `R goes back to your place (${Math.hypot(atHome.x, atHome.z).toFixed(2)} m from it)`);
  // Typing in a box never walks you.
  await laptop.click('[data-testid=add-memory]');
  await laptop.fill('[data-testid=story-text]', '');
  await laptop.click('[data-testid=story-text]');
  await laptop.keyboard.type('wasd wasd', { delay: 60 });
  const typed = await where();
  check(Math.hypot(typed.x, typed.z) < 0.05, 'typing w a s d in a note doesn’t walk');
  await laptop.keyboard.press('Escape');
  await laptop.waitForTimeout(400);

  // The laptop walks toward her (W): the Quest sees the boy walking, then stopping short of her.
  await laptop.focus('canvas').catch(() => undefined);
  await laptop.keyboard.down('KeyW');
  await laptop.waitForTimeout(1300);
  const walking = await other(quest);
  check(!!walking && walking.walking > 0.9 && walking.speed > 1, `the Quest sees the boy walking (${fmt(walking)})`);
  await shot(quest, '3-quest-sees-the-boy-walking');
  await laptop.waitForTimeout(2200); // long enough to reach her
  await laptop.keyboard.up('KeyW');
  await laptop.waitForTimeout(1500);
  const stopped = await other(quest);
  check(!!stopped && stopped.walking < 0.05, `and stopping (${fmt(stopped)})`);
  const gap = await quest.evaluate(() => { const c = window.__socialCamera(); const o = [...window.__people.values()][0]; return Math.hypot(c.x - o.at[0], c.z - o.at[2]); });
  check(gap > 0.55, `he stops short of her, not inside her (${gap.toFixed(2)} m apart)`);
  await shot(laptop, '4-laptop-walked-up-to-grandma');

  // The Quest steps back with its left stick: the laptop sees her walking (backwards), then stopping.
  await quest.evaluate(() => window.__social.emulator().controllers.left.updateAxes('thumbstick', 0, 1));
  await quest.waitForTimeout(1300);
  const back = await other(laptop);
  check(!!back && back.walking > 0.9 && back.speed > 0.8, `the laptop sees the grandmother walking (${fmt(back)})`);
  await shot(laptop, '5-laptop-sees-grandma-stepping-back');
  await quest.evaluate(() => window.__social.emulator().controllers.left.updateAxes('thumbstick', 0, 0));
  await quest.waitForTimeout(1500);
  const still = await other(laptop);
  check(!!still && still.walking < 0.05, `and stopping (${fmt(still)})`);
} catch (e) {
  failed = true;
  note(`FAILED: ${String(e).slice(0, 300)}`);
}
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 8)) note(`  ${e}`);
if (errors.length) failed = true;
note(failed ? 'walk: FAILED' : 'walk: all checks passed');
await browser.close();
process.exitCode = failed ? 1 : 0;
