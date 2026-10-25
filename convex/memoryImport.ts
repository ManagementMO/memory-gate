'use node';
import { v, ConvexError } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { normalizePosts, scraperInput, mediaUrl } from '../actors/historical-memory-atlas/src/social.mjs';
const auth = { code: v.string(), token: v.string() };

async function apify(path: string, init: RequestInit = {}) {
  const response = await fetch('https://api.apify.com/v2/' + path, { ...init, redirect: 'error',
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Apify is unavailable or the account needs attention. Check the saved run before retrying.');
  return response.json();
}
export const start = action({ args: { ...auth, mode: v.union(v.literal('fixture'), v.literal('cloud')), urls: v.array(v.string()), permission: v.boolean() }, handler: async (ctx, a): Promise<string> => {
  if (a.mode === 'cloud' && (!process.env.APIFY_TOKEN || process.env.ALLOW_APIFY_CLOUD !== '1')) throw new ConvexError('Apify is not configured. Set the server APIFY_TOKEN and ALLOW_APIFY_CLOUD=1, then run env:push.');
  const actorId = process.env.APIFY_MEMORY_ACTOR_ID || 'apify~instagram-scraper';
  if (!/^[\w-]+(?:[~\/][\w-]+)?$/.test(actorId)) throw new ConvexError('The configured Apify Actor ID is invalid.');
  const id = await ctx.runMutation(internal.memorySources.begin, { ...a, actorId });
  if (a.mode === 'fixture') { await ctx.runMutation(internal.memorySources.fixture, { id }); return id; }
  try {
    const body = actorId === 'apify~instagram-scraper' || actorId === 'apify/instagram-scraper'
      ? scraperInput(a.urls) : { sourceMode: 'social', postUrls: scraperInput(a.urls).directUrls, permissionConfirmed: true };
    const { data } = await apify(`acts/${encodeURIComponent(actorId.replace('/', '~'))}/runs?timeout=180&maxTotalChargeUsd=0.10`, { method: 'POST', body: JSON.stringify(body) });
    if (!data?.id || !/^[A-Za-z0-9]+$/.test(data.id)) throw new Error('Apify did not return a run ID.');
    await ctx.runMutation(internal.memorySources.recordRun, { id, runId: data.id });
    return id;
  } catch {
    await ctx.runMutation(internal.memorySources.fail, { id, message: 'The Apify start request failed. It may have reached Apify; inspect the account before starting another run. No source was attached.' });
    throw new ConvexError('Could not start the import. Check the import status and Apify Console before retrying.');
  }
} });
export const refresh = action({ args: { ...auth, id: v.id('memoryImports') }, handler: async (ctx, a): Promise<void> => {
  const job = await ctx.runQuery(internal.memorySources.job, a);
  if (job.status !== 'running' || !job.runId) return;
  const { data } = await apify(`actor-runs/${job.runId}`);
  if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(data.status)) {
    await ctx.runMutation(internal.memorySources.fail, { id: job._id, message: `Apify run ${job.runId} ended without photos (${data.status}). No scene details changed.` }); return;
  }
  if (data.status !== 'SUCCEEDED') return;
  if (!/^[A-Za-z0-9]+$/.test(data.defaultDatasetId ?? '')) throw new ConvexError('The completed Apify run has no dataset.');
  const rows = await apify(`datasets/${data.defaultDatasetId}/items?clean=true&limit=12&format=json`);
  await ctx.runMutation(internal.memorySources.complete, { id: job._id, cards: normalizePosts(rows, job.urls) });
} });

export const attach = action({ args: { ...auth, id: v.id('memorySources'), objectKey: v.union(v.literal('kite'), v.literal('flower'), v.literal('landmark')), perspective: v.union(v.literal('elena'), v.literal('rosa')), note: v.string() }, handler: async (ctx, a): Promise<void> => {
  const source = await ctx.runQuery(internal.memorySources.source, { code: a.code, token: a.token, id: a.id });
  if (source.approved) return;
  let fileId = null;
  try {
    if (source.execution !== 'fixture') {
      const url = mediaUrl(source.imageUrl);
      if (!url) throw new Error('This photo URL is unavailable. Import the public post again.');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
      const type = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || Number(response.headers.get('content-length')) > 5_000_000) throw new Error('The source photo cannot be saved. Try another public photo.');
      const reader = response.body?.getReader(); if (!reader) throw new Error('No photo was returned.');
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 5_000_000) { await reader.cancel(); throw new Error('Choose a photo smaller than 5 MB.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      fileId = await ctx.storage.store(new Blob([bytes], { type }));
    }
    const result = await ctx.runMutation(internal.memorySources.publish, { ...a, fileId });
    if (fileId && !result.usedFile) await ctx.storage.delete(fileId);
  } catch {
    if (fileId) await ctx.storage.delete(fileId);
    throw new ConvexError('The photo could not be attached. Check that sharing is enabled and the room is active. Expired photos may need a fresh import.');
  }
} });
