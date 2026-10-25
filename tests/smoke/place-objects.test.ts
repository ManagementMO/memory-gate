import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { newT, storeBlob, fileExists } from './helpers';
import { validateMemoryGlb } from '../../packages/shared/src/memoryObjects';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup(offline = true) {
  const t = newT(), owner = await t.mutation(api.rooms.create, { title: 'Optional props', displayName: 'Family', demo: true, offline });
  await t.mutation(api.consents.give, { ...owner, scopes: ['share_with_family'] });
  const viewer = await t.mutation(api.rooms.join, { code: owner.code, displayName: 'Visitor', role: 'viewer' });
  await t.action(api.memoryImport.findPlace, { ...owner, query: 'Willowbrook Park', mode: 'fixture', permission: true });
  const place = (await t.query(api.memoryObjects.list, owner)).places[0]!;
  return { t, owner, viewer, place };
}
const candidate = (placeId: Id<'memoryPlaces'> | null) => ({ placeId, sourceId: null, perspective: 'elena' as const, choice: 'builtin:bridge', label: 'The footbridge', note: 'An illustration for a conversation.', vendorConsent: false, commandId: crypto.randomUUID() });

test('place and object review are separate; a private candidate never appears to a visitor', async () => {
  const { t, owner, viewer, place } = await setup();
  expect((await t.query(api.memoryObjects.list, viewer)).places).toHaveLength(0);
  await expect(t.action(api.memoryModels.create, { ...owner, ...candidate(place._id) })).rejects.toThrow('reviewed');
  await t.mutation(api.memoryObjects.approvePlace, { ...owner, id: place._id });
  const id = await t.action(api.memoryModels.create, { ...owner, ...candidate(place._id) });
  expect((await t.query(api.memoryObjects.list, owner)).objects[0]).toMatchObject({ status: 'ready', assetKey: 'bridge' });
  expect((await t.query(api.memoryObjects.list, viewer)).objects).toHaveLength(0);
  await expect(t.mutation(api.memoryObjects.place, { ...viewer, id })).rejects.toThrow();
  await t.mutation(api.memoryObjects.place, { ...owner, id });
  expect((await t.query(api.memoryObjects.list, viewer)).objects[0]).toMatchObject({ status: 'placed', perspective: 'elena', url: '/memory-objects/bridge.glb' });
  expect(await t.run(ctx => ctx.db.query('providerUsage').collect())).toEqual([]);
  await t.mutation(api.memoryObjects.hide, { ...owner, id }); expect((await t.query(api.memoryObjects.list, viewer)).objects).toHaveLength(0);
});
test('placement is idempotent and limited to three reviewed props per perspective', async () => {
  const { t, owner, place } = await setup(); await t.mutation(api.memoryObjects.approvePlace, { ...owner, id: place._id });
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const args = { ...owner, ...candidate(place._id) }; const id = await t.action(api.memoryModels.create, args);
    expect(await t.action(api.memoryModels.create, args)).toBe(id); ids.push(id);
  }
  for (const id of ids.slice(0, 3)) await t.mutation(api.memoryObjects.place, { ...owner, id });
  await expect(t.mutation(api.memoryObjects.place, { ...owner, id: ids[3]! })).rejects.toThrow('three objects');
  await t.mutation(api.memoryObjects.hide, { ...owner, id: ids[0]! }); await t.mutation(api.memoryObjects.place, { ...owner, id: ids[3]! });
  expect((await t.query(api.memoryObjects.list, owner)).objects.filter(o => o.status === 'placed').map(o => o.slot).sort()).toEqual([0, 1, 2]);
});
test('cloud place jobs resume the saved Apify run and do not expose unreviewed results', async () => {
  const { t, owner, viewer } = await setup(false); vi.stubEnv('APIFY_TOKEN', 'secret'); vi.stubEnv('ALLOW_APIFY_CLOUD', '1');
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).not.toContain('secret');
    if (init?.method === 'POST') { expect(JSON.parse(String(init.body))).toMatchObject({ searchStringsArray: ['A public park'], maxCrawledPlacesPerSearch: 3, maxImages: 0 }); return new Response(JSON.stringify({ data: { id: 'mapsRun123' } })); }
    return String(url).includes('actor-runs') ? new Response(JSON.stringify({ data: { status: 'SUCCEEDED', defaultDatasetId: 'mapsData123' } }))
      : new Response(JSON.stringify([{ title: 'A public park', url: 'https://www.google.com/maps/place/Park/', location: { lat: 37, lng: -122 } }]));
  }); vi.stubGlobal('fetch', request);
  const id = await t.action(api.memoryImport.findPlace, { ...owner, mode: 'cloud', query: 'A public park', permission: true }) as Id<'memoryImports'>;
  await t.action(api.memoryImport.refresh, { ...owner, id }); await t.action(api.memoryImport.refresh, { ...owner, id });
  expect(request).toHaveBeenCalledTimes(3); expect((await t.query(api.memoryObjects.list, owner)).places).toHaveLength(2);
  expect((await t.query(api.memoryObjects.list, viewer)).places).toHaveLength(0);
});
test('offline generation is blocked and removing a place removes its dependent objects', async () => {
  const { t, owner, place } = await setup(); await t.mutation(api.memoryObjects.approvePlace, { ...owner, id: place._id });
  await expect(t.action(api.memoryModels.create, { ...owner, ...candidate(place._id), choice: 'image', vendorConsent: true })).rejects.toThrow('unavailable');
  const id = await t.action(api.memoryModels.create, { ...owner, ...candidate(place._id) });
  await t.mutation(api.memoryObjects.place, { ...owner, id }); await t.mutation(api.memoryObjects.removePlace, { ...owner, id: place._id });
  expect((await t.query(api.memoryObjects.list, owner)).objects).toHaveLength(0);
});

function tinyGlb() {
  const json = JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 3 }] });
  const padded = json.padEnd(Math.ceil(json.length / 4) * 4), bytes = new Uint8Array(20 + padded.length), data = new DataView(bytes.buffer);
  data.setUint32(0, 0x46546c67, true); data.setUint32(4, 2, true); data.setUint32(8, bytes.length, true); data.setUint32(12, padded.length, true); data.setUint32(16, 0x4e4f534a, true); bytes.set(new TextEncoder().encode(padded), 20); return bytes;
}
test('generated shapes are saved against one task, reviewed, and deleted with their source', async () => {
  const { t, owner } = await setup(false); vi.stubEnv('TRIPO_API_KEY', 'secret');
  await t.run(ctx => ctx.db.insert('flags', { name: 'objects.live', value: true }));
  await t.action(api.memoryImport.start, { ...owner, mode: 'fixture', urls: [], permission: true });
  const source = (await t.query(api.memorySources.list, owner)).sources[0]!;
  const photo = await storeBlob(t, 'test photo bytes', 'image/jpeg');
  await t.run(ctx => ctx.db.patch(source._id, { approved: true, execution: 'apify-cloud', fileId: photo }));
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { expect(JSON.parse(String(init.body))).toMatchObject({ texture: false, face_limit: 6000, pbr: false }); return new Response(JSON.stringify({ code: 0, data: { task_id: 'task_model123' } })); }
    if (String(url).includes('/tasks/')) return new Response(JSON.stringify({ code: 0, data: { status: 'success', output: { model_url: 'https://cdn.tripo3d.ai/model.glb' } } }));
    return new Response(tinyGlb(), { headers: { 'Content-Type': 'model/gltf-binary' } });
  }); vi.stubGlobal('fetch', request);
  const args = { ...owner, ...candidate(null), sourceId: source._id, choice: 'image', vendorConsent: true };
  const id = await t.action(api.memoryModels.create, args); expect(await t.action(api.memoryModels.create, args)).toBe(id);
  await t.action(api.memoryModels.refresh, { ...owner, id }); await t.action(api.memoryModels.refresh, { ...owner, id });
  expect(request).toHaveBeenCalledTimes(3);
  const model = (await t.query(api.memoryObjects.list, owner)).objects[0]!; expect(model.status).toBe('ready'); expect(model.fileId).toBeTruthy();
  await t.mutation(api.memorySources.remove, { ...owner, id: source._id });
  expect(await fileExists(t, model.fileId!)).toBe(false); expect((await t.query(api.memoryObjects.list, owner)).objects).toHaveLength(0);
});
test('model validation rejects external resources and excessive geometry', () => {
  expect(validateMemoryGlb(tinyGlb()).triangles).toBe(1);
  const invalid = tinyGlb(); new DataView(invalid.buffer).setUint32(4, 1, true); expect(() => validateMemoryGlb(invalid)).toThrow('GLB 2');
  expect(() => validateMemoryGlb(new Uint8Array(12_000_001))).toThrow('12 MB');
});
