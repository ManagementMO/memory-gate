// Stored memories (the plan each visit is drawn from) and the composed-object cache. Guests on other devices read
// the same plan, so everyone in a session sees the same place.
import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireMember, requireScope } from './lib/auth';

/** A one-time upload URL for a shared photo or video still (needs the photo permission given at Begin). */
export const uploadUrl = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['storyteller', 'family']);
    await requireScope(ctx, room._id, 'photo_processing');
    return ctx.storage.generateUploadUrl();
  },
});

export const save = internalMutation({
  args: {
    roomId: v.id('rooms'), memoryId: v.optional(v.id('memories')), title: v.string(), words: v.array(v.string()), plan: v.any(), source: v.string(),
    mediaFileId: v.optional(v.id('_storage')), mediaKind: v.optional(v.string()), caption: v.optional(v.string()), appendWords: v.optional(v.boolean()),
    memberId: v.optional(v.id('members')),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    const existing = a.memoryId ? await ctx.db.get(a.memoryId) : null;
    if (existing && existing.roomId === a.roomId) {
      await ctx.db.patch(existing._id, {
        title: a.title, plan: a.plan, source: a.source, updatedAt: now,
        words: a.appendWords ? [...existing.words, ...a.words].slice(-40) : a.words,
        ...(a.mediaFileId ? { mediaFileId: a.mediaFileId } : {}), ...(a.mediaKind ? { mediaKind: a.mediaKind } : {}), ...(a.caption ? { caption: a.caption } : {}),
      });
      return existing._id;
    }
    return ctx.db.insert('memories', {
      roomId: a.roomId, title: a.title, words: a.words, plan: a.plan, source: a.source,
      mediaFileId: a.mediaFileId ?? null, mediaKind: a.mediaKind ?? null, caption: a.caption ?? null, createdAt: now, updatedAt: now,
      ...(a.memberId ? { memberId: a.memberId } : {}),
    });
  },
});

/** The session's latest memory (guests follow the host's place through this). */
export const current = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room, member } = await requireMember(ctx, code, token);
    const m = await ctx.db.query('memories').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').first();
    if (!m) return null;
    const by = m.memberId ? await ctx.db.get(m.memberId) : null;
    return {
      id: m._id, title: m.title, plan: m.plan, source: m.source, updatedAt: m.updatedAt, caption: m.caption,
      mediaUrl: m.mediaFileId ? await ctx.storage.getUrl(m.mediaFileId) : null, mediaKind: m.mediaKind,
      mine: !m.memberId || m.memberId === member._id, byName: by?.displayName ?? null, byOwner: by?.isOwner ?? false,
    };
  },
});

export const fileUrl = internalQuery({ args: { fileId: v.id('_storage') }, handler: (ctx, { fileId }) => ctx.storage.getUrl(fileId) });

export const cached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => (await ctx.db.query('sketchCache').withIndex('by_key', (q) => q.eq('key', key)).unique())?.parts ?? null,
});

export const cache = internalMutation({
  args: { key: v.string(), parts: v.any() },
  handler: async (ctx, { key, parts }) => {
    const row = await ctx.db.query('sketchCache').withIndex('by_key', (q) => q.eq('key', key)).unique();
    if (row) await ctx.db.patch(row._id, { parts });
    else await ctx.db.insert('sketchCache', { key, parts, createdAt: Date.now() });
  },
});
