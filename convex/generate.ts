'use node';
// Live object models (flag objects.live): Tripo v3 text-to-model for objects not in the library (153-180 s, V24) and
// "personalize" re-texturing of a library model from spoken colors/materials (~31 s, V28). The GLB link expires in
// 5 minutes, so it is downloaded at once and stored in Convex. Moderation (2008) or any failure keeps the library or
// placeholder model. objects.attachModel enforces "swap only while still a ghost".
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';

const API = 'https://openapi.tripo3d.ai/v3';
const auth = () => ({ Authorization: `Bearer ${process.env.TRIPO_API_KEY ?? ''}` });

async function tripo<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method, headers: { ...auth(), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let j: { code?: number; data?: T; message?: string } | null = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok || !j || j.code !== 0) throw new Error(`tripo ${method} ${path} -> ${res.status} code=${j?.code ?? '?'} ${(j?.message ?? text).slice(0, 160)}`);
  return j.data as T;
}

async function waitTask(taskId: string, deadlineMs: number) {
  let misses = 0;
  for (;;) {
    let t: { status: string; output?: { model_url?: string }; credits_consumed?: number; error_code?: number };
    try { t = await tripo('GET', `/tasks/${taskId}`); misses = 0; }
    catch (e) { if (++misses >= 5 || Date.now() > deadlineMs) throw e; await new Promise((r) => setTimeout(r, 4000)); continue; } // the task keeps running (and billing): don't lose it to one bad poll
    if (['success', 'failed', 'cancelled', 'banned', 'expired'].includes(t.status)) return t;
    if (Date.now() > deadlineMs) throw new Error('tripo timed out');
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export const run = internalAction({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const info = await ctx.runQuery(internal.jobsdb.jobInfo, { jobId });
    if (!info?.object) return;
    const { job, object } = info;
    const meta = (job.meta ?? {}) as { prompt?: string; details?: string[] };
    if (!process.env.TRIPO_API_KEY) {
      await ctx.runMutation(internal.jobsdb.setJob, { jobId, status: 'failed', lastError: 'no TRIPO_API_KEY' });
      await ctx.runMutation(internal.objects.markModelFailed, { objectId: object._id, error: 'no key' });
      return;
    }
    await ctx.runMutation(internal.jobsdb.setJob, { jobId, status: 'running' });
    const t0 = Date.now();
    try {
      let taskId: string;
      if (job.kind === 'retexture' && info.libraryUrl) {
        const glb = await (await fetch(info.libraryUrl)).blob();
        const form = new FormData();
        form.append('file', new Blob([await glb.arrayBuffer()], { type: 'model/gltf-binary' }), `${object.label.replace(/\W+/g, '-')}.glb`);
        const { file_token } = await tripo<{ file_token: string }>('POST', '/files', form);
        const text = `${object.label} with ${(meta.details ?? object.details).join(', ')}`.slice(0, 200); // vetted words only
        ({ task_id: taskId } = await tripo<{ task_id: string }>('POST', '/models/texture', { input: file_token, texture_prompt: { text }, model: 'v3.5-20260815', texture_quality: 'fast', pbr: false }));
      } else {
        ({ task_id: taskId } = await tripo<{ task_id: string }>('POST', '/generation/text-to-model', { prompt: meta.prompt ?? `${object.label}, single household object, 1940s`, model: 'v3.1-20260211', face_limit: 20000, texture: true, pbr: false }));
      }
      await ctx.runMutation(internal.jobsdb.setJob, { jobId, status: 'running', meta: { taskId } });
      const task = await waitTask(taskId, Date.now() + 6 * 60_000);
      if (task.status !== 'success' || !task.output?.model_url) throw new Error(`tripo ${task.status} code=${task.error_code ?? ''}`);
      const res = await fetch(task.output.model_url); // the link expires after 5 minutes: fetch now
      if (!res.ok) throw new Error(`model download ${res.status}`);
      const bytes = await res.arrayBuffer();
      const magic = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength)));
      if (magic !== 'glTF' || bytes.byteLength < 1024 || bytes.byteLength > 12_000_000) throw new Error(`not a usable GLB (${magic}, ${bytes.byteLength} bytes)`);
      const fileId = await ctx.storage.store(new Blob([bytes], { type: 'model/gltf-binary' }));
      const r = await ctx.runMutation(internal.objects.attachModel, { objectId: object._id, fileId, source: job.kind === 'retexture' ? 'retexture' : 'tripo', taskId });
      if ('gone' in r && r.gone) await ctx.storage.delete(fileId); // the room was reset while generating
      await ctx.runMutation(internal.jobsdb.setJob, { jobId, status: 'done', meta: { ms: Date.now() - t0, bytes: bytes.byteLength, credits: task.credits_consumed ?? null, swapped: r.swapped } });
    } catch (e) {
      await ctx.runMutation(internal.jobsdb.setJob, { jobId, status: 'failed', lastError: String((e as Error).message).slice(0, 300), meta: { ms: Date.now() - t0 } });
      await ctx.runMutation(internal.objects.markModelFailed, { objectId: object._id, error: String(e) });
    }
  },
});
