// Album moments for a session: a picture of the place, the words that shaped it and, when recording was allowed,
// the original voice. Everyone in the session sees the same album.
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMember } from './lib/auth';

export const uploadUrl = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    await requireMember(ctx, code, token, ['storyteller', 'family']);
    return ctx.storage.generateUploadUrl();
  },
});

export const add = mutation({
  args: {
    code: v.string(), token: v.string(), memoryTitle: v.string(), caption: v.string(), speaker: v.string(), kind: v.string(),
    imageFileId: v.optional(v.id('_storage')), audioFileId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, a) => {
    const { room, member } = await requireMember(ctx, a.code, a.token, ['storyteller', 'family']);
    return ctx.db.insert('moments', {
      roomId: room._id, memberId: member._id, memoryTitle: a.memoryTitle.slice(0, 60), caption: a.caption.slice(0, 400),
      speaker: a.speaker === 'companion' ? 'companion' : 'you', kind: ['arrival', 'detail', 'final'].includes(a.kind) ? a.kind : 'detail',
      imageFileId: a.imageFileId ?? null, audioFileId: a.audioFileId ?? null, createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token);
    const rows = await ctx.db.query('moments').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').take(120);
    return Promise.all(rows.map(async (m) => ({
      id: m._id, memoryTitle: m.memoryTitle, caption: m.caption, speaker: m.speaker, kind: m.kind, at: m.createdAt,
      imageUrl: m.imageFileId ? await ctx.storage.getUrl(m.imageFileId) : null,
      audioUrl: m.audioFileId ? await ctx.storage.getUrl(m.audioFileId) : null,
    })));
  },
});
