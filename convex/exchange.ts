import { ConvexError, v } from 'convex/values';
import { query } from './_generated/server';
import { activeScopes, requireMember, requireScope } from './lib/auth';

// A bounded reconciliation query lets the gateway erase deleted rooms after an
// outage too. It reveals only absence, and requires the existing server secret.
export const deletedRooms = query({
  args: { secret: v.string(), roomIds: v.array(v.string()) },
  handler: async (ctx, { secret, roomIds }) => {
    if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'Server authorization required.' });
    if (roomIds.length > 100) throw new ConvexError({ code: 'LIMIT', message: 'At most 100 rooms per reconciliation.' });
    const deleted: string[] = [];
    for (const roomId of roomIds) {
      const id = ctx.db.normalizeId('rooms', roomId);
      if (!id || !await ctx.db.get(id)) deleted.push(roomId);
    }
    return deleted;
  },
});

// Gateway authorization is checked again for every action and every pushed snapshot.
export const context = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    await requireScope(ctx, room._id, 'share_with_family');
    const members = await ctx.db.query('members').withIndex('by_room', q => q.eq('roomId', room._id)).take(100);
    const sources = await ctx.db.query('utterances').withIndex('by_room', q => q.eq('roomId', room._id)).order('desc').take(50);
    const recordingAllowed = (await activeScopes(ctx, room._id)).has('voice_recording');
    return {
      roomId: room._id, memberId: member._id, displayName: member.displayName, isOwner: member.isOwner, paused: room.paused, offline: room.offline ?? false, recordingAllowed,
      members: members.filter(m => m.revokedAt === null && m.role !== 'viewer').map(m => ({ id: m._id, name: m.displayName, role: m.role })),
      sources: sources.filter(s => s.memberId === member._id && s.status === 'done').map(s => ({ id: s._id, transcript: s.transcript, source: s.source, language: s.language })),
    };
  },
});

export const source = query({
  args: { code: v.string(), token: v.string(), sourceId: v.id('utterances') },
  handler: async (ctx, { code, token, sourceId }) => {
    const { room } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    await requireScope(ctx, room._id, 'share_with_family');
    const u = await ctx.db.get(sourceId);
    if (!u || u.roomId !== room._id) throw new ConvexError({ code: 'SOURCE_UNAVAILABLE', message: 'This story is no longer available.' });
    const contributor = await ctx.db.get(u.memberId);
    if (!contributor || contributor.revokedAt !== null) throw new ConvexError({ code: 'SOURCE_UNAVAILABLE', message: 'The contributor is no longer sharing this story.' });
    const scopes = await activeScopes(ctx, room._id);
    const objects = await ctx.db.query('objects').withIndex('by_room', q => q.eq('roomId', room._id)).take(100);
    const related = await Promise.all(objects.filter(o => o.status === 'confirmed').map(async o => {
      const correction = o.lastCorrectionId ? await ctx.db.get(o.lastCorrectionId) : null;
      return (correction?.utteranceId ?? o.utteranceId) === u._id ? { id: o._id, label: o.label, position: o.anchor.position } : null;
    }));
    return { id: u._id, contributorId: u.memberId, speaker: u.speaker, transcript: u.transcript, translation: u.translation, language: u.language, source: u.source,
      audioUrl: u.audioFileId && scopes.has('voice_recording') ? await ctx.storage.getUrl(u.audioFileId) : null,
      objects: related.filter(o => o !== null) };
  },
});
