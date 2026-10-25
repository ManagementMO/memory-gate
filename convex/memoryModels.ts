'use node';
import { ConvexError, v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { validateMemoryGlb } from '../packages/shared/src/memoryObjects';
const auth = { code: v.string(), token: v.string() };
async function tripo(path: string, body?: unknown) {
  const response = await fetch('https://openapi.tripo3d.ai/v3/' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const result = await response.json();
  if (!response.ok || result.code !== 0 || !result.data) throw new Error('Tripo is unavailable. The saved task can be checked again without starting another generation.');
  return result.data;
}
export const create = action({ args: { ...auth, sourceId: v.union(v.id('memorySources'), v.null()), placeId: v.union(v.id('memoryPlaces'), v.null()),
  perspective: v.union(v.literal('elena'), v.literal('rosa')), choice: v.string(), label: v.string(), note: v.string(), vendorConsent: v.boolean(), commandId: v.string() },
  handler: async (ctx, a): Promise<Id<'memoryObjects'>> => {
    const prepared = await ctx.runMutation(internal.memoryObjects.prepare, a);
    if (!prepared.created || !prepared.needsGeneration) return prepared.id;
    try {
      const info = await ctx.runQuery(internal.memoryObjects.generationInfo, { code: a.code, token: a.token, id: prepared.id });
      if (!info?.imageUrl || info.paused) throw new Error('The selected photo is no longer available.');
      const photo = info.imageFileId ? await ctx.storage.get(info.imageFileId) : null;
      if (!photo || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) throw new Error('The source is not a supported photo.');
      // Geometry-only, low-poly output keeps texture memory bounded on Quest. The original
      // photo and family note stay beside the interpretation in the source card.
      const task = await tripo('generation/image-to-model', { input: info.imageUrl, model: 'v3.1-20260211', face_limit: 6000, smart_low_poly: true, texture: false, pbr: false });
      if (!/^[A-Za-z0-9_-]{6,100}$/.test(task.task_id ?? '')) throw new Error('No task ID.');
      await ctx.runMutation(internal.memoryObjects.saveTask, { id: prepared.id, taskId: task.task_id });
      return prepared.id;
    } catch {
      await ctx.runMutation(internal.memoryObjects.fail, { id: prepared.id, message: 'The generation request failed or became unavailable. It may have reached Tripo; inspect the account before creating another candidate.' });
      throw new ConvexError('The model could not start. The saved candidate records the failure; no object was placed.');
    }
  },
});

export const refresh = action({ args: { ...auth, id: v.id('memoryObjects') }, handler: async (ctx, a): Promise<void> => {
  const info = await ctx.runQuery(internal.memoryObjects.generationInfo, a);
  if (!info || info.paused || !info.object.taskId || !['generating', 'downloading', 'failed'].includes(info.object.status)) return;
  const task = await tripo('tasks/' + encodeURIComponent(info.object.taskId));
  if (['failed', 'cancelled', 'banned', 'expired'].includes(task.status)) {
    await ctx.runMutation(internal.memoryObjects.fail, { id: a.id, message: 'Tripo did not produce a model. Your scene has not changed.' }); return;
  }
  if (task.status !== 'success') return;
  if (!(await ctx.runMutation(internal.memoryObjects.claimDownload, { id: a.id }))) return;
  let fileId: Id<'_storage'> | null = null;
  try {
    const url = new URL(task.output?.model_url);
    const hostOK = ['tripo3d.ai', 'tripo3d.com'].some(h => url.hostname === h || url.hostname.endsWith('.' + h)) || url.hostname === 'tripo-data.cdn.bcebos.com';
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hostOK) throw new Error('Unrecognized model host.');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25_000) });
    if (!response.ok || Number(response.headers.get('content-length')) > 12_000_000 || !response.body) throw new Error('Model unavailable.');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 12_000_000) { await reader.cancel(); throw new Error('Model too large.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    validateMemoryGlb(bytes);
    fileId = await ctx.storage.store(new Blob([bytes], { type: 'model/gltf-binary' }));
    if (!(await ctx.runMutation(internal.memoryObjects.finishModel, { id: a.id, fileId }))) await ctx.storage.delete(fileId);
  } catch {
    if (fileId) await ctx.storage.delete(fileId);
    await ctx.runMutation(internal.memoryObjects.fail, { id: a.id, message: 'The generated file could not be cached or was too complex for this headset flow. Check the saved task or choose an original model. No object was placed.' });
  }
} });
