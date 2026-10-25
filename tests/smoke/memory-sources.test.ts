import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { newT, storeBlob, fileExists } from './helpers';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const url = 'https://www.instagram.com/p/Kite123/';
async function setup(offline = true) {
  const t = newT(), owner = await t.mutation(api.rooms.create, { title: 'Source test', displayName: 'Family', demo: true, offline });
  const consent = await t.mutation(api.consents.give, { ...owner, scopes: ['share_with_family'] });
  const viewer = await t.mutation(api.rooms.join, { code: owner.code, displayName: 'Visitor', role: 'viewer' });
  return { t, owner, viewer, consent };
}
test('fixture preview is private, explicit approval shares a source without changing either telling', async () => {
  const { t, owner, viewer } = await setup();
  await t.action(api.memoryImport.start, { ...owner, mode: 'fixture', urls: [], permission: true });
  let list = await t.query(api.memorySources.list, owner); const id = list.sources[0]!._id;
  expect(list.sources[0]).toMatchObject({ approved: false, execution: 'fixture', runId: null });
  expect((await t.query(api.memorySources.list, viewer)).sources).toHaveLength(0);
  await expect(t.action(api.memoryImport.attach, { ...viewer, id, objectKey: 'kite', perspective: 'elena', note: '' })).rejects.toThrow();
  await t.action(api.memoryImport.attach, { ...owner, id, objectKey: 'kite', perspective: 'elena', note: 'I remember that ribbon.' });
  list = await t.query(api.memorySources.list, viewer);
  expect(list.sources[0]).toMatchObject({ approved: true, perspective: 'elena', note: 'I remember that ribbon.' });
  expect(await t.run(ctx => ctx.db.query('redKiteTellings').collect())).toEqual([]);
  await t.mutation(api.memorySources.remove, { ...owner, id });
  expect((await t.query(api.memorySources.list, viewer)).sources).toEqual([]);
});
test('offline rooms, unconfirmed permission, foreign rooms and viewers cannot initiate cloud work', async () => {
  const { t, owner, viewer } = await setup();
  await expect(t.mutation(internal.memorySources.begin, { ...owner, mode: 'cloud', urls: [url], permission: true, actorId: 'test' })).rejects.toThrow('offline');
  await expect(t.mutation(internal.memorySources.begin, { ...owner, mode: 'fixture', urls: [], permission: false, actorId: 'test' })).rejects.toThrow('permission');
  await expect(t.mutation(internal.memorySources.begin, { ...viewer, mode: 'fixture', urls: [], permission: true, actorId: 'test' })).rejects.toThrow();
});
test('a cloud run is saved, resumed and normalized once, with no token in browser results', async () => {
  const { t, owner, viewer } = await setup(false);
  vi.stubEnv('APIFY_TOKEN', 'test-secret'); vi.stubEnv('ALLOW_APIFY_CLOUD', '1');
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(input); expect(endpoint).not.toContain('test-secret');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-secret');
    if (init?.method === 'POST') { expect(JSON.parse(String(init.body))).toMatchObject({ directUrls: [url], resultsLimit: 3 }); return new Response(JSON.stringify({ data: { id: 'run123' } })); }
    if (endpoint.includes('actor-runs')) return new Response(JSON.stringify({ data: { status: 'SUCCEEDED', defaultDatasetId: 'data123' } }));
    return new Response(JSON.stringify([{ url, caption: 'Kite in the park', ownerUsername: 'family', displayUrl: 'https://scontent.cdninstagram.com/kite.jpg' }]));
  }); vi.stubGlobal('fetch', fetchMock);
  const id = await t.action(api.memoryImport.start, { ...owner, mode: 'cloud', urls: [url], permission: true }) as Id<'memoryImports'>;
  expect((await t.query(api.memorySources.list, owner)).jobs[0]!.runId).toBe('run123');
  await t.action(api.memoryImport.refresh, { ...owner, id }); await t.action(api.memoryImport.refresh, { ...owner, id });
  const list = await t.query(api.memorySources.list, owner);
  expect(list.sources).toHaveLength(1); expect(list.sources[0]!.suggestedObjects).toEqual(['kite', 'landmark']);
  expect(JSON.stringify(list)).not.toContain('test-secret'); expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((await t.query(api.memorySources.list, viewer)).sources).toEqual([]);
});
test('membership revocation during import blocks late publication; source files are deleted with the memory', async () => {
  const { t, owner } = await setup(false);
  const job = await t.mutation(internal.memorySources.begin, { ...owner, mode: 'cloud', urls: [url], permission: true, actorId: 'test' });
  await t.run(async ctx => { const m = await ctx.db.query('members').withIndex('by_token', q => q.eq('token', owner.token)).unique(); await ctx.db.patch(m!._id, { revokedAt: Date.now() }); });
  await t.mutation(internal.memorySources.complete, { id: job, cards: [{ sourceUrl: url, imageUrl: 'https://scontent.cdninstagram.com/a.jpg', caption: '', owner: 'family', timestamp: null, suggestedObjects: [], attribution: '' }] });
  expect(await t.run(ctx => ctx.db.query('memorySources').collect())).toEqual([]);
  const another = await setup();
  await another.t.action(api.memoryImport.start, { ...another.owner, mode: 'fixture', urls: [], permission: true });
  const file = await storeBlob(another.t, 'photo', 'image/jpeg');
  await another.t.run(async ctx => { const s = (await ctx.db.query('memorySources').collect())[0]!; await ctx.db.patch(s._id, { fileId: file }); });
  await another.t.mutation(api.consents.deleteMemory, { ...another.owner, confirmText: another.owner.code });
  expect(await fileExists(another.t, file)).toBe(false);
  expect(await another.t.run(ctx => ctx.db.query('memoryImports').collect())).toEqual([]);
});
