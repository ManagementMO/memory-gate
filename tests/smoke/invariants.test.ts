// Room invariants (CLAUDE.md "Invariants (tests enforce)"), on mocks, in-process.
//
// Extraction path: every spoken turn here goes through the real scheduler-triggered internal.ai.extract (convex-test
// runs the 'use node' action in-process; ai.live is false, so mockExtract -> validate -> internal.objects.applyActions).
// Model arrival is simulated by calling internal.objects.attachModel directly (what generate.run does after Tripo).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { PAUSE_REPLY } from '../../packages/shared/src/contract';
import { OWNER, STORYTELLER, cid, drain, expectConvexError, fileExists, latestUndoable, newT, propose, roomDoc, rows, say, setupRoom, storeBlob } from './helpers';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const byId = async (t: ReturnType<typeof newT>, code: string, token: string, id: string) => (await t.query(api.objects.list, { code, token })).find((o) => o.id === id);

describe('models: swap only while a ghost', () => {
  test('a GLB arriving while a ghost is swapped in; after confirm it is stored, never swapped', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { library: ['piano'] });
    const libraryPiano = await t.run(async (ctx) => (await ctx.db.query('library').withIndex('by_key', (q) => q.eq('key', 'piano')).unique())!.fileId);

    // Not in the library and objects.live is off: a placeholder ghost, and no Tripo job.
    const clock = await propose(t, code, owner, 'Mantel Clock');
    expect(await byId(t, code, owner, clock)).toMatchObject({ label: 'mantel clock', status: 'ghost', model: 'placeholder', modelSource: 'placeholder', glbUrl: null });
    expect(await rows(t, code, 'jobs')).toEqual([]);
    const glb1 = await storeBlob(t, 'generated clock GLB', 'model/gltf-binary');
    expect(await t.mutation(internal.objects.attachModel, { objectId: clock, fileId: glb1, source: 'tripo', taskId: 'task-clock' })).toEqual({ swapped: true });
    expect(await byId(t, code, owner, clock)).toMatchObject({ status: 'ghost', model: 'ready', modelSource: 'tripo', glbUrl: expect.any(String), hasStoredGlb: false });

    // A library piano, confirmed, then a personalized model arrives late: stored only, the confirmed look never changes.
    const said = await say(t, code, teller, 'There was a piano under the window');
    expect(said.intent).toBe('propose_object');
    const piano = (await t.query(api.objects.list, { code, token: owner })).find((o) => o.label === 'piano')!;
    await t.mutation(api.objects.confirm, { code, token: owner, objectId: piano.id, commandId: cid() });
    const glb2 = await storeBlob(t, 'retextured piano GLB', 'model/gltf-binary');
    expect(await t.mutation(internal.objects.attachModel, { objectId: piano.id, fileId: glb2, source: 'retexture', taskId: 'task-piano' })).toEqual({ swapped: false });
    expect(await byId(t, code, owner, piano.id)).toMatchObject({ status: 'confirmed', model: 'ready', modelSource: 'library', glbUrl: piano.glbUrl, hasStoredGlb: true, anchor: piano.anchor, size: piano.size });
    const raw = (await rows(t, code, 'objects')).find((o) => o._id === piano.id)!;
    expect(raw.glbFileId).toBe(libraryPiano);
    expect(raw.storedGlbFileId).toBe(glb2);
    expect(await fileExists(t, glb2)).toBe(true);

    // A confirmed placeholder keeps its placeholder; the late GLB is stored, not shown.
    const lamp = await propose(t, code, owner, 'lamp');
    await t.mutation(api.objects.confirm, { code, token: teller, objectId: lamp, commandId: cid() });
    const glb3 = await storeBlob(t, 'late lamp GLB', 'model/gltf-binary');
    expect(await t.mutation(internal.objects.attachModel, { objectId: lamp, fileId: glb3, source: 'tripo', taskId: 'task-lamp' })).toEqual({ swapped: false });
    expect(await byId(t, code, owner, lamp)).toMatchObject({ status: 'confirmed', modelSource: 'placeholder', glbUrl: null, hasStoredGlb: true });
  });
});

describe('pause', () => {
  test('paused: actions are ignored (no objects, no companion reply); a pause intent pauses; resume restores', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { library: ['piano', 'radio'] });

    // The phone's Pause button. Retrying the same command is a no-op; pausing twice is "unchanged".
    const pauseCmd = cid();
    expect(await t.mutation(api.rooms.setPaused, { code, token: owner, paused: true, commandId: pauseCmd })).toEqual({ ok: true });
    expect(await t.mutation(api.rooms.setPaused, { code, token: owner, paused: true, commandId: pauseCmd })).toEqual({ ok: true, duplicate: true });
    expect(await t.mutation(api.rooms.setPaused, { code, token: owner, paused: true, commandId: cid() })).toEqual({ ok: true, unchanged: true });
    expect((await t.query(api.rooms.get, { code, token: teller })).room.paused).toBe(true);

    const ignored = await say(t, code, teller, 'There was a piano under the window');
    // While paused the line is kept but never sent to the AI (review fix 05:20): no intent, no reply.
    expect(ignored).toMatchObject({ status: 'done', intent: null, reply: null, sayBack: null });
    expect(ignored.dropped).toContain('room paused: not sent to the AI');
    expect(await rows(t, code, 'objects')).toEqual([]);

    // Resume restores the story.
    expect(await t.mutation(api.rooms.setPaused, { code, token: owner, paused: false, commandId: cid() })).toEqual({ ok: true });
    const proposed = await say(t, code, teller, 'There was a piano under the window');
    expect(proposed.intent).toBe('propose_object');
    const [piano] = await t.query(api.objects.list, { code, token: owner });
    expect(piano).toMatchObject({ label: 'piano', status: 'ghost' });

    // "I'm tired" from the storyteller maps to pause_session: the room pauses and the companion only thanks them.
    const tired = await say(t, code, teller, "I'm feeling a little tired now. Can we stop for today?");
    expect(tired).toMatchObject({ intent: 'pause_session', reply: PAUSE_REPLY, sayBack: null });
    expect((await t.query(api.rooms.get, { code, token: owner })).room.paused).toBe(true);
    const pauses = () => rows(t, code, 'events').then((ev) => ev.filter((e) => e.kind === 'pause'));
    expect((await pauses()).map((e) => e.actor)).toEqual([OWNER, STORYTELLER]);

    // While paused, a voice confirm does nothing; another pause intent is harmless (no second event).
    // (Since the 05:20 review fix, a paused room keeps the line but never sends it to the AI.)
    const yes = await say(t, code, teller, "Yes, that's it.");
    expect(yes).toMatchObject({ intent: null, reply: null });
    expect((await t.query(api.objects.list, { code, token: owner }))[0]).toMatchObject({ status: 'ghost' });
    const stop = await say(t, code, teller, 'Stop, please.');
    expect(stop.intent).toBe(null);
    expect(await pauses()).toHaveLength(2);
    // Buttons can't change the resting room either: the phone's confirm is refused until resume.
    const ghostId = (await t.query(api.objects.list, { code, token: owner }))[0]!.id;
    await expect(t.mutation(api.objects.confirm, { code, token: owner, objectId: ghostId, commandId: cid() })).rejects.toThrow(/PAUSED/);

    // Resume, and the same "yes" now confirms the pending ghost.
    await t.mutation(api.rooms.setPaused, { code, token: teller, paused: false, commandId: cid() });
    expect((await say(t, code, teller, "Yes, that's it.")).intent).toBe('confirm_pending');
    expect((await t.query(api.objects.list, { code, token: owner }))[0]).toMatchObject({ label: 'piano', status: 'confirmed', confirmedBy: STORYTELLER });
    expect((await rows(t, code, 'events')).map((e) => e.kind)).toEqual(['consent', 'pause', 'resume', 'propose', 'pause', 'resume', 'confirm']);
  });
});

describe('commands and undo', () => {
  test('commandId makes confirm and proposeFromPhone idempotent (and undo, and utterances)', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { library: ['chair'] });

    const proposeCmd = cid();
    const a = await t.mutation(api.objects.proposeFromPhone, { code, token: owner, label: 'chair', commandId: proposeCmd });
    const b = await t.mutation(api.objects.proposeFromPhone, { code, token: owner, label: 'chair', commandId: proposeCmd });
    expect(a).toEqual({ objectId: expect.any(String), duplicate: false });
    expect(b).toEqual({ objectId: a.objectId, duplicate: true });
    expect(await rows(t, code, 'objects')).toHaveLength(1);
    expect((await byId(t, code, owner, a.objectId!))).toMatchObject({ label: 'chair', status: 'ghost', model: 'ready', modelSource: 'library', proposedBy: OWNER, quote: 'chair', source: null });

    const confirmCmd = cid();
    expect(await t.mutation(api.objects.confirm, { code, token: teller, objectId: a.objectId!, commandId: confirmCmd })).toEqual({ ok: true });
    const revision = (await roomDoc(t, code))!.revision;
    expect(await t.mutation(api.objects.confirm, { code, token: teller, objectId: a.objectId!, commandId: confirmCmd })).toEqual({ ok: true, duplicate: true });
    expect((await roomDoc(t, code))!.revision).toBe(revision); // the retry changed nothing
    // A *new* command on an already-confirmed object is stale, not a silent second confirm.
    await expectConvexError(t.mutation(api.objects.confirm, { code, token: owner, objectId: a.objectId!, commandId: cid() }), 'STALE');
    expect((await rows(t, code, 'events')).filter((e) => e.kind === 'confirm')).toHaveLength(1);

    const undoCmd = cid();
    expect(await t.mutation(api.objects.undo, { code, token: owner, commandId: undoCmd })).toEqual({ undone: 'confirm', label: 'chair' });
    expect(await t.mutation(api.objects.undo, { code, token: owner, commandId: undoCmd })).toEqual({ duplicate: true });
    expect((await byId(t, code, owner, a.objectId!))?.status).toBe('ghost'); // undone once, not twice

    const sayCmd = cid();
    const u1 = await t.mutation(api.utterances.add, { code, token: teller, transcript: 'We had a chair by the door', source: 'stt', commandId: sayCmd });
    const u2 = await t.mutation(api.utterances.add, { code, token: teller, transcript: 'We had a chair by the door', source: 'stt', commandId: sayCmd });
    expect(u2).toEqual({ utteranceId: u1.utteranceId, duplicate: true });
    await drain(t);
    expect(await rows(t, code, 'utterances')).toHaveLength(1);
  });

  test('a stale undo (wrong expectedEventId) is rejected with STALE and changes nothing', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { library: ['radio'] });
    const { objectId } = await t.mutation(api.objects.proposeFromPhone, { code, token: owner, label: 'radio', commandId: cid() });
    const seenByPhone = await latestUndoable(t, code, owner); // the phone renders "Undo: suggested radio"
    await t.mutation(api.objects.confirm, { code, token: teller, objectId: objectId!, commandId: cid() }); // meanwhile, the headset confirms

    const before = await rows(t, code, 'events');
    await expectConvexError(t.mutation(api.objects.undo, { code, token: owner, commandId: cid(), expectedEventId: seenByPhone }), 'STALE');
    expect(await rows(t, code, 'events')).toEqual(before);
    expect((await byId(t, code, owner, objectId!))?.status).toBe('confirmed');

    const current = await latestUndoable(t, code, owner);
    expect(current).not.toBe(seenByPhone);
    expect(await t.mutation(api.objects.undo, { code, token: owner, commandId: cid(), expectedEventId: current })).toEqual({ undone: 'confirm', label: 'radio' });
    expect((await byId(t, code, owner, objectId!))?.status).toBe('ghost');
  });

  test('voice confirm/reject acts on the ghost nearest the ray within ~15 degrees, else the most recent; confirm never moves it', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { library: ['piano', 'radio'] });
    await say(t, code, teller, 'There was a piano under the window', { pointer: { origin: [0, 1.5, 0], direction: [-0.5, -0.4, -1], hit: [-1, 0, -2], source: 'controller' } });
    vi.setSystemTime(Date.now() + 5_000); // distinct createdAt, so "most recent" really means the radio
    await say(t, code, teller, 'There was a radio on the table', { pointer: { origin: [0, 1.5, 0], direction: [0.6, -0.3, -1], hit: [1, 0.74, -1.5], source: 'controller' } });
    const before = await t.query(api.objects.list, { code, token: owner });
    expect(before.map((o) => `${o.label}:${o.status}`)).toEqual(['piano:ghost', 'radio:ghost']);
    expect(before[1]!.createdAt).toBeGreaterThan(before[0]!.createdAt);

    // Aimed at the piano's middle (the older ghost): the piano is confirmed, not the more recent radio.
    const yes = await say(t, code, teller, "Yes, that's it, right there.", { pointer: { origin: [0, 1.5, 0], direction: [-1, -1.1, -2], hit: null, source: 'controller' } });
    expect(yes.intent).toBe('confirm_pending');
    let now = await t.query(api.objects.list, { code, token: owner });
    expect(now.map((o) => `${o.label}:${o.status}`)).toEqual(['piano:confirmed', 'radio:ghost']);
    expect(now.map((o) => o.anchor)).toEqual(before.map((o) => o.anchor));

    // A ray that points at nothing (the ceiling) falls back to the most recent pending ghost: a newer second piano.
    vi.setSystemTime(Date.now() + 5_000);
    await say(t, code, teller, 'There was a piano under the window');
    const ghosts = (await t.query(api.objects.list, { code, token: owner })).filter((o) => o.status === 'ghost');
    expect(ghosts.map((o) => o.label).sort()).toEqual(['piano', 'radio']);
    const newest = [...ghosts].sort((x, y) => y.createdAt - x.createdAt)[0]!;
    expect(newest.label).toBe('piano');
    expect((await say(t, code, teller, "No, that wasn't there.", { pointer: { origin: [0, 1.5, 0], direction: [0, 1, 0], hit: null, source: 'head' } })).intent).toBe('reject_pending');
    expect((await rows(t, code, 'objects')).map((o) => `${o.label}:${o.status}`)).toEqual(['piano:confirmed', 'radio:ghost', 'piano:rejected']);

    // No ray at all: the most recent pending ghost (now the radio) is rejected.
    expect((await say(t, code, teller, "No, that wasn't there.")).intent).toBe('reject_pending');
    now = await t.query(api.objects.list, { code, token: owner });
    expect(now.map((o) => `${o.label}:${o.status}`)).toEqual(['piano:confirmed']);
    expect((await rows(t, code, 'objects')).map((o) => `${o.label}:${o.status}`)).toEqual(['piano:confirmed', 'radio:rejected', 'piano:rejected']);

    // "Take that back" undoes exactly the reject.
    expect((await say(t, code, teller, 'Oh, take that back.')).intent).toBe('undo_last');
    expect((await t.query(api.objects.list, { code, token: owner })).map((o) => `${o.label}:${o.status}`)).toEqual(['piano:confirmed', 'radio:ghost']);
  });
});

describe('admin', () => {
  test('reset demo room clears objects, events, utterances and non-splat jobs; keeps room, members, consents, splat', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { scopes: ['photo_processing', 'voice_processing', 'voice_recording'] });
    const libraryPiano = await t.run(async (ctx) => (await ctx.db.query('library').withIndex('by_key', (q) => q.eq('key', 'piano')).unique())!.fileId);
    const clip = await storeBlob(t, 'RIFF clip', 'audio/wav');
    await say(t, code, teller, 'There was a piano under the window', { audioFileId: clip });
    const piano = (await t.query(api.objects.list, { code, token: owner }))[0]!;
    await t.mutation(api.objects.confirm, { code, token: owner, objectId: piano.id, commandId: cid() });
    const lateGlb = await storeBlob(t, 'late piano GLB (arrived after confirm)', 'model/gltf-binary');
    expect(await t.mutation(internal.objects.attachModel, { objectId: piano.id, fileId: lateGlb, source: 'retexture', taskId: 'task-2' })).toEqual({ swapped: false });
    const { objectId: clock } = await t.mutation(api.objects.proposeFromPhone, { code, token: owner, label: 'clock', commandId: cid() });
    const clockGlb = await storeBlob(t, 'generated clock GLB', 'model/gltf-binary');
    await t.mutation(internal.objects.attachModel, { objectId: clock!, fileId: clockGlb, source: 'tripo', taskId: 'task-1' });
    const roomId = (await roomDoc(t, code))!._id;
    await t.run(async (ctx) => {
      const job = { roomId, attempts: 1, lastError: null, startedAt: 1, finishedAt: 2, createdAt: 1 };
      await ctx.db.insert('jobs', { ...job, kind: 'object', refId: clock!, provider: 'tripo', status: 'done' });
      await ctx.db.insert('jobs', { ...job, kind: 'retexture', refId: piano.id, provider: 'tripo', status: 'failed' });
      await ctx.db.insert('jobs', { ...job, kind: 'splat', refId: 'splat-history', provider: 'modal', status: 'done' });
      await ctx.db.patch(roomId, { tripoCount: 3 });
    });
    await t.mutation(api.rooms.open, { code, token: owner });
    await t.mutation(api.rooms.setPaused, { code, token: owner, paused: true, commandId: cid() });
    const kept = { members: await rows(t, code, 'members'), consents: await rows(t, code, 'consents'), splats: await rows(t, code, 'splats'), splat: (await t.query(api.rooms.get, { code, token: owner })).splat };

    await expectConvexError(t.mutation(api.rooms.resetDemo, { code, token: teller }), 'FORBIDDEN');
    await t.mutation(api.rooms.resetDemo, { code, token: owner });

    expect(await rows(t, code, 'objects')).toEqual([]);
    expect(await rows(t, code, 'utterances')).toEqual([]);
    // Every earlier event is gone; reset appends exactly one 'reset' event of its own.
    expect((await rows(t, code, 'events')).map((e) => `${e.kind}:${e.actor}`)).toEqual([`reset:${OWNER}`]);
    expect((await rows(t, code, 'jobs')).map((j) => j.kind)).toEqual(['splat']); // splat build history is kept
    expect(await fileExists(t, clip)).toBe(false);
    expect(await fileExists(t, clockGlb)).toBe(false);
    expect(await fileExists(t, lateGlb)).toBe(false); // stored late GLBs go too (fixed in rooms.resetDemo)
    expect(await fileExists(t, libraryPiano)).toBe(true); // the shared library survives
    expect(await rows(t, code, 'members')).toEqual(kept.members);
    expect(await rows(t, code, 'consents')).toEqual(kept.consents);
    expect(await rows(t, code, 'splats')).toEqual(kept.splats);
    const view = await t.query(api.rooms.get, { code, token: owner });
    expect(view.room).toMatchObject({ code, paused: false, openedAt: null });
    expect(view.splat).toEqual(kept.splat);
    expect((await roomDoc(t, code))!.tripoCount).toBe(0);
    expect(await t.query(api.objects.list, { code, token: owner })).toEqual([]);
    expect(await t.query(api.utterances.recent, { code, token: owner })).toEqual([]);
    expect(await t.query(api.splats.jobs, { code, token: owner })).toMatchObject([{ kind: 'splat' }]);

    // The room works again right away (same code, same tokens).
    expect((await say(t, code, teller, 'There was a piano under the window')).intent).toBe('propose_object');
    expect((await t.query(api.objects.list, { code, token: owner })).map((o) => `${o.label}:${o.status}`)).toEqual(['piano:ghost']);
  });

  test('delete this memory: needs the typed code; then every row and file of the room is gone, shared assets stay', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { scopes: ['photo_processing', 'voice_processing', 'voice_recording'] });
    const shared = await t.run(async (ctx) => [...(await ctx.db.query('library').collect()).map((l) => l.fileId), ...(await ctx.db.query('assets').collect()).map((a) => a.fileId)]);
    const photoFile = await storeBlob(t, 'JPEG', 'image/jpeg');
    await t.mutation(api.splats.addPhoto, { code, token: owner, fileId: photoFile, width: 640, height: 480, tone: 'sepia', credit: 'Shared by Karen (test)' });
    await drain(t);
    const clip = await storeBlob(t, 'RIFF clip', 'audio/wav');
    await say(t, code, teller, 'There was a piano under the window', { audioFileId: clip });
    const { objectId } = await t.mutation(api.objects.proposeFromPhone, { code, token: owner, label: 'clock', commandId: cid() });
    const glb = await storeBlob(t, 'clock GLB', 'model/gltf-binary');
    await t.mutation(internal.objects.attachModel, { objectId: objectId!, fileId: glb, source: 'tripo', taskId: null });

    await expectConvexError(t.mutation(api.consents.deleteMemory, { code, token: owner, confirmText: 'WRONG1' }), 'CONFIRM');
    expect(await t.query(api.objects.list, { code, token: owner })).toHaveLength(2);
    expect(await t.mutation(api.consents.deleteMemory, { code, token: owner, confirmText: ` ${code.toLowerCase()} ` })).toEqual({ deleted: true });

    await expectConvexError(t.query(api.rooms.get, { code, token: owner }), 'ROOM_NOT_FOUND');
    for (const f of [photoFile, clip, glb]) expect(await fileExists(t, f)).toBe(false);
    for (const f of shared) expect(await fileExists(t, f)).toBe(true);
    const left = await t.run(async (ctx) => {
      const counts: Record<string, number> = {};
      for (const table of ['rooms', 'members', 'consents', 'photos', 'splats', 'utterances', 'objects', 'events', 'jobs'] as const) counts[table] = (await ctx.db.query(table).collect()).length;
      return counts;
    });
    expect(left).toEqual({ rooms: 0, members: 0, consents: 0, photos: 0, splats: 0, utterances: 0, objects: 0, events: 0, jobs: 0 });
  });
});
