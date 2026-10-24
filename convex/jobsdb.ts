// DB helpers for generate.ts (Node-runtime files may only define actions).
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';

export const jobInfo = internalQuery({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const o = await ctx.db.get(job.refId as Id<'objects'>);
    const lib = o?.prebakedKey ? await ctx.db.query('library').withIndex('by_key', (q) => q.eq('key', o.prebakedKey!)).unique() : null;
    return { job, object: o, libraryUrl: lib ? await ctx.storage.getUrl(lib.fileId) : null };
  },
});

export const setJob = internalMutation({
  args: { jobId: v.id('jobs'), status: v.string(), lastError: v.optional(v.string()), meta: v.optional(v.any()) },
  handler: async (ctx, { jobId, status, lastError, meta }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    await ctx.db.patch(jobId, {
      status, ...(lastError !== undefined ? { lastError } : {}), ...(meta !== undefined ? { meta: { ...(job.meta ?? {}), ...meta } } : {}),
      ...(status === 'running' ? { startedAt: Date.now(), attempts: job.attempts + 1 } : {}), ...(status === 'done' || status === 'failed' ? { finishedAt: Date.now() } : {}),
    });
  },
});

