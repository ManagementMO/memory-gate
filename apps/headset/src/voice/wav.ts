// WAV helpers for the voice module.
// - encodeWav: the 16 kHz mono push-to-talk clip, kept in memory and uploaded only with voice_recording consent.
// - WavStreamReader: Cartesia's /tts/bytes streams a RIFF header with unknown sizes (0xFFFFFFFF), then a LIST chunk,
//   then a `data` chunk that runs to the end of the response (checked live 2026-10-23). It turns network chunks into
//   Float32 samples as soon as the `data` payload starts, so playback can begin on the first chunk.

export function encodeWav(frames: readonly Int16Array<ArrayBuffer>[], sampleRate: number): Blob {
  const samples = frames.reduce((n, f) => n + f.length, 0);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, samples * 2, true);
  // Int16Array bytes are little-endian on every platform we target (x86, ARM), which is what WAV wants.
  return new Blob([header, ...frames], { type: 'audio/wav' });
}

export type WavFormat = { sampleRate: number; channels: number; bitsPerSample: number };

/** Incremental WAV reader: push network chunks, get mono Float32 samples once the `data` chunk has started. */
export class WavStreamReader {
  format: WavFormat | null = null;
  private head: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private inData = false;
  private carry: number[] = []; // bytes left over from an incomplete sample frame

  push(chunk: Uint8Array): Float32Array<ArrayBuffer> | null {
    if (this.inData) return this.decode(chunk);
    const joined = new Uint8Array(this.head.length + chunk.length);
    joined.set(this.head, 0);
    joined.set(chunk, this.head.length);
    this.head = joined;
    if (this.head.length < 12) return null;
    const dv = new DataView(this.head.buffer, this.head.byteOffset, this.head.byteLength);
    const tag = (at: number) => String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('speech audio was not a WAV stream');
    let at = 12;
    while (at + 8 <= this.head.length) {
      const id = tag(at);
      const size = dv.getUint32(at + 4, true);
      if (id === 'data') {
        if (!this.format) throw new Error('WAV data before fmt');
        this.inData = true;
        const rest = this.head.subarray(at + 8);
        this.head = new Uint8Array(0);
        return this.decode(rest);
      }
      if (at + 8 + size > this.head.length) return null; // wait for the rest of this chunk
      if (id === 'fmt ') {
        const audioFormat = dv.getUint16(at + 8, true);
        const channels = dv.getUint16(at + 10, true);
        const sampleRate = dv.getUint32(at + 12, true);
        const bitsPerSample = dv.getUint16(at + 22, true);
        if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1 || !sampleRate) throw new Error('unsupported speech audio format');
        this.format = { sampleRate, channels, bitsPerSample };
      }
      at += 8 + size + (size & 1);
    }
    return null;
  }

  private decode(bytes: Uint8Array): Float32Array<ArrayBuffer> | null {
    const ch = this.format?.channels ?? 1;
    const frameBytes = 2 * ch;
    let src: Uint8Array = bytes;
    if (this.carry.length) {
      const merged = new Uint8Array(this.carry.length + bytes.length);
      merged.set(this.carry, 0);
      merged.set(bytes, this.carry.length);
      src = merged;
      this.carry = [];
    }
    const frames = Math.floor(src.length / frameBytes);
    const used = frames * frameBytes;
    if (used < src.length) this.carry = Array.from(src.subarray(used));
    if (!frames) return null;
    const dv = new DataView(src.buffer, src.byteOffset, used);
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < ch; c++) sum += dv.getInt16((i * ch + c) * 2, true);
      out[i] = sum / ch / 32768;
    }
    return out;
  }
}
