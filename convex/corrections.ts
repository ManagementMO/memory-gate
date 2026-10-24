import { ConvexError, v } from 'convex/values';
import { mutation, query, internalMutation, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { activeScopes, appendEvent, requireMember } from './lib/auth';
import { planPlacement, spokenCorrection, type SpatialRequest, type SpatialObject } from '../packages/shared/src/spatial';

const relationV = v.union(v.literal('next_to'), v.literal('left_of'), v.literal('right_of'), v.literal('stay'));
const roomObjects = (ctx: MutationCtx, roomId: Id<'rooms'>) => ctx.db.query('objects').withIndex('by_room', q => q.eq('roomId', roomId)).collect();
const asSpatial = (rows: Doc<'objects'>[]): SpatialObject[] => rows.filter(o => o.status === 'confirmed').map(o => ({
  id: o._id, label: o.label, size: o.size, position: o.anchor.position, facingYaw: o.facingYaw,
}));
function notPaused(room: Doc<'rooms'>) {
  if (room.paused) throw new ConvexError({ code: 'PAUSED', message: 'Resume the memory before changing its placement.' });
}

async function proposeOne(ctx: MutationCtx, room: Doc<'rooms'>, member: Doc<'members'>, input: SpatialRequest & {
  baseRevision: number; commandId: string; utteranceId?: Id<'utterances'>; quote?: string;
}) {
  const prior = await ctx.db.query('corrections').withIndex('by_room_command', q => q.eq('roomId', room._id).eq('commandId', input.commandId)).first();
  if (prior) return { correctionId: prior._id, duplicate: true };
  notPaused(room);
  if (input.baseRevision !== room.revision) throw new ConvexError({ code: 'STALE', message: 'The memory changed. Review a fresh placement.' });
  const rows = await roomObjects(ctx, room._id);
  const target = rows.find(o => o._id === input.objectId && o.status === 'confirmed');
  if (!target || !rows.some(o => o._id === input.referenceId && o.status === 'confirmed')
    || (input.facingId && !rows.some(o => o._id === input.facingId && o.status === 'confirmed'))) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Choose confirmed objects in this memory.' });
  }
  let plan;
  try { plan = planPlacement(asSpatial(rows), input); }
  catch (e) { throw new ConvexError({ code: 'BAD_PLACEMENT', message: (e as Error).message }); }
  // One active correction is easy to review; a new preview explicitly supersedes the old one.
  for (const p of await ctx.db.query('corrections').withIndex('by_room', q => q.eq('roomId', room._id)).collect()) {
    if (p.status === 'pending') await ctx.db.patch(p._id, { status: 'superseded' });
  }
  const correctionId = await ctx.db.insert('corrections', {
    roomId: room._id, objectId: target._id, referenceId: input.referenceId as Id<'objects'>,
    facingId: (input.facingId as Id<'objects'> | undefined) ?? null, relation: input.relation, baseRevision: room.revision,
    beforeAnchor: target.anchor, beforeYaw: target.facingYaw ?? null, beforeCorrectionId: target.lastCorrectionId ?? null,
    proposedAnchor: { position: plan.position, source: 'correction' }, proposedYaw: plan.yaw,
    utteranceId: input.utteranceId ?? null, quote: input.quote ?? '', description: plan.description,
    actor: member.displayName, memberId: member._id, commandId: input.commandId, status: 'pending', createdAt: Date.now(),
  });
  return { correctionId, duplicate: false };
}

export const propose = mutation({
  args: { code: v.string(), token: v.string(), objectId: v.id('objects'), referenceId: v.id('objects'),
    facingId: v.optional(v.id('objects')), relation: relationV, baseRevision: v.number(), commandId: v.string() },
  handler: async (ctx, { code, token, ...input }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    return proposeOne(ctx, room, member, input);
  },
});

export async function settleCorrection(ctx: MutationCtx, room: Doc<'rooms'>, member: Doc<'members'>, correction: Doc<'corrections'>, accept: boolean, commandId: string | null) {
  notPaused(room);
  if (correction.roomId !== room._id || correction.status !== 'pending') throw new ConvexError({ code: 'STALE', message: 'That preview is no longer pending.' });
  if (!accept) { await ctx.db.patch(correction._id, { status: 'rejected' }); return; }
  if (room.revision !== correction.baseRevision) throw new ConvexError({ code: 'STALE', message: 'The memory changed. Make a fresh preview before confirming.' });
  const target = await ctx.db.get(correction.objectId);
  if (!target || target.roomId !== room._id || target.status !== 'confirmed') throw new ConvexError({ code: 'STALE', message: 'That object changed.' });
  await ctx.db.patch(target._id, { anchor: correction.proposedAnchor, facingYaw: correction.proposedYaw, lastCorrectionId: correction._id });
  const eventId = await appendEvent(ctx, room, { kind: 'correction', objectId: target._id, actor: member.displayName, memberId: member._id, commandId });
  await ctx.db.patch(eventId, { correctionId: correction._id });
  await ctx.db.patch(correction._id, { status: 'confirmed' });
}

export async function settlePendingCorrection(ctx: MutationCtx, room: Doc<'rooms'>, member: Doc<'members'>, accept: boolean): Promise<boolean> {
  const p = (await ctx.db.query('corrections').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).find(p => p.status === 'pending');
  if (!p) return false;
  await settleCorrection(ctx, room, member, p, accept, null);
  return true;
}

export const confirm = mutation({
  args: { code: v.string(), token: v.string(), correctionId: v.id('corrections'), commandId: v.string() },
  handler: async (ctx, { code, token, correctionId, commandId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    const prior = await ctx.db.query('events').withIndex('by_room_command', q => q.eq('roomId', room._id).eq('commandId', commandId)).first();
    if (prior) {
      if (prior.correctionId !== correctionId) throw new ConvexError({ code: 'STALE', message: 'This command already belongs to another change.' });
      return { duplicate: true };
    }
    const p = await ctx.db.get(correctionId);
    if (!p || p.roomId !== room._id) throw new ConvexError({ code: 'NOT_FOUND', message: 'No such preview.' });
    await settleCorrection(ctx, room, member, p, true, commandId);
    return { duplicate: false };
  },
});

export const reject = mutation({
  args: { code: v.string(), token: v.string(), correctionId: v.id('corrections') },
  handler: async (ctx, { code, token, correctionId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    const p = await ctx.db.get(correctionId);
    if (!p || p.roomId !== room._id) throw new ConvexError({ code: 'NOT_FOUND', message: 'No such preview.' });
    await settleCorrection(ctx, room, member, p, false, null);
  },
});

export const list = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token);
    const scopes = await activeScopes(ctx, room._id);
    const rows = await ctx.db.query('corrections').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
    return Promise.all(rows.filter(p => p.status === 'pending').map(async p => {
      const u = p.utteranceId ? await ctx.db.get(p.utteranceId) : null;
      return { id: p._id, objectId: p.objectId, description: p.description, status: p.status,
        stale: p.baseRevision !== room.revision, baseRevision: p.baseRevision, actor: p.actor,
        source: u ? { transcript: u.transcript, speaker: u.speaker, language: u.language, translation: u.translation,
          audioUrl: u.audioFileId && scopes.has('voice_recording') ? await ctx.storage.getUrl(u.audioFileId) : null } : null };
    }));
  },
});

/** Deterministic EN/ES spatial grammar, with the same recording/provenance path as ordinary narration. */
export const fromUtterance = internalMutation({
  args: { utteranceId: v.id('utterances') },
  handler: async (ctx, { utteranceId }): Promise<boolean> => {
    const u = await ctx.db.get(utteranceId);
    if (!u || u.status !== 'pending') return true;
    const room = await ctx.db.get(u.roomId), member = await ctx.db.get(u.memberId);
    if (!room || !member || member.revokedAt !== null) return true;
    const parsed = spokenCorrection(u.transcript, asSpatial(await roomObjects(ctx, room._id)));
    if (!parsed.handled) return false;
    const es = /\b(mueve|mueva|banco|árbol|puerta|gira|muevas)\b/iu.test(u.transcript);
    let reply = parsed.message ?? '';
    let translation: string | null = null;
    let replyTranslation: string | null = null;
    let intent = 'none';
    if (parsed.request) {
      try {
        if (!(await activeScopes(ctx, room._id)).has('voice_processing')) throw new Error('Voice permission was withdrawn.');
        const r = await proposeOne(ctx, room, member, { ...parsed.request,
          baseRevision: u.baseRevision ?? room.revision, commandId: u.commandId, utteranceId, quote: u.transcript });
        const description = (await ctx.db.get(r.correctionId))!.description;
        const englishReply = description + ' Review the preview before keeping it.';
        reply = es ? 'He preparado una vista previa de esa posición. Revísela antes de confirmar; la posición actual sigue igual.' : englishReply;
        if (es) { translation = description; replyTranslation = 'I prepared a preview of that placement. Review it before confirming; the current placement is unchanged.'; }
        intent = 'correct_object';
      } catch (e) {
        reply = e instanceof ConvexError ? String((e.data as { message: string }).message) : (e as Error).message;
      }
    }
    if (es && !parsed.request && reply === 'The current placement is unchanged.') {
      reply = 'La posición actual sigue igual.';
      translation = 'Do not move it.';
      replyTranslation = 'The current placement is unchanged.';
    }
    await ctx.db.patch(u._id, { status: 'done', intent, reply, aiMode: 'guided-spatial', aiMs: 0,
      language: es ? 'es' : 'en', translation, replyTranslation, dropped: [] });
    return true;
  },
});
