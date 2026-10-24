// One push-to-talk turn (or a typed line from the phone): stored exactly as transcribed, then Claude (or the mock)
// proposes, the validator decides, objects.applyActions applies. The original clip is kept only with consent.
import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { activeScopes, readFlags, requireMember, requireScope } from './lib/auth';
import { pointerV } from './schema';

async function isReferenced(ctx: MutationCtx, id: Id<'_storage'>): Promise<boolean> {
  if ((await ctx.db.query('library').collect()).some((r) => r.fileId === id)) return true;
  if ((await ctx.db.query('assets').collect()).some((r) => r.fileId === id || ['liteFileId', 'previewFileId'].some(key => r.meta?.[key] === id))) return true;
  if ((await ctx.db.query('photos').collect()).some((r) => r.fileId === id)) return true;
  if ((await ctx.db.query('splats').collect()).some((r) => r.fileId === id || r.liteFileId === id || r.previewFileId === id)) return true;
  if ((await ctx.db.query('objects').collect()).some((r) => r.glbFileId === id || r.storedGlbFileId === id)) return true;
  return (await ctx.db.query('utterances').collect()).some((r) => r.audioFileId === id);
}

export const generateAudioUploadUrl = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['storyteller', 'family']);
    await requireScope(ctx, room._id, 'voice_recording');
    return ctx.storage.generateUploadUrl();
  },
});

export const add = mutation({
  args: {
    code: v.string(), token: v.string(), transcript: v.string(), source: v.union(v.literal('stt'), v.literal('typed'), v.literal('fixture')),
    pointer: v.optional(pointerV), durationMs: v.optional(v.number()), audioFileId: v.optional(v.id('_storage')), commandId: v.string(),
  },
  handler: async (ctx, a) => {
    const { room, member } = await requireMember(ctx, a.code, a.token, ['storyteller', 'family']);
    const dup = await ctx.db.query('utterances').withIndex('by_room_command', (q) => q.eq('roomId', room._id).eq('commandId', a.commandId)).first();
    if (dup) return { utteranceId: dup._id, duplicate: true };
    await requireScope(ctx, room._id, 'voice_processing');
    const scopes = await activeScopes(ctx, room._id);
    let audioFileId = a.audioFileId ?? null;
    if (audioFileId && !scopes.has('voice_recording')) {
      // Privacy: a clip is never kept without consent. Security: only delete it if nothing else references that
      // storage id, so a client can't name (and delete) a library model, photo or splat.
      if (!(await isReferenced(ctx, audioFileId))) await ctx.storage.delete(audioFileId);
      audioFileId = null;
    }
    const transcript = a.transcript.replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!transcript) throw new ConvexError({ code: 'EMPTY', message: 'Nothing was heard.' });
    const utteranceId = await ctx.db.insert('utterances', {
      roomId: room._id, memberId: member._id, speaker: member.displayName, audioFileId, transcript, source: a.source, language: null, translation: null,
      pointer: a.pointer ?? null, durationMs: a.durationMs ?? 0, baseRevision: room.revision, status: 'pending', intent: null, reply: null, sayBack: null, aiMode: null, aiMs: null,
      dropped: [], commandId: a.commandId, createdAt: Date.now(),
    });
    if (room.paused) await ctx.db.patch(utteranceId, { status: 'done', dropped: ['room paused: not sent to the AI'] });
    else await ctx.scheduler.runAfter(0, internal.ai.extract, { utteranceId });
    return { utteranceId, duplicate: false };
  },
});

/** Recent turns for captions and the phone's story timeline (newest first). */
export const recent = query({
  args: { code: v.string(), token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { code, token, limit }) => {
    const { room } = await requireMember(ctx, code, token);
    const scopes = await activeScopes(ctx, room._id);
    const rows = await ctx.db.query('utterances').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').take(Math.min(50, limit ?? 20));
    return Promise.all(rows.map(async (u) => ({
      id: u._id, speaker: u.speaker, transcript: u.transcript, translation: u.translation, language: u.language, source: u.source,
      status: u.status, intent: u.intent, reply: u.reply, replyTranslation: u.replyTranslation ?? null, sayBack: u.sayBack, aiMode: u.aiMode, aiMs: u.aiMs, dropped: u.dropped, createdAt: u.createdAt,
      audioUrl: u.audioFileId && scopes.has('voice_recording') ? await ctx.storage.getUrl(u.audioFileId) : null,
    })));
  },
});

export const forExtraction = internalQuery({
  args: { utteranceId: v.id('utterances') },
  handler: async (ctx, { utteranceId }) => {
    const u = await ctx.db.get(utteranceId);
    if (!u || u.status !== 'pending') return null;
    const room = await ctx.db.get(u.roomId);
    if (!room) return null;
    const ghosts = (await ctx.db.query('objects').withIndex('by_room', (q) => q.eq('roomId', u.roomId)).collect()).filter((o) => o.status === 'ghost');
    const confirmed = (await ctx.db.query('objects').withIndex('by_room', (q) => q.eq('roomId', u.roomId)).collect()).filter((o) => o.status === 'confirmed');
    const library = await ctx.db.query('library').collect();
    return {
      transcript: u.transcript, flags: await readFlags(ctx, room),
      pending: ghosts.sort((a, b) => b.createdAt - a.createdAt)[0]?.label ?? null,
      inRoom: confirmed.map((o) => o.label).slice(0, 20),
      libraryKeys: library.flatMap((l) => [l.key, ...l.synonyms]).filter((k) => /^[a-z ]+$/.test(k)),
    };
  },
});

/** ai.extract crashed after the model call: fail the turn so no client waits on it forever. */
export const failExtraction = internalMutation({
  args: { utteranceId: v.id('utterances'), error: v.string() },
  handler: async (ctx, { utteranceId, error }) => {
    const u = await ctx.db.get(utteranceId);
    if (u && u.status === 'pending') await ctx.db.patch(utteranceId, { status: 'failed', dropped: [...u.dropped, error.slice(0, 160)] });
  },
});
