// Smoke test = the definition of working (CLAUDE.md robustness rule 2), on mocks, in-process.
//
// Extraction path: utterances.add schedules internal.ai.extract (a 'use node' action that imports
// @anthropic-ai/sdk). convex-test 0.0.61 ignores 'use node' and runs the action in the same edge-runtime VM, so the
// REAL scheduler-triggered path runs here: forExtraction -> mockExtract (ai.live is false) -> validate ->
// internal.objects.applyActions. Only the Spanish test below calls internal.objects.applyActions directly (the mock
// never translates), with a hand-written ExtractionResult that still goes through validate().
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { validate, safeDisplay, type ExtractionResult } from '../../packages/shared/src/contract';
import { FLAG_NAMES } from '../../packages/shared/src/flags';
import { OWNER, STORYTELLER, cid, drain, expectConvexError, latestUndoable, newT, rows, say, seedLibrary, seedSampleSplat, storeBlob, setupRoom } from './helpers';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('happy path', () => {
  test('create -> join storyteller -> consent -> prebaked splat -> "piano under the window" -> ghost -> confirm -> undo -> undo', async () => {
    const t = newT();
    const sampleFile = await seedSampleSplat(t);
    await seedLibrary(t, ['piano']);

    // 1. The family member creates the room on the phone and owns it.
    const { code, token } = await t.mutation(api.rooms.create, { title: 'Front room, 1938 (sample)', displayName: OWNER });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); // 6 chars, no look-alikes
    expect(token.length).toBeGreaterThanOrEqual(32);

    // 2. The headset joins as the storyteller (codes are case-insensitive).
    const key = (await t.query(api.rooms.get, { code, token })).joinKey!;
    expect(key).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const teller = await t.mutation(api.rooms.join, { code: code.toLowerCase(), displayName: STORYTELLER, role: 'storyteller', key: key.toLowerCase() });
    expect(teller.code).toBe(code);

    // 3. Consent first: unknown scopes are dropped, the rest recorded with who gave them.
    const consentId = await t.mutation(api.consents.give, { code, token, scopes: ['photo_processing', 'voice_processing', 'share_with_family', 'not_a_scope'] });
    let view = await t.query(api.rooms.get, { code, token });
    expect(view.consents).toEqual([{ id: consentId, givenBy: OWNER, scopes: ['photo_processing', 'voice_processing', 'share_with_family'], createdAt: expect.any(Number) }]);
    expect(view.me).toEqual({ displayName: OWNER, role: 'family', isOwner: true });
    expect(view.members).toEqual(expect.arrayContaining([{ displayName: OWNER, role: 'family' }, { displayName: STORYTELLER, role: 'storyteller' }]));
    for (const f of FLAG_NAMES) expect(view.flags[f], `flag ${f} must be false in tests`).toBe(false);

    // 4. The room starts on the prebaked sample splat (a stored blob, served by URL).
    expect(view.splat).toMatchObject({ status: 'ready', source: 'prebaked', numSplats: 500000, floorY: -1.19, scale: 1 });
    expect(view.splat?.url).toEqual(expect.any(String));
    const splatRow = (await rows(t, code, 'splats'))[0];
    expect(splatRow?.fileId).toBe(sampleFile);

    // 5. The storyteller speaks; the release-time ray hit a spot by the window.
    const transcript = 'There was a piano under the window';
    const pointer = { origin: [0, 1.5, 0], direction: [-0.5, -0.4, -1], hit: [-1, 0, -2], source: 'controller' };
    const u = await say(t, code, teller.token, transcript, { pointer, durationMs: 2100 });
    expect(u).toMatchObject({ status: 'done', intent: 'propose_object', aiMode: 'mock', speaker: STORYTELLER, transcript, source: 'stt', translation: null, audioUrl: null });
    expect(u.sayBack).toBe('A piano… under the window. Shall I keep it there?'); // built by code; model is ready
    expect(u.reply).toBe('What do you remember about the piano?');

    // 6. A ghost with the verbatim quote, placed once at proposal time.
    let list = await t.query(api.objects.list, { code, token });
    expect(list).toHaveLength(1);
    const ghost = list[0]!;
    expect(ghost).toMatchObject({ label: 'piano', status: 'ghost', model: 'ready', modelSource: 'library', where: 'under the window', proposedBy: STORYTELLER, confirmedBy: null, hasStoredGlb: false });
    expect(transcript.toLowerCase()).toContain(ghost.quote.toLowerCase());
    expect(ghost.anchor).toEqual({ position: [-1, 0, -2], source: 'controller' });
    expect(ghost.glbUrl).toEqual(expect.any(String));
    expect(ghost.source).toMatchObject({ speaker: STORYTELLER, at: u.createdAt, transcript, translation: null, audioUrl: null });

    // 7. The family member confirms on the phone.
    expect(await t.mutation(api.objects.confirm, { code, token, objectId: ghost.id, commandId: cid() })).toEqual({ ok: true });

    // 8. Everyone (here: the headset's token) sees it confirmed, with attribution; confirm never moves it.
    list = await t.query(api.objects.list, { code, token: teller.token });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ghost.id, status: 'confirmed', confirmedBy: OWNER, proposedBy: STORYTELLER, quote: ghost.quote, anchor: ghost.anchor, glbUrl: ghost.glbUrl });
    expect(list[0]!.confirmedAt).toEqual(expect.any(Number));
    expect(list[0]!.source).toMatchObject({ speaker: STORYTELLER, at: u.createdAt, transcript });

    // 9. Undo (with the phone's expectedEventId) reverts exactly the confirm: back to a ghost.
    const confirmEvent = await latestUndoable(t, code, token);
    expect(await t.mutation(api.objects.undo, { code, token, commandId: cid(), expectedEventId: confirmEvent })).toEqual({ undone: 'confirm', label: 'piano' });
    list = await t.query(api.objects.list, { code, token });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ghost.id, status: 'ghost', confirmedBy: null, confirmedAt: null, anchor: ghost.anchor });

    // 10. Undo again reverts the proposal: the object is undone and leaves the list.
    const proposeEvent = await latestUndoable(t, code, token);
    expect(proposeEvent).not.toBe(confirmEvent);
    expect(await t.mutation(api.objects.undo, { code, token, commandId: cid(), expectedEventId: proposeEvent })).toEqual({ undone: 'propose', label: 'piano' });
    expect(await t.query(api.objects.list, { code, token })).toEqual([]);
    expect((await rows(t, code, 'objects')).map((o) => o.status)).toEqual(['undone']);

    // The append-only log: each undo reverted exactly one event.
    const ev = await t.query(api.objects.events, { code, token });
    expect(ev.map((e) => `${e.kind}${e.label ? `:${e.label}` : ''}${e.undone ? '(undone)' : ''}`)).toEqual(['undo:piano', 'undo:piano', 'confirm:piano(undone)', 'propose:piano(undone)', 'consent']);
    expect(ev.map((e) => e.revision)).toEqual([5, 4, 3, 2, 1]);
    expect((await t.query(api.rooms.get, { code, token })).room.revision).toBe(5);
    await expectConvexError(t.mutation(api.objects.undo, { code, token, commandId: cid() }), 'NOTHING_TO_UNDO');
  });

  test('photo -> upload -> addPhoto -> splat queued -> prebaked fallback (splat.live off) -> ready and active', async () => {
    const t = newT();
    await seedSampleSplat(t);
    const { code, token } = await t.mutation(api.rooms.create, { title: 'Photo room (test)', displayName: OWNER });
    const firstSplat = (await t.query(api.rooms.get, { code, token })).splat?.id;

    // No upload without photo_processing consent.
    await expectConvexError(t.mutation(api.splats.generatePhotoUploadUrl, { code, token }), 'NO_CONSENT');
    await t.mutation(api.consents.give, { code, token, scopes: ['photo_processing'] });
    expect(await t.mutation(api.splats.generatePhotoUploadUrl, { code, token })).toEqual(expect.any(String));

    // The phone POSTs the normalized JPEG to that URL; here the bytes are stored directly (same storage id result).
    const fileId = await storeBlob(t, 'JPEG stand-in (8-bit sRGB, <=2048 px)', 'image/jpeg');
    const r = await t.mutation(api.splats.addPhoto, { code, token, fileId, width: 1600, height: 1200, tone: 'sepia', credit: 'Library of Congress, FSA/OWI, 1938 (sample, public domain)' });
    expect(r.live).toBe(false);
    let view = await t.query(api.rooms.get, { code, token });
    expect(view.recentSplats[0]).toMatchObject({ id: r.splatId, status: 'queued', source: 'prebaked' });
    expect(view.splat?.id).toBe(firstSplat); // still on the old room until the new one is ready

    await drain(t); // usePrebaked fires after its 2.5 s delay
    view = await t.query(api.rooms.get, { code, token });
    expect(view.recentSplats[0]).toMatchObject({ id: r.splatId, status: 'ready', source: 'prebaked', error: 'splat.live off' });
    expect(view.splat).toMatchObject({ id: r.splatId, status: 'ready', source: 'prebaked' });
    expect(view.splat?.url).toEqual(expect.any(String));
    const photo = (await rows(t, code, 'photos'))[0];
    expect(photo).toMatchObject({ fileId, width: 1600, height: 1200, tone: 'sepia', caption: null });
    expect(await t.query(api.splats.jobs, { code, token })).toEqual([]); // no GPU job without splat.live

    // An unknown tone is stored as 'muted'.
    const f2 = await storeBlob(t, 'JPEG 2', 'image/jpeg');
    await t.mutation(api.splats.addPhoto, { code, token, fileId: f2, width: 800, height: 600, tone: 'neon', credit: 'Shared by Karen (test)' });
    expect((await rows(t, code, 'photos')).map((p) => p.tone)).toEqual(['sepia', 'muted']);
  });

  test('a Spanish line keeps its own words and carries an English translation (direct applyActions path)', async () => {
    const t = newT();
    const { code, owner, teller } = await setupRoom(t, { library: ['piano'] });
    const transcript = 'Había un piano bajo la ventana.';
    const { utteranceId } = await t.mutation(api.utterances.add, { code, token: teller, transcript, source: 'stt', commandId: cid() });
    // What the live model returns for this line (V18-style); validate() still decides what survives.
    const out: ExtractionResult = {
      intent: 'propose_object',
      proposals: [{ object: 'piano', details: [], anchor: 'window', relation: 'under', where: 'bajo la ventana', quote: 'un piano bajo la ventana', confidence: 0.95 }],
      companion_reply: '¿Quién tocaba el piano?', reply_translation: '', language: 'es', translation: 'There was a piano under the window.',
      flags: { distress: false, private_info: false, instruction_like_text: false },
    };
    const val = validate(transcript, out);
    expect(val.dropped).toEqual([]);
    await t.mutation(internal.objects.applyActions, { utteranceId, actions: val.actions, reply: val.reply, aiMode: 'live', aiMs: 1800, dropped: val.dropped, language: 'es', translation: safeDisplay(out.translation) });
    await drain(t); // the scheduled extraction now finds the utterance done and does nothing

    const [u] = await t.query(api.utterances.recent, { code, token: owner });
    // The code-built say-back is English-only; the companion's reply (in Spanish) does the acknowledging.
    expect(u).toMatchObject({ transcript, language: 'es', translation: 'There was a piano under the window.', aiMode: 'live', intent: 'propose_object', reply: '¿Quién tocaba el piano?', sayBack: null });
    const list = await t.query(api.objects.list, { code, token: owner });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: 'piano', status: 'ghost', quote: 'un piano bajo la ventana', where: 'bajo la ventana' });
    expect(list[0]!.source).toMatchObject({ speaker: STORYTELLER, transcript, language: 'es', translation: 'There was a piano under the window.' });
  });
});
