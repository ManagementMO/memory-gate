import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { newT, storeBlob, cid } from './helpers';

async function fixture() {
  const t = newT();
  const fileId = await storeBlob(t, 'cached meadow stand-in');
  await t.run(ctx => ctx.db.insert('assets', { key: 'world.practice-red-kite', fileId, meta: {
    scale: 2.6397884, floorY: -.57755, numSplats: 500000, liteNumSplats: 100000, bytes: 10,
    worldId: 'red-kite-fixture', sourceWords: 'A fictional California meadow.',
  } }));
  const owner = await t.mutation(api.rooms.create, { title: 'The Red Kite', displayName: 'Curator', demo: true, offline: true });
  await t.mutation(api.consents.give, { ...owner, scopes: ['share_with_family'] });
  await t.mutation(api.splats.usePracticeWorld, { ...owner, setting: 'red-kite' });
  const viewer = await t.mutation(api.rooms.join, { code: owner.code, displayName: 'Visitor', role: 'viewer' });
  return { t, owner, viewer };
}

test('two fictional tellings are source-linked, prepared once, and create no paid work', async () => {
  const { t, owner } = await fixture();
  await t.mutation(api.redKite.prepare, owner);
  const first = await t.query(api.redKite.current, owner);
  await t.mutation(api.redKite.prepare, owner);
  const second = await t.query(api.redKite.current, owner);
  expect(second).toEqual(first);
  expect(first!.tellings.map(p => p.key)).toEqual(['elena', 'rosa']);
  expect(first!.tellings.every(p => p.lines.every(l => l.sourceKind === 'fixture' && l.sourceId && l.quote))).toBe(true);
  expect(first!.tellings.every(p => p.look.color === null && !p.look.visible)).toBe(true);
  expect(await t.run(ctx => ctx.db.query('jobs').collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query('providerUsage').collect())).toEqual([]);
});

test('each telling retains its unknown and conflicting colors without borrowing the other account', async () => {
  const { t, owner } = await fixture();
  await t.mutation(api.redKite.prepare, owner);
  const get = async (key: 'elena' | 'rosa') => (await t.query(api.redKite.current, owner))!.tellings.find(p => p.key === key)!;
  const advance = async (key: 'elena' | 'rosa') => t.mutation(api.redKite.advance, { ...owner, perspective: key, baseRevision: (await get(key)).revision, commandId: cid() });
  const choose = async (key: 'elena' | 'rosa', decision: 'use' | 'leave') => t.mutation(api.redKite.choose, { ...owner, perspective: key, decision, baseRevision: (await get(key)).revision, commandId: cid() });
  await advance('elena');
  await choose('elena', 'use');
  expect((await get('elena')).look).toMatchObject({ visible: true, color: null });
  await advance('elena'); await choose('elena', 'use');
  expect((await get('elena')).look.color).toBe('red');
  expect((await get('rosa')).look).toMatchObject({ visible: false, color: null });
  await advance('rosa'); await choose('rosa', 'use'); await advance('rosa');
  await choose('rosa', 'leave');
  expect((await get('rosa')).look).toMatchObject({ visible: true, color: null });
  await choose('rosa', 'use');
  expect((await get('rosa')).look.color).toBe('orange');
  expect((await get('elena')).look.color).toBe('red');
  const sources = [(await get('elena')).look.colorSourceId, (await get('rosa')).look.colorSourceId];
  expect(sources[0]).not.toBe(sources[1]);
});

test('stale commands fail, repeated commands reuse the same event, and viewers cannot author', async () => {
  const { t, owner, viewer } = await fixture();
  await t.mutation(api.redKite.prepare, owner);
  const args = { ...owner, perspective: 'elena' as const, baseRevision: 0, commandId: cid() };
  await t.mutation(api.redKite.advance, args);
  await t.mutation(api.redKite.advance, args);
  expect((await t.query(api.redKite.current, viewer))!.tellings[0]!.beat).toBe(1);
  await expect(t.mutation(api.redKite.advance, { ...args, commandId: cid() })).rejects.toThrow('changed');
  await expect(t.mutation(api.redKite.choose, { ...viewer, perspective: 'elena', decision: 'use', baseRevision: 1, commandId: cid() })).rejects.toThrow();
  await expect(t.mutation(api.redKite.prepare, viewer)).rejects.toThrow();
  await expect(t.query(api.redKite.current, { code: owner.code, token: 'foreign-token' })).rejects.toThrow();
});

test('personal rooms, paused rooms and missing proposal beats cannot be authored', async () => {
  const { t, owner } = await fixture();
  const personal = await t.mutation(api.rooms.create, { title: 'Personal', displayName: 'Family' });
  await expect(t.mutation(api.redKite.prepare, personal)).rejects.toThrow();
  await t.mutation(api.redKite.prepare, owner);
  await expect(t.mutation(api.redKite.choose, { ...owner, perspective: 'elena', decision: 'use', baseRevision: 0, commandId: cid() })).rejects.toThrow('detail');
  await t.mutation(api.rooms.setPaused, { ...owner, paused: true, commandId: cid() });
  await expect(t.mutation(api.redKite.advance, { ...owner, perspective: 'rosa', baseRevision: 0, commandId: cid() })).rejects.toThrow('ready');
});

test('reset and deletion clean narrator data without deleting the shared cached world', async () => {
  const { t, owner } = await fixture();
  await t.mutation(api.redKite.prepare, owner);
  await t.mutation(api.rooms.resetDemo, owner);
  expect(await t.query(api.redKite.current, owner)).toBeNull();
  await t.mutation(api.redKite.prepare, owner);
  await t.mutation(api.consents.deleteMemory, { ...owner, confirmText: owner.code });
  expect(await t.run(ctx => ctx.db.query('redKiteTellings').collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query('assets').collect())).toHaveLength(1);
});
