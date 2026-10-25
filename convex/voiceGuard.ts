// The grandchild's voice. Whoever claimed the grandchild's eyes in a visit has their spoken words kept as text only,
// unless a parent or guardian agreed on that device to keep the audio too (for replaying in the album, like the
// grown-ups' clips). The exchange gateway keeps the perspectives, so it tells Convex who the grandchild's claimant is;
// everything that stores or serves a clip asks clipsAllowed first. Revoking deletes that person's clips.
import { ConvexError, v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { activeScopes, requireMember } from './lib/auth';
import { deleteIfUnreferenced } from './lib/storage';

const serverOnly = (secret: string) => {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'Server authorization required.' });
};

const rowOf = (ctx: QueryCtx | MutationCtx, memberId: Id<'members'>) =>
  ctx.db.query('voiceGuardians').withIndex('by_member', (q) => q.eq('memberId', memberId)).unique();

/** May this member's voice be kept as clips? The room's recording consent, and for the grandchild a guardian's yes. */
export async function clipsAllowed(ctx: QueryCtx | MutationCtx, roomId: Id<'rooms'>, memberId: Id<'members'>): Promise<boolean> {
  if (!(await activeScopes(ctx, roomId)).has('voice_recording')) return false;
  const g = await rowOf(ctx, memberId);
  return !g || !g.childClaimant || (!!g.agreedAt && !g.revokedAt);
}

/** The gateway: who claims the grandchild's eyes in this room now (null: nobody). Everyone else stops being it. */
export const setClaimant = mutation({
  args: { secret: v.string(), roomId: v.string(), memberId: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    serverOnly(a.secret);
    const roomId = ctx.db.normalizeId('rooms', a.roomId);
    if (!roomId) return;
    const memberId = a.memberId ? ctx.db.normalizeId('members', a.memberId) : null;
    const now = Date.now();
    const rows = await ctx.db.query('voiceGuardians').withIndex('by_room', (q) => q.eq('roomId', roomId)).collect();
    for (const r of rows) if (r.childClaimant !== (r.memberId === memberId)) await ctx.db.patch(r._id, { childClaimant: r.memberId === memberId, updatedAt: now });
    if (memberId && !rows.some((r) => r.memberId === memberId)) {
      const m = await ctx.db.get(memberId);
      if (m && m.roomId === roomId) await ctx.db.insert('voiceGuardians', { roomId, memberId, childClaimant: true, guardianName: null, agreedAt: null, revokedAt: null, updatedAt: now });
    }
  },
});

/** On the grandchild's device: a parent or guardian agrees to keep the child's voice clips. */
export const agree = mutation({
  args: { code: v.string(), token: v.string(), guardianName: v.string() },
  handler: async (ctx, a) => {
    const { room, member } = await requireMember(ctx, a.code, a.token, ['storyteller', 'family']);
    const guardianName = a.guardianName.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!guardianName) throw new ConvexError({ code: 'GUARDIAN', message: 'Please write the parent or guardian’s name.' });
    const now = Date.now();
    const row = await rowOf(ctx, member._id);
    if (row) await ctx.db.patch(row._id, { guardianName, agreedAt: now, revokedAt: null, updatedAt: now });
    else await ctx.db.insert('voiceGuardians', { roomId: room._id, memberId: member._id, childClaimant: false, guardianName, agreedAt: now, revokedAt: null, updatedAt: now });
  },
});

/** Take the agreement back: this person's clips are deleted (their words stay as text). */
export const revoke = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, a) => {
    const { room, member } = await requireMember(ctx, a.code, a.token, ['storyteller', 'family']);
    const row = await rowOf(ctx, member._id);
    if (row) await ctx.db.patch(row._id, { revokedAt: Date.now(), updatedAt: Date.now() });
    const files: Id<'_storage'>[] = [];
    for (const m of await ctx.db.query('moments').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
      if (m.memberId === member._id && m.audioFileId) { files.push(m.audioFileId); await ctx.db.patch(m._id, { audioFileId: null }); }
    }
    for (const u of await ctx.db.query('utterances').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
      if (u.memberId === member._id && u.audioFileId) { files.push(u.audioFileId); await ctx.db.patch(u._id, { audioFileId: null }); }
    }
    for (const id of files) await deleteIfUnreferenced(ctx, id);
    return { deleted: files.length };
  },
});

/** For this device: does it hold the grandchild's eyes, and has a guardian agreed to keep the voice? */
export const status = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, a) => {
    const { room, member } = await requireMember(ctx, a.code, a.token, ['storyteller', 'family']);
    const row = await rowOf(ctx, member._id);
    return { childClaimant: !!row?.childClaimant, agreed: !!row?.agreedAt && !row.revokedAt, guardianName: row?.guardianName ?? null, clips: await clipsAllowed(ctx, room._id, member._id) };
  },
});
