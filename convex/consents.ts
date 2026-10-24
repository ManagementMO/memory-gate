import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import { activeScopes, appendEvent, requireMember, requireOwner } from './lib/auth';
import { SCOPES } from '../packages/shared/src/contract';
import { deleteIfUnreferenced } from './lib/storage';
import type { Id } from './_generated/dataModel';

export const give = mutation({
  args: { code: v.string(), token: v.string(), scopes: v.array(v.string()) },
  handler: async (ctx, { code, token, scopes }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    const clean = [...new Set(scopes)].filter((s) => (SCOPES as readonly string[]).includes(s));
    if (!clean.length) throw new ConvexError({ code: 'NO_SCOPES', message: 'Pick at least one permission.' });
    const id = await ctx.db.insert('consents', { roomId: room._id, memberId: member._id, givenBy: member.displayName, scopes: clean, createdAt: Date.now(), revokedAt: null });
    await appendEvent(ctx, room, { kind: 'consent', objectId: null, actor: member.displayName, memberId: member._id, commandId: null });
    return id;
  },
});

/** Revoking voice_recording deletes every stored clip in the room (files and references). */
export const revoke = mutation({
  args: { code: v.string(), token: v.string(), consentId: v.id('consents') },
  handler: async (ctx, { code, token, consentId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    const c = await ctx.db.get(consentId);
    if (!c || c.roomId !== room._id) throw new ConvexError({ code: 'NOT_FOUND', message: 'No such consent.' });
    if (c.memberId !== member._id && !member.isOwner) throw new ConvexError({ code: 'FORBIDDEN', message: 'Only the person who gave it, or the owner, can revoke it.' });
    await ctx.db.patch(consentId, { revokedAt: Date.now() });
    if (!(await activeScopes(ctx, room._id)).has('voice_recording')) {
      for (const u of await ctx.db.query('utterances').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
        if (u.audioFileId) { await ctx.db.patch(u._id, { audioFileId: null }); await deleteIfUnreferenced(ctx, u.audioFileId); }
      }
    }
  },
});

/** "Delete this memory": every row and file of this room (shared library and sample assets stay). Owner only. */
export const deleteMemory = mutation({
  args: { code: v.string(), token: v.string(), confirmText: v.string() },
  handler: async (ctx, { code, token, confirmText }) => {
    const { room } = await requireOwner(ctx, code, token);
    if (confirmText.trim().toUpperCase() !== room.code) throw new ConvexError({ code: 'CONFIRM', message: 'Type the room code to confirm.' });
    const files = new Set<Id<'_storage'>>();
    for (const t of ['objects', 'events', 'utterances', 'photos', 'splats', 'jobs', 'consents', 'members', 'corrections', 'redKiteTellings'] as const) {
      for (const row of await ctx.db.query(t).withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
        const r = row as Record<string, unknown>;
        for (const k of ['glbFileId', 'storedGlbFileId', 'audioFileId', 'fileId', 'liteFileId', 'previewFileId']) if (r[k]) files.add(r[k] as Id<'_storage'>);
        await ctx.db.delete(row._id);
      }
    }
    await ctx.db.delete(room._id);
    for (const id of files) await deleteIfUnreferenced(ctx, id);
    return { deleted: true };
  },
});

