import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { cid, expectConvexError, newT, propose, roomDoc, say, setupRoom } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function scene() {
  const t = newT();
  const r = await setupRoom(t, { library: false });
  const bench = await propose(t, r.code, r.owner, 'bench');
  const tree = await propose(t, r.code, r.owner, 'tree');
  const gate = await propose(t, r.code, r.owner, 'gate');
  await t.run(async (ctx) => {
    await ctx.db.patch(bench, { anchor: { position: [2, 0, -1], source: 'phone' }, size: 1.4 });
    await ctx.db.patch(tree, { anchor: { position: [-2, 0, -3], source: 'phone' }, size: 1.8 });
    await ctx.db.patch(gate, { anchor: { position: [0, 0, -6], source: 'phone' }, size: 1.6 });
  });
  for (const objectId of [bench, tree, gate]) await t.mutation(api.objects.confirm, { code: r.code, token: r.owner, objectId, commandId: cid() });
  return { t, ...r, bench, tree, gate };
}

test('a spatial correction previews, confirms, synchronizes and undoes with source intact', async () => {
  const s = await scene();
  const before = (await s.t.query(api.objects.list, { code: s.code, token: s.owner })).find(o => o.id === s.bench)!;
  const revision = (await roomDoc(s.t, s.code))!.revision;
  const { correctionId } = await s.t.mutation(api.corrections.propose, {
    code: s.code, token: s.owner, objectId: s.bench, referenceId: s.tree, facingId: s.gate,
    relation: 'right_of', baseRevision: revision, commandId: cid(),
  });
  const pending = await s.t.query(api.corrections.list, { code: s.code, token: s.teller });
  expect(pending).toMatchObject([{ id: correctionId, status: 'pending', stale: false }]);
  const still = (await s.t.query(api.objects.list, { code: s.code, token: s.teller })).find(o => o.id === s.bench)!;
  expect(still.anchor).toEqual(before.anchor);
  expect(still.pendingCorrection).toMatchObject({ id: correctionId });
  const commandId = cid();
  await s.t.mutation(api.corrections.confirm, { code: s.code, token: s.teller, correctionId, commandId });
  await s.t.mutation(api.corrections.confirm, { code: s.code, token: s.teller, correctionId, commandId });
  const moved = (await s.t.query(api.objects.list, { code: s.code, token: s.owner })).find(o => o.id === s.bench)!;
  expect(moved.anchor.position[0]).toBeGreaterThan(-2);
  expect(moved.anchor.position[2]).toBe(-3);
  expect(Math.sin(moved.facingYaw!)).toBeCloseTo(0);
  expect(Math.cos(moved.facingYaw!)).toBeCloseTo(-1);
  expect((await roomDoc(s.t, s.code))!.revision).toBe(revision + 1);
  await s.t.mutation(api.objects.undo, { code: s.code, token: s.owner, commandId: cid() });
  const restored = (await s.t.query(api.objects.list, { code: s.code, token: s.teller })).find(o => o.id === s.bench)!;
  expect(restored.anchor).toEqual(before.anchor);
  expect(restored.facingYaw).toBeNull();
});

test('a stale correction cannot overwrite a newer accepted change', async () => {
  const s = await scene();
  const { correctionId } = await s.t.mutation(api.corrections.propose, {
    code: s.code, token: s.owner, objectId: s.bench, referenceId: s.tree,
    relation: 'next_to', baseRevision: (await roomDoc(s.t, s.code))!.revision, commandId: cid(),
  });
  await propose(s.t, s.code, s.owner, 'lamp');
  await expectConvexError(s.t.mutation(api.corrections.confirm, { code: s.code, token: s.teller, correctionId, commandId: cid() }), 'STALE');
  expect((await s.t.query(api.objects.list, { code: s.code, token: s.owner })).find(o => o.id === s.bench)!.anchor.position).toEqual([2, 0, -1]);
});

test('a viewer or member of another room cannot propose or confirm a correction', async () => {
  const s = await scene();
  const { token } = await s.t.mutation(api.rooms.join, { code: s.code, role: 'viewer', displayName: 'Viewer' });
  await expectConvexError(s.t.mutation(api.corrections.propose, {
    code: s.code, token, objectId: s.bench, referenceId: s.tree, relation: 'next_to',
    baseRevision: (await roomDoc(s.t, s.code))!.revision, commandId: cid(),
  }), 'FORBIDDEN');
  const other = await setupRoom(s.t, { library: false, sample: false });
  await expectConvexError(s.t.mutation(api.corrections.propose, {
    code: other.code, token: other.owner, objectId: s.bench, referenceId: s.tree,
    relation: 'next_to', baseRevision: (await roomDoc(s.t, other.code))!.revision, commandId: cid(),
  }), 'NOT_FOUND');
});

test.each([
  'Move the bench beside the tree, facing the gate.',
  'Mueve el banco al lado del árbol, mirando hacia la puerta.',
])('a supported spoken correction changes no object before confirmation: %s', async (text) => {
  const s = await scene();
  const u = await say(s.t, s.code, s.teller, text);
  expect(u.intent).toBe('correct_object');
  const pending = await s.t.query(api.corrections.list, { code: s.code, token: s.owner });
  expect(pending).toHaveLength(1);
  expect(pending[0]!.source?.transcript).toBe(text);
  expect((await s.t.query(api.objects.list, { code: s.code, token: s.owner }))).toHaveLength(3);
  await say(s.t, s.code, s.teller, 'No lo muevas.');
  expect((await s.t.query(api.corrections.list, { code: s.code, token: s.owner }))[0]!.status).toBe('pending');
  await say(s.t, s.code, s.teller, "Yes, that's it.");
  expect((await s.t.query(api.corrections.list, { code: s.code, token: s.owner }))).toHaveLength(0);
});
