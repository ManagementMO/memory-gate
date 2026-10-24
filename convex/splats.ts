// Photo -> splat. The phone uploads a normalized JPEG; with splat.live on (and vendor_upload_modal consent) a job is
// queued for the local GPU worker (worker/sharp_worker.py: SHARP on Modal L40S, V29), otherwise the prebaked sample
// splat is attached after a short simulated delay. Worker endpoints are guarded by WORKER_SECRET.
import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { readFlags, requireMember, requireScope, activeScopes } from './lib/auth';
import type { MutationCtx } from './_generated/server';
import { storyWorldPrompt } from '../packages/shared/src/worldlabs';

function checkSecret(secret: string) {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'bad worker secret' });
}

export const generatePhotoUploadUrl = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    await requireScope(ctx, room._id, 'photo_processing');
    return ctx.storage.generateUploadUrl();
  },
});

export const addPhoto = mutation({
  args: { code: v.string(), token: v.string(), fileId: v.id('_storage'), width: v.number(), height: v.number(), tone: v.string(), caption: v.optional(v.string()), credit: v.string(),
    builder: v.optional(v.union(v.literal('auto'), v.literal('worldlabs'))) },
  handler: async (ctx, a) => {
    const { room } = await requireMember(ctx, a.code, a.token, ['family']);
    await requireScope(ctx, room._id, 'photo_processing');
    const flags = await readFlags(ctx, room);
    const scopes = await activeScopes(ctx, room._id);
    const worldlabs = a.builder === 'worldlabs';
    if (worldlabs) {
      if (!flags['worldlabs.generate']) throw new ConvexError({ code: 'UNAVAILABLE', message: 'World Labs generation is switched off in the local service settings.' });
      await requireScope(ctx, room._id, 'vendor_upload_worldlabs');
      if (!process.env.WORLD_LABS_API_KEY && !process.env.WORLDLABS_API_KEY) throw new ConvexError({ code: 'NO_KEY', message: 'The operator needs to configure World Labs before generation.' });
      const jobs = (await ctx.db.query('jobs').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).filter(j => j.provider === 'worldlabs');
      if (jobs.some(j => j.status === 'queued' || j.status === 'running') || jobs.length >= 3) {
        throw new ConvexError({ code: 'LIMIT', message: 'One world at a time, with at most three generations per room.' });
      }
    }
    const photoId = await ctx.db.insert('photos', { roomId: room._id, fileId: a.fileId, width: a.width, height: a.height, caption: a.caption ?? null,
      tone: ['mono', 'sepia', 'muted'].includes(a.tone) ? a.tone : 'muted', credit: a.credit.slice(0, 80), createdAt: Date.now() });
    const live = worldlabs || (flags['splat.live'] && scopes.has('vendor_upload_modal'));
    const splatId = await ctx.db.insert('splats', { roomId: room._id, photoId, status: 'queued', fileId: null, liteFileId: null, source: worldlabs ? 'worldlabs' : live ? 'sharp' : 'prebaked',
      numSplats: 0, bytes: 0, gpuSeconds: 0, fPx: null, floorY: null, scale: 1, error: null, createdAt: Date.now(), readyAt: null });
    if (worldlabs) {
      const jobId = await ctx.db.insert('jobs', { roomId: room._id, kind: 'world', refId: splatId, provider: 'worldlabs', status: 'queued', attempts: 0,
        lastError: null, startedAt: null, finishedAt: null, createdAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.worldlabs.submit, { jobId });
      await ctx.scheduler.runAfter(20 * 60_000, internal.worlddb.expire, { jobId });
    } else if (live) {
      await ctx.db.insert('jobs', { roomId: room._id, kind: 'splat', refId: splatId, provider: 'modal', status: 'queued', attempts: 0, lastError: null, startedAt: null, finishedAt: null, createdAt: Date.now() });
      await ctx.scheduler.runAfter(150_000, internal.splats.fallbackIfStuck, { splatId }); // the prebaked splat after 150 s
    } else {
      await ctx.scheduler.runAfter(2_500, internal.splats.usePrebaked, { splatId, reason: flags['splat.live'] ? 'no vendor_upload_modal consent' : 'splat.live off' });
    }
    return { photoId, splatId, live };
  },
});

export const setActive = mutation({
  args: { code: v.string(), token: v.string(), splatId: v.union(v.id('splats'), v.null()) },
  handler: async (ctx, { code, token, splatId }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    if (splatId === null) { await ctx.db.patch(room._id, { activeSplatId: null }); return; }
    const s = await ctx.db.get(splatId);
    if (!s || s.roomId !== room._id || s.status !== 'ready') throw new ConvexError({ code: 'NOT_READY', message: 'That memory is not ready yet.' });
    await ctx.db.patch(room._id, { activeSplatId: splatId, ...(s.sourceUtteranceId ? { layout: 'courtyard' as const } : {}) });
  },
});

/** Explicit family action. One source line has one durable job, including after a lost response. */
export const fromStory = mutation({
  args: { code: v.string(), token: v.string(), utteranceId: v.id('utterances') },
  handler: async (ctx, { code, token, utteranceId }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    await requireScope(ctx, room._id, 'voice_processing');
    await requireScope(ctx, room._id, 'vendor_upload_worldlabs');
    const source = await ctx.db.get(utteranceId);
    if (!source || source.roomId !== room._id || source.status !== 'done') throw new ConvexError({ code: 'NOT_READY', message: 'Choose a completed story from this room.' });
    const existing = (await ctx.db.query('splats').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).find(s => s.sourceUtteranceId === utteranceId);
    if (existing) return { splatId: existing._id, duplicate: true };
    if (!(await readFlags(ctx, room))['worldlabs.generate']) throw new ConvexError({ code: 'UNAVAILABLE', message: 'World Labs generation is switched off.' });
    if (!process.env.WORLD_LABS_API_KEY && !process.env.WORLDLABS_API_KEY) throw new ConvexError({ code: 'NO_KEY', message: 'World Labs is not configured.' });
    storyWorldPrompt(source.transcript); // validate before reserving any work
    const jobs = (await ctx.db.query('jobs').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).filter(j => j.provider === 'worldlabs');
    if (jobs.some(j => ['queued', 'running'].includes(j.status)) || jobs.length >= 3) throw new ConvexError({ code: 'LIMIT', message: 'One world at a time, with at most three generations per room.' });
    const splatId = await ctx.db.insert('splats', { roomId: room._id, photoId: null, sourceUtteranceId: utteranceId, source: 'worldlabs', status: 'queued',
      fileId: null, liteFileId: null, numSplats: 0, bytes: 0, gpuSeconds: 0, fPx: null, floorY: null, scale: 1, error: null, createdAt: Date.now(), readyAt: null });
    const jobId = await ctx.db.insert('jobs', { roomId: room._id, kind: 'world', refId: splatId, provider: 'worldlabs', status: 'queued', attempts: 0,
      lastError: null, startedAt: null, finishedAt: null, createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.worldlabs.submit, { jobId });
    await ctx.scheduler.runAfter(20 * 60_000, internal.worlddb.expire, { jobId });
    return { splatId, duplicate: false };
  },
});

/** Fictional rehearsal worlds are cached once; opening one never invokes a provider. */
export const usePracticeWorld = mutation({
  args: { code: v.string(), token: v.string(), setting: v.optional(v.union(v.literal('courtyard'), v.literal('red-kite'))) },
  handler: async (ctx, { code, token, setting = 'courtyard' }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family']);
    if (!room.demo) throw new ConvexError({ code: 'FORBIDDEN', message: 'The fictional practice world is available only in a labeled sample room.' });
    if (room.paused) throw new ConvexError({ code: 'PAUSED', message: 'Resume when everyone is ready before changing the setting.' });
    const assetKey = setting === 'red-kite' ? 'world.practice-red-kite' : 'world.practice-courtyard';
    const asset = await ctx.db.query('assets').withIndex('by_key', q => q.eq('key', assetKey)).unique();
    const m = asset?.meta as { floorY: number; scale: number; numSplats: number; liteNumSplats: number; bytes: number; worldId: string; sourceWords: string;
      liteFileId?: import('./_generated/dataModel').Id<'_storage'>; previewFileId?: import('./_generated/dataModel').Id<'_storage'> } | undefined;
    if (!asset || !m || !Number.isFinite(m.scale) || m.scale <= 0 || !Number.isFinite(m.floorY) || typeof m.sourceWords !== 'string') {
      throw new ConvexError({ code: 'UNAVAILABLE', message: setting === 'red-kite' ? 'Run node scripts/red-kite-room.mjs to load the cached fictional meadow.' : 'Run npm run seed:world to load the cached fictional courtyard.' });
    }
    const existing = (await ctx.db.query('splats').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).find(s => s.worldId === m.worldId && s.status === 'ready');
    if (existing) { await ctx.db.patch(room._id, { activeSplatId: existing._id, layout: 'courtyard', openedAt: Date.now() }); return { splatId: existing._id, reused: true }; }
    const sourceUtteranceId = await ctx.db.insert('utterances', { roomId: room._id, memberId: member._id, speaker: 'Sample storyteller (fictional)',
      transcript: m.sourceWords, source: 'fixture', audioFileId: null, language: 'en', translation: null, pointer: null, durationMs: 0, status: 'done', intent: 'none', reply: null,
      sayBack: null, aiMode: 'fixture', aiMs: null, dropped: [], commandId: `prepared-world-${m.worldId}`, createdAt: Date.now() });
    const splatId = await ctx.db.insert('splats', { roomId: room._id, photoId: null, sourceUtteranceId, status: 'ready', source: 'worldlabs', fileId: asset.fileId,
      liteFileId: m.liteFileId ?? null, ...(m.previewFileId ? { previewFileId: m.previewFileId } : {}), liteNumSplats: m.liteNumSplats, worldId: m.worldId,
      numSplats: m.numSplats, bytes: m.bytes, gpuSeconds: 0, fPx: null, floorY: m.floorY, scale: m.scale, error: null, createdAt: Date.now(), readyAt: Date.now() });
    await ctx.db.patch(room._id, { activeSplatId: splatId, layout: 'courtyard', openedAt: Date.now() });
    return { splatId, reused: false };
  },
});

async function attachPrebaked(ctx: MutationCtx, splatId: import('./_generated/dataModel').Id<'splats'>, reason: string) {
  const s = await ctx.db.get(splatId);
  if (!s || s.status === 'ready') return;
  const sample = await ctx.db.query('assets').withIndex('by_key', (q) => q.eq('key', 'splat.sample')).unique();
  if (!sample) { await ctx.db.patch(splatId, { status: 'failed', error: `no prebaked splat seeded (${reason})` }); return; }
  const m = (sample.meta ?? {}) as { numSplats?: number; bytes?: number; floorY?: number; scale?: number; liteFileId?: string };
  await ctx.db.patch(splatId, { status: 'ready', fileId: sample.fileId, liteFileId: (m.liteFileId as import('./_generated/dataModel').Id<'_storage'> | undefined) ?? null, source: 'prebaked', numSplats: m.numSplats ?? 0, bytes: m.bytes ?? 0, floorY: m.floorY ?? null, scale: m.scale ?? 1, error: reason, readyAt: Date.now() });
  await ctx.db.patch(s.roomId, { activeSplatId: splatId });
}

export const usePrebaked = internalMutation({ args: { splatId: v.id('splats'), reason: v.string() }, handler: (ctx, a) => attachPrebaked(ctx, a.splatId, a.reason) });

export const fallbackIfStuck = internalMutation({
  args: { splatId: v.id('splats') },
  handler: async (ctx, { splatId }) => {
    const s = await ctx.db.get(splatId);
    if (!s || s.status === 'ready') return;
    for (const j of await ctx.db.query('jobs').withIndex('by_room', (q) => q.eq('roomId', s.roomId)).collect()) {
      if (j.refId === splatId && (j.status === 'queued' || j.status === 'running')) await ctx.db.patch(j._id, { status: 'failed', lastError: 'timed out after 150 s', finishedAt: Date.now() });
    }
    await attachPrebaked(ctx, splatId, 'GPU worker timed out after 150 s');
  },
});

// ---------- worker API (local process; secret-guarded) ----------

export const claimJob = mutation({
  args: { secret: v.string(), kinds: v.array(v.string()) },
  handler: async (ctx, { secret, kinds }) => {
    checkSecret(secret);
    const queued = (await ctx.db.query('jobs').withIndex('by_status', (q) => q.eq('status', 'queued')).collect()).filter((j) => kinds.includes(j.kind)).sort((a, b) => a.createdAt - b.createdAt);
    const job = queued[0];
    if (!job) return null;
    await ctx.db.patch(job._id, { status: 'running', attempts: job.attempts + 1, startedAt: Date.now() });
    if (job.kind === 'splat') {
      const s = await ctx.db.get(job.refId as import('./_generated/dataModel').Id<'splats'>);
      const photo = s?.photoId ? await ctx.db.get(s.photoId) : null;
      if (!s || !photo) { await ctx.db.patch(job._id, { status: 'failed', lastError: 'missing splat or photo', finishedAt: Date.now() }); return null; }
      if (!(await activeScopes(ctx, s.roomId)).has('vendor_upload_modal')) { // consent revoked while queued: never send the photo
        await ctx.db.patch(job._id, { status: 'cancelled', lastError: 'vendor_upload_modal revoked', finishedAt: Date.now() });
        await attachPrebaked(ctx, s._id, 'consent for the GPU service was withdrawn');
        return null;
      }
      await ctx.db.patch(s._id, { status: 'running' });
      return { jobId: job._id, kind: job.kind, splatId: s._id, photoUrl: await ctx.storage.getUrl(photo.fileId), width: photo.width, height: photo.height };
    }
    return { jobId: job._id, kind: job.kind, refId: job.refId, meta: job.meta ?? null };
  },
});

export const workerUploadUrl = mutation({ args: { secret: v.string() }, handler: async (ctx, { secret }) => { checkSecret(secret); return ctx.storage.generateUploadUrl(); } });

export const completeSplat = mutation({
  args: { secret: v.string(), jobId: v.id('jobs'), fileId: v.id('_storage'), liteFileId: v.optional(v.id('_storage')), numSplats: v.number(), bytes: v.number(), gpuSeconds: v.number(), fPx: v.optional(v.number()), floorY: v.optional(v.number()), scale: v.optional(v.number()), timings: v.optional(v.any()) },
  handler: async (ctx, a) => {
    checkSecret(a.secret);
    const job = await ctx.db.get(a.jobId);
    if (!job || job.kind !== 'splat') throw new ConvexError({ code: 'NOT_FOUND', message: 'no such splat job' });
    const s = await ctx.db.get(job.refId as import('./_generated/dataModel').Id<'splats'>);
    if (!s) throw new ConvexError({ code: 'NOT_FOUND', message: 'no such splat' });
    if (s.status === 'ready') { // the fallback already won: drop both late files (the lite one used to leak)
      // A retry with the same ids must never delete the files this splat already uses.
      if (a.fileId !== s.fileId && a.fileId !== s.liteFileId) await ctx.storage.delete(a.fileId);
      if (a.liteFileId && a.liteFileId !== s.fileId && a.liteFileId !== s.liteFileId) await ctx.storage.delete(a.liteFileId);
      return { late: true };
    }
    await ctx.db.patch(s._id, { status: 'ready', fileId: a.fileId, liteFileId: a.liteFileId ?? null, source: 'sharp', numSplats: a.numSplats, bytes: a.bytes, gpuSeconds: a.gpuSeconds,
      fPx: a.fPx ?? null, floorY: a.floorY ?? null, scale: a.scale ?? 1, error: null, readyAt: Date.now() });
    await ctx.db.patch(job._id, { status: 'done', finishedAt: Date.now(), meta: { timings: a.timings ?? null } });
    await ctx.db.patch(s.roomId, { activeSplatId: s._id });
    return { late: false };
  },
});

export const failJob = mutation({
  args: { secret: v.string(), jobId: v.id('jobs'), error: v.string() },
  handler: async (ctx, { secret, jobId, error }) => {
    checkSecret(secret);
    const job = await ctx.db.get(jobId);
    if (!job) return;
    await ctx.db.patch(jobId, { status: 'failed', lastError: error.slice(0, 300), finishedAt: Date.now() });
    if (job.kind === 'splat') await attachPrebaked(ctx, job.refId as import('./_generated/dataModel').Id<'splats'>, `GPU worker failed: ${error.slice(0, 120)}`);
  },
});

/** Operator panel: recent jobs with timings (phone admin screen). */
export const jobs = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    const rows = await ctx.db.query('jobs').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').take(20);
    return rows.map((j) => ({ id: j._id, kind: j.kind, provider: j.provider, status: j.status, attempts: j.attempts, lastError: j.lastError,
      ms: j.startedAt && j.finishedAt ? j.finishedAt - j.startedAt : null, createdAt: j.createdAt,
      canRecover: j.provider === 'worldlabs' && j.status === 'failed' && typeof j.meta?.operationId === 'string',
      operationId: typeof j.meta?.operationId === 'string' ? j.meta.operationId : null,
      model: typeof j.meta?.model === 'string' ? j.meta.model : null,
      artifactHash: typeof j.meta?.artifactHash === 'string' ? j.meta.artifactHash : null }));
  },
});
