// The real voice loop, hands-free: a recorded WAV plays as Chrome's microphone (synthesized speech, not a person),
// our turn detector decides when the speaker starts and stops, Cartesia transcribes, Claude answers, Cartesia speaks.
// Spends a few cents. Usage: node apps/gate/scripts/voice-e2e.mjs <mic.wav> [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const wav = process.argv[2];
const out = process.argv[3] ?? 'apps/gate/.shots/voice-e2e';
if (!wav) { console.error('usage: voice-e2e.mjs <mic.wav> [outDir]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true, permissions: ['microphone'] });
const page = await ctx.newPage();
const t0 = Date.now();
const log = [];
const note = (s) => { const l = `${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`; log.push(l); console.log(l); };
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errors.push(t.slice(0, 240)); if (/\[voice\]/.test(t)) note(`console ${t.slice(0, 160)}`); });
await page.goto('https://localhost:5180/?companion=figure', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.getByTestId('begin').click();
note('tapped Begin (the only tap; everything after is spoken)');
let last = { said: '', heard: '', stage: '', voice: '' };
const until = Date.now() + 170_000;
while (Date.now() < until) {
  const s = await page.evaluate(() => { const g = window.__gate.store.getState(); return { said: g.companionLine?.text ?? '', heard: g.heardLine ? `${g.heardLine.interim ? '(interim) ' : ''}${g.heardLine.text}` : '', stage: g.stage, voice: g.voice, mood: g.mood }; });
  if (s.voice !== last.voice) note(`voice engine: ${s.voice}`);
  if (s.stage !== last.stage) note(`stage → ${s.stage}`);
  if (s.said !== last.said && s.said) note(`companion: ${s.said}`);
  if (s.heard !== last.heard && s.heard && !s.heard.startsWith('(interim)')) note(`heard: ${s.heard}`);
  else if (s.heard !== last.heard && s.heard) { /* interim words are frequent; keep the log short */ }
  last = s;
  if (s.stage === 'memory') { await page.waitForTimeout(4000); await page.screenshot({ path: `${out}/memory.png` }); note('in the memory (screenshot)'); break; }
  await page.waitForTimeout(250);
}
note(`errors: ${errors.length}`); for (const e of errors.slice(0, 10)) note(`  ${e}`);
writeFileSync(`${out}/log.txt`, log.join('\n') + '\n');
await browser.close();
