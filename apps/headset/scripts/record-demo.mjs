// Records the spectator view while the story plays: a storyteller headset session (typed mock voice, named
// "Grandma (sample)") speaks two lines (EN + ES), the family's phone session confirms each, then pauses and resumes.
// Output: evidence/video/practice-demo-spectator.webm. Sample content only (public-domain 1934 photo, fictional lines).
// Usage: node scripts/record-demo.mjs [baseUrl]   (room from .test-room.json; resets the room first)
import { readFileSync, renameSync, mkdirSync, readdirSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { chromium } from '@playwright/test';
import { api } from '../../../convex/_generated/api.js';

const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
const base = process.argv[2] || 'https://127.0.0.1:8081/';
const videoDir = new URL('../../../evidence/video/', import.meta.url).pathname;
mkdirSync(videoDir, { recursive: true });
const family = new ConvexHttpClient(room.url);
const cmd = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await family.mutation(api.rooms.resetDemo, { code: room.code, token: room.token });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctxS = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } });
const spec = await ctxS.newPage();
const wait = (fn, ms = 60000) => spec.waitForFunction(fn, null, { timeout: ms });
const t0 = Date.now(); const mark = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${s}`);
await spec.goto(`${base}?room=${room.code}&view=spectator`);
await wait(() => window.__mg?.stats?.splatLoaded === true, 90000);
mark('spectator: room loaded');
await sleep(6000);

const ctxH = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
const head = await ctxH.newPage();
await head.goto(`${base}?room=${room.code}${room.key ? `&key=${room.key}` : ''}&voice=mock&name=${encodeURIComponent('Grandma (sample)')}`);
await head.waitForFunction(() => window.__mg?.stats?.splatLoaded === true, null, { timeout: 90000 });
await sleep(1200);
const ghostCount = () => spec.evaluate(() => ((window.__mg?.stats?.objects ?? '').match(/:(appearing|ghost)/g) ?? []).length);
const solidCount = () => spec.evaluate(() => ((window.__mg?.stats?.objects ?? '').match(/:solid/g) ?? []).length);

async function sayAndConfirm(sentence, aim, label) {
  await head.mouse.move(aim[0], aim[1]);
  await head.evaluate((s) => window.__mg.say(s), sentence);
  mark(`storyteller: "${sentence}"`);
  const before = await solidCount();
  for (let i = 0; i < 60 && (await ghostCount()) < 1; i++) await sleep(500);
  mark(`spectator: ${label} ghost`);
  await sleep(6500); // say-back + ticker readable
  const ghost = (await family.query(api.objects.list, { code: room.code, token: room.token })).find((o) => o.status === 'ghost' && o.label === label)
    ?? (await family.query(api.objects.list, { code: room.code, token: room.token })).find((o) => o.status === 'ghost');
  if (ghost) await family.mutation(api.objects.confirm, { code: room.code, token: room.token, objectId: ghost.id, commandId: cmd() });
  for (let i = 0; i < 30 && (await solidCount()) <= before; i++) await sleep(500);
  mark(`family: confirmed ${label}`);
  await sleep(7000); // settle + the companion's open question
}
await sayAndConfirm('There was a piano by the fireplace.', [860, 610], 'piano');
await sayAndConfirm('Había un radio sobre la mesa.', [1110, 545], 'radio');
await family.mutation(api.rooms.setPaused, { code: room.code, token: room.token, paused: true, commandId: cmd() });
mark('family: pause'); await sleep(4000);
await family.mutation(api.rooms.setPaused, { code: room.code, token: room.token, paused: false, commandId: cmd() });
mark('family: resume'); await sleep(6000);
const stats = await spec.evaluate(() => window.__mg?.stats ?? {});
await ctxH.close();
await ctxS.close(); // finalizes the video
await browser.close();
const files = readdirSync(videoDir).filter((f) => f.endsWith('.webm') && !f.startsWith('practice-'));
if (files[0]) renameSync(`${videoDir}/${files[0]}`, `${videoDir}/practice-demo-spectator.webm`);
console.log(JSON.stringify({ code: room.code, objects: stats.objects, ticker: stats.ticker, fps: stats.fps, video: 'evidence/video/practice-demo-spectator.webm' }, null, 1));
