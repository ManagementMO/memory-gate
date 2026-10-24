const MAX_BYTES = 20_000_000;
const CHUNK = 256 * 1024;

async function boundedBody(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new Error('Generated asset has no body.');
  const parts: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('Generated asset exceeds its download size budget.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** Range-capable CDN files use four bounded transfers so one slow hotspot connection cannot stall the world. */
export async function downloadWorldAsset(url: string): Promise<Blob> {
  if (new URL(url).protocol !== 'https:') throw new Error('World asset must use HTTPS.');
  const deadline = AbortSignal.timeout(240_000);
  let probe: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      probe = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.any([deadline, AbortSignal.timeout(20000)]) });
      break;
    } catch (error) { if (attempt >= 1 || deadline.aborted) throw error; }
  }
  let bytes: Uint8Array<ArrayBuffer>;
  if (probe.status === 200) {
    // Providers without byte ranges keep the same strict size limit.
    if (Number(probe.headers.get('content-length')) > MAX_BYTES) { await probe.body?.cancel(); throw new Error('Generated asset exceeds the headset size budget.'); }
    bytes = await boundedBody(probe, MAX_BYTES);
  } else {
    const match = /^bytes 0-0\/(\d+)$/.exec(probe.headers.get('content-range') ?? '');
    if (probe.status !== 206 || !match) { await probe.body?.cancel(); throw new Error('Generated asset download failed.'); }
    const size = Number(match[1]);
    if (size < 32 || size > MAX_BYTES) { await probe.body?.cancel(); throw new Error('Generated asset exceeds the headset size budget.'); }
    if ((await boundedBody(probe, 1)).length !== 1) throw new Error('Generated asset range is incomplete.');
    bytes = new Uint8Array(size);
    let next = 0;
    const controller = new AbortController();
    const worker = async () => {
      while (next < size) {
        const start = next; next += CHUNK;
        const end = Math.min(size - 1, start + CHUNK - 1);
        for (let attempt = 0; ; attempt++) {
          try {
            const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` },
              signal: AbortSignal.any([deadline, controller.signal, AbortSignal.timeout(45000)]) });
            if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${size}`) {
              await response.body?.cancel(); throw new Error('Generated asset range does not match the requested file.');
            }
            const part = await boundedBody(response, end - start + 1);
            if (part.length !== end - start + 1) throw new Error('Generated asset range is incomplete.');
            bytes.set(part, start); break;
          } catch (error) { if (attempt >= 1 || deadline.aborted || controller.signal.aborted) throw error; }
        }
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(4, Math.ceil(size / CHUNK)) }, worker)); }
    catch (error) { controller.abort(); throw error; }
  }
  if (bytes.length < 32 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('World Labs returned an invalid compressed SPZ asset.');
  return new Blob([bytes], { type: 'application/octet-stream' });
}
