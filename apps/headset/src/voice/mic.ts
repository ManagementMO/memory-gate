// Microphone capture for push-to-talk.
// One getUserMedia stream (echo cancellation, noise suppression) stays open for the session, opened on the 2D page
// before XR, so pressing the button never waits for a permission prompt or a device start. An AudioWorklet low-passes
// the device-rate signal (4th-order Butterworth at 7.2 kHz, as two biquads), resamples it to 16 kHz mono with linear
// interpolation, converts to s16le and, only while a turn is capturing, posts ~100 ms frames tagged with that turn's
// id. Between turns it keeps only the last 200 ms in a ring buffer inside the worklet (pre-roll, so a first syllable
// spoken as the button goes down is not clipped); nothing leaves the worklet unless a turn is capturing.

const WORKLET_SRC = `
const OUT_RATE = 16000, FRAME = 1600, PRE = 3200;
function lowpass(f0, fs, q) {
  const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: -2 * c / a0, a2: (1 - a) / a0, z1: 0, z2: 0 };
}
function run(s, x) { const y = s.b0 * x + s.z1; s.z1 = s.b1 * x - s.a1 * y + s.z2; s.z2 = s.b2 * x - s.a2 * y; return y; }
class MgPcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / OUT_RATE;
    this.stages = sampleRate > OUT_RATE ? [lowpass(7200, sampleRate, 0.5412), lowpass(7200, sampleRate, 1.3066)] : [];
    this.prev = 0; this.idx = 0; this.next = 0;
    this.turn = 0; this.frame = new Int16Array(FRAME); this.n = 0;
    this.pre = new Int16Array(PRE); this.preW = 0; this.preN = 0;
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.cmd === 'start') {
        this.post();
        this.turn = m.id; this.n = 0;
        if (m.preroll) this.drainPre();
        this.preW = 0; this.preN = 0;
      } else if (m.cmd === 'stop') {
        if (this.turn === m.id) { this.post(); this.turn = 0; }
        this.port.postMessage({ type: 'stopped', id: m.id });
      }
    };
  }
  post() {
    if (!this.turn || !this.n) { this.n = 0; return; }
    const pcm = this.frame.slice(0, this.n); this.n = 0;
    this.port.postMessage({ type: 'pcm', id: this.turn, pcm }, [pcm.buffer]);
  }
  drainPre() { const start = (this.preW - this.preN + PRE) % PRE; for (let k = 0; k < this.preN; k++) this.push(this.pre[(start + k) % PRE]); }
  push(v) { this.frame[this.n++] = v; if (this.n === FRAME) this.post(); }
  emit(x) {
    const s = x > 1 ? 1 : x < -1 ? -1 : x;
    const v = s < 0 ? s * 32768 : s * 32767;
    if (this.turn) this.push(v);
    else { this.pre[this.preW] = v; this.preW = (this.preW + 1) % PRE; if (this.preN < PRE) this.preN++; }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      let y = ch[i];
      for (let k = 0; k < this.stages.length; k++) y = run(this.stages[k], y);
      while (this.next <= this.idx) { this.emit(this.prev + (y - this.prev) * (this.next - this.idx + 1)); this.next += this.ratio; }
      this.prev = y; this.idx++;
    }
    if (this.idx > 1e7) { this.idx -= 1e7; this.next -= 1e7; }
    return true;
  }
}
registerProcessor('mg-pcm16k', MgPcm16k);
`;

export const MIC_RATE = 16000;

type TurnSink = { onFrame: (pcm: Int16Array<ArrayBuffer>) => void; stopped: (() => void) | null };

export class Mic {
  readonly analyser: AnalyserNode;
  /** Called once if the device goes away mid-session (unplugged, permission revoked). */
  onEnded: (() => void) | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private readonly turns = new Map<number, TurnSink>();
  private nextId = 1;

  constructor(private readonly ctx: AudioContext) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
  }

  get ok(): boolean {
    return !!this.node && !!this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live');
  }

  async open(): Promise<void> {
    if (this.node) return;
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('getUserMedia unavailable'), { name: 'NotSupportedError' });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
      try { await this.ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      const node = new AudioWorkletNode(this.ctx, 'mg-pcm16k', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit',
      });
      node.port.onmessage = (e: MessageEvent) => {
        const m = e.data as { type?: string; id?: number; pcm?: Int16Array<ArrayBuffer> };
        const t = typeof m.id === 'number' ? this.turns.get(m.id) : undefined;
        if (!t) return;
        if (m.type === 'pcm' && m.pcm) t.onFrame(m.pcm);
        else if (m.type === 'stopped') t.stopped?.();
      };
      const source = this.ctx.createMediaStreamSource(stream);
      const sink = this.ctx.createGain();
      sink.gain.value = 0; // keeps the worklet in the rendered graph without making any sound
      source.connect(node);
      source.connect(this.analyser);
      node.connect(sink);
      sink.connect(this.ctx.destination);
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => this.onEnded?.(), { once: true });
      this.stream = stream; this.source = source; this.node = node; this.sink = sink;
    } catch (e) {
      for (const t of stream.getTracks()) t.stop();
      throw e;
    }
  }

  /**
   * After the device took the microphone away (a headset going to sleep, then waking): ask for it again and plug it
   * into the same graph. Resolves false while it can't be had yet (try again later).
   */
  async reopen(): Promise<boolean> {
    if (!this.node) return false;
    if (this.ok) return true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch { return false; }
    try { this.source?.disconnect(); } catch { /* already gone */ }
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    const source = this.ctx.createMediaStreamSource(stream);
    source.connect(this.node);
    source.connect(this.analyser);
    for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => this.onEnded?.(), { once: true });
    this.stream = stream; this.source = source;
    return true;
  }

  /** Starts capturing a turn; frames arrive at onFrame until end(id) resolves. */
  begin(onFrame: (pcm: Int16Array<ArrayBuffer>) => void, preroll: boolean): number {
    const id = this.nextId++;
    this.turns.set(id, { onFrame, stopped: null });
    this.node?.port.postMessage({ cmd: 'start', id, preroll });
    return id;
  }

  /** Stops a turn. Resolves after the worklet has posted that turn's last partial frame (or 500 ms, whichever first). */
  end(id: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = this.turns.get(id);
      if (!t || !this.node) { this.turns.delete(id); resolve(); return; }
      let settled = false;
      const finish = () => { if (settled) return; settled = true; this.turns.delete(id); resolve(); };
      t.stopped = finish;
      this.node.port.postMessage({ cmd: 'stop', id });
      setTimeout(finish, 500);
    });
  }

  close(): void {
    this.turns.clear();
    try { this.source?.disconnect(); this.node?.disconnect(); this.sink?.disconnect(); } catch { /* already gone */ }
    if (this.node) this.node.port.onmessage = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null; this.source = null; this.node = null; this.sink = null;
  }
}
