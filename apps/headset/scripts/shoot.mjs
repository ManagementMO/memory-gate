// Desktop screenshots of the real headset page against the running backend (headless Chrome, GPU via Metal).
// States: room revealed → ghost after a typed "There was a piano under the window" → settled after objects.confirm →
// replay (click the piano) → paused → resumed → undo (dissolve out). Prints measured load times, fps and errors.
// Usage: node scripts/shoot.mjs [outDir] [baseUrl]   (room from .test-room.json; make one with scripts/make-room.mjs)
import { readFileSync, mkdirSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { chromium } from '@playwright/test';
import { api } from '../../../convex/_generated/api.js';

const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
const out = process.argv[2] || new URL('../../../evidence/screens/', import.meta.url).pathname;
const base = process.argv[3] || 'https://127.0.0.1:8081/';
const sentence = process.env.SENTENCE || 'There was a piano under the window';
const aim = (process.env.AIM || '').split(',').map(Number); // optional mouse aim in NDC (x,y) before speaking
const prefix = process.env.PREFIX || 'headset';
mkdirSync(out, { recursive: true });
const family = new ConvexHttpClient(room.url);
const cmd = () => crypto.randomUUID();

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const proxied = new Set();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) proxied.add(`${u.origin}${u.pathname.split('/').slice(0, 3).join('/')}`); });
const stats = () => page.evaluate(() => window.__mg?.stats ?? {});
const waitFor = (fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms });
const shot = async (name) => { await page.screenshot({ path: `${out}/${prefix}-${name}.png` }); console.log('shot', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Start from an empty room (owner-only "Reset demo room": objects, events and utterances; keeps splat and consents).
await family.mutation(api.rooms.resetDemo, { code: room.code, token: room.token });
const t0 = Date.now();
await page.goto(`${base}?room=${room.code}${room.key ? `&key=${room.key}` : ''}${process.env.QUERY ?? '&voice=mock'}`);
await waitFor(() => window.__mg?.stats?.splatLoaded === true, null, 90000);
const tLoaded = Date.now() - t0;
await sleep(4200); // the reveal takes ~3.6 s
await shot('1-room');
const s1 = await stats();

// A typed utterance from the headset (the same path the push-to-talk release takes), optionally aimed with the mouse.
if (aim.length === 2 && aim.every(Number.isFinite)) {
  await page.mouse.move(640 + aim[0] * 640, 400 - aim[1] * 400);
  await sleep(100);
}
const tSay = Date.now();
await page.evaluate((s) => window.__mg.say(s), sentence);
await waitFor(() => /piano:(appearing|ghost)/.test(window.__mg?.stats?.objects ?? ''), null, 30000);
const ghostMs = Date.now() - tSay;
await waitFor(() => /piano:ghost/.test(window.__mg?.stats?.objects ?? ''), null, 10000);
await waitFor(() => (window.__mg?.stats?.spokenCount ?? 0) >= 1, null, 15000).catch(() => undefined);
await sleep(1200);
await shot('2-ghost');
const s2 = await stats();

// Confirm from the family's phone session (api.objects.confirm), as the phone's Keep button would.
const list = await family.query(api.objects.list, { code: room.code, token: room.token });
const piano = list.find((o) => o.label.includes('piano') && o.status === 'ghost');
if (!piano) throw new Error('no ghost piano in the list: ' + JSON.stringify(list.map((o) => [o.label, o.status])));
const tConfirm = Date.now();
await family.mutation(api.objects.confirm, { code: room.code, token: room.token, objectId: piano.id, commandId: cmd() });
await waitFor(() => /piano:settling|piano:solid/.test(window.__mg?.stats?.objects ?? ''), null, 10000);
const confirmSeenMs = Date.now() - tConfirm;
await sleep(900);
await shot('3-settling');
await waitFor(() => /piano:solid/.test(window.__mg?.stats?.objects ?? ''), null, 10000);
await sleep(1500);
await shot('3-settled');
const s3 = await stats();

// Replay: click the settled piano (desktop mouse click → raycast against object meshes only).
const picked = await page.evaluate(() => {
  for (let y = -0.6; y <= 0.2; y += 0.05) for (let x = -0.5; x <= 0.5; x += 0.05) { const l = window.__mg.pickAt(x, y); if (l) return { l, x, y }; }
  return null;
});
await sleep(900);
await shot('4-replay');
const s4 = await stats();

await family.mutation(api.rooms.setPaused, { code: room.code, token: room.token, paused: true, commandId: cmd() });
await sleep(2200);
await shot('5-paused');
const s5 = await stats();
await family.mutation(api.rooms.setPaused, { code: room.code, token: room.token, paused: false, commandId: cmd() });
await sleep(2200);
await shot('6-resumed');

// Measure desktop fps over 6 s with the room + one settled object (headless desktop GPU: not a Quest number).
await sleep(6000);
const s6 = await stats();

if (process.env.UNDO !== '0') {
  await family.mutation(api.objects.undo, { code: room.code, token: room.token, commandId: cmd() }); // undoes the confirm → ghost
  await waitFor(() => /piano:(unsettling|ghost)/.test(window.__mg?.stats?.objects ?? ''), null, 10000);
  await sleep(1800);
  await shot('7-undo-to-ghost');
  await family.mutation(api.objects.undo, { code: room.code, token: room.token, commandId: cmd() }); // undoes the proposal → gone
  await sleep(700);
  await shot('8-undo-dissolving');
  await waitFor(() => !/piano/.test(window.__mg?.stats?.objects ?? ''), null, 10000);
}
const sEnd = await stats();
console.log(JSON.stringify({
  code: room.code, pageToSplatReadyMs: tLoaded, splatLoadMs: s1.splatLoadMs, tJoined: s1.tJoined, tSplatReady: s1.tSplatReady,
  sayToGhostMs: ghostMs, raycast: s2.lastRaycast, placement: s2.lastPlacement ?? 'floor plane', anchor: (await family.query(api.objects.events, { code: room.code, token: room.token })).length, confirmToSettleStartMs: confirmSeenMs, aiMs: s2.latestUtterance?.aiMs, aiMode: s2.latestUtterance?.aiMode,
  companion: s2.lastSpoken, caption2: s2.caption, heldAfterGhost: s2.heldQuestions, spokenAfterConfirm: s3.lastSpoken, caption3: s3.caption, picked, replay: s4.lastReplay, replayAudio: s4.lastReplayAudio, pausedObjects: s5.objects,
  fpsDesktopHeadless: s6.fps, objectsEnd: sEnd.objects, voice: s1.voice, proxied: [...proxied], errors: errors.slice(0, 10),
}, null, 1));
await browser.close();
