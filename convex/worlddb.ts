import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { activeScopes, requireMember, requireScope } from './lib/auth';
import type { Id } from './_generated/dataModel';

export const info = internalQuery({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.provider !== 'worldlabs' || !['queued', 'running'].includes(job.status)) return null;
    const room = await ctx.db.get(job.roomId);
    const splat = await ctx.db.get(job.refId as Id<'splats'>);
    const photo = splat?.photoId ? await ctx.db.get(splat.photoId) : null;
    if (!room || !splat || !photo || splat.roomId !== room._id) return null;
    const scopes = await activeScopes(ctx, room._id);
    if (!scopes.has('photo_processing') || !scopes.has('vendor_upload_worldlabs')) return null;
    return { job, splat, photoUrl: await ctx.storage.getUrl(photo.fileId) };
  },
});

export const claim = internalMutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.provider !== 'worldlabs' || job.status !== 'queued') return false;
    await ctx.db.patch(jobId, { status: 'running', attempts: job.attempts + 1, startedAt: Date.now() });
    const splat = await ctx.db.get(job.refId as Id<'splats'>);
    if (splat) await ctx.db.patch(splat._id, { status: 'running' });
    return true;
  },
});

export const recordRequest = internalMutation({
  args: { jobId: v.id('jobs'), requestHash: v.string(), photoHash: v.string(), model: v.string() },
  handler: async (ctx, { jobId, ...request }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.provider !== 'worldlabs' || job.status !== 'running') return false;
    await ctx.db.patch(jobId, { meta: { ...(job.meta ?? {}), ...request } });
    return true;
  },
});

export const reserveGeneration = internalMutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.provider !== 'worldlabs' || job.status !== 'running') return false;
    if (job.meta?.reservedGeneration) return true;
    const usage = await ctx.db.query('providerUsage').withIndex('by_key', q => q.eq('key', 'worldlabs.generations')).unique();
    // Count acknowledged legacy submissions once when upgrading this checkout.
    const count = usage?.count ?? (await ctx.db.query('jobs').collect()).filter(j => j.provider === 'worldlabs' && !!j.meta?.operationId).length;
    const limit = Number(process.env.WORLD_LABS_GENERATION_LIMIT ?? 3);
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000 || count >= limit) return false;
    const next = { key: 'worldlabs.generations', count: count + 1, updatedAt: Date.now() };
    if (usage) await ctx.db.patch(usage._id, next); else await ctx.db.insert('providerUsage', next);
    await ctx.db.patch(jobId, { meta: { ...(job.meta ?? {}), reservedGeneration: true, estimatedCredits: 1580 } });
    return true;
  },
});

/** Download/poll recovery reuses the saved operation. It can never call worlds:generate. */
export const recover = mutation({
  args: { code: v.string(), token: v.string(), jobId: v.id('jobs') },
  handler: async (ctx, { code, token, jobId }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    await requireScope(ctx, room._id, 'photo_processing');
    await requireScope(ctx, room._id, 'vendor_upload_worldlabs');
    const job = await ctx.db.get(jobId);
    if (!job || job.roomId !== room._id || job.provider !== 'worldlabs' || job.status !== 'failed'
        || typeof job.meta?.operationId !== 'string') return { resumed: false };
    const splat = await ctx.db.get(job.refId as Id<'splats'>);
    if (!splat || splat.status === 'ready') return { resumed: false };
    await ctx.db.patch(jobId, { status: 'running', finishedAt: null, lastError: null,
      meta: { ...job.meta, pollDeadlineAt: Date.now() + 5 * 60_000, progress: 'Recovering the existing world (no new generation)' } });
    await ctx.db.patch(splat._id, { status: 'running', error: null });
    await ctx.scheduler.runAfter(0, internal.worldlabs.poll, { jobId, operationId: job.meta.operationId });
    await ctx.scheduler.runAfter(5 * 60_000, internal.worlddb.expire, { jobId });
    return { resumed: true };
  },
});

export const expire = internalMutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const deadline = Number(job.meta?.pollDeadlineAt ?? job.createdAt + 20 * 60_000);
    if (Date.now() < deadline) { await ctx.scheduler.runAfter(deadline - Date.now(), internal.worlddb.expire, { jobId }); return; }
    await ctx.db.patch(jobId, { status: 'failed', lastError: 'World download timed out. The current scene is still available; recover this operation in Room settings.', finishedAt: Date.now() });
    const splat = await ctx.db.get(job.refId as Id<'splats'>);
    if (splat && splat.status !== 'ready') await ctx.db.patch(splat._id, { status: 'failed', error: 'World download timed out.' });
  },
});

export const waitForOperation = internalMutation({
  args: { jobId: v.id('jobs'), operationId: v.string(), progress: v.string() },
  handler: async (ctx, { jobId, operationId, progress }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== 'running') return;
    const prior = (job.meta ?? {}) as { polls?: number };
    const polls = (prior.polls ?? 0) + 1;
    await ctx.db.patch(jobId, { meta: { ...prior, operationId, polls, progress: progress.slice(0, 180) } });
    await ctx.scheduler.runAfter(polls < 4 ? 5000 : 15000, internal.worldlabs.poll, { jobId, operationId });
  },
});

export const fail = internalMutation({
  args: { jobId: v.id('jobs'), reason: v.string() },
  handler: async (ctx, { jobId, reason }) => {
    const job = await ctx.db.get(jobId);
    if (!job || !['queued', 'running'].includes(job.status)) return;
    await ctx.db.patch(jobId, { status: 'failed', lastError: reason.slice(0, 240), finishedAt: Date.now() });
    const splat = await ctx.db.get(job.refId as Id<'splats'>);
    if (splat && splat.status !== 'ready') await ctx.db.patch(splat._id, { status: 'failed', error: reason.slice(0, 240) });
  },
});

export const finish = internalMutation({
  args: { jobId: v.id('jobs'), splatId: v.id('splats'), fileId: v.id('_storage'), liteFileId: v.union(v.id('_storage'), v.null()),
    numSplats: v.number(), liteNumSplats: v.union(v.number(), v.null()), bytes: v.number(), floorY: v.number(), scale: v.number(), worldId: v.union(v.string(), v.null()),
    artifactHash: v.optional(v.string()), liteArtifactHash: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { jobId, splatId, artifactHash, liteArtifactHash, ...result }) => {
    const job = await ctx.db.get(jobId), splat = await ctx.db.get(splatId);
    if (!job || !splat || job.refId !== splatId || job.status !== 'running' || !(await ctx.db.get(job.roomId))) return false;
    const scopes = await activeScopes(ctx, job.roomId);
    if (!scopes.has('photo_processing') || !scopes.has('vendor_upload_worldlabs')) return false;
    await ctx.db.patch(splatId, { ...result, status: 'ready', error: null, readyAt: Date.now() });
    await ctx.db.patch(jobId, { status: 'done', finishedAt: Date.now(), meta: { ...(job.meta ?? {}), worldId: result.worldId, needsReview: true,
      ...(artifactHash ? { artifactHash, liteArtifactHash: liteArtifactHash ?? null } : {}), bytes: result.bytes, scale: result.scale, floorY: result.floorY } });
    // Keep the current scene until the family presses Show on the phone.
    return true;
  },
});
