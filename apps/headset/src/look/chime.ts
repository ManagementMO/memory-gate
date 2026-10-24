// Soft chimes, synthesized with WebAudio (no asset): a warm two-partial bell when a ghost settles (659 + 988 Hz) and
// a quieter, lower note when a ghost first appears (440 Hz). 8 ms attack, 1.6 s exponential decay, no clicks.
// Gains are set for the room's default sound level (0.6) and scale with room.soundLevel (0..1), which keeps them far
// under the companion's voice (calm contract: effects ~10 dB under speech). Non-spatial for now.
// Browsers start audio only after a user gesture: call unlock() from one (Enable microphone, Enter, a click).

export class Chimes {
  private ctx: AudioContext | null = null;
  /** room.soundLevel, 0..1 (0.6 is the default the gains below are tuned for). */
  level = 0.6;
  muted = false;
  readonly counts = { appear: 0, settle: 0 };

  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* no audio in this browser: chimes stay silent */ }
  }

  get state(): string { return this.ctx?.state ?? 'locked'; }

  private play(partials: [number, number][], peak: number, decayS = 1.6): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (ctx.state === 'suspended') { void ctx.resume().catch(() => undefined); return; } // e.g. after the headset slept
    if (ctx.state !== 'running') return;
    const gain = peak * Math.min(1.6, Math.max(0, this.level) / 0.6);
    if (gain <= 0.0005) return;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(gain, t0 + 0.008); // 8 ms attack
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.008 + decayS); // 1.6 s decay
    out.connect(ctx.destination);
    for (const [freq, rel] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = rel;
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(t0 + decayS + 0.05);
      osc.onended = () => { g.disconnect(); };
    }
    setTimeout(() => out.disconnect(), (decayS + 0.3) * 1000);
  }

  /** A ghost became confirmed: the settle bell. */
  settle(): void { this.counts.settle++; this.play([[659.25, 1], [987.77, 0.5]], 0.06); }
  /** A ghost first appeared: a quieter, lower note. */
  appear(): void { this.counts.appear++; this.play([[440, 1]], 0.035); }
}
