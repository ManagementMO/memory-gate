// Two devices in the same room. The second finds the visit nearby and joins in one tap, stays quiet (no voice, no
// music), and each sees the other as a light; a tap inside the memory leaves a "look here" mark the other shows.
//   node apps/gate/scripts/multiplayer-check.mjs [outDir]   (a live room with voice off: one Claude reply + plan, ~5¢)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'apps/gate/.shots/multiplayer';
mkdirSync(out, { recursive: true });
const base = process.env.GATE_URL ?? 'https://localhost:5180/';
const t0 = Date.now();
const note = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${m}`);
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who} pageerror ${String(e).slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who} console ${m.text().slice(0, 200)}`); });
};
const host = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })).newPage();
watch(host, 'host'); watch(guest, 'guest');
const state = (page) => page.evaluate(() => {
  const g = window.__gate.store.getState(); const p = window.__presence?.getState();
  return { stage: g.stage, role: g.session?.role ?? null, voice: g.voice, music: g.musicOn, others: p?.others.length ?? 0, nearby: !!p?.nearby, backend: p?.backend ?? null, mark: !!p?.others.find((o) => o.point && Date.now() + p.offset - o.point.t < 7000) };
});
let ok = true;
// Screenshots are for review only: a busy GPU can stall one, which must not fail the checks.
const shot = (page, path) => page.screenshot({ path, timeout: 45000 }).catch((e) => note(`(screenshot skipped: ${String(e).split('\n')[0].slice(0, 80)})`));
const check = (cond, msg) => { note(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) ok = false; };

await host.goto(`${base}?voice=off`, { waitUntil: 'load' });
await host.waitForTimeout(4000);
await host.click('[data-testid=begin]');
await host.waitForFunction(() => window.__gate.store.getState().session?.role === 'host', null, { timeout: 30000 });
note('host began a visit');

await guest.goto(`${base}?voice=off`, { waitUntil: 'load' });
const offered = await guest.waitForSelector('[data-testid=join-nearby]', { timeout: 30000 }).then(() => true, () => false);
check(offered, 'phone is offered the visit nearby');
await shot(guest, `${out}/01-phone-join.png`);
if (offered) await guest.click('[data-testid=join-nearby]');
await guest.waitForFunction(() => window.__gate.store.getState().session?.role === 'guest', null, { timeout: 30000 }).catch(() => undefined);
await guest.waitForTimeout(6000);
const gs = await state(guest);
check(gs.role === 'guest', `phone joined as a guest (${gs.role})`);
check(gs.voice === 'shared' && gs.music === false, `phone stays quiet (voice ${gs.voice}, music ${gs.music})`);
await host.waitForFunction(() => (window.__presence?.getState().others.length ?? 0) >= 1, null, { timeout: 15000 }).catch(() => undefined);
const hs = await state(host);
check(hs.others >= 1, `host sees the phone's light (${hs.others})`);
check(gs.others >= 1, `phone sees the host's light (${gs.others})`);
note(`presence runs on: host ${hs.backend}, phone ${gs.backend}`);
if (process.env.EXPECT_PRESENCE) check(hs.backend === process.env.EXPECT_PRESENCE && gs.backend === process.env.EXPECT_PRESENCE, `presence on ${process.env.EXPECT_PRESENCE} for both devices`);
await shot(host, `${out}/02-host-gathering.png`);
await shot(guest, `${out}/03-phone-gathering.png`);

// The host describes a memory and agrees to go; the phone follows.
await host.evaluate(() => window.__gate.flow.testHear('My grandmother’s kitchen in the morning, with yellow curtains and a round wooden table.'));
await host.waitForTimeout(9000);
await host.evaluate(() => window.__gate.flow.testHear('Yes, let’s go there together.'));
await host.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 90000 }).catch(() => undefined);
note(`host stage: ${(await state(host)).stage}`);
await guest.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 60000 }).catch(() => undefined);
check((await state(guest)).stage === 'memory', 'phone followed into the memory');
await guest.waitForTimeout(4000);

// The phone taps the middle of the room: "look here".
const box = await guest.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.62 }; });
await guest.touchscreen.tap(box.x, box.y);
await host.waitForFunction(() => { const p = window.__presence.getState(); return p.others.some((o) => o.point && Date.now() + p.offset - o.point.t < 7000); }, null, { timeout: 10000 }).catch(() => undefined);
check((await state(host)).mark, 'host sees the phone’s “look here” mark');
await host.waitForTimeout(600);
await shot(host, `${out}/04-host-memory-mark.png`);
await shot(guest, `${out}/05-phone-memory.png`);

note(`errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) note(`  ${e}`);
note(ok ? 'multiplayer: all checks passed' : 'multiplayer: some checks failed');
await browser.close();
process.exit(ok ? 0 : 1);
