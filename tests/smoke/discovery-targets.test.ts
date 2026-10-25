import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { buildInfoTargets, type DiscoverySnapshot } from '../../apps/gate/src/object-info/targets';
import { SCENE_DISCOVERY_HINTS } from '../../apps/gate/src/object-info/sceneHints';
import { PLACES } from '../../packages/shared/src/places';

const snapshot = (): DiscoverySnapshot => ({ planObjects: [], perspectiveObjects: [], optionalObjects: [], memoryKey: 'visit:one', perspectiveId: 'p:grandparent', viewing: 'grandparent', photoWorld: false, worldId: null });
const thing = (id: string, kind: string) => ({ id, kind, label: kind, scale: 1 });

test('annotations read a frozen scene snapshot without changing the plan or calling an external service', () => {
  const input = snapshot(); input.planObjects = [thing('kite-1', 'kite'), thing('flower-1', 'flowers'), thing('tree-1', 'tree'), thing('chair-1', 'chair')];
  for (const o of input.planObjects) Object.freeze(o); Object.freeze(input.planObjects); Object.freeze(input);
  const before = JSON.stringify(input), request = vi.spyOn(globalThis, 'fetch');
  try {
    expect(buildInfoTargets(input).map(t => t.topic)).toEqual(['kite', 'flowers', 'trees']);
    expect(JSON.stringify(input)).toBe(before); expect(request).not.toHaveBeenCalled();
  } finally { request.mockRestore(); }
});

test('the existing tree and flowers get hints only in the checked meadow, without adding geometry', () => {
  const world = JSON.parse(readFileSync(new URL('../../fixtures/worlds/red-kite.json', import.meta.url), 'utf8'));
  const config = SCENE_DISCOVERY_HINTS[0]!; expect(config.worldId).toBe(world.worldId);
  const input = { ...snapshot(), photoWorld: true, worldId: config.worldId };
  const hints = buildInfoTargets(input); expect(hints.map(t => t.topic)).toEqual(['flowers', 'trees']);
  expect(input.planObjects).toEqual([]);
  const oak = PLACES['red-kite'].landmarks.find(l => l.words.test('oak'))!, tree = hints.find(t => t.topic === 'trees')!;
  expect([tree.anchor![0], tree.anchor![2]]).toEqual([oak.x, oak.z]);
  expect(buildInfoTargets({ ...input, worldId: 'another-world' })).toEqual([]);
  expect(buildInfoTargets({ ...input, photoWorld: false })).toEqual([]);
  hints[0]!.anchor![0] = 999;
  expect(buildInfoTargets(input)[0]!.anchor![0]).toBe(1.65); // render annotations cannot rewrite the config
});

test('current-POV details are kept while other memories and ghost objects are excluded', () => {
  const input = snapshot();
  input.planObjects = [thing('shared-tree', 'tree')];
  input.perspectiveObjects = [
    { memoryId: input.memoryKey, perspectiveId: input.perspectiveId, data: thing('shared-tree', 'tree') },
    { memoryId: input.memoryKey, perspectiveId: input.perspectiveId, data: thing('my-flowers', 'flowers') },
    { memoryId: input.memoryKey, perspectiveId: 'p:child', data: thing('other-tree', 'tree') },
    { memoryId: 'another-visit', perspectiveId: input.perspectiveId, data: thing('old-kite', 'kite') },
  ];
  expect(buildInfoTargets(input).map(t => t.id)).toEqual(['shared-tree', 'my-flowers']);
});

test('reviewed optional objects stay supported independently of the authored scenery hints', () => {
  const input = snapshot(), prop = { _id: 'flower', status: 'placed', memoryKey: input.memoryKey, perspective: 'grandparent', assetKey: 'flower', choice: 'builtin:flower', size: .6 };
  input.optionalObjects = [prop, { ...prop, _id: 'preview', status: 'ready' }, { ...prop, _id: 'other-pov', perspective: 'child' }, { ...prop, _id: 'old', memoryKey: 'another-visit' }, { ...prop, _id: 'both', perspective: 'shared' }];
  expect(buildInfoTargets(input).map(t => t.id)).toEqual(['optional:flower', 'optional:both']);
  expect(buildInfoTargets(input)[0]!.node).toBe('MemoryObject:flower');
});

test('many remembered objects keep a bounded annotation budget', () => {
  expect(buildInfoTargets({ ...snapshot(), planObjects: Array.from({ length: 50 }, (_, i) => thing('tree-' + i, 'tree')) })).toHaveLength(12);
});
