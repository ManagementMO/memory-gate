import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { newT, setupRoom, storeBlob, roomDoc } from './helpers';

test('the cached meadow is family-selected in a fictional room, distinct from the courtyard and never a paid job', async () => {
  const t = newT(), room = await setupRoom(t, { sample: false, library: false });
  for (const [key, worldId, words] of [
    ['world.practice-courtyard', 'courtyard', 'Fictional courtyard with pale stone walls.'],
    ['world.practice-red-kite', 'red-kite', 'Fictional California meadow with an old oak and a winding path.'],
  ] as const) {
    const fileId = await storeBlob(t, key);
    await t.run(ctx => ctx.db.insert('assets', { key, fileId, meta: {
      scale: 2.6, floorY: -.58, numSplats: 500000, liteNumSplats: 100000, bytes: 1234, worldId, sourceWords: words,
    } }));
  }
  const auth = { code: room.code, token: room.owner }, args = { ...auth, setting: 'red-kite' as const };
  await expect(t.mutation(api.splats.usePracticeWorld, args)).rejects.toThrow();
  const doc = await roomDoc(t, room.code);
  await t.run(ctx => ctx.db.patch(doc!._id, { demo: true }));
  await expect(t.mutation(api.splats.usePracticeWorld, { ...args, token: room.teller })).rejects.toThrow();
  const selected = await t.mutation(api.splats.usePracticeWorld, args);
  expect(await t.mutation(api.splats.usePracticeWorld, args)).toEqual({ ...selected, reused: true });
  let view = await t.query(api.rooms.get, auth);
  expect(view.splat?.sourceStory).toMatchObject({ transcript: 'Fictional California meadow with an old oak and a winding path.', source: 'fixture' });
  expect(view.splat?.scale).toBe(2.6);
  expect(view.splat?.floorY).toBe(-.58);
  expect(await t.run(ctx => ctx.db.query('jobs').collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query('providerUsage').collect())).toEqual([]);
  const courtyard = await t.mutation(api.splats.usePracticeWorld, auth);
  expect(courtyard.splatId).not.toEqual(selected.splatId);
  view = await t.query(api.rooms.get, auth);
  expect(view.splat?.sourceStory?.transcript).toContain('courtyard');
  await t.mutation(api.rooms.setPaused, { ...auth, paused: true, commandId: 'pause-before-meadow' });
  await expect(t.mutation(api.splats.usePracticeWorld, args)).rejects.toThrow();
  expect((await t.query(api.rooms.get, auth)).splat?.id).toBe(courtyard.splatId);
});

test('a missing meadow pack fails without silently substituting another world', async () => {
  const t = newT();
  const auth = await t.mutation(api.rooms.create, { title: 'Fictional meadow', displayName: 'Curator', demo: true });
  await expect(t.mutation(api.splats.usePracticeWorld, { ...auth, setting: 'red-kite' })).rejects.toThrow('cached fictional meadow');
  expect((await t.query(api.rooms.get, auth)).splat).toBeNull();
  expect(await t.run(ctx => ctx.db.query('jobs').first())).toBeNull();
});
