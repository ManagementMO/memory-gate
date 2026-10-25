import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import { requireMember } from './lib/auth';
import { normalizeObjectReferences, type ObjectTopicKey } from '../actors/historical-memory-atlas/src/knowledge.mjs';

export const topicV = v.union(v.literal('kite'), v.literal('flowers'), v.literal('trees'));
const auth = { code: v.string(), token: v.string() };
const referenceV = v.object({ topicKey: v.string(), sourceUrl: v.string(), title: v.string(), attribution: v.string(), excerpt: v.string(), fetchedAt: v.number() });
export const list = query({ args: auth, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token);
  const rows = await ctx.db.query('objectKnowledge').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  return { configured: !!process.env.APIFY_TOKEN && process.env.ALLOW_APIFY_CLOUD === '1' && !!process.env.APIFY_MEMORY_ACTOR_ID,
    offline: !!room.offline, canRequest: member.role !== 'viewer', paused: room.paused,
    jobs: rows.map(({ _id, topicKey, status, runId, references, error }) => ({ _id, topicKey, status, runId, references, error })) };
} });
/** Atomic per-room/topic reservation prevents duplicate cloud starts on repeated clicks or multiple devices. */
export const begin = internalMutation({ args: { ...auth, topicKey: topicV }, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token);
  if (room.paused) throw new ConvexError('Continue the memory before exploring.');
  const existing = await ctx.db.query('objectKnowledge').withIndex('by_room_topic', q => q.eq('roomId', room._id).eq('topicKey', a.topicKey)).unique();
  if (existing) return { id: existing._id, start: false };
  const cached = await ctx.db.query('objectKnowledge').withIndex('by_topic_status', q => q.eq('topicKey', a.topicKey).eq('status', 'ready')).order('desc').take(10);
  const ready = cached.find(j => j.runId && j.references.length && j.references.every(r => Date.now() - r.fetchedAt < 7 * 86400_000));
  if (!ready && member.role === 'viewer') throw new ConvexError('Ask family to look up this topic first.');
  if (!ready && room.offline) throw new ConvexError('This topic is not cached for offline use yet.');
  if (!ready && (!process.env.APIFY_TOKEN || process.env.ALLOW_APIFY_CLOUD !== '1' || !process.env.APIFY_MEMORY_ACTOR_ID)) throw new ConvexError('Object information is not connected yet.');
  const jobs = await ctx.db.query('objectKnowledge').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  if (!ready && jobs.some(j => j.status === 'starting' || j.status === 'running')) throw new ConvexError('One topic is being retrieved. Please wait for it.');
  const id = await ctx.db.insert('objectKnowledge', { roomId: room._id, memberId: member._id, topicKey: a.topicKey, status: ready ? 'ready' : 'starting', runId: ready?.runId ?? null, references: ready?.references ?? [], error: null, createdAt: Date.now() });
  return { id, start: !ready };
} });
export const record = internalMutation({ args: { id: v.id('objectKnowledge'), runId: v.string() }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (job?.status === 'starting') await ctx.db.patch(job._id, { runId: a.runId, status: 'running' });
} });
export const job = internalQuery({ args: { ...auth, id: v.id('objectKnowledge') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token), job = await ctx.db.get(a.id);
  if (!job || job.roomId !== room._id) throw new ConvexError('This topic is no longer available.');
  return job;
} });
export const finish = internalMutation({ args: { id: v.id('objectKnowledge'), references: v.array(referenceV) }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (!job || job.status !== 'running') return;
  const room = await ctx.db.get(job.roomId), member = await ctx.db.get(job.memberId);
  if (!room || room.paused || !member || member.revokedAt !== null) { await ctx.db.patch(job._id, { status: 'failed', error: 'The memory was paused or access ended. The scene was not changed.' }); return; }
  const references = normalizeObjectReferences(a.references, job.topicKey as ObjectTopicKey);
  await ctx.db.patch(job._id, { references, status: references.length ? 'ready' : 'failed', error: references.length ? null : 'The page did not return a usable explanation. You can keep exploring the memory.' });
} });
export const fail = internalMutation({ args: { id: v.id('objectKnowledge'), uncertain: v.boolean() }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (!job || !['starting', 'running'].includes(job.status)) return;
  await ctx.db.patch(job._id, { status: a.uncertain ? 'uncertain' : 'failed', error: a.uncertain ? 'The lookup could not be confirmed. Family can check Apify before starting another run. The memory is still here.' : 'This reference is unavailable just now. The memory is still here.' });
} });
