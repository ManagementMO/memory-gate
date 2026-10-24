import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { storyWorldPrompt, worldAssetPlan } from '../../packages/shared/src/worldlabs';
import { fileExists, newT, setupRoom, storeBlob } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

test('a story world needs an explicit family action and source consent, and repeated clicks reuse one job', async () => {
  const t = newT(), r = await setupRoom(t, { sample: false, library: false });
  const transcript = 'Our courtyard had pale limestone walls and deep green shutters. The afternoon light came through the vines.';
  const { utteranceId } = await t.mutation(api.utterances.add, { code: r.code, token: r.teller, transcript, source: 'typed', commandId: 'story-place' });
  await t.run(ctx => ctx.db.patch(utteranceId, { status: 'done' }));
  const args = { code: r.code, token: r.owner, utteranceId };
  vi.stubEnv('WORLD_LABS_API_KEY', 'test-key');
  await t.run(ctx => ctx.db.insert('flags', { name: 'worldlabs.generate', value: true }));
  await expect(t.mutation(api.splats.fromStory, args)).rejects.toThrow();
  await t.mutation(api.consents.give, { code: r.code, token: r.owner, scopes: ['vendor_upload_worldlabs'] });
  await expect(t.mutation(api.splats.fromStory, { ...args, token: r.teller })).rejects.toThrow();
  const first = await t.mutation(api.splats.fromStory, args);
  expect(await t.mutation(api.splats.fromStory, args)).toEqual({ ...first, duplicate: true });
  const job = await t.run(ctx => ctx.db.query('jobs').filter(q => q.eq(q.field('provider'), 'worldlabs')).first());
  expect(await t.mutation(internal.worlddb.claim, { jobId: job!._id })).toBe(true);
  expect((await t.query(internal.worlddb.info, { jobId: job!._id }))?.story?.transcript).toBe(transcript);
  const view = await t.query(api.rooms.get, { code: r.code, token: r.owner });
  expect(view.splat).toBe(null); // generation never replaces the currently shared place
  expect(view.recentSplats[0]?.sourceStory).toMatchObject({ id: utteranceId, transcript, source: 'typed' });
  const prop = await t.mutation(api.objects.proposeFromPhone, { code: r.code, token: r.owner, label: 'bench', commandId: 'before-place' });
  const before = (await t.query(api.objects.list, { code: r.code, token: r.owner })).find(o => o.id === prop.objectId)!.anchor;
  await t.mutation(internal.worlddb.finish, { jobId: job!._id, splatId: first.splatId, fileId: await storeBlob(t, 'world'), liteFileId: null, numSplats: 500000, liteNumSplats: null, bytes: 1000, floorY: -1.5, scale: 1, worldId: 'story-world' });
  await t.mutation(api.splats.setActive, { code: r.code, token: r.owner, splatId: first.splatId });
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).room.layout).toBe('courtyard');
  expect((await t.query(api.objects.list, { code: r.code, token: r.owner })).find(o => o.id === prop.objectId)!.anchor).toEqual(before);
  const other = await setupRoom(t, { sample: false, library: false });
  await t.mutation(api.consents.give, { code: other.code, token: other.owner, scopes: ['vendor_upload_worldlabs'] });
  await expect(t.mutation(api.splats.fromStory, { ...args, code: other.code, token: other.owner })).rejects.toThrow();
});

test('revoking story processing blocks both provider handoff and a late story-world attachment', async () => {
  const t = newT(), r = await setupRoom(t, { sample: false, library: false, scopes: ['voice_processing', 'vendor_upload_worldlabs'] });
  vi.stubEnv('WORLD_LABS_API_KEY', 'test-key');
  await t.run(ctx => ctx.db.insert('flags', { name: 'worldlabs.generate', value: true }));
  const { utteranceId } = await t.mutation(api.utterances.add, { code: r.code, token: r.owner, transcript: 'There was a quiet courtyard with stone walls and green shutters.', source: 'typed', commandId: 'world' });
  await t.run(ctx => ctx.db.patch(utteranceId, { status: 'done' }));
  const { splatId } = await t.mutation(api.splats.fromStory, { code: r.code, token: r.owner, utteranceId });
  const job = (await t.run(ctx => ctx.db.query('jobs').filter(q => q.eq(q.field('provider'), 'worldlabs')).first()))!;
  await t.mutation(internal.worlddb.claim, { jobId: job._id });
  expect(await t.query(internal.worlddb.info, { jobId: job._id })).not.toBe(null);
  await t.mutation(api.consents.revoke, { code: r.code, token: r.owner, consentId: r.consentId! });
  expect(await t.query(internal.worlddb.info, { jobId: job._id })).toBe(null);
  expect(await t.mutation(internal.worlddb.finish, { jobId: job._id, splatId, fileId: await storeBlob(t, 'SPZ'), liteFileId: null, numSplats: 500000, liteNumSplats: null, bytes: 1000, floorY: -1.6, scale: 1, worldId: 'test' })).toBe(false);
});

test('the world brief preserves the source and reserves open space for live story props', () => {
  const story = 'I remember a sunny courtyard with vines and warm limestone.';
  const prompt = storyWorldPrompt(story);
  expect(prompt).toContain(`<story>\n${story}\n</story>`);
  expect(prompt).toContain('separate interactive');
  expect(prompt).toContain('not a historically verified');
  expect(prompt).toContain('Subtle painterly simplification is welcome');
  expect(prompt).not.toContain('No illustration');
  expect(() => storyWorldPrompt('hello')).toThrow();
  expect(() => storyWorldPrompt('a'.repeat(2001))).toThrow();
});

test('the cached fictional courtyard needs sample mode, creates no paid job, survives reset, and preserves shared files', async () => {
  const t = newT(), r = await setupRoom(t, { sample: false, library: false });
  const fileId = await storeBlob(t, 'cached-world'), liteFileId = await storeBlob(t, 'cached-lite'), previewFileId = await storeBlob(t, 'cached-preview');
  const sourceWords = 'Our courtyard had pale stone walls and green shutters.';
  await t.run(ctx => ctx.db.insert('assets', { key: 'world.practice-courtyard', fileId, meta: {
    liteFileId, previewFileId, scale: 1, floorY: -1.5, numSplats: 500000, liteNumSplats: 100000, bytes: 1000, worldId: 'fixture-world', sourceWords,
  } }));
  const args = { code: r.code, token: r.owner };
  await expect(t.mutation(api.splats.usePracticeWorld, args)).rejects.toThrow();
  await t.run(async ctx => { const room = await ctx.db.query('rooms').withIndex('by_code', q => q.eq('code', r.code)).unique(); await ctx.db.patch(room!._id, { demo: true }); });
  const first = await t.mutation(api.splats.usePracticeWorld, args);
  expect(await t.mutation(api.splats.usePracticeWorld, args)).toEqual({ ...first, reused: true });
  const view = await t.query(api.rooms.get, args);
  expect(view.splat?.sourceStory).toMatchObject({ transcript: sourceWords, source: 'fixture' });
  expect(await t.run(ctx => ctx.db.query('jobs').first())).toBe(null);
  expect(await t.run(ctx => ctx.db.query('providerUsage').first())).toBe(null);
  const audio = await storeBlob(t, 'private demo recording');
  await t.run(ctx => ctx.db.patch(view.splat!.sourceStory!.id, { audioFileId: audio }));
  await t.mutation(api.rooms.resetDemo, args);
  expect((await t.query(api.rooms.get, args)).splat?.sourceStory?.transcript).toBe(sourceWords);
  expect(await fileExists(t, audio)).toBe(false);
  await t.mutation(api.consents.deleteMemory, { ...args, confirmText: r.code });
  for (const id of [fileId, liteFileId, previewFileId]) expect(await fileExists(t, id)).toBe(true);
});

test('world metadata aligns the raw ground exactly at zero in the renderer frame', () => {
  const plan = worldAssetPlan({ world_id: 'world', assets: { splats: { spz_urls: { '500k': 'https://example.com/full.spz', '100k': 'https://example.com/lite.spz' },
    semantics_metadata: { metric_scale_factor: .64, ground_plane_offset: 1.52 } } } });
  expect(plan.floorY).toBeCloseTo(-2.375);
  const rawGround = 1.52 / .64;
  expect(-rawGround * plan.scale - plan.floorY * plan.scale).toBeCloseTo(0);
  expect(plan.liteNumSplats).toBe(100_000);
  expect(plan.worldId).toBe('world');
  // The first live draft returned null here. It must never silently become a metric Quest scene.
  expect(() => worldAssetPlan({ assets: { splats: { spz_urls: { '500k': 'https://example.com/draft.spz' }, semantics_metadata: null } } })).toThrow(/calibration/);
  expect(() => worldAssetPlan({ assets: { splats: { spz_urls: { full_res: 'https://example.com/huge.spz' } } } })).toThrow();
  expect(() => worldAssetPlan({ assets: { splats: { spz_urls: { '500k': 'http://127.0.0.1/private' } } } })).toThrow();
});

test('generation reservations are idempotent, global, and survive deleting their room', async () => {
  const t = newT(); const r = await setupRoom(t, { sample: false, library: false });
  const ids = await t.run(async ctx => {
    const room = (await ctx.db.query('rooms').first())!;
    return Promise.all(Array.from({ length: 4 }, (_, i) => ctx.db.insert('jobs', { roomId: room._id, refId: `unused-${i}`, kind: 'world', provider: 'worldlabs',
      status: 'running', attempts: 1, lastError: null, startedAt: Date.now(), finishedAt: null, createdAt: Date.now() })));
  });
  expect(await t.mutation(internal.worlddb.reserveGeneration, { jobId: ids[0]! })).toBe(true);
  expect(await t.mutation(internal.worlddb.reserveGeneration, { jobId: ids[0]! })).toBe(true);
  expect(await t.mutation(internal.worlddb.reserveGeneration, { jobId: ids[1]! })).toBe(true);
  expect(await t.mutation(internal.worlddb.reserveGeneration, { jobId: ids[2]! })).toBe(true);
  expect(await t.mutation(internal.worlddb.reserveGeneration, { jobId: ids[3]! })).toBe(false);
  await t.mutation(api.consents.deleteMemory, { code: r.code, token: r.owner, confirmText: r.code });
  expect(await t.run(ctx => ctx.db.query('providerUsage').first())).toMatchObject({ key: 'worldlabs.generations', count: 3 });
});

test('recovery only polls the saved operation, requires its own family membership, and keeps the submission count', async () => {
  const t = newT(); const r = await setupRoom(t, { sample: false, library: false, scopes: ['photo_processing', 'vendor_upload_worldlabs'] });
  const ids = await t.run(async ctx => {
    const room = (await ctx.db.query('rooms').first())!;
    const splatId = await ctx.db.insert('splats', { roomId: room._id, photoId: null, status: 'failed', source: 'worldlabs', fileId: null, liteFileId: null,
      numSplats: 0, bytes: 0, gpuSeconds: 0, fPx: null, floorY: null, scale: 1, error: 'download failed', createdAt: Date.now(), readyAt: null });
    const jobId = await ctx.db.insert('jobs', { roomId: room._id, refId: splatId, kind: 'world', provider: 'worldlabs', status: 'failed', attempts: 1,
      lastError: 'download failed', startedAt: Date.now(), finishedAt: Date.now(), createdAt: Date.now(), meta: { operationId: 'existing-operation', reservedGeneration: true } });
    return { jobId, splatId };
  });
  const { token: viewer } = await t.mutation(api.rooms.join, { code: r.code, displayName: 'Viewer', role: 'viewer' });
  await expect(t.mutation(api.worlddb.recover, { code: r.code, token: viewer, jobId: ids.jobId })).rejects.toThrow();
  expect(await t.mutation(api.worlddb.recover, { code: r.code, token: r.owner, jobId: ids.jobId })).toEqual({ resumed: true });
  expect(await t.mutation(api.worlddb.recover, { code: r.code, token: r.owner, jobId: ids.jobId })).toEqual({ resumed: false });
  expect(await t.run(ctx => ctx.db.get(ids.jobId))).toMatchObject({ status: 'running', attempts: 1, meta: { operationId: 'existing-operation' } });
});

test('World Labs generation needs its flag, a key and specific photo-upload consent', async () => {
  const t = newT();
  const r = await setupRoom(t, { sample: false, library: false });
  const fileId = await storeBlob(t, 'photo', 'image/jpeg');
  const args = { code: r.code, token: r.owner, fileId, width: 640, height: 480, tone: 'muted', credit: 'sample', builder: 'worldlabs' as const };
  await expect(t.mutation(api.splats.addPhoto, args)).rejects.toThrow();
  await t.run(ctx => ctx.db.insert('flags', { name: 'worldlabs.generate', value: true }));
  await expect(t.mutation(api.splats.addPhoto, args)).rejects.toThrow();
  vi.stubEnv('WORLD_LABS_API_KEY', 'test-key');
  await t.mutation(api.consents.give, { code: r.code, token: r.owner, scopes: ['photo_processing', 'vendor_upload_worldlabs'] });
  const result = await t.mutation(api.splats.addPhoto, args);
  const job = await t.run(ctx => ctx.db.query('jobs').first());
  expect(job).toMatchObject({ kind: 'world', provider: 'worldlabs', status: 'queued', refId: result.splatId });
  // Claim is atomic: scheduler retries cannot submit another paid generation.
  expect(await t.mutation(internal.worlddb.claim, { jobId: job!._id })).toBe(true);
  expect(await t.mutation(internal.worlddb.claim, { jobId: job!._id })).toBe(false);
});

test('a generated world is stored for review, and a late completion cannot revive a deleted room', async () => {
  const t = newT();
  const r = await setupRoom(t, { sample: false, library: false, scopes: ['photo_processing', 'vendor_upload_worldlabs'] });
  const ids = await t.run(async ctx => {
    const room = (await ctx.db.query('rooms').first())!;
    const splatId = await ctx.db.insert('splats', { roomId: room._id, photoId: null, status: 'running', source: 'worldlabs', fileId: null, liteFileId: null,
      numSplats: 0, bytes: 0, gpuSeconds: 0, fPx: null, floorY: null, scale: 1, error: null, createdAt: Date.now(), readyAt: null });
    const jobId = await ctx.db.insert('jobs', { roomId: room._id, refId: splatId, kind: 'world', provider: 'worldlabs', status: 'running', attempts: 1,
      lastError: null, startedAt: Date.now(), finishedAt: null, createdAt: Date.now() });
    return { splatId, jobId };
  });
  const fileId = await storeBlob(t, 'SPZ stand-in');
  const previewFileId = await storeBlob(t, 'JPEG stand-in', 'image/jpeg');
  expect(await t.mutation(internal.worlddb.finish, { ...ids, fileId, previewFileId, liteFileId: null, numSplats: 100000, liteNumSplats: null, bytes: 1000, floorY: -1.5, scale: 1, worldId: 'test' })).toBe(true);
  const view = await t.query(api.rooms.get, { code: r.code, token: r.owner });
  expect(view.splat).toBe(null);
  expect(view.recentSplats[0]?.status).toBe('ready');
  expect(view.recentSplats[0]?.previewUrl).toBeTruthy();
  await t.mutation(api.splats.setActive, { code: r.code, token: r.owner, splatId: ids.splatId });
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).splat?.id).toBe(ids.splatId);
  await t.mutation(api.splats.setActive, { code: r.code, token: r.owner, splatId: null });
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).splat).toBe(null);
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).recentSplats[0]?.status).toBe('ready');
  await t.mutation(api.consents.deleteMemory, { code: r.code, token: r.owner, confirmText: r.code });
  expect(await fileExists(t, previewFileId)).toBe(false);
  expect(await t.mutation(internal.worlddb.finish, { ...ids, fileId, liteFileId: null, numSplats: 100000, liteNumSplats: null, bytes: 1000, floorY: -1.5, scale: 1, worldId: 'test' })).toBe(false);
});
