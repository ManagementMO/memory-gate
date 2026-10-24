// Companion speech. Cartesia POST /tts/bytes (streamed WAV, pcm_s16le 24 kHz) played through Web Audio as the bytes
// arrive, so the first words start about one first-byte (~0.15-0.25 s) after speak(). Lines queue and play back to
// back on one timeline; the next line's request starts as soon as the previous line's bytes have all arrived.
// cancel() bumps a generation id: queued lines resolve at once, in-flight requests abort, scheduled audio fades out
// in ~30 ms, and any chunk that still arrives for an old generation is dropped. Without a usable token (mock mode,
// tts.live off, or a failed request) a line is "spoken" as captions only: ~60 ms per character, cancellable the same.
import { WavStreamReader } from './wav';

export type TtsAuth = { token: string; voiceId: string; model: string; version: string };

export type SpeakMetrics = {
  chars: number;
  mode: 'tts' | 'captions';
  language: string | null;
  firstByteMs: number | null; // speak() -> first response byte
  firstAudioMs: number | null; // speak() -> first sample scheduled to play (includes the queue wait)
  fetchMs: number | null; // speak() -> last byte
  playedMs: number | null; // speak() -> line finished (or cancelled)
  audioSec: number;
  underruns: number;
  cancelled: boolean;
  error: string | null;
};

const TTS_URL = 'https://api.cartesia.ai/tts/bytes';
const LEAD_S = 0.05; // the first chunk starts this far ahead of "now" (absorbs jitter between the first chunks)
const CAPTION_MS_PER_CHAR = 60;
const FIRST_CHUNK = 1200; // samples (50 ms at 24 kHz) before the first chunk is scheduled
const CHUNK = 2400; // later chunks are merged to >= 100 ms
// sonic-3.6 languages (research/cartesia.md); anything else is sent without `language` (Cartesia then infers it).
const SONIC_LANGS = new Set('en de es fr ja pt zh hi ko it nl pl ru sv tr tl bg ro ar cs el fi hr ms sk da ta uk hu no vi bn th he ka id te gu kn ml mr pa or ur'.split(' '));

type Line = {
  gen: number; text: string; language: string | null; t0: number; resolve: () => void; settled: boolean;
  gain: GainNode | null; sources: Set<AudioBufferSourceNode>; abort: AbortController;
  timer: ReturnType<typeof setTimeout> | null; streamDone: boolean; m: SpeakMetrics;
};

export class Speaker {
  readonly analyser: AnalyserNode | null;
  /** performance.now() when speech audio last stopped (used to skip the mic pre-roll right after speech). */
  lastAudioAt = 0;
  readonly history: SpeakMetrics[] = [];
  private readonly master: GainNode | null;
  private gen = 0;
  private queue: Line[] = [];
  private readonly active = new Set<Line>();
  private pumping = false;
  private nextTime = 0;

  constructor(
    private readonly ctx: AudioContext | null,
    private readonly auth: () => TtsAuth | null,
    private readonly refreshAuth: () => Promise<boolean>,
    private readonly onChange: () => void,
    private readonly onError: (msg: string) => void,
  ) {
    if (ctx) {
      this.master = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    } else {
      this.master = null;
      this.analyser = null;
    }
  }

  /** True while any line is queued, loading or playing. */
  get busy(): boolean { return this.active.size > 0 || this.queue.length > 0; }

  /** True while real audio is (or is about to be) coming out of the speakers. */
  get audible(): boolean { for (const l of this.active) if (l.sources.size) return true; return false; }

  speak(text: string, language?: string | null): Promise<void> {
    const clean = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!clean) return Promise.resolve();
    const lang = language && SONIC_LANGS.has(language) ? language : null;
    return new Promise<void>((resolve) => {
      this.queue.push({
        gen: this.gen, text: clean, language: lang, t0: performance.now(), resolve, settled: false, gain: null, sources: new Set(),
        abort: new AbortController(), timer: null, streamDone: false,
        m: { chars: clean.length, mode: 'tts', language: lang, firstByteMs: null, firstAudioMs: null, fetchMs: null, playedMs: null, audioSec: 0, underruns: 0, cancelled: false, error: null },
      });
      this.onChange();
      void this.pump();
    });
  }

  /** Stops speech now: drops queued lines, aborts requests, fades scheduled audio, ignores late chunks. */
  cancel(): void {
    this.gen++;
    const queued = this.queue;
    this.queue = [];
    for (const l of queued) { l.m.cancelled = true; this.settle(l); }
    const now = this.ctx?.currentTime ?? 0;
    for (const l of [...this.active]) {
      l.m.cancelled = true;
      l.abort.abort();
      if (l.timer) { clearTimeout(l.timer); l.timer = null; }
      if (l.gain) {
        const g = l.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + 0.03);
      }
      for (const s of l.sources) { try { s.stop(now + 0.035); } catch { /* never started */ } }
      if (l.sources.size) this.lastAudioAt = performance.now() + 40;
      this.settle(l);
    }
    this.nextTime = 0;
    this.onChange();
  }

  private settle(l: Line): void {
    if (l.settled) return;
    l.settled = true;
    l.m.playedMs = Math.round(performance.now() - l.t0);
    this.active.delete(l);
    this.history.push(l.m);
    if (this.history.length > 30) this.history.shift();
    l.resolve();
    this.onChange();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (let l = this.queue.shift(); l; l = this.queue.shift()) {
        if (l.gen !== this.gen) { this.settle(l); continue; }
        this.active.add(l);
        this.onChange();
        await this.render(l); // returns once this line's audio is fully scheduled (or its caption time has passed)
      }
    } finally {
      this.pumping = false;
    }
  }

  private async render(l: Line): Promise<void> {
    const a = this.ctx ? this.auth() : null;
    if (!a || !this.ctx) return this.captions(l);
    const running = (c: AudioContext) => c.state === 'running';
    if (!running(this.ctx)) {
      // Audio is blocked until the page has had a click; never queue sound that would play late.
      await Promise.race([this.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
      if (!running(this.ctx)) return this.captions(l);
    }
    try {
      let res = await this.request(l, a);
      if ((res.status === 401 || res.status === 403) && l.gen === this.gen) {
        // The token may have just expired: mint a fresh one and try once more.
        const b = (await this.refreshAuth()) && l.gen === this.gen ? this.auth() : null;
        if (b) res = await this.request(l, b);
      }
      if (!res.ok) throw new Error(`speech request failed (${res.status})`);
      await this.stream(l, res);
    } catch (e) {
      if (l.gen !== this.gen || l.abort.signal.aborted) return; // cancelled: already settled
      l.m.error = String((e as Error)?.message ?? e).slice(0, 120);
      if (!l.sources.size && l.m.audioSec === 0) {
        this.onError('The companion’s voice is unavailable right now, so the words are shown instead.');
        return this.captions(l);
      }
      // Part of the line is already playing: let it finish.
    }
    if (l.gen !== this.gen) return;
    l.streamDone = true;
    if (!l.sources.size) { this.settle(l); return; }
    // Watchdog: if the audio clock stalls (context suspended mid-line), end the line on wall time instead of hanging.
    const left = Math.max(0, this.nextTime - (this.ctx?.currentTime ?? 0));
    setTimeout(() => {
      if (l.settled) return;
      l.m.error ??= 'audio clock stalled';
      for (const s of l.sources) { try { s.stop(); } catch { /* ended */ } }
      this.settle(l);
    }, left * 1000 + 2500);
  }

  private request(l: Line, a: TtsAuth): Promise<Response> {
    l.m.mode = 'tts';
    return fetch(TTS_URL, {
      method: 'POST',
      // A stalled request on venue Wi-Fi must not freeze every later companion line: give up after 20 s
      // (the existing catch falls back to captions-only when nothing has played).
      signal: withTimeout(l.abort.signal, 20_000),
      headers: { Authorization: `Bearer ${a.token}`, 'Cartesia-Version': a.version, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: a.model,
        transcript: l.text,
        voice: { mode: 'id', id: a.voiceId },
        ...(l.language ? { language: l.language } : {}),
        output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 },
        generation_config: { speed: 0.95, emotion: 'calm' },
      }),
    });
  }

  private async stream(l: Line, res: Response): Promise<void> {
    const wav = new WavStreamReader();
    let pending: Float32Array<ArrayBuffer>[] = [];
    let pendingN = 0;
    const flush = () => {
      if (!pendingN || !wav.format) return;
      const merged = new Float32Array(pendingN);
      let o = 0;
      for (const p of pending) { merged.set(p, o); o += p.length; }
      pending = []; pendingN = 0;
      this.schedule(l, merged, wav.format.sampleRate);
    };
    const take = (bytes: Uint8Array) => {
      const s = wav.push(bytes);
      if (s && s.length) { pending.push(s); pendingN += s.length; }
      if (pendingN >= (l.m.audioSec > 0 ? CHUNK : FIRST_CHUNK)) flush();
    };
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (l.gen !== this.gen) return;
      l.m.firstByteMs = Math.round(performance.now() - l.t0);
      take(buf);
    } else {
      for (;;) {
        const { done, value } = await reader.read();
        if (l.gen !== this.gen) { // a late chunk of a cancelled line: drop it and stop reading
          try { await reader.cancel(); } catch { /* already closed */ }
          return;
        }
        if (done) break;
        if (l.m.firstByteMs === null) l.m.firstByteMs = Math.round(performance.now() - l.t0);
        take(value);
      }
    }
    flush();
    l.m.fetchMs = Math.round(performance.now() - l.t0);
  }

  private schedule(l: Line, samples: Float32Array<ArrayBuffer>, rate: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || l.gen !== this.gen) return;
    if (!l.gain) { l.gain = ctx.createGain(); l.gain.connect(this.master); }
    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(l.gain);
    const now = ctx.currentTime;
    let at = this.nextTime;
    if (at < now + 0.01) {
      if (l.m.audioSec > 0) l.m.underruns++; // the network fell behind playback: a short gap
      at = now + LEAD_S;
    }
    src.start(at);
    this.nextTime = at + buffer.duration;
    if (l.m.firstAudioMs === null) l.m.firstAudioMs = Math.round(performance.now() - l.t0 + (at - now) * 1000);
    l.m.audioSec = +(l.m.audioSec + buffer.duration).toFixed(3);
    l.sources.add(src);
    src.onended = () => {
      l.sources.delete(src);
      this.lastAudioAt = performance.now();
      if (l.streamDone && !l.sources.size) this.settle(l);
    };
    this.onChange();
  }

  private captions(l: Line): Promise<void> {
    l.m.mode = 'captions';
    const behind = this.ctx ? Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000) : 0;
    const ms = behind + Math.max(300, CAPTION_MS_PER_CHAR * l.text.length);
    return new Promise<void>((resolve) => {
      if (l.gen !== this.gen) { resolve(); return; }
      l.abort.signal.addEventListener('abort', () => resolve(), { once: true });
      l.timer = setTimeout(() => { l.timer = null; this.settle(l); resolve(); }, ms);
    });
  }

  /** Releases the audio graph (the AudioContext itself is owned by the caller). */
  dispose(): void {
    this.cancel();
    try { this.master?.disconnect(); this.analyser?.disconnect(); } catch { /* already gone */ }
  }
}

/** The caller's abort signal plus a hard timeout (AbortSignal.any where available; Quest Browser is Chromium-based). */
function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  return any && timeout ? any([signal, timeout(ms)]) : signal;
}
