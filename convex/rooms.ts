import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { appendEvent, newRoomCode, newToken, priorCommand, randomString, readFlags, requireMember, requireOwner } from './lib/auth';
import { FLAG_NAMES } from '../packages/shared/src/flags';
import { deleteIfUnreferenced } from './lib/storage';

const roleV = v.union(v.literal('family'), v.literal('storyteller'), v.literal('viewer'));

/** A family member creates a room on the phone and becomes its owner. */
export const create = mutation({
  args: { title: v.string(), displayName: v.string(), demo: v.optional(v.boolean()), offline: v.optional(v.boolean()) },
  handler: async (ctx, { title, displayName, demo, offline }) => {
    let code = newRoomCode();
    while (await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code)).unique()) code = newRoomCode();
    // A new room starts on the prebaked sample splat when one is seeded, so the headset always has a place to show.
    const sample = await ctx.db.query('assets').withIndex('by_key', (q) => q.eq('key', 'splat.sample')).unique();
    const roomId = await ctx.db.insert('rooms', {
      code, title: title.trim().slice(0, 60) || 'Our room', paused: false, activeSplatId: null, openedAt: null, headsetLastSeenAt: null,
      soundLevel: 0.6, echoEnabled: false, familyNames: [], revision: 0, tripoCount: 0, demo: demo ?? false, offline: offline ?? false, createdAt: Date.now(),
      joinKey: randomString(8, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'),
    });
    if (sample) {
      const m = (sample.meta ?? {}) as { numSplats?: number; bytes?: number; floorY?: number; scale?: number; liteFileId?: string };
      const splatId = await ctx.db.insert('splats', {
        roomId, photoId: null, status: 'ready', fileId: sample.fileId, liteFileId: (m.liteFileId as Id<'_storage'> | undefined) ?? null, source: 'prebaked', numSplats: m.numSplats ?? 0,
        bytes: m.bytes ?? 0, gpuSeconds: 0, fPx: null, floorY: m.floorY ?? null, scale: m.scale ?? 1, error: null, createdAt: Date.now(), readyAt: Date.now(),
      });
      await ctx.db.patch(roomId, { activeSplatId: splatId });
    }
    const token = newToken();
    await ctx.db.insert('members', { roomId, token, displayName: displayName.trim().slice(0, 40) || 'Family', role: 'family', isOwner: true, createdAt: Date.now(), revokedAt: null });
    return { code, token };
  },
});

/** Anyone with the code joins with a display name and a role; the token returned is their session. */
export const join = mutation({
  args: { code: v.string(), displayName: v.string(), role: roleV, key: v.optional(v.string()) },
  handler: async (ctx, { code, displayName, role, key }) => {
    const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code.trim().toUpperCase())).unique();
    if (!room) throw new ConvexError({ code: 'ROOM_NOT_FOUND', message: 'No room with that code.' });
    // The code is shown on screens, so on its own it only lets someone watch. Family and storyteller joins need the
    // room's family key, which travels in the family and headset links.
    if (role !== 'viewer' && room.joinKey && (key ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() !== room.joinKey) {
      throw new ConvexError({ code: 'NEED_KEY', message: 'To join as family or storyteller, open the family link (it carries the family key). With only the code you can watch.' });
    }
    const token = newToken();
    await ctx.db.insert('members', { roomId: room._id, token, displayName: displayName.trim().slice(0, 40) || role, role, isOwner: false, createdAt: Date.now(), revokedAt: null });
    return { code: room.code, token };
  },
});

/** The room view every client renders: state, active splat URL, flags, members, consents. */
export const get = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room, member } = await requireMember(ctx, code, token);
    const splat = room.activeSplatId ? await ctx.db.get(room.activeSplatId) : null;
    const splatUrl = splat?.fileId ? await ctx.storage.getUrl(splat.fileId) : null;
    const liteUrl = splat?.liteFileId ? await ctx.storage.getUrl(splat.liteFileId) : null;
    const members = await ctx.db.query('members').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect();
    const consents = await ctx.db.query('consents').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect();
    const splats = await ctx.db.query('splats').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').take(5);
    return {
      room: { code: room.code, title: room.title, paused: room.paused, openedAt: room.openedAt, headsetLastSeenAt: room.headsetLastSeenAt,
        soundLevel: room.soundLevel, echoEnabled: room.echoEnabled, familyNames: room.familyNames, revision: room.revision, demo: room.demo, offline: room.offline ?? false, layout: room.layout ?? 'photo' },
      me: { displayName: member.displayName, role: member.role, isOwner: member.isOwner },
      joinKey: member.role === 'family' ? room.joinKey ?? null : null, // only family can share the privileged links
      splat: splat ? { id: splat._id, status: splat.status, source: splat.source, url: splatUrl, liteUrl, numSplats: splat.numSplats, liteNumSplats: splat.liteNumSplats ?? null, floorY: splat.floorY, scale: splat.scale } : null,
      recentSplats: splats.map((s) => ({ id: s._id, status: s.status, source: s.source, error: s.error, createdAt: s.createdAt, readyAt: s.readyAt })),
      flags: await readFlags(ctx, room),
      members: members.filter((m) => m.revokedAt === null).map((m) => ({ displayName: m.displayName, role: m.role })),
      consents: consents.filter((c) => c.revokedAt === null).map((c) => ({ id: c._id, givenBy: c.givenBy, scopes: c.scopes, createdAt: c.createdAt })),
    };
  },
});

export const setPaused = mutation({
  args: { code: v.string(), token: v.string(), paused: v.boolean(), commandId: v.string() },
  handler: async (ctx, { code, token, paused, commandId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    if (await priorCommand(ctx, room._id, commandId)) return { ok: true, duplicate: true };
    if (room.paused === paused) return { ok: true, unchanged: true };
    await ctx.db.patch(room._id, { paused });
    await appendEvent(ctx, room, { kind: paused ? 'pause' : 'resume', objectId: null, actor: member.displayName, memberId: member._id, commandId });
    return { ok: true };
  },
});

/** The phone's "Show" button: the headset fades the memory in when openedAt changes. */
export const open = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    await ctx.db.patch(room._id, { openedAt: Date.now(), paused: false });
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['storyteller']);
    const now = Date.now();
    // A headset (re)appearing after 5+ minutes: warm the model connection so the first spoken turn is fast.
    if (!room.offline && (!room.headsetLastSeenAt || now - room.headsetLastSeenAt > 300_000)) await ctx.scheduler.runAfter(0, internal.ai.warm, {});
    await ctx.db.patch(room._id, { headsetLastSeenAt: now });
  },
});

export const setSettings = mutation({
  args: { code: v.string(), token: v.string(), familyNames: v.optional(v.array(v.string())), echoEnabled: v.optional(v.boolean()), soundLevel: v.optional(v.number()), title: v.optional(v.string()) },
  handler: async (ctx, { code, token, ...s }) => {
    const { room } = await requireMember(ctx, code, token, ['family']);
    const patch: Record<string, unknown> = {};
    if (s.familyNames) patch.familyNames = s.familyNames.map((n) => n.trim()).filter((n) => /^[\p{L}' -]{1,30}$/u.test(n)).slice(0, 20);
    if (s.echoEnabled !== undefined) patch.echoEnabled = s.echoEnabled;
    if (s.soundLevel !== undefined) patch.soundLevel = Math.min(1, Math.max(0, s.soundLevel));
    if (s.title !== undefined) patch.title = s.title.trim().slice(0, 60);
    await ctx.db.patch(room._id, patch);
  },
});

/** Admin: flip a feature flag (global for this deployment). Owner only. */
export const setFlag = mutation({
  args: { code: v.string(), token: v.string(), name: v.string(), value: v.boolean(), adminCode: v.optional(v.string()) },
  handler: async (ctx, { code, token, name, value, adminCode }) => {
    await requireOwner(ctx, code, token);
    // Flags are deployment-global, so owning a room is not enough: the operator code (ADMIN_CODE env) is required.
    if (!process.env.ADMIN_CODE || adminCode !== process.env.ADMIN_CODE) throw new ConvexError({ code: 'ADMIN_CODE', message: 'Enter the operator code to change live services.' });
    if (!(FLAG_NAMES as readonly string[]).includes(name)) throw new ConvexError({ code: 'BAD_FLAG', message: `Unknown flag ${name}` });
    const row = await ctx.db.query('flags').withIndex('by_name', (q) => q.eq('name', name)).unique();
    if (row) await ctx.db.patch(row._id, { value }); else await ctx.db.insert('flags', { name, value });
  },
});

/** Admin: "Reset demo room" between judges. Deletes objects, events, utterances (and their audio) and the room's
 * jobs; unpauses; clears openedAt and the Tripo counter. Keeps the code, members, photo, splat and consents. */
export const resetDemo = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room, member } = await requireOwner(ctx, code, token);
    const files = new Set<Id<'_storage'>>();
    for (const o of await ctx.db.query('objects').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
      if (o.glbFileId) files.add(o.glbFileId);
      if (o.storedGlbFileId) files.add(o.storedGlbFileId);
      await ctx.db.delete(o._id);
    }
    for (const e of await ctx.db.query('events').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) await ctx.db.delete(e._id);
    for (const p of await ctx.db.query('corrections').withIndex('by_room', q => q.eq('roomId', room._id)).collect()) await ctx.db.delete(p._id);
    for (const u of await ctx.db.query('utterances').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
      if (u.audioFileId) files.add(u.audioFileId);
      await ctx.db.delete(u._id);
    }
    for (const j of await ctx.db.query('jobs').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) {
      if (!['splat', 'world'].includes(j.kind)) await ctx.db.delete(j._id);
    }
    for (const id of files) await deleteIfUnreferenced(ctx, id);
    await ctx.db.patch(room._id, { paused: false, openedAt: null, tripoCount: 0 });
    await appendEvent(ctx, { ...room, paused: false }, { kind: 'reset', objectId: null, actor: member.displayName, memberId: member._id, commandId: null });
  },
});
