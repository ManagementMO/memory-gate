// Two devices in the same room. The second finds the visit nearby and joins in one tap, stays quiet (no voice, no
// music), and each sees the other as a light; a tap inside the memory leaves a "look here" mark the other shows.
// With the exchange running, perspectives too: each picks whose eyes they see through, the phone stands in the memory
// at a grandchild's eye height, a note it adds is the grandchild's (a ghost for the host), and a memory handed across
// is kept by the grandparent. The host's own words inside the memory become the grandparent's story.
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
/** Whose eyes: the picker asks once, when the person has settled at the gate. */
const choose = async (page, key, name) => {
  const asked = await page.waitForSelector('[data-testid=perspective-picker]', { timeout: 20000 }).then(() => true, () => false);
  if (!asked) return false;
  await page.fill('[data-testid=social-name]', name);
  await page.click(`[data-testid=choose-${key}]`);
  return page.waitForFunction((k) => window.__social.store.getState().viewing === k && !document.querySelector('[data-testid=perspective-picker]'), key, { timeout: 5000 }).then(() => true, () => false);
};
const social = (page) => page.evaluate(() => {
  const s = window.__social.store.getState();
  return { status: s.status, viewing: s.viewing, memberId: s.memberId, stories: s.stories, objects: s.objects, handoffs: s.handoffs, perspectives: s.perspectives,
    poses: [...window.__social.poses.values()].map((p) => ({ memberId: p.memberId, y: p.head[1], inScene: p.inScene, perspectiveId: p.perspectiveId })) };
});
const state = (page) => page.evaluate(() => {
  const g = window.__gate.store.getState(); const p = window.__presence?.getState();
  return { stage: g.stage, role: g.session?.role ?? null, voice: g.voice, music: g.musicOn, others: p?.others.length ?? 0, nearby: !!p?.nearby, backend: p?.backend ?? null, mark: !!p?.others.find((o) => o.point && Date.now() + p.offset - o.point.t < 7000) };
});
let ok = true;
// Screenshots are for review only: a busy GPU can stall one, which must not fail the checks.
const shot = (page, path) => page.screenshot({ path, timeout: 45000 }).catch((e) => note(`(screenshot skipped: ${String(e).split('\n')[0].slice(0, 80)})`));
const check = (cond, msg) => { note(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) ok = false; };

// GATE_MEMORY=red-kite: the visit's memory is the team's cached meadow (node scripts/red-kite-room.mjs first).
await host.goto(`${base}?voice=off${process.env.GATE_MEMORY ? `&memory=${process.env.GATE_MEMORY}` : ''}`, { waitUntil: 'load' });
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
check(await choose(host, 'grandparent', 'Grandpa Joe'), 'host sees through the grandparent’s eyes');
check(await choose(guest, 'child', 'Lily'), 'phone sees through the grandchild’s eyes');
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

if (hs.backend === 'spacetime') {
  // The phone stands in the memory at the grandchild's eye height (its own view), seen by the host where it is.
  await host.waitForFunction(() => [...window.__social.poses.values()].some((p) => p.inScene && Math.abs(p.head[1] - 1.1) < 0.02), null, { timeout: 10000 }).catch(() => undefined);
  const seen = (await social(host)).poses.find((p) => p.inScene && Math.abs(p.y - 1.1) < 0.02);
  check(!!seen, `host sees the phone in the memory at a grandchild’s eye height (${seen?.y?.toFixed(2) ?? 'none'})`);
  check((await host.evaluate(() => window.__social.store.getState().perspectives.find((p) => p.key === 'child')?.claimedName)) === 'Lily', 'the grandchild’s eyes are claimed by Lily');

  // The phone adds a note through the grandchild's eyes: it is the grandchild's story, and a thing in the place.
  await guest.click('[data-testid=add-memory]');
  await guest.fill('[data-testid=story-text]', 'There was a little red stool by the stove, just my size.');
  await guest.click('[data-testid=story-keep]');
  await host.waitForFunction(() => { const s = window.__social.store.getState(); const child = s.perspectives.find((p) => p.key === 'child'); return s.stories.some((x) => x.perspectiveId === child.id && x.speakerName === 'Lily') && s.objects.some((o) => o.perspectiveId === child.id); }, null, { timeout: 30000 }).catch(() => undefined);
  const hostView = await social(host);
  const child = hostView.perspectives.find((p) => p.key === 'child');
  const note1 = hostView.stories.find((x) => x.perspectiveId === child.id && x.speakerName === 'Lily');
  check(!!note1, 'the note is kept as the grandchild’s, told by Lily');
  check(hostView.objects.some((o) => o.perspectiveId === child.id), `it adds a thing for the grandchild (${hostView.objects.filter((o) => o.perspectiveId === child.id).map((o) => o.data.label).join(', ') || 'none'})`);
  await host.waitForTimeout(3500);
  await shot(host, `${out}/06-host-sees-ghost.png`);
  await shot(guest, `${out}/07-phone-own-stool.png`);

  // Two people in the room: Lily's note put the grandchild by the stove, so she stands there now, and through the
  // grandparent's eyes the host sees her across the room. Stepping into the grandchild's eyes puts the host in her
  // place (she isn't drawn inside you) with the grandparent waiting across the room.
  await host.waitForFunction(() => window.__social.spot('child').source !== 'default', null, { timeout: 15000 }).catch(() => undefined);
  const childSpot = await host.evaluate(() => window.__social.spot('child'));
  // In a prepared world (the Red Kite meadow) everyone stays at that world's checked viewpoints instead.
  check(childSpot.source === 'story' || childSpot.source === 'world', childSpot.source === 'world' ? 'in the meadow the grandchild stays at its checked viewpoint beside the oak' : `the grandchild now stands where the story put her (${childSpot.objectId})`);
  await host.waitForFunction((at) => [...window.__social.poses.values()].some((p) => p.inScene && Math.hypot(p.head[0] - at.x, p.head[2] - at.z) < 0.05), childSpot.world, { timeout: 8000 }).catch(() => undefined);
  const lilyThere = (await social(host)).poses.some((p) => p.inScene && Math.abs(p.y - 1.1) < 0.02);
  check(lilyThere && (await host.evaluate(() => window.__socialDrawn.figures.length)) >= 1, 'through the grandparent’s eyes, the host sees Lily across the room at her spot');
  await host.evaluate(() => window.__social.store.getState().set({ view: 'first' }));
  await host.waitForTimeout(2500);
  await shot(host, `${out}/09-grandparent-sees-lily-across.png`);
  await host.evaluate(() => window.__social.setViewing('child'));
  await host.waitForTimeout(2500);
  const across = await host.evaluate(() => ({ figures: window.__socialDrawn.figures.length, standIns: window.__socialDrawn.standIns }));
  check(across.figures === 0 && across.standIns.includes('grandparent'), `in the grandchild’s eyes the host shares Lily’s spot and sees the grandparent across the room (${JSON.stringify(across)})`);
  await shot(host, `${out}/10-grandchild-sees-grandparent-across.png`);
  await host.evaluate(() => { window.__social.setViewing('grandparent'); window.__social.store.getState().set({ view: 'overview' }); });

  // The phone hands it to the grandparent; the host keeps it.
  if (note1) {
    await guest.evaluate((id) => window.__social.store.getState().set({ openStory: id }), note1.id);
    await guest.click('[data-testid=story-hand]').catch(() => undefined);
    const tray = await host.waitForSelector('[data-testid=handoff-keep]', { timeout: 15000 }).then(() => true, () => false);
    check(tray, 'host is offered the handed memory');
    if (tray) await host.click('[data-testid=handoff-keep]');
    await host.waitForFunction(() => window.__social.store.getState().stories.some((x) => x.handedFrom && x.speakerName === 'Lily'), null, { timeout: 15000 }).catch(() => undefined);
    check((await social(host)).stories.some((x) => x.handedFrom === child.id), 'the grandparent kept it (still told by Lily)');
  }

  // The host's own words inside the memory become the grandparent's story.
  await host.evaluate(() => window.__gate.flow.testHear('There was a radio on the shelf, always playing the news.'));
  await host.waitForFunction(() => { const s = window.__social.store.getState(); const gp = s.perspectives.find((p) => p.key === 'grandparent'); return s.stories.some((x) => x.perspectiveId === gp.id && x.speakerName === 'Grandpa Joe' && !x.handedFrom); }, null, { timeout: 30000 }).catch(() => undefined);
  check((await social(host)).stories.some((x) => x.speakerName === 'Grandpa Joe' && !x.handedFrom), 'the host’s words are the grandparent’s story, told by Grandpa Joe');
  await shot(host, `${out}/08-host-memory.png`);
}

note(`errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) note(`  ${e}`);
note(ok ? 'multiplayer: all checks passed' : 'multiplayer: some checks failed');
await browser.close();
process.exit(ok ? 0 : 1);
