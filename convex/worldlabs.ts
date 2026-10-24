'use node';
// Official Marble API: prepare upload -> private PUT -> single paid POST -> scheduled polling -> cached SPZ.
// References: docs.worldlabs.ai/api/reference/media-assets/prepare-upload and /operations/get.
import { v } from 'convex/values';
import { createHash } from 'node:crypto';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { worldAssetPlan } from '../packages/shared/src/worldlabs';
import type { Id } from './_generated/dataModel';

const BASE = 'https://api.worldlabs.ai/marble/v1';
const MODEL = 'marble-1.1';
const PROMPT = 'A grounded, static interpretation of this place. Preserve the visible layout and architectural character. Keep the foreground open for separate interactive objects; do not invent freestanding benches, gates, trees, or photographs in that space. No people, no written words.';
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
type Operation = { operation_id: string; done: boolean; error?: unknown; response?: unknown; metadata?: { progress?: { description?: string } } };
const key = () => process.env.WORLD_LABS_API_KEY ?? process.env.WORLDLABS_API_KEY;
async function marble<T>(path: string, body?: unknown): Promise<T> {
  if (!key()) throw new Error('World Labs is not configured.');
  const response = await fetch(BASE + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30_000),
    headers: { 'WLT-Api-Key': key()!, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`World Labs request failed (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}
async function asset(url: string): Promise<Blob> {
  if (new URL(url).protocol !== 'https:') throw new Error('World asset must use HTTPS.');
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok || !response.body) throw new Error('Generated asset download failed.');
  if (Number(response.headers.get('content-length') ?? 0) > 20_000_000) throw new Error('Generated asset exceeds the headset size budget.');
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 20_000_000) { await reader.cancel(); throw new Error('Generated asset exceeds the headset size budget.'); }
    chunks.push(new Uint8Array(value));
  }
  const blob = new Blob(chunks, { type: 'application/octet-stream' });
  const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (size < 32 || header[0] !== 0x1f || header[1] !== 0x8b) throw new Error('World Labs returned an invalid compressed SPZ asset.');
  return blob;
}
const safeReason = (error: unknown) => {
  let text = error instanceof Error ? error.message : 'World generation failed.';
  if (key()) text = text.split(key()!).join('<redacted>');
  return text.replace(/https?:\/\/\S+/g, '<provider-url>').slice(0, 220);
};

export const submit = internalAction({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    // Claim exactly once; a lost HTTP response must never trigger an automatic second paid POST.
    if (!(await ctx.runMutation(internal.worlddb.claim, { jobId }))) return;
    try {
      const info = await ctx.runQuery(internal.worlddb.info, { jobId });
      if (!info?.photoUrl) throw new Error('Photo or its World Labs permission is no longer available.');
      const photo = await fetch(info.photoUrl, { signal: AbortSignal.timeout(15000) });
      if (!photo.ok) throw new Error('The stored photo could not be read.');
      const bytes = await photo.blob();
      if (bytes.size > 8_000_000) throw new Error('Photo exceeds the upload size budget.');
      const photoHash = sha256(new Uint8Array(await bytes.arrayBuffer()));
      const requestHash = sha256(JSON.stringify({ photoHash, model: MODEL, prompt: PROMPT }));
      if (!(await ctx.runMutation(internal.worlddb.recordRequest, { jobId, photoHash, requestHash, model: MODEL }))) return;
      const upload = await marble<{ media_asset: { media_asset_id: string }; upload_info: { upload_url: string; required_headers: Record<string, string> } }>(
        '/media-assets:prepare_upload', { file_name: 'family-memory.jpg', extension: 'jpg', kind: 'image' });
      if (new URL(upload.upload_info.upload_url).protocol !== 'https:') throw new Error('Invalid media upload URL.');
      const put = await fetch(upload.upload_info.upload_url, { method: 'PUT', headers: upload.upload_info.required_headers, body: bytes, signal: AbortSignal.timeout(30000) });
      if (!put.ok) throw new Error('The photo upload to World Labs failed.');
      // Check consent again immediately before the billable generation request.
      if (!(await ctx.runQuery(internal.worlddb.info, { jobId }))) throw new Error('World Labs permission was withdrawn.');
      if (!(await ctx.runMutation(internal.worlddb.reserveGeneration, { jobId }))) throw new Error('The deployment reached its configured world generation limit. Existing worlds remain available.');
      const operation = await marble<Operation>('/worlds:generate', { display_name: 'Family memory interpretation', model: MODEL,
        permission: { public: false, allow_id_access: false },
        world_prompt: { type: 'image', image_prompt: { source: 'media_asset', media_asset_id: upload.media_asset.media_asset_id },
          text_prompt: PROMPT } });
      if (!operation.operation_id) throw new Error('World Labs returned no operation identifier.');
      await ctx.runMutation(internal.worlddb.waitForOperation, { jobId, operationId: operation.operation_id, progress: 'Generating an interpretation of the photo' });
    } catch (error) { await ctx.runMutation(internal.worlddb.fail, { jobId, reason: safeReason(error) }); }
  },
});

export const poll = internalAction({
  args: { jobId: v.id('jobs'), operationId: v.string() },
  handler: async (ctx, { jobId, operationId }) => {
    const stored: Id<'_storage'>[] = [];
    try {
      const info = await ctx.runQuery(internal.worlddb.info, { jobId });
      if (!info) { await ctx.runMutation(internal.worlddb.fail, { jobId, reason: 'Photo or World Labs permission is no longer available.' }); return; }
      if (Date.now() > Number(info.job.meta?.pollDeadlineAt ?? info.job.createdAt + 20 * 60_000)) throw new Error('World download timed out. Recover the existing operation in Room settings.');
      let operation: Operation;
      try { operation = await marble<Operation>(`/operations/${encodeURIComponent(operationId)}`); }
      catch {
        await ctx.runMutation(internal.worlddb.waitForOperation, { jobId, operationId, progress: 'Reconnecting to world generation' });
        return; // bounded by the overall deadline; polling never submits another generation
      }
      if (operation.error) throw new Error('World Labs could not complete this generation.');
      if (!operation.done) {
        await ctx.runMutation(internal.worlddb.waitForOperation, { jobId, operationId, progress: operation.metadata?.progress?.description ?? 'Generating the world' });
        return;
      }
      const plan = worldAssetPlan(operation.response);
      const full = await asset(plan.url);
      const fileId = await ctx.storage.store(full); stored.push(fileId);
      const lite = plan.liteUrl ? await asset(plan.liteUrl) : null;
      const liteFileId = lite ? await ctx.storage.store(lite) : null;
      if (liteFileId) stored.push(liteFileId);
      const artifactHash = sha256(new Uint8Array(await full.arrayBuffer()));
      const liteArtifactHash = lite ? sha256(new Uint8Array(await lite.arrayBuffer())) : null;
      const attached = await ctx.runMutation(internal.worlddb.finish, { jobId, splatId: info.splat._id, fileId, liteFileId,
        numSplats: plan.numSplats, liteNumSplats: plan.liteNumSplats, bytes: full.size + (lite?.size ?? 0), floorY: plan.floorY, scale: plan.scale, worldId: plan.worldId, artifactHash, liteArtifactHash });
      if (attached) stored.length = 0;
      else await ctx.runMutation(internal.worlddb.fail, { jobId, reason: 'The memory changed or upload permission was withdrawn before completion.' });
    } catch (error) { await ctx.runMutation(internal.worlddb.fail, { jobId, reason: safeReason(error) }); }
    finally { for (const id of stored) await ctx.storage.delete(id); }
  },
});
