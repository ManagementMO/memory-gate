import { ConvexError, v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { appendEvent, priorCommand, requireMember } from './lib/auth';
import { RED_KITE_TELLINGS, resolveKiteLook, type Perspective } from '../packages/shared/src/redKite';

const auth = { code: v.string(), token: v.string() };
const perspective = v.union(v.literal('elena'), v.literal('rosa'));
const command = { ...auth, perspective, baseRevision: v.number(), commandId: v.string() };
function sample(room: Doc<'rooms'>) {
  if (!room.demo) throw new ConvexError({ code: 'FORBIDDEN', message: 'This fictional story is available only in a labeled sample room.' });
}
function ready(room: Doc<'rooms'>) {
  if (room.paused) throw new ConvexError({ code: 'PAUSED', message: 'Continue when everyone is ready before changing the story.' });
}

/** An explicit, idempotent fixture seed. It never interprets speech or calls a provider. */
export const prepare = mutation({ args: auth, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token, ['family']);
  sample(room); ready(room);
  const world = room.activeSplatId ? await ctx.db.get(room.activeSplatId) : null;
  const asset = await ctx.db.query('assets').withIndex('by_key', q => q.eq('key', 'world.practice-red-kite')).unique();
  if (!world || world.status !== 'ready' || !asset || world.worldId !== asset.meta?.worldId) {
    throw new ConvexError({ code: 'UNAVAILABLE', message: 'Open the cached Red Kite meadow before preparing its fictional tellings.' });
  }
  const existing = await ctx.db.query('redKiteTellings').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  for (const key of ['elena', 'rosa'] as const) {
    if (existing.some(p => p.key === key)) continue;
    const script = RED_KITE_TELLINGS[key], sourceIds = [];
    for (let beat = 0; beat < script.lines.length; beat++) {
      sourceIds.push(await ctx.db.insert('utterances', {
        roomId: room._id, memberId: member._id, speaker: `${script.name} (fictional sample)`,
        transcript: script.lines[beat]!.quote, source: 'fixture', audioFileId: null, language: 'en', translation: null,
        pointer: null, durationMs: 0, status: 'done', intent: 'none', reply: null, sayBack: null,
        aiMode: 'fixture', aiMs: null, dropped: [], commandId: `red-kite-${key}-${beat}`, createdAt: Date.now(),
      }));
    }
    await ctx.db.insert('redKiteTellings', { roomId: room._id, key, beat: 0, revision: 0, sourceIds, decisions: [] });
  }
  return { prepared: true };
} });

export const current = query({ args: auth, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token);
  sample(room);
  const rows = await ctx.db.query('redKiteTellings').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  if (!rows.length) return null;
  const tellings = [];
  for (const key of ['elena', 'rosa'] as const) {
    const p = rows.find(r => r.key === key); if (!p) continue;
    const script = RED_KITE_TELLINGS[key], lines = [];
    for (let i = 0; i < p.sourceIds.length; i++) {
      const s = await ctx.db.get(p.sourceIds[i]!);
      if (!s || s.roomId !== room._id || s.source !== 'fixture') throw new ConvexError({ code: 'UNAVAILABLE', message: 'This sample source needs to be prepared again.' });
      lines.push({ ...script.lines[i]!, sourceId: s._id, quote: s.transcript, sourceKind: 'fixture' as const, audioUrl: null });
    }
    tellings.push({ key, name: script.name, place: script.place, introduction: script.introduction, beat: p.beat,
      revision: p.revision, decisions: p.decisions, lines, look: resolveKiteLook(key, p) });
  }
  return { paused: room.paused, canAuthor: member.role === 'family', canReset: member.isOwner, tellings };
} });

async function writable(ctx: MutationCtx, a: { code: string; token: string; perspective: Perspective; baseRevision: number; commandId: string }) {
  const { room, member } = await requireMember(ctx, a.code, a.token, ['family']);
  sample(room); ready(room);
  if (await priorCommand(ctx, room._id, a.commandId)) return null;
  const p = (await ctx.db.query('redKiteTellings').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).find(r => r.key === a.perspective);
  if (!p) throw new ConvexError({ code: 'NOT_READY', message: 'Prepare the story first.' });
  if (p.revision !== a.baseRevision) throw new ConvexError({ code: 'STALE', message: 'This telling changed. Review the latest line and try again.' });
  return { room, member, p };
}

export const advance = mutation({ args: command, handler: async (ctx, a) => {
  const r = await writable(ctx, a); if (!r) return { duplicate: true };
  const { room, member, p } = r;
  const beat = Math.min(p.beat + 1, RED_KITE_TELLINGS[p.key].lines.length - 1);
  if (beat === p.beat) return { unchanged: true };
  await ctx.db.patch(p._id, { beat, revision: p.revision + 1 });
  await appendEvent(ctx, room, { kind: `red-kite-line:${p.key}`, actor: member.displayName, memberId: member._id, objectId: null, commandId: a.commandId });
  return { advanced: true };
} });

export const choose = mutation({ args: { ...command, decision: v.union(v.literal('use'), v.literal('leave')) }, handler: async (ctx, a) => {
  const r = await writable(ctx, a); if (!r) return { duplicate: true };
  const { room, member, p } = r;
  if (!RED_KITE_TELLINGS[p.key].lines[p.beat]?.proposal) throw new ConvexError({ code: 'NO_PROPOSAL', message: 'This line has no proposed detail to choose.' });
  const decisions = p.decisions.filter(d => d.beat !== p.beat).concat({ beat: p.beat, decision: a.decision });
  await ctx.db.patch(p._id, { decisions, revision: p.revision + 1 });
  await appendEvent(ctx, room, { kind: `red-kite-${a.decision}:${p.key}`, actor: member.displayName, memberId: member._id, objectId: null, commandId: a.commandId });
  return { chosen: true };
} });

export const reset = mutation({ args: { ...auth, commandId: v.string() }, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token, ['family']);
  sample(room); ready(room);
  if (!member.isOwner) throw new ConvexError({ code: 'FORBIDDEN', message: 'Only the sample owner can start this story again.' });
  if (await priorCommand(ctx, room._id, a.commandId)) return { duplicate: true };
  for (const p of await ctx.db.query('redKiteTellings').withIndex('by_room', q => q.eq('roomId', room._id)).collect()) {
    await ctx.db.patch(p._id, { beat: 0, decisions: [], revision: p.revision + 1 });
  }
  await appendEvent(ctx, room, { kind: 'red-kite-reset', actor: member.displayName, memberId: member._id, objectId: null, commandId: a.commandId });
  return { reset: true };
} });
