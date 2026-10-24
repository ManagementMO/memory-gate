/// <reference types="vite/client" />
// Shared setup for the smoke tests. convex-test runs every function in-process; no flags rows exist, so every flag
// reads false (DEFAULT_FLAGS) and every provider takes its mock/fixture path. No network is touched.
import { convexTest } from 'convex-test';
import { expect, vi } from 'vitest';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { Scope } from '../../packages/shared/src/contract';

// Relative to this file; the extglob form from the docs finds nothing (CLAUDE.md "Convex -> Tests").
export const modules = import.meta.glob('../../convex/**/*.*s');
export const newT = () => convexTest(schema, modules);
export type T = ReturnType<typeof newT>;
export const cid = () => crypto.randomUUID();

export const OWNER = 'Karen (test)';
export const STORYTELLER = 'Grandma (sample)';
export type Pointer = { origin: number[]; direction: number[]; hit: number[] | null; source: string };

/** Mirrors scripts/seed.mjs (real keys, synonyms and sizes); the GLB bytes are stand-ins. */
export const LIBRARY = [
  { key: 'piano', synonyms: ['upright piano', 'old piano'], size: 1.45, yawOffset: -Math.PI / 2, source: 'tripo' },
  { key: 'armchair', synonyms: ['arm chair', 'easy chair', 'reading chair', 'big chair'], size: 0.95, yawOffset: 0, source: 'tripo' },
  { key: 'radio', synonyms: ['wireless', 'wooden radio', 'old radio'], size: 0.42, yawOffset: -Math.PI / 2, source: 'tripo' },
  { key: 'bowl of oranges', synonyms: ['oranges', 'orange', 'bowl', 'fruit bowl', 'bowl of fruit', 'fruit'], size: 0.3, yawOffset: 0, source: 'tripo' },
  { key: 'chair', synonyms: ['side chair', 'wooden chair', 'kitchen chair'], size: 0.85, yawOffset: 0, source: 'cc0' },
];
/** The keys mockExtract sees in production (utterances.forExtraction): keys + synonyms, letters and spaces only. */
export const LIBRARY_KEYS = LIBRARY.flatMap((l) => [l.key, ...l.synonyms]).filter((k) => /^[a-z ]+$/.test(k));

export async function storeBlob(t: T, body: string, type = 'application/octet-stream'): Promise<Id<'_storage'>> {
  return t.run((ctx) => ctx.storage.store(new Blob([body], { type })));
}

export async function fileExists(t: T, id: Id<'_storage'>): Promise<boolean> {
  return t.run(async (ctx) => (await ctx.storage.get(id)) !== null);
}

/** Library rows with stored stand-in GLBs. Returns key -> fileId. */
export async function seedLibrary(t: T, keys?: string[]): Promise<Record<string, Id<'_storage'>>> {
  const out: Record<string, Id<'_storage'>> = {};
  for (const l of LIBRARY.filter((x) => !keys || keys.includes(x.key))) {
    const fileId = await storeBlob(t, `glTF stand-in for ${l.key}`, 'model/gltf-binary');
    await t.run((ctx) => ctx.db.insert('library', { key: l.key, synonyms: l.synonyms, fileId, size: l.size, yawOffset: l.yawOffset, source: l.source, credit: 'test stand-in' }));
    out[l.key] = fileId;
  }
  return out;
}

/** The prebaked sample splat asset ('splat.sample') a new room starts on. Returns its stored file id. */
export async function seedSampleSplat(t: T): Promise<Id<'_storage'>> {
  const fileId = await storeBlob(t, 'SPZ stand-in (sample room, public-domain 1938 photo)');
  await t.run((ctx) => ctx.db.insert('assets', { key: 'splat.sample', fileId, meta: { numSplats: 500000, bytes: 7_000_000, floorY: -1.19, scale: 1, source: 'sharp' } }));
  return fileId;
}

/** Runs every scheduled function (extraction, prebaked fallbacks) to completion under fake timers. */
export async function drain(t: T) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

export type RoomSetup = { code: string; owner: string; teller: string; consentId: Id<'consents'> | null };

/** Owner (family, on the phone) creates the room; a storyteller (headset) joins; the owner gives consent. */
export async function setupRoom(t: T, opts: { scopes?: Scope[]; library?: boolean | string[]; sample?: boolean } = {}): Promise<RoomSetup> {
  if (opts.sample !== false) await seedSampleSplat(t);
  if (opts.library !== false) await seedLibrary(t, Array.isArray(opts.library) ? opts.library : undefined);
  const { code, token: owner } = await t.mutation(api.rooms.create, { title: 'Sample room (test)', displayName: OWNER });
  const key = (await t.query(api.rooms.get, { code, token: owner })).joinKey ?? undefined; // from the family/headset link
  const { token: teller } = await t.mutation(api.rooms.join, { code, displayName: STORYTELLER, role: 'storyteller', key });
  const scopes = opts.scopes ?? ['photo_processing', 'voice_processing', 'share_with_family'];
  const consentId = scopes.length ? await t.mutation(api.consents.give, { code, token: owner, scopes }) : null;
  return { code, owner, teller, consentId };
}

/** One spoken (or typed) turn, extracted by the scheduler-triggered internal.ai.extract (mock path), then read back. */
export async function say(t: T, code: string, token: string, transcript: string, extra: { pointer?: Pointer; audioFileId?: Id<'_storage'>; source?: 'stt' | 'typed' | 'fixture'; durationMs?: number } = {}) {
  const { utteranceId } = await t.mutation(api.utterances.add, { code, token, transcript, source: extra.source ?? 'stt', commandId: cid(),
    ...(extra.pointer ? { pointer: extra.pointer } : {}), ...(extra.audioFileId ? { audioFileId: extra.audioFileId } : {}), ...(extra.durationMs ? { durationMs: extra.durationMs } : {}) });
  await drain(t);
  const u = (await t.query(api.utterances.recent, { code, token })).find((x) => x.id === utteranceId);
  if (!u) throw new Error(`utterance ${utteranceId} not found`);
  return u;
}

export async function roomDoc(t: T, code: string) {
  return t.run(async (ctx) => ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code)).unique());
}

/** Every row of a room's table, including rejected/undone objects that api.objects.list hides. */
export async function rows<K extends 'objects' | 'events' | 'utterances' | 'jobs' | 'consents' | 'members' | 'photos' | 'splats'>(t: T, code: string, table: K) {
  return t.run(async (ctx): Promise<Doc<K>[]> => {
    const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code)).unique();
    if (!room) return [];
    return (await ctx.db.query(table as 'objects').withIndex('by_room', (q) => q.eq('roomId', room._id)).collect()) as unknown as Doc<K>[];
  });
}

/** The phone's "Add an object" (api.objects.proposeFromPhone); returns the new object's id. */
export async function propose(t: T, code: string, token: string, label: string, commandId = cid()): Promise<Id<'objects'>> {
  const r = await t.mutation(api.objects.proposeFromPhone, { code, token, label, commandId });
  if (!r.objectId) throw new Error(`proposeFromPhone(${label}) returned no object`);
  return r.objectId;
}

/** What the phone passes as expectedEventId: the newest propose/confirm/reject event not yet undone. */
export async function latestUndoable(t: T, code: string, token: string): Promise<Id<'events'> | undefined> {
  const ev = await t.query(api.objects.events, { code, token });
  return ev.find((e) => ['propose', 'confirm', 'reject'].includes(e.kind) && !e.undone)?.id;
}

/** Asserts a ConvexError with data.code === code (falls back to the serialized message). */
export async function expectConvexError(p: Promise<unknown>, code: string) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, `expected a ${code} error`).not.toBeNull();
  const data = (err as { data?: { code?: string } }).data;
  expect(data?.code ?? String((err as Error).message)).toContain(code);
}
