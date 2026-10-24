// One Cartesia ink-2 realtime STT connection, push-to-talk style (manual finalize). Protocol, as proven in the prep
// browser spike and checked again live on 2026-10-23: binary s16le 16 kHz frames of ~100 ms; on release the text
// frame `finalize` (the server answers `flush_done` once every buffered word is out), then `close` (the server answers
// `done` and closes with 1000). The transcript is the exact concatenation of the `text` of every `transcript` message
// with is_final: true. The short-lived access token rides in the URL, so the URL is never logged.

export const STT_RATE = 16000;
const OPEN_TIMEOUT_MS = 6000; // a released turn waits this long for a socket that is still connecting
const FLUSH_TIMEOUT_MS = 5000; // finalize -> flush_done; never hang the conversation
const DONE_GRACE_MS = 400; // close -> done is ~100 ms; after this, use what flush_done delivered

export function sttUrl(token: string, keyterms: readonly string[], version: string): string {
  const qs = new URLSearchParams({ model: 'ink-2', encoding: 'pcm_s16le', sample_rate: String(STT_RATE), cartesia_version: version, access_token: token });
  let total = 0;
  for (const raw of keyterms.slice(0, 100)) {
    const k = raw.trim();
    if (!k || total + k.length > 1200) continue; // Cartesia: up to 100 keyterms, 1200 characters in all
    total += k.length;
    qs.append('keyterm', k);
  }
  return `wss://api.cartesia.ai/stt/websocket?${qs.toString()}`;
}

export type SttOutcome = {
  ok: boolean; // false when the socket failed before every word came back (the caller may replay the clip)
  transcript: string; // exact is_final concatenation
  flushMs: number | null; // release -> flush_done
  doneMs: number | null; // release -> done
  error: string | null;
};

type Msg = { type?: string; is_final?: boolean; text?: string; title?: string; message?: string };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class SttSession {
  state: 'connecting' | 'open' | 'finishing' | 'closed' = 'connecting';
  error: string | null = null;
  readonly createdAt = performance.now();
  openedAt: number | null = null;
  /** Fires if the socket closes on its own before finish() (idle timeout, network); used to reconnect a spare. */
  onDrop: (() => void) | null = null;
  /** Optional: receives the transcript so far each time words arrive (interim words included). */
  onText: ((text: string) => void) | null = null;
  readonly opened: Promise<boolean>;
  private readonly ws: WebSocket;
  private queue: ArrayBuffer[] = [];
  private finals = '';
  private flushWaiter: (() => void) | null = null;
  private doneWaiter: (() => void) | null = null;
  private flushAt: number | null = null;
  private doneAt: number | null = null;

  constructor(url: string) {
    let settleOpen: (ok: boolean) => void = () => {};
    this.opened = new Promise<boolean>((r) => { settleOpen = r; });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.state = 'closed';
      this.error = 'could not open the speech connection';
      settleOpen(false);
      this.ws = null as unknown as WebSocket;
      return;
    }
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (this.state !== 'connecting') return;
      this.state = 'open';
      this.openedAt = performance.now();
      for (const b of this.queue) ws.send(b);
      this.queue = [];
      settleOpen(true);
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      let m: Msg;
      try { m = JSON.parse(ev.data) as Msg; } catch { return; }
      if (m.type === 'transcript') {
        if (m.is_final && typeof m.text === 'string') this.finals += m.text;
        // Optional live view of the words so far (finals plus the current interim guess). Never changes `finals`.
        if (typeof m.text === 'string' && this.onText) { try { this.onText(m.is_final ? this.finals : this.finals + m.text); } catch { /* the app's handler must not break STT */ } }
      } else if (m.type === 'flush_done') {
        this.flushAt = performance.now();
        this.flushWaiter?.();
      } else if (m.type === 'done') {
        this.doneAt = performance.now();
        this.doneWaiter?.();
      } else if (m.type === 'error') {
        this.error = String(m.title ?? m.message ?? 'speech service error').slice(0, 120);
        this.flushWaiter?.();
        this.doneWaiter?.();
      }
    };
    ws.onerror = () => { /* onclose follows with the details */ };
    ws.onclose = (ev: CloseEvent) => {
      const was = this.state;
      this.state = 'closed';
      settleOpen(false);
      if (was !== 'finishing') {
        this.error ??= `speech connection closed (${ev.code})`;
        this.onDrop?.();
      }
      this.flushWaiter?.();
      this.doneWaiter?.();
    };
  }

  get usable(): boolean { return this.state === 'connecting' || this.state === 'open'; }

  /** Sends one frame now, or queues it while the socket is still connecting. */
  send(pcm: Int16Array<ArrayBuffer>): void {
    const buf = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength ? pcm.buffer : pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
    if (this.state === 'open') { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(buf); }
    else if (this.state === 'connecting') this.queue.push(buf);
  }

  /** finalize -> flush_done -> close -> done. Times are measured from `releaseAt` (performance.now()). */
  async finish(releaseAt: number): Promise<SttOutcome> {
    const fail = (error: string): SttOutcome => ({ ok: false, transcript: this.finals, flushMs: null, doneMs: null, error });
    if (this.state === 'closed') return fail(this.error ?? 'speech connection closed');
    const opened = await Promise.race([this.opened, sleep(OPEN_TIMEOUT_MS).then(() => false)]);
    if (!opened || this.state !== 'open') { this.dispose(); return fail(this.error ?? 'speech connection did not open'); }
    this.state = 'finishing';
    const flushed = new Promise<void>((r) => { this.flushWaiter = r; });
    if (this.ws.readyState !== WebSocket.OPEN) { this.dispose(); return fail(this.error ?? 'speech connection closed'); }
    try { this.ws.send('finalize'); } catch { this.dispose(); return fail('speech connection failed'); }
    await Promise.race([flushed, sleep(FLUSH_TIMEOUT_MS)]);
    this.flushWaiter = null;
    const gotFlush = this.flushAt !== null;
    if (gotFlush && this.ws.readyState === WebSocket.OPEN) {
      const done = new Promise<void>((r) => { this.doneWaiter = r; });
      try { this.ws.send('close'); } catch { /* closing anyway */ }
      await Promise.race([done, sleep(DONE_GRACE_MS)]);
      this.doneWaiter = null;
    }
    const out: SttOutcome = {
      ok: gotFlush && !this.error,
      transcript: this.finals,
      flushMs: this.flushAt === null ? null : Math.round(this.flushAt - releaseAt),
      doneMs: this.doneAt === null ? null : Math.round(this.doneAt - releaseAt),
      error: gotFlush ? this.error : (this.error ?? 'no reply to finalize'),
    };
    this.dispose();
    return out;
  }

  /** Closes without waiting (spare rotation, teardown, a turn that never captured audio). */
  dispose(): void {
    const was = this.state;
    this.state = 'closed';
    this.onDrop = null;
    this.onText = null;
    this.queue = [];
    if (!this.ws) return;
    const ws = this.ws;
    ws.onmessage = null; ws.onerror = null; ws.onclose = null;
    if (ws.readyState === WebSocket.CONNECTING) {
      // Closing a socket that is still connecting makes the browser log its URL, which holds the access token.
      // Let it finish opening, then close it quietly.
      ws.onopen = () => { try { ws.close(1000); } catch { /* ignore */ } };
    } else {
      ws.onopen = null;
      if (was !== 'closed' && ws.readyState === WebSocket.OPEN) { try { ws.close(1000); } catch { /* already closing */ } }
    }
    this.flushWaiter?.();
    this.doneWaiter?.();
  }

  /** Test hook: simulate a network drop (the server would close with 1006). */
  drop(): void {
    if (this.state === 'closed' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.close(4000, 'simulated drop'); } catch { /* ignore */ }
  }
}
