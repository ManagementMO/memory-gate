// Being together in the same room. Each open page says "I'm here" every couple of seconds, and everyone sees the
// others as soft lights of their own colour; a "look here" mark (a tap on something) travels on the same row.
// A visit in progress can be joined from any other device nearby in one tap (`nearby`), with no code to type.
// Times are the server's; clients compare against the server time each `here` returns, so device clocks don't matter.
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMember } from './lib/auth';

const COLORS = ['#ffd27a', '#ff9fb2', '#8fd3ff', '#a8eec0', '#cdb4ff', '#ffbf94'];
const deviceV = v.union(v.literal('headset'), v.literal('phone'), v.literal('desktop'));
const vec3 = v.array(v.number());

export const here = mutation({
  args: { code: v.string(), token: v.string(), device: deviceV, point: v.optional(vec3) },
  handler: async (ctx, { code, token, device, point }) => {
    const { room, member } = await requireMember(ctx, code, token);
    const now = Date.now();
    const mark = point && point.length === 3 && point.every(Number.isFinite) ? { at: point, t: now } : undefined;
    const mine = await ctx.db.query('presence').withIndex('by_member', (q) => q.eq('memberId', member._id)).unique();
    if (mine) {
      await ctx.db.patch(mine._id, { device, updatedAt: now, leftAt: null, ...(mark ? { point: mark } : {}) });
      return { seat: mine.seat, color: mine.color, now };
    }
    const seat = (await ctx.db.query('presence').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()).length;
    const color = COLORS[seat % COLORS.length]!;
    await ctx.db.insert('presence', { roomId: room._id, memberId: member._id, seat, color, device, point: mark ?? null, updatedAt: now, leftAt: null });
    return { seat, color, now };
  },
});

/** Closing the page: the light goes out at once instead of fading after a few seconds. */
export const leave = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { member } = await requireMember(ctx, code, token);
    const mine = await ctx.db.query('presence').withIndex('by_member', (q) => q.eq('memberId', member._id)).unique();
    if (mine) await ctx.db.patch(mine._id, { leftAt: Date.now() });
  },
});

/** Everyone who has been here in this visit; the client keeps the ones seen in the last few seconds. */
export const list = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room, member } = await requireMember(ctx, code, token);
    const rows = await ctx.db.query('presence').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect();
    const out = [];
    for (const r of rows) {
      const m = await ctx.db.get(r.memberId);
      if (!m || m.revokedAt !== null) continue;
      out.push({ id: r._id as string, me: r.memberId === member._id, host: m.isOwner, seat: r.seat, color: r.color, device: r.device, point: r.point, updatedAt: r.updatedAt, leftAt: r.leftAt });
    }
    return out.sort((a, b) => a.seat - b.seat);
  },
});

/**
 * A visit happening nearby: the newest room whose host was here since `after` (server time). Same-room visits run on
 * one local backend, so every device that reaches it is in the room; test rooms (offline) are never offered.
 */
export const nearby = query({
  args: { after: v.number() },
  handler: async (ctx, { after }) => {
    const recent = await ctx.db.query('presence').withIndex('by_updated', (q) => q.gt('updatedAt', after)).order('desc').take(24);
    for (const r of recent) {
      if (r.leftAt !== null) continue;
      const m = await ctx.db.get(r.memberId);
      if (!m || !m.isOwner || m.revokedAt !== null) continue;
      const room = await ctx.db.get(r.roomId);
      if (!room || room.offline || !room.joinKey) continue;
      return { code: room.code, key: room.joinKey, since: r.updatedAt };
    }
    return null;
  },
});

/**
 * For the exchange gateway (SpacetimeDB presence): the join code and family key of a room whose host is present, so
 * a nearby device can be offered the visit. Server secret only; offline (test) rooms are never offered.
 */
export const inviteFor = query({
  args: { secret: v.string(), roomId: v.string() },
  handler: async (ctx, { secret, roomId }) => {
    if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) return null;
    const id = ctx.db.normalizeId('rooms', roomId);
    const room = id ? await ctx.db.get(id) : null;
    if (!room || room.offline || !room.joinKey) return null;
    return { code: room.code, key: room.joinKey };
  },
});
