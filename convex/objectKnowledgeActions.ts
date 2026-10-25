'use node';
import { v, ConvexError } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { normalizeObjectReferences, type ObjectTopicKey } from '../actors/historical-memory-atlas/src/knowledge.mjs';
const auth = { code: v.string(), token: v.string() };
const topicV = v.union(v.literal('kite'), v.literal('flowers'), v.literal('trees'));
async function apify(path: string, init: RequestInit = {}) {
  const response = await fetch('https://api.apify.com/v2/' + path, { ...init, redirect: 'error', headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Apify request unavailable.');
  return response.json();
}
export const lookup = action({ args: { ...auth, topicKey: topicV }, handler: async (ctx, a): Promise<string> => {
  const actor = process.env.APIFY_MEMORY_ACTOR_ID ?? '';
  if (actor && !/^[\w-]+(?:[~\/][\w-]+)?$/.test(actor)) throw new ConvexError('The source connection needs attention.');
  const reservation = await ctx.runMutation(internal.objectKnowledge.begin, a);
  if (!reservation.start) return reservation.id;
  try {
    const { data } = await apify(`actors/${encodeURIComponent(actor.replace('/', '~'))}/runs?timeout=90&maxTotalChargeUsd=0.10`, { method: 'POST', body: JSON.stringify({ sourceMode: 'object', topicKey: a.topicKey }) });
    if (!/^[A-Za-z0-9]+$/.test(data?.id ?? '')) throw new Error('No run ID.');
    await ctx.runMutation(internal.objectKnowledge.record, { id: reservation.id, runId: data.id });
    return reservation.id;
  } catch {
    await ctx.runMutation(internal.objectKnowledge.fail, { id: reservation.id, uncertain: true });
    throw new ConvexError('The lookup could not be confirmed. Check the saved topic and Apify Console before retrying.');
  }
} });
export const refresh = action({ args: { ...auth, id: v.id('objectKnowledge') }, handler: async (ctx, a): Promise<void> => {
  const job = await ctx.runQuery(internal.objectKnowledge.job, a);
  if (job.status !== 'running' || !job.runId) return;
  const { data } = await apify(`actor-runs/${job.runId}`);
  if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(data.status)) { await ctx.runMutation(internal.objectKnowledge.fail, { id: job._id, uncertain: false }); return; }
  if (data.status !== 'SUCCEEDED') return;
  if (!/^[A-Za-z0-9]+$/.test(data.defaultDatasetId ?? '')) throw new ConvexError('The source dataset is unavailable.');
  const rows = await apify(`datasets/${data.defaultDatasetId}/items?clean=true&limit=4&format=json`);
  await ctx.runMutation(internal.objectKnowledge.finish, { id: job._id, references: normalizeObjectReferences(rows, job.topicKey as ObjectTopicKey) });
} });
