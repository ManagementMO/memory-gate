// Two people, two microphones, one companion: the laptop (the host, the grandchild) and an emulated Meta Quest 3 (a
// guest, the grandparent) both talk, and the companion keeps one conversation with both (services/exchange/
// conversation.mjs). What each device "hears" is driven with flow.testHear (how loud its mic heard it, too), so this runs
// without microphones. Checks: one answer, the same line on both devices, after the lull, to what both said; the same
// words picked up by both mics count once, for the louder; both people's words shape the place; a guest's "let's go"
// doesn't take them through alone, and they follow only once the host is inside; inside, the guest's detail is theirs.
//   node apps/gate/scripts/two-voices-check.mjs [outDir]   (local stack with the exchange; GATE_URL to point elsewhere)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'apps/gate/.shots/two-voices';
mkdirSync(out, { recursive: true });
const base = process.env.GATE_URL ?? 'https://localhost:5180/';
const t0 = Date.now();
const note = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
let failed = false;
const check = (ok, s) => { if (!ok) failed = true; note(`${ok ? 'PASS' : 'FAIL'} ${s}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const laptop = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const questCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
await questCtx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }); } catch { /* ignore */ } });
const quest = await questCtx.newPage();
const errors = [];
for (const [p, who] of [[laptop, 'laptop'], [quest, 'quest']]) p.on('pageerror', (e) => errors.push(`${who} ${String(e).slice(0, 200)}`));
// Diagnostic: when the headset leaves VR, and in which stage.
const xrLog = [];
const watchXr = setInterval(() => { void quest.evaluate(() => [window.__gate.store.getState().xr, window.__gate.store.getState().stage, window.__social.store.getState().status]).then(([x, st, live]) => { const last = xrLog[xrLog.length - 1]; if (!last || last.x !== x || last.st !== st || last.live !== live) xrLog.push({ t: ((Date.now() - t0) / 1000).toFixed(1), x, st, live }); }).catch(() => undefined); }, 250);
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png`, timeout: 45000 }).catch(() => undefined);
const stage = (p) => p.evaluate(() => window.__gate.store.getState().stage);
const lines = (p) => p.evaluate(() => [...(window.__roomLines ?? [])]);
const answers = async (p) => (await lines(p)).filter((l) => !['welcome', 'line'].includes(l.intent));
const conversation = (p) => p.evaluate(() => window.__social.store.getState().conversation ?? []);
const hear = (p, text, snrDb) => p.evaluate(([t, s]) => window.__gate.flow.testHear(t, { snrDb: s }), [text, snrDb]);
const waitFor = async (fn, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) { const v = await fn(); if (v) return v; } return null; };

try {
  // The laptop begins the visit and sees through the grandchild's eyes.
  await laptop.goto(`${base}?voice=off&memory=red-kite`); await laptop.waitForTimeout(3000); await laptop.click('[data-testid=begin]');
  await laptop.waitForSelector('[data-testid=perspective-picker]'); await laptop.fill('[data-testid=social-name]', 'Lily'); await laptop.click('[data-testid=choose-child]');
  await laptop.click('[data-testid=child-voice-words]', { timeout: 5000 }).catch(() => undefined);
  // The Quest joins nearby, chooses the grandparent's eyes and a name on the page, then goes into VR.
  await quest.goto(`${base}?voice=off&emulate=1`); await quest.waitForSelector('[data-testid=join-nearby]', { timeout: 30000 }); await quest.click('[data-testid=join-nearby]');
  await quest.waitForSelector('[data-testid=perspective-picker]', { timeout: 30000 });
  await quest.fill('[data-testid=social-name]', 'Rosa'); await quest.click('[data-testid=choose-grandparent]');
  await quest.getByTestId('enter-vr').click({ timeout: 10000 }).catch(() => undefined);
  check(!!(await quest.waitForFunction(() => window.__gate.store.getState().xr === true, null, { timeout: 15000 }).catch(() => null)), 'the Quest chose the grandparent’s eyes on the page, then went into VR');
  await quest.waitForFunction(() => window.__social.store.getState().status === 'live', null, { timeout: 15000 }).catch(() => undefined);
  check(!!(await waitFor(async () => (await lines(quest)).some((l) => l.intent === 'welcome'))), 'the companion welcomes the one who joined, on both devices');

  // At the gate: both talk. One answer after the lull, to both of them, the same line on both devices.
  await hear(quest, 'I remember the big old oak tree at the bend', 26);
  await hear(laptop, 'We flew a red kite on the hill', 27);
  const first = await waitFor(async () => (await answers(laptop))[0]);
  const same = first && (await waitFor(async () => (await answers(quest)).find((l) => l.id === first.id)));
  check(!!first && !!same && same.text === first.text, `one answer, the same line on both devices ("${first?.text ?? 'none'}")`);
  check(!!first && first.heard.includes('Rosa') && first.heard.includes('Lily'), `it answers what both just said (${first?.heard.join(' + ') ?? '-'})`);
  await laptop.waitForTimeout(2500);
  check((await answers(laptop)).length === 1, 'once for everything said, not once per utterance');
  await shot(laptop, '1-laptop-at-the-gate');

  // The same words picked up by both microphones count once, for the louder (Lily's own mic).
  await Promise.all([hear(laptop, 'It had a long cream ribbon on its tail', 28), hear(quest, 'it had a long cream ribbon on its tail', 8)]);
  const ribbon = await waitFor(async () => { const r = (await conversation(laptop)).filter((c) => /cream ribbon/i.test(c.text) && c.who === 'person'); return r.length ? r : null; }, 8000);
  check(ribbon?.length === 1 && ribbon[0].speakerName === 'Lily', `the same words from both mics are kept once, as Lily's (${ribbon?.map((c) => c.speakerName).join(', ') || 'none'})`);
  await waitFor(async () => (await answers(laptop)).length >= 2, 12000);

  // A guest's "let's go" doesn't take them through alone; the host's does, and the guest follows once the host is in.
  await hear(quest, 'Let’s go there', 26);
  await quest.waitForTimeout(4000);
  check(['gathering', 'greeting'].includes(await stage(quest)) || ['entering', 'forming', 'memory'].includes(await stage(laptop)), `the guest doesn't step through on their own (guest ${await stage(quest)}, host ${await stage(laptop)})`);
  if (['gathering', 'greeting'].includes(await stage(laptop))) await hear(laptop, 'Yes, let’s go there together.', 27);
  await laptop.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 90000 }).catch(() => undefined);
  const hostIn = Date.now();
  await quest.waitForFunction(() => ['entering', 'forming', 'memory'].includes(window.__gate.store.getState().stage), null, { timeout: 60000 }).catch(() => undefined);
  await quest.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 90000 }).catch(() => undefined);
  check(await stage(laptop) === 'memory' && await stage(quest) === 'memory', `both are inside the memory (host ${await stage(laptop)}, guest ${await stage(quest)}; the guest followed ${((Date.now() - hostIn) / 1000).toFixed(0)} s after the host was in)`);
  await laptop.waitForTimeout(3000);

  // Inside: the grandparent's detail is the grandparent's (her device keeps it), answered to both.
  const before = (await answers(laptop)).length;
  await hear(quest, 'There was a wooden bench under the oak where I sat and watched', 27);
  const story = await waitFor(() => quest.evaluate(() => {
    const s = window.__social.store.getState();
    const gp = s.perspectives.find((p) => p.key === 'grandparent');
    return s.stories.find((x) => x.perspectiveId === gp?.id && /bench/.test(x.text) && x.speakerName === 'Rosa') ?? null;
  }), 20000);
  check(!!story, `inside, the grandparent's detail is her story, told by Rosa (${story ? story.text.slice(0, 40) : 'none'})`);
  if (!story) note(`  (last line ${JSON.stringify((await lines(quest)).at(-1))}; stories ${JSON.stringify(await quest.evaluate(() => { const s = window.__social.store.getState(); return { me: s.memberId, viewing: s.viewing, stories: s.stories.map((x) => [x.perspectiveId.split(':')[1], x.speakerName, x.text.slice(0, 30)]) }; }))})`);
  check(!!(await waitFor(async () => (await answers(laptop)).length > before && (await answers(quest)).length > before)), 'and the companion answers it on both devices');
  check(!xrLog.some((e, i) => i > 0 && xrLog[i - 1].x && !e.x) && (await quest.evaluate(() => window.__gate.store.getState().xr)), 'the headset stayed in VR into the memory');
  const kept = await conversation(laptop);
  check(new Set(kept.filter((c) => c.who === 'person').map((c) => c.speakerName)).size === 2, `the conversation is kept with both names (${[...new Set(kept.filter((c) => c.who === 'person').map((c) => c.speakerName))].join(', ')})`);
  await shot(laptop, '2-laptop-inside');
  await shot(quest, '3-quest-inside');
} catch (e) {
  failed = true;
  note(`FAILED: ${String(e).slice(0, 300)}`);
}
clearInterval(watchXr);
note(`headset: ${xrLog.map((e) => `${e.t}s ${e.x ? 'VR' : '2D'} ${e.st} ${e.live}`).join(' → ')}`);
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 8)) note(`  ${e}`);
if (errors.length) failed = true;
note(failed ? 'two voices: FAILED' : 'two voices: all checks passed');
await browser.close();
process.exitCode = failed ? 1 : 0;
