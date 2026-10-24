// End-to-end with the REAL voice module (src/voice) inside the headset app: Chrome's fake microphone loops the voice
// owner's 16 kHz WAV of "There was a piano under the window."; Enable microphone (a real click) creates the module;
// holding Space is push-to-talk; live Cartesia STT → utterances.add(source 'stt') → live Claude → ghost → the
// companion's reply spoken by live TTS. Costs a few seconds of Cartesia STT/TTS. Evidence level: automated browser
// test against live providers (fake mic), not a headset result.
// Usage: node scripts/voice-e2e.mjs [outDir]
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { chromium } from '@playwright/test';
import { api } from '../../../convex/_generated/api.js';

const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
const out = process.argv[2] || new URL('../../../evidence/screens/', import.meta.url).pathname;
const wav = new URL('../../../evidence/raw/voice-check-mic-16k.wav', import.meta.url).pathname;
if (!existsSync(wav)) throw new Error('missing fixture WAV (made by scripts/voice-check.mjs): ' + wav);
const loopMs = Math.round((readFileSync(wav).length - 44) / 2 / 16); // 16 kHz mono s16
mkdirSync(out, { recursive: true });
const family = new ConvexHttpClient(room.url);
await family.mutation(api.rooms.resetDemo, { code: room.code, token: room.token });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`https://127.0.0.1:8081/?room=${room.code}${room.key ? `&key=${room.key}` : ''}`);
await page.waitForFunction(() => window.__mg?.stats?.splatLoaded === true, null, { timeout: 60000 });
await page.waitForTimeout(3500);
const tMic = Date.now();
await page.click('[data-testid=enable-mic]');
await page.waitForFunction(() => window.__mg?.stats?.voice?.source === 'module' && window.__mg?.stats?.voiceReady === true, null, { timeout: 45000 });
const readyMs = Date.now() - tMic;
const mode = await page.evaluate(() => window.__mg.stats.voice.mode);
await page.mouse.move(860, 545); // point at the floor under the window
await page.locator('body').focus().catch(() => undefined);
await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
// Hold for two loops of the fake mic so one whole sentence is inside the turn wherever the loop is.
const holdMs = loopMs * 2 + 200;
await page.keyboard.down('Space');
await page.waitForTimeout(600);
const listening = await page.evaluate(() => window.__mg.stats.companion);
await page.waitForTimeout(holdMs - 600);
const tRelease = Date.now();
await page.keyboard.up('Space');
await page.waitForFunction(() => /piano:(appearing|ghost)/.test(window.__mg?.stats?.objects ?? ''), null, { timeout: 45000 });
const releaseToGhostMs = Date.now() - tRelease;
let speakingSeen = false;
for (let i = 0; i < 40 && !speakingSeen; i++) { await page.waitForTimeout(250); speakingSeen = (await page.evaluate(() => window.__mg.stats.companion)) === 'speaking'; }
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('mg-panel')?.style.setProperty('display', 'none'));
await page.screenshot({ path: `${out}/headset-voice-live-ghost-speaking.png` });
// Replay of the original recording: confirm from the phone, then click the settled piano.
const ghost = (await family.query(api.objects.list, { code: room.code, token: room.token })).find((o) => o.status === 'ghost');
if (ghost) await family.mutation(api.objects.confirm, { code: room.code, token: room.token, objectId: ghost.id, commandId: crypto.randomUUID() });
await page.waitForFunction(() => /piano:solid/.test(window.__mg?.stats?.objects ?? ''), null, { timeout: 15000 }).catch(() => undefined);
await page.waitForTimeout(800);
const picked = await page.evaluate(() => {
  for (let y = -0.6; y <= 0.2; y += 0.05) for (let x = -0.5; x <= 0.6; x += 0.05) { const l = window.__mg.pickAt(x, y); if (l) return l; }
  return null;
});
await page.waitForTimeout(1200);
const replayState = await page.evaluate(() => ({ replay: window.__mg.stats.lastReplay, audio: window.__mg.stats.lastReplayAudio }));
await page.screenshot({ path: `${out}/headset-voice-live-replay.png` });
const s = await page.evaluate(() => window.__mg.stats);
const utts = await family.query(api.utterances.recent, { code: room.code, token: room.token, limit: 3 });
const u = utts[0];
console.log(JSON.stringify({ loopMs, holdMs, voiceReadyMs: readyMs, mode, companionWhileHeld: listening, releaseToGhostMs, speakingSeen,
  utterance: u ? { source: u.source, transcript: u.transcript, intent: u.intent, aiMode: u.aiMode, aiMs: u.aiMs, hasAudio: !!u.audioUrl } : null,
  lastPtt: s.lastPtt, objects: s.objects, lastSpoken: s.lastSpoken, picked, replayState, voice: s.voice, errors: errors.slice(0, 8) }, null, 1));
await browser.close();
