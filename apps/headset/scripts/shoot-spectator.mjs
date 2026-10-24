// Spectator view screenshots (npm run shoot:spectator): a projector page joined as a read-only viewer while a
// headset page (storyteller, typed mock voice) speaks and the family's phone session confirms and pauses.
// Writes evidence/screens/spectator-*.png: the room; a ghost with the ticker; settled; paused (+ taken back).
// Usage: node scripts/shoot-spectator.mjs [outDir] [baseUrl]   (room from .test-room.json; resets the room first)
import { readFileSync, mkdirSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { chromium } from '@playwright/test';
import { api } from '../../../convex/_generated/api.js';

const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
const out = process.argv[2] || new URL('../../../evidence/screens/', import.meta.url).pathname;
const base = process.argv[3] || 'https://127.0.0.1:8081/';
const sentence = process.env.SENTENCE || 'There was a piano by the fireplace';
const [aimX, aimY] = (process.env.AIM || '860,610').split(',').map(Number); // headset mouse aim (px) for placement
mkdirSync(out, { recursive: true });
const family = new ConvexHttpClient(room.url);
const cmd = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await family.mutation(api.rooms.resetDemo, { code: room.code, token: room.token });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctxS = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
const spec = await ctxS.newPage();
const errors = [];
spec.on('pageerror', (e) => errors.push(`spectator: ${String(e).slice(0, 200)}`));
spec.on('console', (m) => { if (m.type() === 'error') errors.push(`spectator: ${m.text().slice(0, 200)}`); });
const stats = () => spec.evaluate(() => window.__mg?.stats ?? {});
const waitFor = (fn, arg, ms = 60000) => spec.waitForFunction(fn, arg, { timeout: ms });
const shot = async (name) => { await spec.screenshot({ path: `${out}/spectator-${name}.png` }); console.log('shot', name); };

await spec.goto(`${base}?room=${room.code}&view=spectator`);
await waitFor(() => window.__mg?.stats?.splatLoaded === true, null, 90000);
await sleep(5000);
await shot('1-room');
const s1 = await stats();

// The storyteller speaks from the headset (a second, separate browser session).
const ctxH = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
const head = await ctxH.newPage();
head.on('pageerror', (e) => errors.push(`headset: ${String(e).slice(0, 200)}`));
await head.goto(`${base}?room=${room.code}${room.key ? `&key=${room.key}` : ''}&voice=mock`);
await head.waitForFunction(() => window.__mg?.stats?.splatLoaded === true, null, { timeout: 90000 });
await sleep(1500);
await head.mouse.move(aimX, aimY);
const tSay = Date.now();
await head.evaluate((s) => window.__mg.say(s), sentence);
await waitFor(() => /:(appearing|ghost)/.test(window.__mg?.stats?.objects ?? ''), null, 30000);
const ghostSeenMs = Date.now() - tSay;
await head.close();
await waitFor(() => /:ghost/.test(window.__mg?.stats?.objects ?? ''), null, 10000);
await waitFor(() => (window.__mg?.stats?.spokenCount ?? 0) >= 1, null, 15000).catch(() => undefined);
await sleep(900);
await shot('2-ghost-ticker');
const s2 = await stats();

const ghost = (await family.query(api.objects.list, { code: room.code, token: room.token })).find((o) => o.status === 'ghost');
await family.mutation(api.objects.confirm, { code: room.code, token: room.token, objectId: ghost.id, commandId: cmd() });
await waitFor(() => /:solid/.test(window.__mg?.stats?.objects ?? ''), null, 15000);
await sleep(1800);
await shot('3-settled');
const s3 = await stats();

await family.mutation(api.rooms.setPaused, { code: room.code, token: room.token, paused: true, commandId: cmd() });
await sleep(2400);
await shot('4-paused');
const s4 = await stats();
await family.mutation(api.rooms.setPaused, { code: room.code, token: room.token, paused: false, commandId: cmd() });
await sleep(2400);
await family.mutation(api.objects.undo, { code: room.code, token: room.token, commandId: cmd() });
await family.mutation(api.objects.undo, { code: room.code, token: room.token, commandId: cmd() });
await waitFor(() => !/:/.test(window.__mg?.stats?.objects ?? ''), null, 15000).catch(() => undefined);
await sleep(600);
await shot('5-taken-back');
const s5 = await stats();
await sleep(4000); // fps over a few calm seconds
const s6 = await stats();
console.log(JSON.stringify({
  code: room.code, splatLoadMs: s1.splatLoadMs, drift: s1.drift, audio: s1.audio, spectatorRole: 'viewer', sayToGhostOnSpectatorMs: ghostSeenMs,
  ticker2: s2.ticker, companion2: s2.lastSpoken, ticker3: s3.ticker, companion3: s3.lastSpoken, chimes: s3.chimes, pausedTicker: s4.ticker,
  objects4: s4.objects, ticker5: s5.ticker, fpsDesktopHeadless: s6.fps, errors: errors.slice(0, 10),
}, null, 1));
await browser.close();
