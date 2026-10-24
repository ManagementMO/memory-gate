import { afterEach, expect, test, vi } from 'vitest';
import { downloadWorldAsset } from '../../convex/lib/worldAssetDownload';

afterEach(() => vi.unstubAllGlobals());

test('a transient broken range is retried without duplicating or scrambling the cached SPZ bytes', async () => {
  const bytes = new Uint8Array(1_100_000); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  bytes[0] = 0x1f; bytes[1] = 0x8b;
  let active = 0, maxActive = 0, brokenOnce = false;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: RequestInit) => {
    const match = /bytes=(\d+)-(\d+)/.exec((opts.headers as Record<string, string>).Range ?? '')!;
    const start = Number(match[1]), end = Number(match[2]);
    if (start === 0 && end === 0) return new Response(bytes.slice(0, 1), { status: 206, headers: { 'content-range': `bytes 0-0/${bytes.length}` } });
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, start === 0 ? 8 : 1)); active--;
    if (start === 262144 && !brokenOnce) { brokenOnce = true; throw new Error('temporary hotspot disconnect'); }
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${bytes.length}` } });
  }));
  expect(new Uint8Array(await (await downloadWorldAsset('https://example.com/world.spz')).arrayBuffer())).toEqual(bytes);
  expect(maxActive).toBe(4); expect(brokenOnce).toBe(true);
});

test('oversized or mismatched ranges cannot become a cached scene', async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([0x1f]), { status: 206, headers: { 'content-range': 'bytes 0-0/20000001' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(downloadWorldAsset('https://example.com/large.spz')).rejects.toThrow(/size budget/);
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockImplementation(async () => new Response(new Uint8Array([0x1f]), { status: 206, headers: { 'content-range': 'bytes 0-0/64' } }));
  await expect(downloadWorldAsset('https://example.com/wrong-range.spz')).rejects.toThrow(/range/);
  await expect(downloadWorldAsset('http://localhost/private')).rejects.toThrow(/HTTPS/);
});
