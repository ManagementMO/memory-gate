import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { newT, seedLibrary, cid } from './helpers';

test('the illustrative practice scene is explicit, idempotent and never overwrites a personal memory', async () => {
  const t = newT();
  for (const key of ['bench', 'tree', 'gate', 'photograph']) await t.run(async ctx => {
    const fileId = await ctx.storage.store(new Blob(['stand-in']));
    await ctx.db.insert('library', { key, synonyms: [], fileId, size: 1, yawOffset: 0, source: 'original-procedural', credit: 'test' });
  });
  const personal = await t.mutation(api.rooms.create, { title: 'Personal', displayName: 'Family' });
  await expect(t.mutation(api.objects.practiceCourtyard, { code: personal.code, token: personal.token, commandId: cid() })).rejects.toThrow();
  const demo = await t.mutation(api.rooms.create, { title: 'Illustrative practice', displayName: 'Family', demo: true });
  const commandId = cid();
  await t.mutation(api.objects.practiceCourtyard, { code: demo.code, token: demo.token, commandId });
  await t.mutation(api.objects.practiceCourtyard, { code: demo.code, token: demo.token, commandId });
  const objects = await t.query(api.objects.list, { code: demo.code, token: demo.token });
  expect(objects).toHaveLength(4);
  expect(objects.map(o => o.label).sort()).toEqual(['bench', 'gate', 'photograph', 'tree']);
  expect(objects.every(o => o.status === 'confirmed' && o.source === null && o.where?.includes('Illustrative practice'))).toBe(true);
  await expect(t.mutation(api.objects.practiceCourtyard, { code: demo.code, token: demo.token, commandId: cid() })).rejects.toThrow();
});
