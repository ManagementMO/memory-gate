// A generative ambient score, synthesised live (no files, no licensing): slow detuned pads that change chord every
// sixteen seconds, sparse glassy chimes on a pentatonic scale, a breath of filtered air, all through a long
// algorithmic reverb. Each part of the journey has its own voicing; the music ducks whenever the companion speaks.
// Nothing here is percussive or sudden: every change ramps over seconds.

type Mode = 'gate' | 'white' | 'album';

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Voicings in D. The gate is lower and more open; the white side lifts into the upper register.
const CHORDS: Record<Mode, number[][]> = {
  gate: [
    [38, 45, 54, 61, 64],   // Dmaj9
    [35, 42, 57, 62, 64],   // Bm11
    [43, 50, 54, 59, 61],   // Gmaj7(#11)
    [45, 52, 59, 61, 64],   // A(add9)
  ],
  white: [
    [50, 57, 62, 66, 69, 73], // D(add9) up high
    [47, 54, 59, 62, 66, 69], // Bm(add11)
    [43, 55, 59, 62, 66, 71], // Gmaj9
    [45, 57, 61, 64, 69, 71], // Asus2
  ],
  album: [
    [38, 50, 57, 62, 66],
    [43, 55, 59, 62, 69],
  ],
};
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]; // D major pentatonic, two octaves

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private duckGain!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private reverb!: ConvolverNode;
  private mode: Mode = 'gate';
  private chordIndex = 0;
  private chordTimer: ReturnType<typeof setTimeout> | null = null;
  private chimeTimer: ReturnType<typeof setTimeout> | null = null;
  private voices: { stop: (at: number) => void }[] = [];
  private enabled = true;
  private started = false;

  /** Must be called from a user gesture (Begin). Safe to call twice. */
  start(): void {
    if (this.started) { void this.ctx?.resume(); return; }
    this.started = true;
    let ctx: AudioContext;
    try { ctx = new AudioContext({ latencyHint: 'playback' }); } catch { return; }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.duckGain = ctx.createGain();
    this.dry = ctx.createGain(); this.dry.gain.value = 0.55;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.85;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 6.5, 2.6);
    this.dry.connect(this.duckGain);
    this.wet.connect(this.reverb).connect(this.duckGain);
    this.duckGain.connect(this.master).connect(comp).connect(ctx.destination);
    this.air();
    this.playChord();
    this.scheduleChime();
    this.master.gain.setTargetAtTime(this.enabled ? 0.34 : 0, ctx.currentTime, 2.2);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(on ? 0.34 : 0, this.ctx.currentTime, on ? 1.2 : 0.4);
  }

  /** Lower the music under the companion's voice (and bring it back after). */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.duckGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.duckGain.gain.setTargetAtTime(on ? 0.4 : 1, this.ctx.currentTime, on ? 0.25 : 1.1);
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.chordIndex = 0;
    if (this.ctx) { if (this.chordTimer) clearTimeout(this.chordTimer); this.playChord(); }
  }

  /** Soft signature sounds for moments that matter. */
  cue(kind: 'wake' | 'appear' | 'enter' | 'album'): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const now = ctx.currentTime;
    if (kind === 'enter') {
      // A slow rising swell of air and a low bloom: walking into light.
      const n = noiseSource(ctx, 7);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(220, now); bp.frequency.exponentialRampToValueAtTime(4200, now + 5.5);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.16, now + 3.8); g.gain.linearRampToValueAtTime(0, now + 6.5);
      n.connect(bp).connect(g); g.connect(this.wet); g.connect(this.dry);
      n.start(now); n.stop(now + 7);
      [50, 57, 62, 69].forEach((m, i) => this.bell(m + 12, now + 2.2 + i * 0.55, 0.05, 6));
      return;
    }
    const notes = kind === 'wake' ? [74, 81] : kind === 'appear' ? [SCALE[Math.floor(Math.random() * 4) + 4]!] : [69, 74, 78];
    notes.forEach((m, i) => this.bell(m, now + i * 0.32, kind === 'appear' ? 0.045 : 0.06, 4.5));
  }

  private playChord(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const chords = CHORDS[this.mode];
    const chord = chords[this.chordIndex % chords.length]!;
    this.chordIndex++;
    const old = this.voices;
    this.voices = chord.map((m, i) => this.pad(m, now, i === 0));
    for (const v of old) v.stop(now + 7);
    this.chordTimer = setTimeout(() => this.playChord(), 16_000);
  }

  private pad(midi: number, at: number, isRoot: boolean): { stop: (at: number) => void } {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(isRoot ? 0.06 : 0.042, at + 6.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.mode === 'white' ? 1500 : 950;
    lp.Q.value = 0.4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.04 + Math.random() * 0.04;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = this.mode === 'white' ? 520 : 380;
    lfo.connect(lfoGain).connect(lp.frequency);
    const oscs = [-7, 6].map((cents) => {
      const o = ctx.createOscillator();
      o.type = midi < 48 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents + (Math.random() - 0.5) * 3;
      o.connect(lp);
      return o;
    });
    const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 0.7;
    lp.connect(env).connect(pan);
    pan.connect(this.dry); pan.connect(this.wet);
    for (const o of oscs) o.start(at);
    lfo.start(at);
    return {
      stop: (end: number) => {
        env.gain.cancelScheduledValues(end - 6.9);
        env.gain.setValueAtTime(env.gain.value, end - 6.9);
        env.gain.linearRampToValueAtTime(0, end);
        for (const o of oscs) o.stop(end + 0.1);
        lfo.stop(end + 0.1);
      },
    };
  }

  private bell(midi: number, at: number, peak: number, decay: number): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    // A glassy bell: a sine plus a quiet inharmonic partial.
    [1, 2.76].forEach((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const pg = ctx.createGain(); pg.gain.value = i === 0 ? 1 : 0.18;
      o.connect(pg).connect(g);
      o.start(at); o.stop(at + decay + 0.1);
    });
    const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.2;
    g.connect(pan);
    pan.connect(this.wet);
    const d = ctx.createGain(); d.gain.value = 0.35; pan.connect(d).connect(this.dry);
  }

  private scheduleChime(): void {
    const wait = 3200 + Math.random() * 5200;
    this.chimeTimer = setTimeout(() => {
      if (this.ctx && this.enabled) {
        const m = SCALE[Math.floor(Math.random() * SCALE.length)]! + (this.mode === 'white' ? 12 : 0);
        this.bell(m, this.ctx.currentTime + 0.05, 0.022 + Math.random() * 0.018, 5.5);
      }
      this.scheduleChime();
    }, wait);
  }

  private air(): void {
    const ctx = this.ctx!;
    const n = noiseSource(ctx, 4, true);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.012;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.007;
    lfo.connect(lg).connect(g.gain);
    n.connect(bp).connect(g).connect(this.wet);
    n.start(); lfo.start();
  }

  dispose(): void {
    if (this.chordTimer) clearTimeout(this.chordTimer);
    if (this.chimeTimer) clearTimeout(this.chimeTimer);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

function noiseSource(ctx: AudioContext, seconds: number, loop = false): AudioBufferSourceNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Pink-ish noise (Paul Kellet's economical filter): softer than white, like distant air.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  return src;
}

/** A long, dark, stereo hall: exponentially decaying noise, darkened over time by a one-pole low-pass. */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const coeff = 0.15 + 0.8 * t; // the tail darkens
      lp += ((Math.random() * 2 - 1) - lp) * (1 - coeff);
      d[i] = lp * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.02 ? i / (ctx.sampleRate * 0.02) : 1);
    }
  }
  return buf;
}

export const music = new Music();
