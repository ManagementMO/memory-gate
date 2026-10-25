// Hands-free voice. Nobody holds a button: the microphone stays open and a small voice-activity detector decides
// when someone starts and finishes talking, with patience for long pauses (people often stop mid-thought). Or push to
// talk: holding V opens a turn at once and letting go sends it (pushToTalk); after the first press the room's noise
// no longer starts a turn on its own for the rest of the visit.
//   cartesia  the shared Memory Gate voice module (Cartesia ink-2 STT, Sonic TTS, original clips kept with consent);
//             this file only decides when a turn starts and ends.
//   browser   the browser's own speech recognition and synthesis: a free fallback when no voice token is available.
// Both report: interim words (live caption), a finished utterance, levels for the companion to breathe with.
// Every line is spoken in its own language (English, Spanish or French), always in Ariana's voice: one Cartesia voice
// that sounds native in all three, so the companion stays the same person when the language changes. Each utterance
// carries a turn id and how far above the room's noise it was spoken (SNR), so when two devices share a room the
// exchange can tell this person's own words from the other person heard faintly across it.
import type { ConvexReactClient } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { createVoice, type Voice } from '../../../headset/src/voice';

/** `turnId`: this turn's id (also sent when it began). `snrDb`: its mean level above this mic's noise floor. */
export type Heard = { transcript: string; audioFileId: string | null; durationMs: number; turnId: string; snrDb: number };
export type EngineKind = 'cartesia' | 'browser' | 'none';
/** Ariana ("Kind Friend"): native in en-US, es-ES, es-MX, fr-CA and fr-FR. The headset and phone keep the room's voice. */
export const GATE_VOICE_ID = 'ec1e269e-9ca0-402f-8a18-58e0e022355a';

export type EngineEvents = {
  onPartial: (text: string) => void;
  onUtterance: (heard: Heard) => void;
  onSpeechStart: () => void;
  onProblem: (message: string, kind: 'blocked' | 'unsupported' | 'soft') => void;
  /** A turn began (before its words are known) / ended with nothing heard. */
  onTurnStart?: (turnId: string) => void;
  onTurnEnd?: (turnId: string) => void;
  /** In a shared conversation, speech while the companion talks doesn't cut it off at once (it may be the other
   *  person, heard faintly): only once it's clearly this person's own voice (onBargeIn). */
  deferBargeIn?: () => boolean;
  onBargeIn?: () => void;
};

export interface VoiceEngine {
  readonly kind: EngineKind;
  ready: Promise<void>;
  /** Speak a line in its language (ISO 639-1); resolves when it has finished (or was interrupted by the person speaking). */
  say(text: string, language?: string | null): Promise<void>;
  hush(): void;
  /** Open or close the hands-free microphone (closed while resting, while the companion is mid-sentence, etc.). */
  setListening(on: boolean): void;
  /** Push to talk (hold V): held opens a turn at once, even over the companion's greeting (the person has the floor,
   *  so it stops); released ends it and sends what was said. Any call turns hands-free turns off for the rest of the
   *  visit (pushToTalk(false) does only that). The flow decides when it's allowed (not while resting). */
  pushToTalk(down: boolean): void;
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
  bargeInConfirmMs: 400, // shared conversation: speech this long, and this far above the floor, is this person's own
  bargeInSnrDb: 16,
};

const newTurnId = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

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
  let turnId = '';
  let snrSum = 0, snrCount = 0, turnFloor = -62;
  let bargePending = 0; // when speech began over the companion, still to be confirmed as this person's own
  let ptt = false, held = false; // push to talk: on after the first press; the key is down
  const detector = new TurnDetector();
  const voice: Voice = createVoice({
    client: session.client, api, code: session.code, token: session.token, voiceId: GATE_VOICE_ID,
    onState: () => undefined,
    onError: (msg) => ev.onProblem(msg, /blocked|not allowed/i.test(msg) ? 'blocked' : 'soft'),
    onPartial: (text) => { if (text.trim()) ev.onPartial(text.trim()); },
  });

  const endTurn = async () => {
    if (!turnOpen) return;
    turnOpen = false;
    hearingNow = false;
    bargePending = 0;
    const id = turnId, snrDb = snrCount ? snrSum / snrCount : 0;
    const long = performance.now() - turnStartedAt >= VAD.minTurnMs;
    let heard = false;
    try {
      const r = await voice.stop();
      if (long && r.transcript.trim()) { heard = true; ev.onUtterance({ transcript: r.transcript.trim(), audioFileId: r.audioFileId, durationMs: r.durationMs, turnId: id, snrDb }); }
    } catch { /* a dropped turn is simply not heard */ }
    if (!heard) ev.onTurnEnd?.(id);
  };

  const timer = setInterval(() => {
    if (disposed) return;
    const raw = voice.debug.raw();
    const db = dbOf(raw.mic);
    const now = performance.now();
    if (!listening && !held) { if (turnOpen) void endTurn(); detector.reset(); return; }
    // Push to talk: the key, not the detector, starts and ends turns (the level still counts toward this turn's SNR).
    if (ptt) { if (turnOpen && held) { snrSum += db - turnFloor; snrCount++; } return; }
    const edge = detector.step(db, now, speakingNow);
    if (edge === 'start' && !turnOpen) {
      turnOpen = true; hearingNow = true; turnStartedAt = now;
      turnId = newTurnId(); snrSum = 0; snrCount = 0; turnFloor = detector.floor;
      ev.onTurnStart?.(turnId);
      ev.onSpeechStart();
      if (speakingNow && ev.deferBargeIn?.()) { bargePending = now; void voice.start({ interrupt: false }); }
      else { speakingNow = false; void voice.start(); } // start() cuts the companion off: the person always has the floor
    } else if (edge === 'end') void endTurn();
    if (turnOpen && detector.state === 'speech') { snrSum += db - turnFloor; snrCount++; }
    // Over the companion, and still going strong: this person's own voice, so the companion stops (everywhere).
    if (bargePending && now - bargePending >= VAD.bargeInConfirmMs && snrCount && snrSum / snrCount >= VAD.bargeInSnrDb) {
      bargePending = 0; voice.cancelSpeech(); speakingNow = false; ev.onBargeIn?.();
    }
  }, VAD.frameMs);

  return {
    kind: 'cartesia',
    ready: voice.ready,
    async say(text, language) {
      speakingNow = true;
      try { await voice.speak(text, { language: language ?? null }); } finally { speakingNow = false; }
    },
    hush() { voice.cancelSpeech(); speakingNow = false; },
    setListening(on) { listening = on; if (!on && turnOpen && !held) void endTurn(); },
    pushToTalk(down) {
      ptt = true;
      if (!down) { if (held) { held = false; void endTurn(); } return; }
      if (held || disposed) return;
      held = true;
      if (turnOpen) return; // a hands-free turn already under way simply becomes this one
      turnOpen = true; hearingNow = true; turnStartedAt = performance.now(); bargePending = 0;
      turnId = newTurnId(); snrSum = 0; snrCount = 0; turnFloor = detector.floor;
      ev.onTurnStart?.(turnId);
      ev.onSpeechStart();
      if (speakingNow) { voice.cancelSpeech(); speakingNow = false; ev.onBargeIn?.(); } // the person has the floor
      void voice.start();
    },
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

/** A system voice for the line's language when there is one, else the calm English voices we prefer. */
function pickVoice(language?: string | null): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (language && language !== 'en') {
    const own = voices.find((v) => v.lang.toLowerCase().startsWith(language.toLowerCase()));
    if (own) return own;
  }
  const prefer = ['Samantha', 'Google UK English Female', 'Microsoft Aria Online (Natural) - English (United States)', 'Karen', 'Moira', 'Serena', 'Google US English'];
  for (const name of prefer) { const v = voices.find((x) => x.name === name); if (v) return v; }
  return voices.find((v) => /^en/i.test(v.lang)) ?? voices[0] ?? null;
}

function browserEngine(ev: EngineEvents, recognitionLang: () => string): VoiceEngine {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  let rec: SR | null = null;
  let listening = false;
  let speakingNow = false;
  let hearingNow = false;
  let disposed = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let speakT0 = 0;
  let turnId = '';
  let floorDb = -60, snrSum = 0, snrCount = 0;
  let ptt = false, held = false, pttText = ''; // push to talk: on after the first press; the key is down; words so far
  // A separate analyser only for the companion's breathing (recognition has no level API).
  let analyser: AnalyserNode | null = null;
  const buf = new Float32Array(1024);
  let actx: AudioContext | null = null;
  let meter: ReturnType<typeof setInterval> | null = null;
  const micReady = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      actx = new AudioContext();
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      actx.createMediaStreamSource(stream).connect(analyser);
      // The level above the room's noise while someone is talking (recognition has no level of its own).
      meter = setInterval(() => {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
        const db = dbOf(Math.sqrt(s / buf.length));
        if (hearingNow) { snrSum += db - floorDb; snrCount++; } else floorDb += (db - floorDb) * (db < floorDb ? 0.25 : 0.02);
      }, 50);
    } catch (e) {
      const name = (e as { name?: string }).name;
      ev.onProblem('The microphone is blocked. Allow it for this page to talk with the companion.', name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'unsupported');
    }
  })();

  const startRec = () => {
    if (!Ctor || disposed || rec || (ptt ? !held : !listening || speakingNow)) return;
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = recognitionLang(); r.maxAlternatives = 1;
    r.onspeechstart = () => {
      hearingNow = true; snrSum = 0; snrCount = 0;
      if (!turnId) { turnId = newTurnId(); ev.onTurnStart?.(turnId); }
      ev.onSpeechStart();
    };
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const text = res[0].transcript;
        if (ptt) { if (res.isFinal) pttText += ` ${text}`; else interim += text; continue; } // sent once, on release
        if (res.isFinal) {
          hearingNow = false;
          const id = turnId || newTurnId(); turnId = '';
          if (text.trim()) ev.onUtterance({ transcript: text.trim(), audioFileId: null, durationMs: 0, turnId: id, snrDb: snrCount ? snrSum / snrCount : 20 });
          else ev.onTurnEnd?.(id);
        }
        else interim += text;
      }
      const shown = ptt ? `${pttText} ${interim}` : interim;
      if (shown.trim()) ev.onPartial(shown.trim());
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') ev.onProblem('The microphone is blocked. Allow it for this page to talk with the companion.', 'blocked'); };
    r.onend = () => {
      rec = null;
      if (ptt) { if (held) restartTimer = setTimeout(startRec, 100); else finishPtt(); return; } // still holding: keep listening
      hearingNow = false;
      if (turnId) { ev.onTurnEnd?.(turnId); turnId = ''; }
      if (listening && !speakingNow && !disposed) restartTimer = setTimeout(startRec, 250);
    };
    rec = r;
    try { r.start(); } catch { rec = null; }
  };
  const stopRec = () => { if (restartTimer) clearTimeout(restartTimer); restartTimer = null; try { rec?.abort(); } catch { /* ignore */ } rec = null; hearingNow = false; };
  /** Push to talk let go and recognition finished: everything said while the key was down, as one utterance. */
  const finishPtt = () => {
    const id = turnId || newTurnId(), text = pttText.trim();
    turnId = ''; pttText = ''; hearingNow = false;
    if (text) ev.onUtterance({ transcript: text, audioFileId: null, durationMs: 0, turnId: id, snrDb: snrCount ? snrSum / snrCount : 20 });
    else ev.onTurnEnd?.(id);
  };
  if (!Ctor) ev.onProblem('This browser can’t listen. Try Chrome, or share a photo instead.', 'unsupported');

  return {
    kind: Ctor ? 'browser' : 'none',
    ready: micReady,
    say(text, language) {
      return new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) { setTimeout(resolve, Math.min(9000, 380 * text.split(/\s+/).length)); return; }
        stopRec(); // never transcribe ourselves
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(language);
        if (v) u.voice = v;
        if (language) u.lang = v?.lang ?? language;
        u.rate = 0.92; u.pitch = 1.02; u.volume = 1;
        speakingNow = true; speakT0 = performance.now();
        const done = () => { speakingNow = false; resolve(); if (listening) startRec(); };
        u.onend = done; u.onerror = done;
        synth.cancel();
        synth.speak(u);
      });
    },
    hush() { window.speechSynthesis?.cancel(); speakingNow = false; },
    setListening(on) { listening = on; if (on) startRec(); else if (!(ptt && held)) stopRec(); },
    pushToTalk(down) {
      if (!ptt) { ptt = true; stopRec(); } // hands-free recognition ends for the rest of the visit
      if (!down) { if (held) { held = false; if (rec) { try { rec.stop(); } catch { finishPtt(); } } else finishPtt(); } return; }
      if (held || disposed || !Ctor) return;
      held = true; pttText = ''; hearingNow = true; snrSum = 0; snrCount = 0;
      if (speakingNow) { window.speechSynthesis?.cancel(); speakingNow = false; } // the person has the floor
      turnId = newTurnId();
      ev.onTurnStart?.(turnId);
      ev.onSpeechStart();
      startRec();
    },
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
    dispose() { disposed = true; stopRec(); if (meter) clearInterval(meter); window.speechSynthesis?.cancel(); void actx?.close().catch(() => undefined); },
  };
}

/** No voice at all (?voice=off, used by automated runs): captions at speaking pace, nothing heard. */
export function silentEngine(): VoiceEngine {
  let speakingNow = false;
  return {
    kind: 'none',
    ready: Promise.resolve(),
    async say(text, _language) { speakingNow = true; await new Promise((r) => setTimeout(r, 700 + text.split(/\s+/).length * 260)); speakingNow = false; },
    hush() { speakingNow = false; },
    setListening() { /* nothing to listen with */ },
    pushToTalk() { /* nothing to listen with */ },
    level: () => (speakingNow ? 0.4 : 0),
    speaking: () => speakingNow,
    hearing: () => false,
    canSpeak: () => true,
    dispose() { /* nothing held */ },
  };
}

/** Prefer Cartesia when this device has a session that can mint a voice token; fall back to the browser, which listens
 *  for `recognitionLang()` (the pinned language's tag, or the device's own in Automatic). */
export async function createEngine(session: Session | null, ev: EngineEvents, opts: { recognitionLang: () => string }): Promise<VoiceEngine> {
  if (new URLSearchParams(location.search).get('voice') === 'off') return silentEngine();
  if (session) {
    try {
      const mint = await session.client.action(api.voice.mintToken, { code: session.code, token: session.token });
      if (mint.token && mint.sttLive && mint.ttsLive) return cartesiaEngine(session, ev);
    } catch { /* fall through to the browser */ }
  }
  return browserEngine(ev, opts.recognitionLang);
}
