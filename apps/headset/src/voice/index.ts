// Memory Gate voice module (owner C): push-to-talk speech-to-text (Cartesia ink-2), companion speech (Cartesia Sonic)
// and the optional original-clip recording. The headset codes against this contract (mirrored in src/voiceTypes.ts):
//   ready         token minted, mic opened, STT socket pre-opened, or mock mode. Always resolves; problems go to
//                 onError in plain words. Call it from the 2D page's "Enable microphone" button, before Enter XR.
//   start()       push-to-talk pressed. Stops companion speech first: the mic and speech never overlap.
//   stop()        released. Awaits start() (release-before-start is safe), sends finalize -> flush_done -> close ->
//                 done and returns the exact is_final transcript, the clip length and, only with voice_recording
//                 consent and a non-empty transcript, the uploaded WAV's storage id. Empty transcript in mock mode.
//   speak(text)   a queued companion line; resolves when it has finished playing (or was cancelled). Captions-only
//                 timing (~60 ms per character) when speech is unavailable.
//   cancelSpeech, level (0..1: mic while listening, speech while speaking), mode.
// mode: 'live' means speech-to-text works right now; 'mock' means type instead (speech output may still be live).
// State: listening (button down) > speaking > thinking (finalizing the transcript / saving the clip) > idle.
// Keys never reach the browser: the backend mints a short-lived Cartesia access token (10 min) for room members with
// voice consent; it is refreshed 2 minutes before expiry. Tokens and transcripts are never logged.
import type { ConvexClient } from 'convex/browser';
import { MIC_RATE, Mic } from './mic';
import { SttSession, sttUrl, type SttOutcome } from './stt';
import { Speaker, type SpeakMetrics, type TtsAuth } from './tts';
import { repairMojibake } from './text';
import { encodeWav } from './wav';

export { repairMojibake }; // the app can apply the same repair to captions

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type VoiceResult = { transcript: string; durationMs: number; audioFileId: string | null };
export type VoiceOptions = {
  client: Pick<ConvexClient, 'action' | 'mutation'>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated Convex api object (anyApi)
  api: any;
  code: string;
  token: string;
  onState: (s: VoiceState) => void;
  onError: (msg: string) => void;
};

export type TurnMetrics = {
  id: number;
  audioSec: number;
  warmSocket: boolean; // the pre-opened socket was already open when the button went down
  releaseToFlushMs: number | null; // stop() -> flush_done (every final word received)
  releaseToDoneMs: number | null; // stop() -> done (authoritative end)
  releaseToTranscriptMs: number; // stop() -> transcript ready
  uploadMs: number | null; // clip upload (only with voice_recording consent)
  releaseToResultMs: number; // stop() -> stop() resolved
  chars: number;
  replayed: boolean; // the socket failed mid-turn and the kept clip was replayed on a fresh one
  error: string | null;
};

export type VoiceMetrics = {
  mode: 'live' | 'mock';
  sttLive: boolean;
  ttsLive: boolean;
  recording: boolean;
  micOk: boolean;
  tokenValidForMs: number;
  mintMs: number[];
  refreshes: number;
  mintFailures: number;
  socketOpenMs: number[];
  socketDrops: number;
  spare: string;
  turns: TurnMetrics[];
  speech: SpeakMetrics[];
  audio: { sampleRate: number | null; baseLatency: number | null; outputLatency: number | null; state: string };
};

export type Voice = {
  ready: Promise<void>;
  start(): Promise<void>;
  stop(): Promise<VoiceResult>;
  /** `language` (ISO 639-1, optional) is passed to Sonic when it is one of its languages; otherwise inferred. */
  speak(text: string, opts?: { language?: string | null }): Promise<void>;
  cancelSpeech(): void;
  level(): number;
  readonly mode: 'live' | 'mock';
  /** Not part of the headset contract: timings and test hooks for scripts/voice-check.mjs and a debug HUD. */
  readonly debug: { metrics(): VoiceMetrics; refreshToken(): Promise<boolean>; dropSockets(): void; raw(): { mic: number; speech: number } };
  /** Not part of the headset contract: closes sockets, the mic and audio (e.g. when leaving the room). */
  dispose(): void;
};

type Mint = {
  token: string | null; expiresAt: number | null; voiceId: string; ttsModel: string; cartesiaVersion: string;
  keyterms: string[]; recording: boolean; sttLive: boolean; ttsLive: boolean;
};

type Turn = {
  id: number; pressedAt: number; started: Promise<void>; micId: number | null; session: SttSession | null; warm: boolean;
  frames: Int16Array<ArrayBuffer>[]; samples: number; capTimer: ReturnType<typeof setTimeout> | null;
};

const TOKEN_MARGIN_MS = 5_000; // a token counts as expired this long before its end
const REFRESH_BEFORE_MS = 120_000; // refresh this long before expiry
const RETRY_MS = 15_000; // after a failed mint
const RECHECK_MS = 60_000; // while voice is off (flags or consent can change from the phone)
const MAX_TURN_MS = 45_000; // a turn stops capturing after this long
const MIN_CLIP_MS = 500; // shorter clips are never kept (a tap, not an utterance; the app may discard the result)
const READY_SOCKET_WAIT_MS = 30_000; // a cold first connection once took 22 s (prep V4)
const ERROR_REPEAT_MS = 30_000; // the same message is not repeated within this window

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function errCode(e: unknown): string | null {
  const d = (e as { data?: unknown } | null)?.data;
  if (d && typeof d === 'object' && typeof (d as { code?: unknown }).code === 'string') return (d as { code: string }).code;
  const m = String((e as Error)?.message ?? e).match(/\b(NO_CONSENT|NOT_A_MEMBER|ROOM_NOT_FOUND|FORBIDDEN|NO_KEY|PROVIDER)\b/);
  return m?.[1] ?? null;
}

function micMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The microphone is blocked. Allow it for this page and reload; typing works meanwhile.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found, so typing is on.';
  if (name === 'NotReadableError') return 'The microphone is busy in another app. Close it and reload; typing works meanwhile.';
  return 'The microphone could not start, so typing is on.';
}

function mintMessage(code: string | null): string {
  if (code === 'NO_CONSENT') return 'Voice needs permission first. On the phone, turn on voice in the room’s permissions.';
  if (code === 'NOT_A_MEMBER' || code === 'ROOM_NOT_FOUND') return 'This headset is no longer part of the room. Reload to join again.';
  return 'Voice isn’t available right now, so typing is on.';
}

/** Upload URLs come back on the backend's own origin; send them through the origin the Convex client uses (the
 * headset's dev-server proxy), so the Quest uploads over the page's HTTPS like every other backend call. */
function sameOriginUpload(url: string, client: VoiceOptions['client']): string {
  try {
    const u = new URL(url);
    let base: string | null = null;
    try { base = (client as unknown as { client?: { url?: string } }).client?.url ?? null; } catch { base = null; }
    const target = new URL(base ?? location.origin);
    const local = (h: string) => h === '127.0.0.1' || h === 'localhost' || h === '0.0.0.0' || h === '[::1]';
    if (u.origin !== target.origin && local(u.hostname) && u.pathname.startsWith('/api/storage/')) return `${target.origin}${u.pathname}${u.search}`;
    return u.toString();
  } catch {
    return url;
  }
}

export function createVoice(opts: VoiceOptions): Voice {
  const { client, api, code, token, onState, onError } = opts;

  // One AudioContext for capture and playback, created right away so a click that calls createVoice unlocks audio.
  let ctx: AudioContext | null = null;
  try { ctx = new AudioContext({ latencyHint: 'interactive' }); } catch { ctx = null; }
  const mic = ctx ? new Mic(ctx) : null;

  let micOk = false;
  let mint: Mint | null = null;
  let tokenExpiry = 0;
  let mintError: string | null = null;
  let degradedReported = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshing: Promise<boolean> | null = null;
  let spare: SttSession | null = null;
  let spareTimer: ReturnType<typeof setTimeout> | null = null;
  let spareFailures = 0;
  let turn: Turn | null = null; // the turn currently capturing
  let finishing = 0; // released turns still finalizing
  let turnSeq = 0;
  let state: VoiceState = 'idle';
  let smoothed = 0;
  let disposed = false;
  const recentErrors = new Map<string, number>();
  const mintMs: number[] = [];
  const socketOpenMs: number[] = [];
  const turns: TurnMetrics[] = [];
  let refreshes = 0;
  let mintFailures = 0;
  let socketDrops = 0;
  const levelBuf = new Float32Array(1024);

  const report = (msg: string) => {
    const now = Date.now();
    if ((recentErrors.get(msg) ?? 0) > now - ERROR_REPEAT_MS) return;
    recentErrors.set(msg, now);
    try { onError(msg); } catch { /* the app's handler must not break voice */ }
  };

  const refreshState = () => {
    const next: VoiceState = turn ? 'listening' : speaker.busy ? 'speaking' : finishing > 0 ? 'thinking' : 'idle';
    if (next === state) return;
    state = next;
    try { onState(next); } catch { /* ignore */ }
  };

  const tokenValid = () => !!mint?.token && Date.now() < tokenExpiry - TOKEN_MARGIN_MS;
  const sttUsable = () => !disposed && micOk && !!mint?.sttLive && tokenValid();
  const ttsAuth = (): TtsAuth | null =>
    !disposed && mint?.token && mint.ttsLive && tokenValid()
      ? { token: mint.token, voiceId: mint.voiceId, model: mint.ttsModel, version: mint.cartesiaVersion }
      : null;
  const newSession = () => new SttSession(sttUrl(mint?.token ?? '', mint?.keyterms ?? [], mint?.cartesiaVersion ?? '2026-08-14'));

  const speaker = new Speaker(ctx, ttsAuth, () => refreshToken(), () => refreshState(), report);

  // ---------- token ----------
  function schedule(ms: number) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = disposed ? null : setTimeout(() => { void refreshToken(); }, ms);
  }

  async function mintNow(): Promise<boolean> {
    const t0 = performance.now();
    try {
      const m = (await client.action(api.voice.mintToken, { code, token })) as Mint;
      if (disposed) return false;
      mint = m;
      mintError = null;
      let ttl = m.token && m.expiresAt ? m.expiresAt - Date.now() : 0;
      if (m.token && !(ttl > 60_000 && ttl <= 3_600_000)) ttl = 600_000; // device clock skew: trust the server's 10 min
      tokenExpiry = m.token ? Date.now() + ttl : 0;
      mintMs.push(Math.round(performance.now() - t0));
      schedule(m.token ? Math.max(15_000, ttl - REFRESH_BEFORE_MS) : RECHECK_MS);
      return true;
    } catch (e) {
      mintFailures++;
      mintError = errCode(e);
      schedule(mintError === 'NO_CONSENT' ? RECHECK_MS / 2 : RETRY_MS);
      return false;
    }
  }

  function refreshToken(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const ok = await mintNow();
      refreshes++;
      if (ok) {
        degradedReported = false;
        rotateSpare(); // new connections use the fresh token; an idle pre-opened one is replaced now
      } else if (!tokenValid() && !degradedReported) {
        degradedReported = true;
        report(mintMessage(mintError));
      }
      refreshState();
      return ok;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  // ---------- pre-opened STT socket ----------
  function openSpare() {
    if (disposed || spare || !sttUsable()) return;
    if (spareTimer) { clearTimeout(spareTimer); spareTimer = null; }
    const s = newSession();
    spare = s;
    void s.opened.then((ok) => {
      if (ok) { spareFailures = 0; socketOpenMs.push(Math.round((s.openedAt ?? performance.now()) - s.createdAt)); }
    });
    s.onDrop = () => {
      if (spare !== s) return;
      spare = null;
      socketDrops++;
      spareFailures++;
      if (spareFailures >= 3 || tokenExpiry - Date.now() < REFRESH_BEFORE_MS) void refreshToken();
      ensureSpare(Math.min(30_000, 1000 * 2 ** Math.min(5, spareFailures - 1)));
    };
  }

  function ensureSpare(delay: number) {
    if (disposed || spare || spareTimer) return;
    if (delay <= 0) { openSpare(); return; }
    spareTimer = setTimeout(() => { spareTimer = null; openSpare(); }, delay);
  }

  function rotateSpare() {
    if (spareTimer) { clearTimeout(spareTimer); spareTimer = null; }
    if (spare) { spare.dispose(); spare = null; }
    openSpare();
  }

  function takeSession(): { session: SttSession; warm: boolean } {
    const s = spare;
    spare = null;
    if (spareTimer) { clearTimeout(spareTimer); spareTimer = null; }
    if (s && s.usable) { s.onDrop = null; return { session: s, warm: s.state === 'open' }; }
    s?.dispose();
    return { session: newSession(), warm: false };
  }

  // ---------- ready ----------
  // `basics` = mic open + token minted; a press only waits for this (frames queue while a socket connects).
  // `ready` also waits, bounded, for the pre-opened socket, so the first turn starts warm.
  const basics: Promise<void> = (async () => {
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
    const micP = mic ? mic.open() : Promise.reject(Object.assign(new Error('no audio'), { name: 'NotSupportedError' }));
    const [micR] = await Promise.allSettled([micP, mintNow()]);
    if (disposed) return;
    micOk = micR.status === 'fulfilled';
    if (micR.status === 'rejected') report(micMessage(micR.reason));
    if (mic) {
      mic.onEnded = () => {
        micOk = false;
        report('The microphone stopped. Reload the page to use voice again; typing still works.');
        refreshState();
      };
    }
    if (!mint) { degradedReported = true; report(mintMessage(mintError)); }
  })();
  const ready: Promise<void> = (async () => {
    await basics;
    if (!sttUsable()) return; // voice flags off, no consent or no mic: mock mode
    openSpare();
    const s = spare as SttSession | null;
    if (s) await Promise.race([s.opened, sleep(READY_SOCKET_WAIT_MS)]);
  })();

  // ---------- push-to-talk ----------
  function start(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (turn) return turn.started; // a repeated press while already listening
    speaker.cancel(); // the companion never talks over the storyteller
    const t: Turn = { id: ++turnSeq, pressedAt: performance.now(), started: Promise.resolve(), micId: null, session: null, warm: false, frames: [], samples: 0, capTimer: null };
    turn = t;
    refreshState();
    t.started = (async () => {
      await basics; // never rejects; does not wait for a slow first socket
      // After the headset slept, timers may not have refreshed the 10-minute token: refresh now (bounded wait)
      // instead of answering the first press with "Nothing was heard".
      if (!disposed && turn === t && mint?.sttLive && !tokenValid()) await Promise.race([refreshToken(), sleep(1500)]);
      if (disposed || turn !== t || !mic || !sttUsable()) return; // released already, or mock: stop() returns ''
      if (ctx && ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), sleep(300)]);
      if (turn !== t) return;
      const { session, warm } = takeSession();
      t.session = session;
      t.warm = warm;
      // Pre-roll only when no speech just played, so the companion's last syllable never lands in the transcript.
      const preroll = performance.now() - speaker.lastAudioAt > 300;
      t.micId = mic.begin((pcm) => { t.frames.push(pcm); t.samples += pcm.length; session.send(pcm); }, preroll);
      t.capTimer = setTimeout(() => {
        if (t.micId !== null && turn === t) { void mic.end(t.micId); report('That was a long turn, so I stopped listening after 45 seconds.'); }
      }, MAX_TURN_MS);
    })();
    return t.started;
  }

  async function stop(): Promise<VoiceResult> {
    const t = turn;
    if (!t) return { transcript: '', durationMs: 0, audioFileId: null };
    turn = null; // a new press can start at once; this turn finishes on its own socket
    finishing++;
    const releasedAt = performance.now();
    refreshState();
    try {
      await t.started.catch(() => {});
      if (t.capTimer) clearTimeout(t.capTimer);
      if (!t.session || t.micId === null || !mic) {
        t.session?.dispose();
        return { transcript: '', durationMs: Math.round(performance.now() - t.pressedAt), audioFileId: null };
      }
      await mic.end(t.micId); // the worklet posts this turn's last partial frame first
      const durationMs = Math.round((t.samples / MIC_RATE) * 1000);
      const wantClip = !!mint?.recording && durationMs >= MIN_CLIP_MS;
      const uploadUrl: Promise<string | null> | null = wantClip
        ? (client.mutation(api.utterances.generateAudioUploadUrl, { code, token }) as Promise<unknown>).then((u) => (typeof u === 'string' ? u : null)).catch(() => null)
        : null;

      let out: SttOutcome = await t.session.finish(releasedAt);
      let replayed = false;
      if (!out.ok && t.session.openedAt !== null && t.samples > 0 && sttUsable() && !disposed) {
        // The connection dropped mid-turn: replay the kept clip on a fresh one (sent faster than real time).
        // A connection that never opened is not retried (that is a network outage; don't double the wait).
        replayed = true;
        const again = newSession();
        for (const f of t.frames) again.send(f);
        const o2 = await again.finish(releasedAt);
        if (o2.ok || o2.transcript.length > out.transcript.length) out = o2;
      }
      const transcriptAt = performance.now();
      const transcript = out.transcript.trim();
      if (!out.ok && !transcript) report('The voice connection dropped, so that wasn’t heard. Please try again, or type it.');

      let audioFileId: string | null = null;
      let uploadMs: number | null = null;
      if (transcript && uploadUrl && !disposed) {
        const t1 = performance.now();
        const url = await uploadUrl;
        if (url && !disposed) {
          try {
            const r = await fetch(sameOriginUpload(url, client), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: encodeWav(t.frames, MIC_RATE) });
            if (!r.ok) throw new Error(`upload ${r.status}`);
            const j = (await r.json()) as { storageId?: unknown };
            audioFileId = typeof j.storageId === 'string' ? j.storageId : null;
          } catch {
            report('The recording couldn’t be saved; the words were kept.');
          }
        }
        uploadMs = Math.round(performance.now() - t1);
      }
      t.frames = []; // nothing from this turn stays in memory

      const m: TurnMetrics = {
        id: t.id, audioSec: +(durationMs / 1000).toFixed(2), warmSocket: t.warm, releaseToFlushMs: out.flushMs, releaseToDoneMs: out.doneMs,
        releaseToTranscriptMs: Math.round(transcriptAt - releasedAt), uploadMs, releaseToResultMs: Math.round(performance.now() - releasedAt),
        chars: transcript.length, replayed, error: out.error,
      };
      turns.push(m);
      if (turns.length > 30) turns.shift();
      console.debug(`[voice] turn ${m.audioSec} s -> ${m.chars} chars in ${m.releaseToTranscriptMs} ms${audioFileId ? ' (clip saved)' : ''}`);
      return { transcript, durationMs, audioFileId };
    } finally {
      finishing--;
      refreshState();
      ensureSpare(0); // pre-open the next turn's connection
    }
  }

  // ---------- speech ----------
  function speak(text: string, o?: { language?: string | null }): Promise<void> {
    if (disposed || turn) return Promise.resolve(); // dropped while the storyteller is talking
    return speaker.speak(repairMojibake(text), o?.language ?? null); // never read "ÂżQuĂ©" aloud (see text.ts)
  }

  function rms(an: AnalyserNode | null): number {
    if (!an) return 0;
    an.getFloatTimeDomainData(levelBuf);
    let s = 0;
    for (let i = 0; i < levelBuf.length; i++) { const v = levelBuf[i] ?? 0; s += v * v; }
    return Math.sqrt(s / levelBuf.length);
  }

  function level(): number {
    let raw = 0;
    if (turn && turn.micId !== null && mic) raw = rms(mic.analyser);
    else if (speaker.audible) raw = rms(speaker.analyser);
    const db = raw > 1e-6 ? 20 * Math.log10(raw) : -120;
    const target = Math.min(1, Math.max(0, (db + 55) / 45)); // -55 dBFS -> 0, -10 dBFS -> 1
    smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.15); // quick rise, gentle fall
    return smoothed < 0.002 ? 0 : smoothed;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    if (spareTimer) clearTimeout(spareTimer);
    spare?.dispose();
    spare = null;
    turn?.session?.dispose();
    turn = null;
    speaker.dispose();
    mic?.close();
    void ctx?.close().catch(() => {});
    refreshState();
  }

  const voice: Voice = {
    ready,
    start,
    stop,
    speak,
    cancelSpeech: () => speaker.cancel(),
    level,
    get mode() { return sttUsable() ? 'live' : 'mock'; },
    debug: {
      metrics: (): VoiceMetrics => ({
        mode: sttUsable() ? 'live' : 'mock', sttLive: !!mint?.sttLive, ttsLive: !!mint?.ttsLive, recording: !!mint?.recording, micOk,
        tokenValidForMs: tokenValid() ? Math.max(0, tokenExpiry - Date.now()) : 0, mintMs: [...mintMs], refreshes, mintFailures,
        socketOpenMs: [...socketOpenMs], socketDrops, spare: spare ? spare.state : spareTimer ? 'reconnecting' : 'none',
        turns: [...turns], speech: [...speaker.history],
        audio: { sampleRate: ctx?.sampleRate ?? null, baseLatency: ctx?.baseLatency ?? null, outputLatency: ctx && 'outputLatency' in ctx ? ctx.outputLatency : null, state: ctx?.state ?? 'none' },
      }),
      refreshToken,
      dropSockets: () => { spare?.drop(); turn?.session?.drop(); },
      raw: () => ({ mic: mic ? rms(mic.analyser) : 0, speech: rms(speaker.analyser) }),
    },
    dispose,
  };
  return voice;
}

export default { createVoice };
