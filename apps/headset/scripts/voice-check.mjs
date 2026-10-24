// Voice module check (apps/headset/src/voice) against the RUNNING local backend. It never starts `convex dev`.
// - Real Chrome (Playwright, channel 'chrome') with a fake microphone that loops a 16 kHz WAV of a storyteller line.
// - Real Cartesia STT/TTS through tokens minted by the backend: no provider key is read here or sent to the page.
// - Real Claude extraction through utterances.add (when the deployment's ai.live flag is on).
// Creates throwaway sample rooms (deleted at the end unless --keep), measures latencies and writes
// evidence/voice-check.json. Usage: node apps/headset/scripts/voice-check.mjs [--turns 3] [--headed] [--keep]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
import { repairMojibake } from '../src/voice/text.ts'; // Node 24 strips the types

const here = path.dirname(fileURLToPath(import.meta.url));
const headset = path.resolve(here, '..');
const root = path.resolve(headset, '../..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const TURNS = Number(argv[argv.indexOf('--turns') + 1]) || 3;
const SENTENCE = 'There was a piano under the window.';
const STORYTELLER_VOICE = '6c756032-11c3-4be8-a120-74f9673fb700'; // "Harlow" (prep spike), a different voice than the companion
const LEAD_S = 1.0;
const TRAIL_S = 1.6;
const ALL_SCOPES = ['photo_processing', 'voice_processing', 'voice_recording', 'vendor_upload_modal', 'vendor_upload_worldlabs', 'share_with_family'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome prints a failed WebSocket's full URL (access_token included) to the console; never let that reach evidence.
const redact = (s) => String(s).replace(/access_token=[^&'"\s]+/g, 'access_token=<redacted>').replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>');

// ---------- backend ----------
const envLocal = Object.fromEntries(readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const CONVEX_URL = process.env.CONVEX_URL || envLocal.CONVEX_URL;
if (!CONVEX_URL) throw new Error('CONVEX_URL missing (practice/memory-gate/.env.local)');
const convex = new ConvexHttpClient(CONVEX_URL);

async function makeRoom(title, scopes) {
  const r = await convex.mutation(api.rooms.create, { title, displayName: 'Voice check' });
  if (scopes.length) await convex.mutation(api.consents.give, { code: r.code, token: r.token, scopes });
  return r;
}

// ---------- results ----------
const tests = [];
const check = (name, pass, detail = {}) => { tests.push({ name, pass: !!pass, ...detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${Object.keys(detail).length ? ' ' + JSON.stringify(detail).slice(0, 220) : ''}`); };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
function wer(ref, hyp) {
  const r = norm(ref).split(' '); const h = norm(hyp).split(' ').filter(Boolean);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return +(d[r.length][h.length] / r.length).toFixed(3);
}
const pct = (xs, p) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const stats = (xs) => ({ n: xs.filter((x) => typeof x === 'number').length, p50: pct(xs, 0.5), p90: pct(xs, 0.9), max: pct(xs, 1) });

// ---------- WAV helpers ----------
function pcmOfWav(buf) {
  let o = 12; let rate = 0;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4); const size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(o + 12);
    if (id === 'data') return { rate, pcm: buf.subarray(o + 8, size === 0xffffffff ? buf.length : Math.min(buf.length, o + 8 + size)) };
    o += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}
function wavOf(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** The storyteller line as a 16 kHz WAV, made once with Cartesia TTS using a backend-minted token, padded with silence. */
async function micFixture(mint) {
  const file = path.join(root, 'evidence', 'raw', 'voice-check-mic-16k.wav');
  if (!existsSync(file)) {
    const r = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mint.token}`, 'Cartesia-Version': mint.cartesiaVersion, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: mint.ttsModel, transcript: SENTENCE, voice: { mode: 'id', id: STORYTELLER_VOICE }, language: 'en', output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 16000 } }),
    });
    if (!r.ok) throw new Error(`fixture TTS failed (${r.status})`);
    const { pcm } = pcmOfWav(Buffer.from(await r.arrayBuffer()));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, wavOf(Buffer.concat([Buffer.alloc(Math.round(LEAD_S * 16000) * 2), pcm, Buffer.alloc(Math.round(TRAIL_S * 16000) * 2)]), 16000));
  }
  const { pcm } = pcmOfWav(readFileSync(file));
  const totalSec = pcm.length / 32000;
  return { file, totalSec, speechSec: +(totalSec - LEAD_S - TRAIL_S).toFixed(3) };
}

// ---------- page bundle + static server ----------
async function buildPage() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mg-voice-check-'));
  await esbuild.build({
    entryPoints: [path.join(headset, 'src', 'voice', 'harness.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    outfile: path.join(dir, 'harness.js'), logLevel: 'warning', sourcemap: 'inline',
  });
  const html = readFileSync(path.join(headset, 'src', 'voice', 'voice.test.html'), 'utf8').replace('src="./harness.ts"', 'src="./harness.js"');
  writeFileSync(path.join(dir, 'index.html'), html);
  const server = createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0] === '/' ? 'index.html' : path.basename((req.url ?? '').split('?')[0]);
    const f = path.join(dir, name);
    if (!existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { dir, server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR].filter(Boolean);
  for (const c of candidates) if (existsSync(path.join(c, 'index.mjs'))) return import(pathToFileURL(path.join(c, 'index.mjs')).href);
  return import('@playwright/test');
}

// ---------- page-side helpers (run inside the browser) ----------
async function openVoicePage(context, pageUrl, room, consoleLines, wait = true) {
  const page = await context.newPage();
  page.on('console', (m) => consoleLines.push(redact(`${m.type()}: ${m.text()}`)));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  await page.goto(pageUrl);
  const conn = await page.evaluate(([u, c, t, w]) => window.mgVoice.connect(u, c, t, { wait: w }), [CONVEX_URL, room.code, room.token, wait]);
  return { page, conn };
}

/** Holds push-to-talk from `startPhase` to `releasePhase` of the fake mic's loop (or for holdMs from now). */
function pttTurn(page, o) {
  return page.evaluate(async (o) => {
    const v = window.mgVoice.voice;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const phase = () => (((performance.now() - window.__gumAt) / 1000) % o.period + o.period) % o.period;
    const until = (p) => ((p - phase()) % o.period + o.period) % o.period;
    if (o.startPhase !== undefined) await sleep(until(o.startPhase) * 1000);
    const levels = [];
    const t0 = performance.now();
    const sampler = setInterval(() => levels.push([Math.round(performance.now() - t0), +v.level().toFixed(3)]), 30);
    if (o.race) { // release-before-start: do not await start()
      void v.start();
      const r = await v.stop();
      clearInterval(sampler);
      return { r, holdMs: 0, levels, startPhase: null };
    }
    const startedPhase = phase();
    await v.start();
    if (o.dropAfterMs) { await sleep(o.dropAfterMs); v.debug.dropSockets(); }
    if (o.releasePhase !== undefined) await sleep(until(o.releasePhase) * 1000); else await sleep(o.holdMs);
    clearInterval(sampler);
    const holdMs = Math.round(performance.now() - t0);
    const tr = performance.now();
    const r = await v.stop();
    const stopMs = Math.round(performance.now() - tr);
    const m = v.debug.metrics();
    return { r, holdMs, stopMs, levels, startPhase: +startedPhase.toFixed(3), t0Abs: t0, gumAt: window.__gumAt ?? null, turn: m.turns[m.turns.length - 1] ?? null };
  }, o);
}

/** One long hold to find where the sentence starts in the fake mic's loop (phase from the page's getUserMedia time). */
async function calibrate(page, period) {
  const cal = await pttTurn(page, { period, holdMs: Math.round(period * 1000 + 700) });
  let onset = null; let lastLoud = -1e9;
  for (const [t, l] of cal.levels) { if (l >= 0.15) { if (onset === null && t > 200 && t - lastLoud >= 250) onset = t; lastLoud = t; } }
  // Absolute times, so this also works when the press came before getUserMedia had resolved.
  const onsetPhase = onset === null || cal.gumAt === null ? LEAD_S : (((cal.t0Abs + onset - cal.gumAt) / 1000) % period + period) % period;
  return { onsetPhase, cal, info: { onsetPhase: +onsetPhase.toFixed(3), detected: onset !== null, nominalLeadSec: LEAD_S, holdMs: cal.holdMs, micLevelMax: Math.max(0, ...cal.levels.map((x) => x[1])), transcript: cal.r.transcript } };
}
const phasesFor = (onsetPhase, speechSec, period) => ({ startPhase: ((onsetPhase - 0.6) % period + period) % period, releasePhase: (onsetPhase + speechSec + 0.45) % period });

function speakOn(page, text, o = {}) {
  return page.evaluate(async ([text, o]) => {
    const v = window.mgVoice.voice;
    const levels = [];
    const t0 = performance.now();
    const sampler = setInterval(() => levels.push(+v.level().toFixed(3)), 40);
    await v.speak(text, o.language ? { language: o.language } : undefined);
    clearInterval(sampler);
    const m = v.debug.metrics();
    return { ms: Math.round(performance.now() - t0), maxLevel: Math.max(0, ...levels), m: m.speech[m.speech.length - 1] ?? null };
  }, [text, o]);
}

// ---------- main ----------
const startedAt = new Date();
const consoleLines = [];
const evidence = { kind: 'voice-check', at: startedAt.toISOString(), evidenceLevel: 'automated test against live providers (Chrome fake microphone, local Convex backend); not a headset result', backend: new URL(CONVEX_URL).host };
let browser; let page1; let built; const rooms = {};
try {
  // 0. Garbled model replies (UTF-8 shown as Windows-1250, seen in the live eval) are repaired before speech.
  const garbled = [['ÂżQuĂ© recuerda de esa radio, quiĂ©n la escuchaba?', '¿Qué recuerda de esa radio, quién la escuchaba?'], ['Claro, lo quitamos. ÂżQuĂ© otra cosa recuerda en esa habitaciĂłn?', 'Claro, lo quitamos. ¿Qué otra cosa recuerda en esa habitación?'], ['¿Qué canciones tocaba tu hermana?', '¿Qué canciones tocaba tu hermana?'], ['There was a piano under the window.', 'There was a piano under the window.']];
  check('garbled Spanish replies are repaired before speech; clean text is untouched', garbled.every(([g, want]) => repairMojibake(g) === want), { repaired: garbled.map(([g]) => repairMojibake(g)) });
  rooms.full = await makeRoom('Voice check, all consents (sample)', ALL_SCOPES);
  await convex.mutation(api.rooms.setSettings, { code: rooms.full.code, token: rooms.full.token, familyNames: ['Wilhelmina'] });
  rooms.noRecording = await makeRoom('Voice check, no recording consent (sample)', ['voice_processing']);
  rooms.noConsent = await makeRoom('Voice check, no voice consent (sample)', ['photo_processing']);

  const t0 = performance.now();
  const mint = await convex.action(api.voice.mintToken, { code: rooms.full.code, token: rooms.full.token });
  const nodeMintMs = Math.round(performance.now() - t0);
  check('backend mints a short-lived Cartesia token (no key in the browser)', !!mint.token && mint.sttLive && mint.ttsLive && mint.recording && mint.expiresAt > Date.now(),
    { nodeMintMs, ttlSec: Math.round((mint.expiresAt - Date.now()) / 1000), keyterms: mint.keyterms, ttsModel: mint.ttsModel });
  const fx = await micFixture(mint);
  const period = fx.totalSec;
  evidence.fixture = { sentence: SENTENCE, wav: path.relative(root, fx.file), seconds: +period.toFixed(3), speechSec: fx.speechSec, leadSec: LEAD_S, voice: 'Harlow (Cartesia stock voice)' };

  built = await buildPage();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    channel: 'chrome', headless: !flag('headed'),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fx.file}`, '--autoplay-policy=no-user-gesture-required'],
  });
  evidence.chrome = browser.version();
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const md = navigator.mediaDevices; const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await orig(c); window.__gumAt = performance.now(); return s; };
  });

  // 1. ready: token minted, mic open, STT socket pre-opened.
  const a = await openVoicePage(context, built.url, rooms.full, consoleLines);
  page1 = a.page;
  const m0 = await page1.evaluate(() => window.mgVoice.voice.debug.metrics());
  evidence.ready = { readyMs: a.conn.readyMs, mode: a.conn.mode, mintMs: m0.mintMs, socketOpenMs: m0.socketOpenMs, spare: m0.spare, audio: m0.audio };
  check('ready resolves in live mode with the socket pre-opened', a.conn.mode === 'live' && m0.spare === 'open', evidence.ready);

  // 2. Calibrate the fake mic's loop phase from the mic level (one long hold), then aligned turns.
  const cal = await calibrate(page1, period);
  evidence.calibration = cal.info;
  check('mic level rises with speech while listening', cal.info.micLevelMax > 0.3 && cal.info.detected, cal.info);
  const { startPhase, releasePhase } = phasesFor(cal.onsetPhase, fx.speechSec, period);
  const turnRows = [];
  for (let i = 0; i < TURNS; i++) {
    const r = await pttTurn(page1, { period, startPhase, releasePhase });
    turnRows.push({ transcript: r.r.transcript, wer: wer(SENTENCE, r.r.transcript), durationMs: r.r.durationMs, audioFileId: r.r.audioFileId ? 'stored' : null, holdMs: r.holdMs, stopMs: r.stopMs, ...r.turn });
    if (i === 0) evidence.firstTurnAudioFileId = r.r.audioFileId;
  }
  evidence.turns = turnRows;
  check('STT transcript matches the spoken sentence (WER <= 0.15 on every aligned turn)', turnRows.every((t) => t.wer <= 0.15), { transcripts: turnRows.map((t) => t.transcript), wer: turnRows.map((t) => t.wer) });
  check('turns use the pre-opened socket', turnRows.every((t) => t.warmSocket), { warm: turnRows.map((t) => t.warmSocket) });
  check('release -> final transcript is fast (p50 < 600 ms)', (stats(turnRows.map((t) => t.releaseToTranscriptMs)).p50 ?? 1e9) < 600, { releaseToTranscriptMs: turnRows.map((t) => t.releaseToTranscriptMs), releaseToFlushMs: turnRows.map((t) => t.releaseToFlushMs), releaseToDoneMs: turnRows.map((t) => t.releaseToDoneMs) });
  check('recording consent: the clip is uploaded and returned as audioFileId', turnRows.every((t) => t.audioFileId === 'stored'), { uploadMs: turnRows.map((t) => t.uploadMs) });

  // 3. The transcript goes to utterances.add; Claude extraction runs in the backend; the clip is attached.
  const first = turnRows[0];
  const add = await convex.mutation(api.utterances.add, { code: rooms.full.code, token: rooms.full.token, transcript: first.transcript, source: 'stt', durationMs: first.durationMs, ...(evidence.firstTurnAudioFileId ? { audioFileId: evidence.firstTurnAudioFileId } : {}), commandId: `voice-check-${Date.now()}` });
  let row = null; const tAdd = performance.now();
  for (let i = 0; i < 80 && !(row && row.status !== 'pending'); i++) {
    await sleep(250);
    row = (await convex.query(api.utterances.recent, { code: rooms.full.code, token: rooms.full.token, limit: 5 })).find((u) => u.id === add.utteranceId) ?? null;
  }
  const objs = await convex.query(api.objects.list, { code: rooms.full.code, token: rooms.full.token });
  const piano = objs.find((o) => o.label.includes('piano'));
  let clip = null;
  if (row?.audioUrl) {
    const buf = Buffer.from(await (await fetch(row.audioUrl)).arrayBuffer());
    const { rate, pcm } = pcmOfWav(buf);
    clip = { bytes: buf.length, sampleRate: rate, seconds: +(pcm.length / 2 / rate).toFixed(2) };
  }
  evidence.extraction = { status: row?.status, intent: row?.intent, aiMode: row?.aiMode, aiMs: row?.aiMs, waitedMs: Math.round(performance.now() - tAdd), sayBack: row?.sayBack, reply: row?.reply, dropped: row?.dropped, object: piano ? { label: piano.label, status: piano.status, model: piano.model, where: piano.where, quote: piano.quote } : null, clip };
  check('utterances.add accepts the STT transcript and Claude proposes the piano (live)', row?.status === 'done' && row?.intent === 'propose_object' && row?.aiMode === 'live' && piano?.status === 'ghost', evidence.extraction);
  check('the stored clip is a playable 16 kHz WAV of the turn', !!clip && clip.sampleRate === 16000 && Math.abs(clip.seconds * 1000 - first.durationMs) < 150, { clip, durationMs: first.durationMs });

  // 4. Speech: the companion's validated reply, then a few short lines for latency samples.
  const replyLine = [row?.sayBack, row?.reply].filter(Boolean).join(' ') || 'That sounds lovely. What did it sound like?';
  const speeches = [await speakOn(page1, replyLine)];
  for (const line of ['Thank you for sharing that.', 'What else do you see in the room?', 'Take your time.']) speeches.push(await speakOn(page1, line));
  speeches.push(await speakOn(page1, '¿Qué canciones tocaba tu hermana en ese piano?', { language: 'es' }));
  evidence.speech = speeches.map((s) => ({ ms: s.ms, maxLevel: s.maxLevel, ...s.m }));
  check('speak() plays Cartesia TTS and resolves after playback', speeches.every((s) => s.m?.mode === 'tts' && s.m.audioSec > 0.3 && !s.m.error && s.ms >= s.m.audioSec * 1000 - 50), { ms: speeches.map((s) => s.ms), audioSec: speeches.map((s) => s.m?.audioSec) });
  check('level() follows the speech output', speeches.every((s) => s.maxLevel > 0.2), { maxLevel: speeches.map((s) => s.maxLevel) });
  check('speak() -> first audio p50 < 500 ms', (stats(speeches.map((s) => s.m?.firstAudioMs)).p50 ?? 1e9) < 500, { firstAudioMs: speeches.map((s) => s.m?.firstAudioMs), firstByteMs: speeches.map((s) => s.m?.firstByteMs) });

  // 5. Queue: two lines back to back, in order, never overlapping.
  const q = await page1.evaluate(async () => {
    const v = window.mgVoice.voice; const order = [];
    const a = v.speak('Here is the first line.').then(() => order.push('a'));
    const b = v.speak('And here is the second line, right after it.').then(() => order.push('b'));
    await Promise.all([a, b]);
    const h = v.debug.metrics().speech.slice(-2);
    return { order, h };
  });
  const [qa, qb] = q.h;
  check('queued lines play in order without overlapping', q.order.join('') === 'ab' && qb.firstAudioMs >= qa.audioSec * 1000 - 60, { order: q.order, firstLineSec: qa.audioSec, secondFirstAudioMs: qb.firstAudioMs, secondPlayedMs: qb.playedMs });

  // 6. cancelSpeech: stops at once, drops the queued line and the rest of the stream.
  const c = await page1.evaluate(async () => {
    const v = window.mgVoice.voice; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const long = 'This is a longer companion line that keeps going for quite a while, so that it can be interrupted halfway through to check that the speech stops right away and nothing plays afterwards.';
    const p1 = v.speak(long); const p2 = v.speak('This queued line should never play.');
    let r1 = false; p1.then(() => { r1 = true; });
    await sleep(1200);
    let before = 0; for (let i = 0; i < 15; i++) { before = Math.max(before, v.debug.raw().speech); await sleep(20); } // max over 300 ms (words have gaps)
    const tc = performance.now(); v.cancelSpeech();
    await p1; const resolveMs = Math.round(performance.now() - tc); await p2;
    await sleep(120); const after120 = v.debug.raw().speech;
    let late = 0; for (let i = 0; i < 20; i++) { await sleep(50); late = Math.max(late, v.debug.raw().speech); }
    const h = v.debug.metrics().speech.slice(-2);
    const longM = h.find((x) => x.chars === long.length); const queuedM = h.find((x) => x.chars !== long.length);
    return { before, resolveMs, after120, lateMax: late, r1, longM, queuedM, state: window.mgVoice.states.at(-1)?.s };
  });
  check('cancelSpeech stops speech within ~50 ms and drops the queued line and late chunks', c.before > 0.01 && c.resolveMs < 50 && c.after120 < 0.002 && c.lateMax < 0.002 && c.longM?.cancelled && c.queuedM?.cancelled && c.state === 'idle',
    { rmsBefore: +c.before.toFixed(4), resolveMs: c.resolveMs, rmsAfter120ms: c.after120, lateMax: c.lateMax, longLine: c.longM, queuedLine: c.queuedM });

  // 7. Push-to-talk interrupts speech; speak() while listening is dropped.
  const iv = await page1.evaluate(async () => {
    const v = window.mgVoice.voice; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const p = v.speak('Here is another long line, and the storyteller presses the button while it is still playing.');
    await sleep(900);
    let before = 0; for (let i = 0; i < 15; i++) { before = Math.max(before, v.debug.raw().speech); await sleep(20); }
    await v.start();
    const stateAfterStart = window.mgVoice.states.at(-1)?.s;
    await p; await sleep(100);
    const afterStart = v.debug.raw().speech;
    const ts = performance.now(); await v.speak('This should be dropped while listening.'); const droppedMs = Math.round(performance.now() - ts);
    await sleep(400);
    const r = await v.stop();
    return { before, stateAfterStart, afterStart, droppedMs, transcriptChars: r.transcript.length, final: window.mgVoice.states.at(-1)?.s };
  });
  check('pressing push-to-talk stops speech; speak() during listening is dropped', iv.before > 0.01 && iv.stateAfterStart === 'listening' && iv.afterStart < 0.002 && iv.droppedMs < 30 && iv.final === 'idle', iv);

  // 8. Release-before-start race, and stop() with no start.
  const race = await pttTurn(page1, { period, race: true });
  const noStart = await page1.evaluate(async () => { const t = performance.now(); const r = await window.mgVoice.voice.stop(); return { r, ms: Math.round(performance.now() - t) }; });
  const afterRace = await pttTurn(page1, { period, startPhase, releasePhase });
  check('release-before-start: stop() awaits start(), returns, and the next turn still works', race.r && typeof race.r.transcript === 'string' && noStart.r.transcript === '' && noStart.ms < 20 && wer(SENTENCE, afterRace.r.transcript) <= 0.15,
    { raceTranscriptChars: race.r.transcript.length, noStartMs: noStart.ms, nextTurn: afterRace.r.transcript });

  // 9. Dropped connections: the idle socket reconnects; a socket lost mid-turn is replayed from the kept clip.
  const drop = await page1.evaluate(async () => {
    const v = window.mgVoice.voice; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 50 && v.debug.metrics().spare !== 'open'; i++) await sleep(100); // drop an OPEN idle socket
    const drops0 = v.debug.metrics().socketDrops; v.debug.dropSockets(); const t = performance.now();
    let spare = 'none'; for (let i = 0; i < 100; i++) { await sleep(100); spare = v.debug.metrics().spare; if (spare === 'open' && performance.now() - t > 300) break; }
    const m = v.debug.metrics();
    return { reconnectMs: Math.round(performance.now() - t), spare, drops: m.socketDrops - drops0 };
  });
  const afterDrop = await pttTurn(page1, { period, startPhase, releasePhase });
  const midDrop = await pttTurn(page1, { period, startPhase, releasePhase, dropAfterMs: 900 });
  check('an idle socket that drops is reopened and the next turn works', drop.spare === 'open' && drop.drops === 1 && wer(SENTENCE, afterDrop.r.transcript) <= 0.15, { ...drop, transcript: afterDrop.r.transcript });
  check('a socket lost mid-turn: the kept clip is replayed and the words still arrive', midDrop.turn?.replayed === true && wer(SENTENCE, midDrop.r.transcript) <= 0.15, { transcript: midDrop.r.transcript, releaseToTranscriptMs: midDrop.turn?.releaseToTranscriptMs });
  evidence.reconnect = { idleDrop: drop, afterDropTurn: afterDrop.turn, midTurnDrop: midDrop.turn };

  // 10. Token refresh: a new token, the idle socket rotated, speech and a turn still work.
  const rf = await page1.evaluate(async () => {
    const v = window.mgVoice.voice; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const m0 = v.debug.metrics(); const ok = await v.debug.refreshToken();
    for (let i = 0; i < 50 && v.debug.metrics().spare !== 'open'; i++) await sleep(100);
    const m1 = v.debug.metrics();
    return { ok, refreshes: m1.refreshes - m0.refreshes, tokenValidForSec: Math.round(m1.tokenValidForMs / 1000), spare: m1.spare, mintMs: m1.mintMs.at(-1) };
  });
  const afterRefreshSpeech = await speakOn(page1, 'Still here with you.');
  const afterRefreshTurn = await pttTurn(page1, { period, startPhase, releasePhase });
  check('token refresh mints a new token; speech and STT keep working', rf.ok && rf.refreshes === 1 && rf.spare === 'open' && afterRefreshSpeech.m?.mode === 'tts' && wer(SENTENCE, afterRefreshTurn.r.transcript) <= 0.15, { ...rf, ttsFirstAudioMs: afterRefreshSpeech.m?.firstAudioMs, transcript: afterRefreshTurn.r.transcript });
  await page1.evaluate(() => window.mgVoice.voice.dispose());

  // 11. Voice consent without recording consent: no clip is kept (audioFileId null), the words still go through.
  // (The press comes right after createVoice, before ready resolves: start() waits only for the mic and the token.)
  const b = await openVoicePage(context, built.url, rooms.noRecording, consoleLines, false);
  const calB = await calibrate(b.page, period);
  const mb = await b.page.evaluate(() => window.mgVoice.voice.debug.metrics());
  check('a press before ready resolves still captures and transcribes the clip', calB.info.transcript.toLowerCase().includes('piano under the window'), { transcript: calB.info.transcript, firstTurn: calB.cal.turn });
  const nb = await pttTurn(b.page, { period, ...phasesFor(calB.onsetPhase, fx.speechSec, period) });
  const addB = await convex.mutation(api.utterances.add, { code: rooms.noRecording.code, token: rooms.noRecording.token, transcript: nb.r.transcript || SENTENCE, source: 'stt', durationMs: nb.r.durationMs, commandId: `voice-check-b-${Date.now()}` });
  check('no voice_recording consent: audioFileId is null and nothing is uploaded', mb.mode === 'live' && mb.recording === false && nb.r.audioFileId === null && nb.turn?.uploadMs === null && wer(SENTENCE, nb.r.transcript) <= 0.15 && !!addB.utteranceId, { transcript: nb.r.transcript, audioFileId: nb.r.audioFileId });
  await b.page.evaluate(() => window.mgVoice.voice.dispose());
  await b.page.close();

  // 12. No voice consent: mock mode (typed input), captions-only speech timing, a plain-language error.
  const cpage = await openVoicePage(context, built.url, rooms.noConsent, consoleLines);
  const mock = await cpage.page.evaluate(async () => {
    const v = window.mgVoice.voice;
    const ts = performance.now(); await v.start(); const r = await v.stop(); const pttMs = Math.round(performance.now() - ts);
    const text = 'A caption-only line.'; const t1 = performance.now(); await v.speak(text); const speakMs = Math.round(performance.now() - t1);
    return { mode: v.mode, r, pttMs, speakMs, chars: text.length, errors: window.mgVoice.errors.map((e) => e.msg), last: v.debug.metrics().speech.at(-1) };
  });
  check('mock mode: empty transcript, ~60 ms per character captions, consent message', mock.mode === 'mock' && mock.r.transcript === '' && mock.r.audioFileId === null && mock.pttMs < 100 && Math.abs(mock.speakMs - 60 * mock.chars) < 150 && mock.last?.mode === 'captions' && mock.errors.some((e) => /permission/i.test(e)), mock);
  evidence.mock = mock;
  await cpage.page.close();

  // 13. Nothing sensitive in the console: no tokens, no transcript words.
  const leaks = consoleLines.filter((l) => /access_token|Bearer|piano/i.test(l)); // lines are redacted on capture, so a hit means a URL with a token was printed
  check('console shows no tokens or transcripts (only the short debug line)', leaks.length === 0, { consoleLines: consoleLines.slice(0, 12), leaks: leaks.slice(0, 3) });

  // Latency summary
  const allTurns = [...turnRows, afterRace.turn, afterDrop.turn, afterRefreshTurn.turn, nb.turn].filter(Boolean);
  const speechAll = [...speeches.map((s) => s.m), afterRefreshSpeech.m].filter(Boolean);
  evidence.latency = {
    releaseToFinalTranscriptMs: stats(allTurns.map((t) => t.releaseToTranscriptMs)),
    releaseToFlushDoneMs: stats(allTurns.map((t) => t.releaseToFlushMs)),
    releaseToDoneMs: stats(allTurns.map((t) => t.releaseToDoneMs)),
    releaseToStopResolvedWithUploadMs: stats(turnRows.map((t) => t.releaseToResultMs)),
    clipUploadMs: stats(turnRows.map((t) => t.uploadMs)),
    speakToFirstAudioMs: stats(speechAll.map((s) => s.firstAudioMs)),
    ttsFirstByteMs: stats(speechAll.map((s) => s.firstByteMs)),
    ttsTotalFetchMs: stats(speechAll.map((s) => s.fetchMs)),
    readyMs: evidence.ready.readyMs,
    socketOpenMs: m0.socketOpenMs,
    mintMs: m0.mintMs,
    note: 'release = stop() called; first audio = first sample scheduled on the AudioContext (output device latency not included)',
  };
  const sttSec = allTurns.reduce((s, t) => s + t.audioSec, 0) + 2 * cal.info.holdMs / 1000;
  const ttsChars = speechAll.reduce((s, m) => s + m.chars, 0) + 400;
  evidence.spend = { cartesiaSttSec: +sttSec.toFixed(1), cartesiaTtsChars: ttsChars, claudeExtractions: 2, estUsd: 0.03 };
  try { appendFileSync(path.join(root, '.logs', 'spend.log'), `${new Date().toISOString()}\tcartesia+anthropic\tvoice-check: ${ttsChars} TTS chars, ${sttSec.toFixed(0)}s STT, 2 Claude extractions via backend\t$0.030 estimated\n`); } catch { /* optional */ }
} catch (e) {
  check('voice check ran to completion', false, { error: String(e?.stack ?? e).slice(0, 600) });
} finally {
  await browser?.close().catch(() => {});
  built?.server.close();
  if (built?.dir) rmSync(built.dir, { recursive: true, force: true });
  if (!flag('keep')) {
    for (const r of Object.values(rooms)) await convex.mutation(api.consents.deleteMemory, { code: r.code, token: r.token, confirmText: r.code }).catch(() => {});
  }
  evidence.rooms = Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, r.code]));
  evidence.roomsDeleted = !flag('keep');
  evidence.tests = tests;
  evidence.passed = tests.filter((t) => t.pass).length;
  evidence.failed = tests.filter((t) => !t.pass).length;
  evidence.durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);
  mkdirSync(path.join(root, 'evidence'), { recursive: true });
  writeFileSync(path.join(root, 'evidence', 'voice-check.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`\n${evidence.passed}/${tests.length} checks passed -> evidence/voice-check.json`);
  if (evidence.latency) console.log(JSON.stringify(evidence.latency));
  process.exitCode = evidence.failed ? 1 : 0;
}
