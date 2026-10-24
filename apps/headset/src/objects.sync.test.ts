import { expect, test, vi } from 'vitest';
import { Group } from '@iwsdk/core';
import type { ObjectRecord } from './objects.js';

// Keep the real reconciliation and transforms; replace only the GPU/canvas body.
vi.mock('./look/memoryObject.js', async () => {
  const { Group } = await import('@iwsdk/core');
  return { MemoryObject: class {
    root = new Group();
    phase = 'solid';
    constructor(spec: { position: { x: number; y: number; z: number }; rootYaw: number }) {
      this.root.position.copy(spec.position);
      this.root.rotation.y = spec.rootYaw;
    }
    setPlacement(position: { x: number; y: number; z: number }, yaw: number) {
      this.root.position.copy(position); this.root.rotation.y = yaw;
    }
    setPaused() {}
    update() {}
    confirm() {}
    unconfirm() {}
  } };
});
import { ObjectLayer } from './objects.js';

test('a committed correction and undo move the existing rendered object', () => {
  const layer = new ObjectLayer({} as never);
  const initial = {
    id: 'bench', label: 'bench', status: 'confirmed', size: 1.2, yaw: 0,
    anchor: { position: [1, 0, -2], source: 'phone' }, glbUrl: null,
  } as unknown as ObjectRecord;
  layer.sync([initial]);
  const root = layer.root.children[0] as Group;
  expect(root.position.toArray()).toEqual([1, 0, -2]);
  layer.sync([{ ...initial, anchor: { position: [-2, 0, -3], source: 'correction' }, facingYaw: 0.75 } as ObjectRecord]);
  expect(layer.root.children[0]).toBe(root);
  expect(root.position.toArray()).toEqual([-2, 0, -3]);
  expect(root.rotation.y).toBeCloseTo(0.75);
  layer.sync([initial]);
  expect(root.position.toArray()).toEqual([1, 0, -2]);
});
