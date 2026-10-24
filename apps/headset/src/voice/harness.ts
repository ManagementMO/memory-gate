// Logic for voice.test.html, a bare test page for this module (not part of the app build). Two ways in:
// - scripts/voice-check.mjs (Playwright, Chrome's fake microphone) calls window.mgVoice.connect(url, code, token);
// - by hand through the headset dev server, e.g. on the Quest: https://<host>:8081/src/voice/voice.test.html?room=CODE
//   joins the room as a storyteller (as the headset does) and offers hold-to-talk, "send to the room" and speak buttons.
// Sample content only. The page shows the AI and recording notices before the microphone opens.
import { ConvexClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import { createVoice, type Voice, type VoiceState } from './index';

const states: { t: number; s: VoiceState }[] = [];
const errors: { t: number; msg: string }[] = [];
let voice: Voice | null = null;
let client: ConvexClient | null = null;
let session: { code: string; token: string } | null = null;
const now = () => Math.round(performance.now());
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function show(): void {
  const st = $('state'); if (st) st.textContent = states[states.length - 1]?.s ?? 'idle';
  const md = $('mode'); if (md) md.textContent = voice ? voice.mode : '–';
  const er = $('errors'); if (er) er.textContent = errors.slice(-3).map((e) => e.msg).join('\n');
}

async function connect(convexUrl: string, code: string, token: string, o: { wait?: boolean } = {}): Promise<{ mode: string; readyMs: number }> {
  client = new ConvexClient(convexUrl, { skipConvexDeploymentUrlCheck: true, unsavedChangesWarning: false });
  session = { code, token };
  const t0 = performance.now();
  voice = createVoice({
    client, api, code, token,
    onState: (s) => { states.push({ t: now(), s }); show(); },
    onError: (msg) => { errors.push({ t: now(), msg }); show(); },
  });
  if (o.wait === false) return { mode: voice.mode, readyMs: -1 }; // tests: press before ready resolves
  await voice.ready;
  show();
  return { mode: voice.mode, readyMs: Math.round(performance.now() - t0) };
}

/** Manual path: send a transcript to the room, wait for the companion's validated reply, speak it. */
async function sendAndReply(transcript: string, durationMs: number, audioFileId: string | null): Promise<string | null> {
  if (!client || !session || !voice) return null;
  const commandId = crypto.randomUUID();
  const { utteranceId } = await client.mutation(api.utterances.add, {
    ...session, transcript, source: 'stt', durationMs, commandId, ...(audioFileId ? { audioFileId: audioFileId as never } : {}),
  });
  for (let i = 0; i < 60; i++) {
    const rows = await client.query(api.utterances.recent, { ...session, limit: 5 });
    const row = rows.find((r) => r.id === utteranceId);
    if (row && row.status !== 'pending') {
      const line = [row.sayBack, row.reply].filter(Boolean).join(' ');
      const out = $('reply'); if (out) out.textContent = `${row.intent ?? 'none'} · ${line}`;
      if (line) await voice.speak(line, { language: row.language });
      return line;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function wireButtons(): void {
  const enable = $<HTMLButtonElement>('enable');
  const talk = $<HTMLButtonElement>('talk');
  const say = $<HTMLButtonElement>('say');
  const hush = $<HTMLButtonElement>('hush');
  if (!enable || !talk || !say || !hush) return;
  enable.addEventListener('click', async () => {
    enable.disabled = true;
    try {
      const params = new URLSearchParams(location.search);
      const code = (($<HTMLInputElement>('room')?.value || params.get('room')) ?? '').trim().toUpperCase();
      const convexUrl = params.get('convex') ?? location.origin;
      if (!code) throw new Error('Type the room code first.');
      const c = new ConvexClient(convexUrl, { skipConvexDeploymentUrlCheck: true, unsavedChangesWarning: false });
      const joined = await c.mutation(api.rooms.join, { code, displayName: 'Voice test', role: 'storyteller' });
      await c.close();
      await connect(convexUrl, joined.code, joined.token);
      talk.disabled = false; say.disabled = false; hush.disabled = false;
    } catch (e) {
      errors.push({ t: now(), msg: String((e as Error).message ?? e) });
      enable.disabled = false;
      show();
    }
  });
  let pressing: Promise<void> | null = null;
  talk.addEventListener('pointerdown', () => { if (voice && !pressing) pressing = voice.start(); });
  const release = async () => {
    if (!voice || !pressing) return;
    const p = pressing; pressing = null;
    await p;
    const r = await voice.stop();
    const heard = $('heard'); if (heard) heard.textContent = r.transcript || '(nothing heard)';
    if (r.transcript && $<HTMLInputElement>('send')?.checked) await sendAndReply(r.transcript, r.durationMs, r.audioFileId);
  };
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) talk.addEventListener(ev, () => { void release(); });
  say.addEventListener('click', () => { void voice?.speak('There was a piano under the window. What did it sound like?'); });
  hush.addEventListener('click', () => voice?.cancelSpeech());
  const meter = $<HTMLMeterElement>('level');
  const tick = () => { if (meter && voice) meter.value = voice.level(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

Object.assign(window, { mgVoice: { connect, sendAndReply, states, errors, get voice() { return voice; } } });
wireButtons();
