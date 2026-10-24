// Live model check. Default (one Tripo re-texture, ~10 credits): a spoken detail on a library object ("a black piano")
// makes the backend re-texture the library model while it is a ghost; the headset must cross-dissolve to it.
// SENTENCE="There was a birdcage by the window" PREFIX=headset-live-gen (one Tripo generation, ~20 credits, ~2-3 min):
// a non-library object shows the "imagining…" placeholder until the generated model arrives, then cross-dissolves.
// Usage: node scripts/live-model.mjs [outDir]   (room from .test-room.json; resets the room first)
import { readFileSync, mkdirSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { chromium } from '@playwright/test';
import { api } from '../../../convex/_generated/api.js';

const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
const out = process.argv[2] || new URL('../../../evidence/screens/', import.meta.url).pathname;
const sentence = process.env.SENTENCE || 'There was a black piano under the window';
const prefix = process.env.PREFIX || 'headset-live';
mkdirSync(out, { recursive: true });
const family = new ConvexHttpClient(room.url);
await family.mutation(api.rooms.resetDemo, { code: room.code, token: room.token });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`https://127.0.0.1:8081/?room=${room.code}${room.key ? `&key=${room.key}` : ''}&voice=mock`);
await page.waitForFunction(() => window.__mg?.stats?.splatLoaded === true, null, { timeout: 60000 });
await page.waitForTimeout(4000);
await page.mouse.move(860, 545);
const t0 = Date.now();
await page.evaluate((s) => window.__mg.say(s), sentence);
await page.waitForFunction(() => /:ghost/.test(window.__mg?.stats?.objects ?? ''), null, { timeout: 30000 });
const recs1 = await page.evaluate(() => window.__mg.stats.objectRecords);
const ghostMs = Date.now() - t0;
await page.evaluate(() => document.getElementById('mg-panel')?.style.setProperty('display', 'none'));
const objectsAtGhost = await page.evaluate(() => window.__mg.stats.objects);
await page.screenshot({ path: `${out}/${prefix}-1-first-ghost.png` });
// wait for the re-textured model (up to 3 minutes), then catch the cross-dissolve
await page.waitForFunction(() => (window.__mg?.stats?.modelSwaps ?? 0) >= 1, null, { timeout: 300000 });
const swapMs = Date.now() - t0;
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/${prefix}-2-cross-dissolve.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/${prefix}-3-new-model-ghost.png` });
const s = await page.evaluate(() => window.__mg.stats);
console.log(JSON.stringify({ sentence, ghostMs, objectsAtGhost, recordsAtGhost: recs1, swapMs, records: s.objectRecords, objects: s.objects, swaps: s.modelSwaps, errors }, null, 1));
await browser.close();
