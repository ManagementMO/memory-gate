// Spoken objects: proposal (ghost) -> confirm/reject -> undo. Every change is one authored event with a revision.
// Invariants (CLAUDE.md): objects come only from a validated extraction or a person on the phone; placement is fixed at
// proposal; confirm never moves an object; a GLB that arrives after confirm is stored, never swapped in.
import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { activeScopes, appendEvent, priorCommand, readFlags, requireMember } from './lib/auth';
import { anchorV } from './schema';
import { storyPlacement } from '../packages/shared/src/story-placement';
import { norm, sayBack, type AppAction, type ProposeAction } from '../packages/shared/src/contract';
import { settlePendingCorrection } from './corrections';

type Vec3 = [number, number, number];
const DEFAULT_SIZE = 0.6;

/** Library lookup on whole words (plurals folded): an exact key/synonym match, else the LONGEST key/synonym phrase
 * contained in the label ("antique rocking chair" -> "rocking chair", not "chair"). No loose head-noun matching:
 * "washing machine" must not become the sewing machine; unknown objects go to generation instead. */
export async function findLibrary(ctx: MutationCtx, label: string) {
  const rows = await ctx.db.query('library').collect();
  const words = (s: string) => norm(s).split(' ').filter(Boolean).map((w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, ''));
  const l = words(label);
  const key = l.join(' ');
  let best: { row: (typeof rows)[number]; len: number } | null = null;
  for (const r of rows) {
    for (const phrase of [r.key, ...r.synonyms]) {
      const p = words(phrase);
      if (p.join(' ') === key) return r;
      for (let i = 0; i + p.length <= l.length; i++) {
        if (p.every((w, j) => l[i + j] === w) && (!best || p.length > best.len)) best = { row: r, len: p.length };
      }
    }
  }
  return best?.row ?? null;
}

/** Placement from the release-time ray: its hit point, else 1.6 m along it dropped to the floor, else ahead. */
function anchorFrom(pointer: Doc<'utterances'>['pointer'], index: number, onSurface = false): { position: Vec3; source: string } {
  let p: Vec3 = [0, 0, -1.6];
  let source = 'default';
  const sh = pointer?.surfaceHit;
  if (onSurface && sh) { p = [sh[0] ?? 0, sh[1] ?? 0, sh[2] ?? 0]; source = pointer!.source; }
  else if (pointer?.hit) { p = [pointer.hit[0] ?? 0, pointer.hit[1] ?? 0, pointer.hit[2] ?? 0]; source = pointer.source; }
  else if (pointer) {
    const [ox, , oz] = pointer.origin; const [dx, , dz] = pointer.direction;
    const len = Math.hypot(dx ?? 0, dz ?? 0) || 1;
    p = [(ox ?? 0) + ((dx ?? 0) / len) * 1.6, 0, (oz ?? 0) + ((dz ?? 0) / len) * 1.6];
    source = pointer.source;
  }
  if (index > 0) p = [p[0] + 0.7 * index, p[1], p[2]]; // a second object from the same sentence sits beside the first
  return { position: p, source };
}

async function createObject(ctx: MutationCtx, room: Doc<'rooms'>, member: Doc<'members'>, a: {
  label: string; details: string[]; where: string; quote: string; utteranceId: Id<'utterances'> | null; anchor: { position: Vec3; source: string }; generatorPrompt: string; commandId: string | null;
}) {
  const flags = await readFlags(ctx, room);
  const lib = await findLibrary(ctx, a.label);
  // Personalize: a library shape plus spoken colors/materials -> Tripo re-texture (~31 s, V28) while it is a ghost.
  const wantsRetexture = !!lib && a.details.length > 0 && flags['objects.live'] && room.tripoCount < 10;
  const wantsGenerate = !lib && flags['objects.live'] && room.tripoCount < 10;
  const model = lib ? (wantsRetexture ? 'generating' : 'ready') : wantsGenerate ? 'generating' : 'placeholder';
  const objectId = await ctx.db.insert('objects', {
    roomId: room._id, label: a.label.slice(0, 40), details: a.details.slice(0, 4), status: 'ghost', model,
    glbFileId: lib?.fileId ?? null, storedGlbFileId: null, prebakedKey: lib?.key ?? null,
    modelSource: lib ? 'library' : 'placeholder', size: lib?.size ?? DEFAULT_SIZE, yaw: lib?.yawOffset ?? 0,
    anchor: a.anchor, where: a.where, quote: a.quote, utteranceId: a.utteranceId, proposedBy: member.displayName, proposedByMemberId: member._id,
    confirmedBy: null, tripoTaskId: null, createdAt: Date.now(), confirmedAt: null,
  });
  await appendEvent(ctx, room, { kind: 'propose', objectId, actor: member.displayName, memberId: member._id, commandId: a.commandId });
  if (wantsRetexture || wantsGenerate) {
    await ctx.db.patch(room._id, { tripoCount: room.tripoCount + 1 });
    const jobId = await ctx.db.insert('jobs', { roomId: room._id, kind: wantsRetexture ? 'retexture' : 'object', refId: objectId, provider: 'tripo', status: 'queued', attempts: 0, lastError: null, startedAt: null, finishedAt: null, createdAt: Date.now(), meta: { prompt: a.generatorPrompt, libraryKey: lib?.key ?? null, details: a.details } });
    await ctx.scheduler.runAfter(0, internal.generate.run, { jobId });
  }
  return { objectId, modelReady: model === 'ready' };
}

/** While paused nothing changes in the room (the memory is resting); resume first. */
function notPaused(room: Doc<'rooms'>) {
  if (room.paused) throw new ConvexError({ code: 'PAUSED', message: 'The memory is paused. Resume it first.' });
}

/** Explicitly accepted sample props for rehearsing the correction loop. Never placed in a personal room. */
export const practiceCourtyard = mutation({
  args: { code: v.string(), token: v.string(), commandId: v.string() },
  handler: async (ctx, { code, token, commandId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family']);
    if (!room.demo) throw new ConvexError({ code: 'FORBIDDEN', message: 'Illustrative props are available only in a labeled sample room.' });
    if (await priorCommand(ctx, room._id, commandId)) return { duplicate: true };
    notPaused(room);
    if ((await ctx.db.query('objects').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).length) {
      throw new ConvexError({ code: 'STALE', message: 'This room already has objects. Use an empty sample room for the courtyard starter.' });
    }
    await ctx.db.patch(room._id, { layout: 'courtyard' });
    const props: { label: string; position: Vec3; yaw: number }[] = [
      { label: 'bench', position: [-2, 0, -3.3], yaw: .3 },
      { label: 'tree', position: [2, 0, -5.6], yaw: 0 },
      { label: 'gate', position: [0, 0, -8.5], yaw: 0 },
      { label: 'photograph', position: [-.55, 1.05, -.85], yaw: 0 },
    ];
    for (const p of props) if (!(await findLibrary(ctx, p.label))) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Run npm run seed:builtin before loading the courtyard starter.' });
    }
    for (const p of props) {
      const current = (await ctx.db.get(room._id))!;
      const result = await createObject(ctx, current, member, { label: p.label, details: [],
        where: 'Illustrative practice prop · independent of family photos', quote: '', utteranceId: null,
        anchor: { position: p.position, source: 'illustrative-practice' }, generatorPrompt: '', commandId: null });
      await ctx.db.patch(result.objectId, { status: 'confirmed', confirmedBy: member.displayName, confirmedAt: Date.now(), facingYaw: p.yaw });
      await appendEvent(ctx, (await ctx.db.get(room._id))!, { kind: 'confirm', objectId: result.objectId, actor: member.displayName, memberId: member._id, commandId: null });
    }
    await appendEvent(ctx, (await ctx.db.get(room._id))!, { kind: 'practice', objectId: null, actor: member.displayName, memberId: member._id, commandId });
    return { duplicate: false };
  },
});

/** Voice confirm/reject target: the pending ghost nearest the release ray within ~15 degrees, else the most recent. */
async function targetGhost(ctx: MutationCtx, roomId: Id<'rooms'>, pointer: Doc<'utterances'>['pointer']) {
  const ghosts = (await ctx.db.query('objects').withIndex('by_room', (q) => q.eq('roomId', roomId)).collect()).filter((o) => o.status === 'ghost');
  if (!ghosts.length) return null;
  if (pointer) {
    let best: { o: Doc<'objects'>; ang: number } | null = null;
    const [ox = 0, oy = 0, oz = 0] = pointer.origin; const [dx = 0, dy = 0, dz = 0] = pointer.direction;
    const dl = Math.hypot(dx, dy, dz) || 1;
    for (const o of ghosts) {
      const [px = 0, py = 0, pz = 0] = o.anchor.position;
      const vx = px - ox, vy = py + 0.4 - oy, vz = pz - oz; // aim at the object's middle, not its base
      const vl = Math.hypot(vx, vy, vz) || 1;
      const ang = Math.acos(Math.min(1, Math.max(-1, (vx * dx + vy * dy + vz * dz) / (vl * dl)))) * 180 / Math.PI;
      if (ang <= 15 && (!best || ang < best.ang)) best = { o, ang };
    }
    if (best) return best.o;
  }
  return ghosts.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

async function setStatus(ctx: MutationCtx, room: Doc<'rooms'>, member: Doc<'members'>, o: Doc<'objects'>, to: 'confirmed' | 'rejected', commandId: string | null) {
  if (o.status !== 'ghost') throw new ConvexError({ code: 'STALE', message: `That ${o.label} is already ${o.status}.` });
  await ctx.db.patch(o._id, to === 'confirmed' ? { status: to, confirmedBy: member.displayName, confirmedAt: Date.now() } : { status: to });
  await appendEvent(ctx, room, { kind: to === 'confirmed' ? 'confirm' : 'reject', objectId: o._id, actor: member.displayName, memberId: member._id, commandId, prevStatus: 'ghost' });
}

async function undoLast(ctx: MutationCtx, room: Doc<'rooms'>, member: Doc<'members'>, commandId: string | null, expectedEventId?: Id<'events'>) {
  const events = await ctx.db.query('events').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').take(200);
  const target = events.find((e) => ['propose', 'confirm', 'reject', 'correction'].includes(e.kind) && e.undoneBy === null);
  if (!target || !target.objectId) throw new ConvexError({ code: 'NOTHING_TO_UNDO', message: 'Nothing to undo.' });
  if (expectedEventId && target._id !== expectedEventId) throw new ConvexError({ code: 'STALE', message: 'The room changed; refresh and try again.' });
  const o = await ctx.db.get(target.objectId);
  if (!o) throw new ConvexError({ code: 'NOTHING_TO_UNDO', message: 'That object is gone.' });
  if (target.kind === 'correction' && target.correctionId) {
    const correction = await ctx.db.get(target.correctionId);
    if (!correction) throw new ConvexError({ code: 'STALE', message: 'That placement history is unavailable.' });
    await ctx.db.patch(o._id, { anchor: correction.beforeAnchor, facingYaw: correction.beforeYaw ?? undefined,
      lastCorrectionId: correction.beforeCorrectionId ?? undefined });
    const undoId = await appendEvent(ctx, room, { kind: 'undo', objectId: o._id, actor: member.displayName, memberId: member._id,
      commandId, undoes: target._id });
    await ctx.db.patch(target._id, { undoneBy: undoId });
    await ctx.db.patch(correction._id, { status: 'undone' });
    return { undone: target.kind, label: o.label };
  }
  const prev = o.status;
  const next = target.kind === 'propose' ? 'undone' : 'ghost';
  await ctx.db.patch(o._id, next === 'ghost' ? { status: next, confirmedBy: null, confirmedAt: null } : { status: next });
  const undoId = await appendEvent(ctx, room, { kind: 'undo', objectId: o._id, actor: member.displayName, memberId: member._id, commandId, prevStatus: prev, undoes: target._id });
  await ctx.db.patch(target._id, { undoneBy: undoId });
  return { undone: target.kind, label: o.label };
}

// ---------- public API (phone + headset) ----------

export const list = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token);
    const scopes = await activeScopes(ctx, room._id);
    const pending = (await ctx.db.query('corrections').withIndex('by_room', q => q.eq('roomId', room._id)).collect())
      .filter(p => p.status === 'pending' && p.baseRevision === room.revision);
    const rows = (await ctx.db.query('objects').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()).filter((o) => o.status === 'ghost' || o.status === 'confirmed');
    return Promise.all(rows.map(async (o) => {
      const u = o.utteranceId ? await ctx.db.get(o.utteranceId) : null;
      const edit = pending.find(p => p.objectId === o._id);
      const lastEdit = o.lastCorrectionId ? await ctx.db.get(o.lastCorrectionId) : null;
      const editSource = lastEdit?.utteranceId ? await ctx.db.get(lastEdit.utteranceId) : null;
      return {
        id: o._id, utteranceId: o.utteranceId, label: o.label, details: o.details, status: o.status, model: o.model, modelSource: o.modelSource, size: o.size, yaw: o.yaw,
        facingYaw: o.facingYaw ?? null,
        pendingCorrection: edit ? { id: edit._id, anchor: edit.proposedAnchor, facingYaw: edit.proposedYaw, description: edit.description } : null,
        correctionSource: lastEdit ? { description: lastEdit.description, actor: lastEdit.actor, at: lastEdit.createdAt,
          transcript: editSource?.transcript ?? null, speaker: editSource?.speaker ?? null,
          translation: editSource?.translation ?? null, language: editSource?.language ?? null,
          audioUrl: editSource?.audioFileId && scopes.has('voice_recording') ? await ctx.storage.getUrl(editSource.audioFileId) : null } : null,
        anchor: o.anchor, where: o.where, quote: o.quote, proposedBy: o.proposedBy, confirmedBy: o.confirmedBy, createdAt: o.createdAt, confirmedAt: o.confirmedAt,
        glbUrl: o.glbFileId ? await ctx.storage.getUrl(o.glbFileId) : null,
        hasStoredGlb: o.storedGlbFileId !== null,
        source: u ? { speaker: u.speaker, at: u.createdAt, transcript: u.transcript, translation: u.translation, language: u.language,
          audioUrl: u.audioFileId && scopes.has('voice_recording') ? await ctx.storage.getUrl(u.audioFileId) : null } : null,
      };
    }));
  },
});

export const events = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token);
    const rows = await ctx.db.query('events').withIndex('by_room', (q) => q.eq('roomId', room._id)).order('desc').take(50);
    return Promise.all(rows.map(async (e) => ({ id: e._id, kind: e.kind, actor: e.actor, at: e.at, revision: e.revision, undone: e.undoneBy !== null,
      label: e.objectId ? (await ctx.db.get(e.objectId))?.label ?? null : null })));
  },
});

export const proposeFromPhone = mutation({
  args: { code: v.string(), token: v.string(), label: v.string(), commandId: v.string(), anchor: v.optional(anchorV) },
  handler: async (ctx, { code, token, label, commandId, anchor }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family']);
    const prior = await priorCommand(ctx, room._id, commandId);
    if (prior) return { objectId: prior.objectId, duplicate: true };
    notPaused(room);
    const clean = label.trim().toLowerCase();
    if (!/^[a-z][a-z' -]{0,39}$/.test(clean)) throw new ConvexError({ code: 'BAD_LABEL', message: 'Use plain words for the object name.' });
    const lib = await findLibrary(ctx, clean);
    const current = room.layout === 'courtyard' ? await ctx.db.query('objects').withIndex('by_room', q => q.eq('roomId',room._id)).collect() : [];
    const pos = anchor?.position ?? (room.layout === 'courtyard'
      ? storyPlacement(lib?.size ?? DEFAULT_SIZE, current.filter(o => o.status === 'confirmed' || o.status === 'ghost'))
      : [0,0,-1.6] as Vec3);
    if (!pos) throw new ConvexError({code:'NO_CLEAR_SPACE',message:'There is no clear floor space for another suggestion. Remove a suggestion or arrange the existing objects first.'});
    const r = await createObject(ctx, room, member, { label: clean, details: [], where: '', quote: clean, utteranceId: null,
      anchor: { position: pos as Vec3, source: anchor ? anchor.source : room.layout === 'courtyard' ? 'suggested-layout' : 'phone' }, generatorPrompt: `${clean}, single physical object, plain background`, commandId });
    return { objectId: r.objectId, duplicate: false };
  },
});

export const confirm = mutation({
  args: { code: v.string(), token: v.string(), objectId: v.id('objects'), commandId: v.string() },
  handler: async (ctx, { code, token, objectId, commandId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    if (await priorCommand(ctx, room._id, commandId)) return { ok: true, duplicate: true };
    notPaused(room);
    const o = await ctx.db.get(objectId);
    if (!o || o.roomId !== room._id) throw new ConvexError({ code: 'NOT_FOUND', message: 'No such object in this room.' });
    await setStatus(ctx, room, member, o, 'confirmed', commandId);
    return { ok: true };
  },
});

export const reject = mutation({
  args: { code: v.string(), token: v.string(), objectId: v.id('objects'), commandId: v.string() },
  handler: async (ctx, { code, token, objectId, commandId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    if (await priorCommand(ctx, room._id, commandId)) return { ok: true, duplicate: true };
    notPaused(room);
    const o = await ctx.db.get(objectId);
    if (!o || o.roomId !== room._id) throw new ConvexError({ code: 'NOT_FOUND', message: 'No such object in this room.' });
    await setStatus(ctx, room, member, o, 'rejected', commandId);
    return { ok: true };
  },
});

export const undo = mutation({
  args: { code: v.string(), token: v.string(), commandId: v.string(), expectedEventId: v.optional(v.id('events')) },
  handler: async (ctx, { code, token, commandId, expectedEventId }) => {
    const { room, member } = await requireMember(ctx, code, token, ['family', 'storyteller']);
    if (await priorCommand(ctx, room._id, commandId)) return { duplicate: true };
    notPaused(room);
    return undoLast(ctx, room, member, commandId, expectedEventId);
  },
});

// ---------- internal (called by ai.ts / generate.ts after validation) ----------

/** Apply validated actions for one utterance. When paused, only resume-safe bookkeeping happens. */
export const applyActions = internalMutation({
  args: { utteranceId: v.id('utterances'), actions: v.any(), reply: v.string(), replyTranslation: v.optional(v.string()), aiMode: v.string(), aiMs: v.number(), dropped: v.array(v.string()), language: v.union(v.string(), v.null()), translation: v.union(v.string(), v.null()) },
  handler: async (ctx, a) => {
    const u = await ctx.db.get(a.utteranceId);
    if (!u || u.status !== 'pending') return;
    const room = await ctx.db.get(u.roomId);
    const member = await ctx.db.get(u.memberId);
    if (!room || !member) return;
    const actions = a.actions as AppAction[];
    let intent: string = actions[0]?.type ?? 'none';
    let say: string | null = null;
    let proposedAny = false;
    const notes = [...a.dropped];
    if (room.paused && intent !== 'pause_session') {
      notes.push('room paused: actions ignored');
      intent = 'none';
    } else {
      let i = 0;
      for (const act of actions) {
        try {
          if (act.type === 'propose_object') {
            const p = act as ProposeAction;
            const current = await ctx.db.query('objects').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect();
            const dup = current.find((o) => o.status === 'ghost' && o.label === p.label);
            if (dup) { proposedAny = true; notes.push(`already showing a ${p.label}`); continue; }
            // On a table/seat/shelf only when the words mean "on" (any language: Claude's relation), or for small
            // objects (radio, teapot, clock…) when the ray met a surface; furniture stands on the floor.
            const lib = await findLibrary(ctx, p.label);
            const onSurface = p.relation === 'on' || (lib !== null && lib.size <= 0.5);
            // Without a pointing ray, choose only a clear provisional floor slot. Model anchor/relation fields
            // must not invent a support, bypass bounds, or leave a prop stranded when its supposed support moves.
            const suggested = !u.pointer && room.layout === 'courtyard'
              ? storyPlacement(lib?.size ?? DEFAULT_SIZE,current.filter(o => o.status === 'confirmed' || o.status === 'ghost')) : undefined;
            if (suggested === null) { notes.push('No clear floor space for a visual suggestion. Your words are saved.'); continue; }
            const r = await createObject(ctx, (await ctx.db.get(room._id))!, member, { label: p.label, details: p.details, where: p.where, quote: p.quote, utteranceId: u._id,
              anchor: suggested
                ? { position: suggested, source: 'suggested-layout' }
                : anchorFrom(u.pointer, i++, onSurface), generatorPrompt: p.generatorPrompt, commandId: null });
            proposedAny = true;
            // The code-built say-back is English-only; for other languages the companion's own reply (in the
            // storyteller's language) does the acknowledging.
            if (!a.language || a.language === 'en') say ??= sayBack(p.label, p.where, r.modelReady);
          } else if (act.type === 'confirm_pending' || act.type === 'reject_pending') {
            if (await settlePendingCorrection(ctx, (await ctx.db.get(room._id))!, member, act.type === 'confirm_pending')) continue;
            const o = await targetGhost(ctx, room._id, u.pointer);
            if (!o) { notes.push('no pending object to ' + (act.type === 'confirm_pending' ? 'confirm' : 'reject')); continue; }
            await setStatus(ctx, (await ctx.db.get(room._id))!, member, o, act.type === 'confirm_pending' ? 'confirmed' : 'rejected', null);
          } else if (act.type === 'undo_last') {
            await undoLast(ctx, (await ctx.db.get(room._id))!, member, null);
          } else if (act.type === 'pause_session') {
            const fresh = (await ctx.db.get(room._id))!;
            if (!fresh.paused) { await ctx.db.patch(room._id, { paused: true }); await appendEvent(ctx, fresh, { kind: 'pause', objectId: null, actor: member.displayName, memberId: member._id, commandId: null }); }
          }
        } catch (e) {
          notes.push(e instanceof ConvexError ? String((e.data as { message?: string }).message ?? e.data) : String(e));
        }
      }
    }
    if (intent === 'propose_object' && !proposedAny) intent = 'none';
    const silent = room.paused && intent !== 'pause_session';
    await ctx.db.patch(u._id, { status: 'done', intent, reply: silent ? null : a.reply, replyTranslation: silent ? null : a.replyTranslation || null, sayBack: say, aiMode: a.aiMode, aiMs: a.aiMs, dropped: notes, language: a.language, translation: a.translation });
  },
});

/** A finished model: swap it in only while the object is still a ghost; after confirm, store it (never swap). */
export const attachModel = internalMutation({
  args: { objectId: v.id('objects'), fileId: v.id('_storage'), source: v.string(), taskId: v.union(v.string(), v.null()) },
  handler: async (ctx, { objectId, fileId, source, taskId }) => {
    const o = await ctx.db.get(objectId);
    if (!o) return { swapped: false, gone: true }; // the caller deletes the orphaned file
    if (o.status === 'ghost') {
      await ctx.db.patch(objectId, { glbFileId: fileId, model: 'ready', modelSource: source, tripoTaskId: taskId, ...(source === 'tripo' ? { size: o.size, yaw: 0 } : {}) });
      return { swapped: true };
    }
    await ctx.db.patch(objectId, { storedGlbFileId: fileId, model: o.glbFileId ? 'ready' : 'failed', tripoTaskId: taskId });
    return { swapped: false };
  },
});

export const markModelFailed = internalMutation({
  args: { objectId: v.id('objects'), error: v.string() },
  handler: async (ctx, { objectId }) => {
    const o = await ctx.db.get(objectId);
    if (o) await ctx.db.patch(objectId, { model: o.glbFileId ? 'ready' : 'failed' });
  },
});
