// Hands-free voice. Nobody holds a button: the microphone stays open and a small voice-activity detector decides
// when someone starts and finishes talking, with patience for long pauses (people often stop mid-thought).
//   cartesia  the shared Memory Gate voice module (Cartesia ink-2 STT, Sonic TTS, original clips kept with consent);
//             this file only decides when a turn starts and ends.
//   browser   the browser's own speech recognition and synthesis: a free fallback when no voice token is available.
// Both report: interim words (live caption), a finished utterance, levels for the companion to breathe with.
import type { ConvexReactClient } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { createVoice, type Voice } from '../../../headset/src/voice';

export type Heard = { transcript: string; audioFileId: string | null; durationMs: number };
export type EngineKind = 'cartesia' | 'browser' | 'none';
export type EngineEvents = {
  onPartial: (text: string) => void;
  onUtterance: (heard: Heard) => void;
  onSpeechStart: () => void;
  onProblem: (message: string, kind: 'blocked' | 'unsupported' | 'soft') => void;
};

export interface VoiceEngine {
  readonly kind: EngineKind;
  ready: Promise<void>;
  /** Speak a line; resolves when it has finished (or was interrupted by the person speaking). */
  say(text: string): Promise<void>;
  hush(): void;
  /** Open or close the hands-free microphone (closed while resting, while the companion is mid-sentence, etc.). */
  setListening(on: boolean): void;
  /** 0..1 for the companion: the voice while it speaks, the person while they speak. */
  level(): number;
  /** True once the companion can speak aloud (the speaking token is in hand). */
  canSpeak(): boolean;
  speaking(): boolean;
  hearing(): boolean;
  dispose(): void;
}

/** Tunables, chosen for unhurried speakers: a long end-of-turn silence and a patient onset. */
export const VAD = {
  frameMs: 30,
  onsetDb: 11,         // above the noise floor
  onsetMs: 150,        // sustained before a turn begins (the mic keeps 200 ms of pre-roll, so nothing is clipped)
  keepDb: 6,           // above the floor counts as still talking
  endSilenceMs: 1100,  // quiet this long ends the turn (patient with pauses, without leaving the person waiting)
  minTurnMs: 450,
  maxTurnMs: 40_000,
  bargeInExtraDb: 9,   // while the companion speaks, only clearly louder speech interrupts it
  absoluteFloorDb: -58,
};

type Session = { client: ConvexReactClient; code: string; token: string };

const dbOf = (rms: number) => (rms > 1e-7 ? 20 * Math.log10(rms) : -140);

/** The detector: fed a dBFS reading every frame, tells you when a turn starts and ends. Pure, so it is tested. */
export class TurnDetector {
  floor = -62;
  state: 'quiet' | 'maybe' | 'speech' | 'trailing' = 'quiet';
  private since = 0;
  private turnStart = 0;
  constructor(private readonly cfg = VAD) {}
  /** Returns 'start' | 'end' | null for this frame. `companionTalking` raises the bar for barge-in. */
  step(db: number, now: number, companionTalking: boolean): 'start' | 'end' | null {
    const c = this.cfg;
    if (this.state === 'quiet' || this.state === 'maybe') {
      // Track the room's noise floor while nobody is talking: falls fast, rises slowly.
      this.floor += (db - this.floor) * (db < this.floor ? 0.25 : 0.012);
      this.floor = Math.max(this.floor, -90);
    }
    const onset = Math.max(c.absoluteFloorDb, this.floor + c.onsetDb + (companionTalking ? c.bargeInExtraDb : 0));
    switch (this.state) {
      case 'quiet':
        if (db > onset) { this.state = 'maybe'; this.since = now; }
        return null;
      case 'maybe':
        if (db <= onset) { this.state = 'quiet'; return null; }
        if (now - this.since >= c.onsetMs) { this.state = 'speech'; this.turnStart = now; return 'start'; }
        return null;
      case 'speech':
        if (now - this.turnStart > c.maxTurnMs) { this.state = 'quiet'; return 'end'; }
        if (db < this.floor + c.keepDb) { this.state = 'trailing'; this.since = now; }
        return null;
      case 'trailing':
        if (db > this.floor + c.keepDb + 3) { this.state = 'speech'; return null; }
        if (now - this.since >= c.endSilenceMs) { this.state = 'quiet'; return 'end'; }
        return null;
    }
  }
  reset() { this.state = 'quiet'; }
}

// ---------------------------------------------------------------- Cartesia (shared voice module)
function cartesiaEngine(session: Session, ev: EngineEvents): VoiceEngine {
  let listening = false;
  let speakingNow = false;
  let hearingNow = false;
  let turnOpen = false;
  let turnStartedAt = 0;
  let disposed = false;
  const detector = new TurnDetector();
  const voice: Voice = createVoice({
    client: session.client, api, code: session.code, token: session.token,
    onState: () => undefined,
    onError: (msg) => ev.onProblem(msg, /blocked|not allowed/i.test(msg) ? 'blocked' : 'soft'),
    onPartial: (text) => { if (text.trim()) ev.onPartial(text.trim()); },
  });

  const endTurn = async () => {
    if (!turnOpen) return;
    turnOpen = false;
    hearingNow = false;
    const long = performance.now() - turnStartedAt >= VAD.minTurnMs;
    try {
      const r = await voice.stop();
      if (long && r.transcript.trim()) ev.onUtterance({ transcript: r.transcript.trim(), audioFileId: r.audioFileId, durationMs: r.durationMs });
    } catch { /* a dropped turn is simply not heard */ }
  };

  const timer = setInterval(() => {
    if (disposed) return;
    const raw = voice.debug.raw();
    const db = dbOf(raw.mic);
    const now = performance.now();
    if (!listening) { if (turnOpen) void endTurn(); detector.reset(); return; }
    const edge = detector.step(db, now, speakingNow);
    if (edge === 'start' && !turnOpen) {
      turnOpen = true; hearingNow = true; turnStartedAt = now;
      speakingNow = false; // start() cuts the companion off: the person always has the floor
      ev.onSpeechStart();
      void voice.start();
    } else if (edge === 'end') void endTurn();
  }, VAD.frameMs);

  return {
    kind: 'cartesia',
    ready: voice.ready,
    async say(text) {
      speakingNow = true;
      try { await voice.speak(text); } finally { speakingNow = false; }
    },
    hush() { voice.cancelSpeech(); speakingNow = false; },
    setListening(on) { listening = on; if (!on && turnOpen) void endTurn(); },
    level() {
      const raw = voice.debug.raw();
      const v = hearingNow ? raw.mic : speakingNow ? raw.speech : 0;
      const db = dbOf(v);
      return Math.min(1, Math.max(0, (db + 55) / 42));
    },
    speaking: () => speakingNow,
    hearing: () => hearingNow,
    canSpeak: () => { const m = voice.debug.metrics(); return m.ttsLive && m.tokenValidForMs > 0; },
    dispose() { disposed = true; clearInterval(timer); voice.dispose(); },
  };
}

// ---------------------------------------------------------------- Browser fallback
type SR = {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; onspeechstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const prefer = ['Samantha', 'Google UK English Female', 'Microsoft Aria Online (Natural) - English (United States)', 'Karen', 'Moira', 'Serena', 'Google US English'];
  for (const name of prefer) { const v = voices.find((x) => x.name === name); if (v) return v; }
  return voices.find((v) => /^en/i.test(v.lang)) ?? voices[0] ?? null;
}

function browserEngine(ev: EngineEvents): VoiceEngine {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  let rec: SR | null = null;
  let listening = false;
  let speakingNow = false;
  let hearingNow = false;
  let disposed = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let speakT0 = 0;
  // A separate analyser only for the companion's breathing (recognition has no level API).
  let analyser: AnalyserNode | null = null;
  const buf = new Float32Array(1024);
  let actx: AudioContext | null = null;
  const micReady = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      actx = new AudioContext();
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      actx.createMediaStreamSource(stream).connect(analyser);
    } catch (e) {
      const name = (e as { name?: string }).name;
      ev.onProblem('The microphone is blocked. Allow it for this page to talk with the companion.', name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'unsupported');
    }
  })();

  const startRec = () => {
    if (!Ctor || disposed || !listening || speakingNow || rec) return;
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US'; r.maxAlternatives = 1;
    r.onspeechstart = () => { hearingNow = true; ev.onSpeechStart(); };
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const text = res[0].transcript;
        if (res.isFinal) { hearingNow = false; if (text.trim()) ev.onUtterance({ transcript: text.trim(), audioFileId: null, durationMs: 0 }); }
        else interim += text;
      }
      if (interim.trim()) ev.onPartial(interim.trim());
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') ev.onProblem('The microphone is blocked. Allow it for this page to talk with the companion.', 'blocked'); };
    r.onend = () => { rec = null; hearingNow = false; if (listening && !speakingNow && !disposed) restartTimer = setTimeout(startRec, 250); };
    rec = r;
    try { r.start(); } catch { rec = null; }
  };
  const stopRec = () => { if (restartTimer) clearTimeout(restartTimer); restartTimer = null; try { rec?.abort(); } catch { /* ignore */ } rec = null; hearingNow = false; };
  if (!Ctor) ev.onProblem('This browser can’t listen. Try Chrome, or share a photo instead.', 'unsupported');

  return {
    kind: Ctor ? 'browser' : 'none',
    ready: micReady,
    say(text) {
      return new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) { setTimeout(resolve, Math.min(9000, 380 * text.split(/\s+/).length)); return; }
        stopRec(); // never transcribe ourselves
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice();
        if (v) u.voice = v;
        u.rate = 0.92; u.pitch = 1.02; u.volume = 1;
        speakingNow = true; speakT0 = performance.now();
        const done = () => { speakingNow = false; resolve(); if (listening) startRec(); };
        u.onend = done; u.onerror = done;
        synth.cancel();
        synth.speak(u);
      });
    },
    hush() { window.speechSynthesis?.cancel(); speakingNow = false; },
    setListening(on) { listening = on; if (on) startRec(); else stopRec(); },
    level() {
      if (speakingNow) {
        const t = (performance.now() - speakT0) / 1000;
        return 0.35 + 0.25 * Math.abs(Math.sin(t * 7.1)) * (0.6 + 0.4 * Math.sin(t * 2.3));
      }
      if (!analyser || !hearingNow) return 0;
      analyser.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
      return Math.min(1, Math.max(0, (dbOf(Math.sqrt(s / buf.length)) + 55) / 42));
    },
    speaking: () => speakingNow,
    hearing: () => hearingNow,
    canSpeak: () => true,
    dispose() { disposed = true; stopRec(); window.speechSynthesis?.cancel(); void actx?.close().catch(() => undefined); },
  };
}

/** No voice at all (?voice=off, used by automated runs): captions at speaking pace, nothing heard. */
export function silentEngine(): VoiceEngine {
  let speakingNow = false;
  return {
    kind: 'none',
    ready: Promise.resolve(),
    async say(text) { speakingNow = true; await new Promise((r) => setTimeout(r, 700 + text.split(/\s+/).length * 260)); speakingNow = false; },
    hush() { speakingNow = false; },
    setListening() { /* nothing to listen with */ },
    level: () => (speakingNow ? 0.4 : 0),
    speaking: () => speakingNow,
    hearing: () => false,
    canSpeak: () => true,
    dispose() { /* nothing held */ },
  };
}

/** Prefer Cartesia when this device has a session that can mint a voice token; fall back to the browser. */
export async function createEngine(session: Session | null, ev: EngineEvents): Promise<VoiceEngine> {
  if (new URLSearchParams(location.search).get('voice') === 'off') return silentEngine();
  if (session) {
    try {
      const mint = await session.client.action(api.voice.mintToken, { code: session.code, token: session.token });
      if (mint.token && mint.sttLive && mint.ttsLive) return cartesiaEngine(session, ev);
    } catch { /* fall through to the browser */ }
  }
  return browserEngine(ev);
}
