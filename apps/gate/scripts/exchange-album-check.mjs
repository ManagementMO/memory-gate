// The album's "From family" row, end to end with the team's memory exchange: a family member passes a (fictional)
// story to the person, who sees it in the album, keeps it, and opens it to read it in the sender's own words.
//   node apps/gate/scripts/exchange-album-check.mjs [outDir]
// Needs the exchange running (SpacetimeDB + the gateway; EXCHANGE_PORT from .env.exchange, default 3212). Free.
import { chromium } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference as ref } from 'convex/server';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

const out = process.argv[2] ?? 'apps/gate/.shots/exchange-album';
mkdirSync(out, { recursive: true });
const env = (file, key) => existsSync(file) ? readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() : undefined;
const convexUrl = env('.env.local', 'CONVEX_URL') ?? 'http://127.0.0.1:3210';
const port = env('.env.exchange', 'EXCHANGE_PORT') ?? '3212';
const base = process.env.GATE_URL ?? 'https://localhost:5180/';
const backend = new ConvexHttpClient(convexUrl);
const t0 = Date.now();
const note = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${m}`);
let ok = true;
const check = (c, m) => { note(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) ok = false; };

// A fictional family room: Alex tells a story and passes it to Sam.
const owner = await backend.mutation(ref('rooms:create'), { title: 'Album exchange check (fictional)', displayName: 'Alex', offline: true, demo: true });
const room = await backend.query(ref('rooms:get'), owner);
const sam = await backend.mutation(ref('rooms:join'), { code: owner.code, key: room.joinKey, displayName: 'Sam', role: 'family' });
await backend.mutation(ref('consents:give'), { ...owner, scopes: ['voice_processing', 'share_with_family'] });
const { utteranceId } = await backend.mutation(ref('utterances:add'), { ...owner, transcript: 'We sat on the bench by the lake and watched the boats come in. This is a fictional test story.', source: 'typed', commandId: randomUUID() });
let context = null;
for (let i = 0; i < 100 && !context; i++) { const c = await backend.query(ref('exchange:context'), owner); if (c.sources.some((s) => s.id === utteranceId)) context = c; else await new Promise((r) => setTimeout(r, 100)); }
const recipientId = context.members.find((m) => m.name === 'Sam').id;
const socket = new WebSocket(`ws://127.0.0.1:${port}/exchange`, { origin: 'https://localhost:5180' });
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
const send = (m) => new Promise((resolve, reject) => {
  const requestId = randomUUID();
  const onMsg = (raw) => { const d = JSON.parse(raw.toString()); if (d.requestId !== requestId) return; socket.off('message', onMsg); d.type === 'ack' ? resolve(d) : reject(new Error(d.message)); };
  socket.on('message', onMsg); socket.send(JSON.stringify({ ...m, requestId }));
});
await send({ type: 'join', ...owner });
await send({ type: 'pass', sourceId: utteranceId, recipientId, title: 'The bench by the lake', commandId: randomUUID() });
socket.close();
note('Alex passed a story to Sam');

// Sam's album.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${base}?preview=album&xcode=${owner.code}&xtoken=${sam.token}`, { waitUntil: 'load' });
const shown = await page.waitForSelector('[data-testid=family-incoming]', { timeout: 20000 }).then(() => true, () => false);
check(shown, 'the album shows the passed memory under "From family"');
await page.evaluate(() => document.querySelector('[data-testid=from-family]')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/01-incoming.png`, timeout: 45000 }).catch(() => undefined);
if (shown) await page.click('[data-testid=family-keep]');
const kept = await page.waitForSelector('[data-testid=family-open]', { timeout: 15000 }).then(() => true, () => false);
check(kept, 'Keep it moves it into the kept memories');
if (kept) await page.click('[data-testid=family-open]');
const opened = await page.waitForFunction(() => /bench by the lake/i.test(document.querySelector('[data-testid=from-family] blockquote')?.textContent ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
check(opened, 'Open shows the story in the sender\'s own words');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/02-opened.png`, timeout: 45000 }).catch(() => undefined);
note(`errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) note(`  ${e}`);
await browser.close();
note(ok ? 'exchange album: all checks passed' : 'exchange album: some checks failed');
process.exit(ok ? 0 : 1);
