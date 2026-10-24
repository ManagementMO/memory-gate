// Likenesses for shared visits (apps/gate social layer). A family member builds a person's avatar offline from their
// own photos (docs/AVATARS.md: Blender + MPFB + FaceBuilder) and uploads only the finished GLB here; the photos never
// leave their computer. A child's likeness needs a guardian's agreement, recorded with their name. The device that
// uploads it gets an unguessable key and wears the likeness by sending it to the exchange gateway, which resolves it
// here with the server secret. Revoking deletes the file; the gateway clears it from every visit within seconds.
import { ConvexError, v } from 'convex/values';
import { action, internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { randomString, requireMember } from './lib/auth';

const MAX_BYTES = 10 * 1024 * 1024;
const serverOnly = (secret: string) => {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'Server authorization required.' });
};

export const uploadUrl = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    await requireMember(ctx, code, token, ['family', 'storyteller']);
    return ctx.storage.generateUploadUrl();
  },
});

/** Checks the upload really is a binary glTF 2.0 of a sensible size and records consent; returns the wearer's key. */
export const register = action({
  args: { code: v.string(), token: v.string(), fileId: v.id('_storage'), label: v.string(), subjectIsMinor: v.boolean(), guardianName: v.optional(v.string()), guardianAgrees: v.optional(v.boolean()) },
  handler: async (ctx, a): Promise<{ key: string }> => {
    const reject = async (message: string): Promise<never> => { await ctx.storage.delete(a.fileId); throw new ConvexError({ code: 'AVATAR_REJECTED', message }); };
    const guardian = a.guardianName?.trim() ?? '';
    if (a.subjectIsMinor && (!a.guardianAgrees || guardian.length < 2 || guardian.length > 80)) return reject('A parent or guardian must agree, by name, before a child’s likeness is used.');
    const blob = await ctx.storage.get(a.fileId);
    if (!blob) throw new ConvexError({ code: 'AVATAR_REJECTED', message: 'The upload did not arrive. Try again.' });
    if (blob.size > MAX_BYTES) return reject('That model is larger than 10 MB. Export it with smaller textures.');
    const head = new DataView(await blob.slice(0, 12).arrayBuffer());
    const magic = head.byteLength === 12 ? String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3)) : '';
    if (magic !== 'glTF' || head.getUint32(4, true) !== 2) return reject('Choose a .glb file exported as glTF 2.0 binary.');
    const key = await ctx.runMutation(internal.avatars.save, { code: a.code, token: a.token, fileId: a.fileId, bytes: blob.size, label: a.label, subjectIsMinor: a.subjectIsMinor, guardianName: a.subjectIsMinor ? guardian : null });
    return { key };
  },
});

export const save = internalMutation({
  args: { code: v.string(), token: v.string(), fileId: v.id('_storage'), bytes: v.number(), label: v.string(), subjectIsMinor: v.boolean(), guardianName: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    const { member } = await requireMember(ctx, a.code, a.token, ['family', 'storyteller']);
    const key = randomString(40);
    await ctx.db.insert('avatars', { key, fileId: a.fileId, bytes: a.bytes, label: a.label.trim().slice(0, 60) || 'Family member', subjectIsMinor: a.subjectIsMinor, guardianName: a.guardianName, consentBy: member._id, consentAt: Date.now(), revokedAt: null });
    return key;
  },
});

/** Whoever holds the key can take the likeness away again: the file is deleted, and visits stop showing it. */
export const revoke = mutation({
  args: { code: v.string(), token: v.string(), key: v.string() },
  handler: async (ctx, { code, token, key }) => {
    await requireMember(ctx, code, token, ['family', 'storyteller']);
    const a = await ctx.db.query('avatars').withIndex('by_key', (q) => q.eq('key', key)).unique();
    if (!a || a.revokedAt !== null) return;
    if (a.fileId) await ctx.storage.delete(a.fileId);
    await ctx.db.patch(a._id, { fileId: null, revokedAt: Date.now() });
  },
});

/** For the exchange gateway only: what a key wears (null once revoked). */
export const resolve = query({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, { secret, key }) => {
    serverOnly(secret);
    const a = await ctx.db.query('avatars').withIndex('by_key', (q) => q.eq('key', key)).unique();
    if (!a || a.revokedAt !== null || !a.fileId) return null;
    const url = await ctx.storage.getUrl(a.fileId);
    if (!url) return null;
    return { id: a._id as string, url, bytes: a.bytes, subjectIsMinor: a.subjectIsMinor, guardianConsent: !a.subjectIsMinor || !!a.guardianName };
  },
});

/** For the exchange gateway only: which of these likenesses are still being shared. */
export const activeIds = query({
  args: { secret: v.string(), ids: v.array(v.string()) },
  handler: async (ctx, { secret, ids }) => {
    serverOnly(secret);
    if (ids.length > 100) throw new ConvexError({ code: 'LIMIT', message: 'At most 100 avatars per check.' });
    const active: string[] = [];
    for (const raw of ids) {
      const id = ctx.db.normalizeId('avatars', raw);
      const a = id ? await ctx.db.get(id as Id<'avatars'>) : null;
      if (a && a.revokedAt === null && a.fileId) active.push(raw);
    }
    return active;
  },
});
