import { afterEach, expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { cid, fileExists, newT, seedLibrary, setupRoom, storeBlob } from './helpers';
afterEach(() => vi.unstubAllEnvs());

test('replacing a library model preserves confirmed versions until the last memory using them is deleted', async () => {
  vi.stubEnv('WORKER_SECRET', 'local-test-worker');
  const t = newT(), library = await seedLibrary(t, ['piano']);
  const a = await setupRoom(t, { library: false, sample: false });
  const b = await setupRoom(t, { library: false, sample: false });
  for (const room of [a, b]) {
    const { objectId } = await t.mutation(api.objects.proposeFromPhone, { code: room.code, token: room.owner, label: 'piano', commandId: cid() });
    if (!objectId) throw new Error('Expected a newly proposed piano.');
    await t.mutation(api.objects.confirm, { code: room.code, token: room.owner, objectId, commandId: cid() });
  }
  const newer = await storeBlob(t, 'new model', 'model/gltf-binary');
  await t.mutation(api.admin.upsertLibrary, { secret: 'local-test-worker', key: 'piano', synonyms: [], fileId: newer, size: 1.4, yawOffset: 0, source: 'original-procedural', credit: 'test' });
  expect(await fileExists(t, library.piano!)).toBe(true);
  await t.mutation(api.consents.deleteMemory, { code: a.code, token: a.owner, confirmText: a.code });
  expect(await fileExists(t, library.piano!)).toBe(true);
  await t.mutation(api.consents.deleteMemory, { code: b.code, token: b.owner, confirmText: b.code });
  expect(await fileExists(t, library.piano!)).toBe(false);
  expect(await fileExists(t, newer)).toBe(true);
});

test('replacing an unused asset still cleans up its old file', async () => {
  vi.stubEnv('WORKER_SECRET', 'local-test-worker');
  const t = newT(), prior = await storeBlob(t, 'old'), next = await storeBlob(t, 'new');
  await t.mutation(api.admin.upsertAsset, { secret: 'local-test-worker', key: 'unused-poster', fileId: prior });
  await t.mutation(api.admin.upsertAsset, { secret: 'local-test-worker', key: 'unused-poster', fileId: next });
  expect(await fileExists(t, prior)).toBe(false);
  expect(await fileExists(t, next)).toBe(true);
});
