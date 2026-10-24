import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { worldAssetPlan } from '../../packages/shared/src/worldlabs';
import { newT, setupRoom, storeBlob } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

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
  expect(await t.mutation(internal.worlddb.finish, { ...ids, fileId, liteFileId: null, numSplats: 100000, liteNumSplats: null, bytes: 1000, floorY: -1.5, scale: 1, worldId: 'test' })).toBe(true);
  const view = await t.query(api.rooms.get, { code: r.code, token: r.owner });
  expect(view.splat).toBe(null);
  expect(view.recentSplats[0]?.status).toBe('ready');
  await t.mutation(api.splats.setActive, { code: r.code, token: r.owner, splatId: ids.splatId });
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).splat?.id).toBe(ids.splatId);
  await t.mutation(api.splats.setActive, { code: r.code, token: r.owner, splatId: null });
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).splat).toBe(null);
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).recentSplats[0]?.status).toBe('ready');
  await t.mutation(api.consents.deleteMemory, { code: r.code, token: r.owner, confirmText: r.code });
  expect(await t.mutation(internal.worlddb.finish, { ...ids, fileId, liteFileId: null, numSplats: 100000, liteNumSplats: null, bytes: 1000, floorY: -1.5, scale: 1, worldId: 'test' })).toBe(false);
});
