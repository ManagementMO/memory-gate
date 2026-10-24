import { expect, test, vi } from 'vitest';
import { Group } from '@iwsdk/core';

const pending = vi.hoisted(() => [] as (() => void)[]);
vi.mock('@sparkjsdev/spark', async () => {
  const { Group } = await import('@iwsdk/core');
  return { SparkRenderer: class {}, SplatMesh: class extends Group {
    opacity = 0;
    initialized = new Promise<void>(resolve => pending.push(resolve));
    dispose = vi.fn();
    updateVersion() {}
  } };
});
vi.mock('./look/roomGrade.js', () => ({ applyRoomGrade: () => ({ reveal: { value: 0 } }) }));
import { SplatRoom } from './room.js';

test('switching to the courtyard releases the rendered generated room', async () => {
  const room = new SplatRoom();
  room.load({ url: 'https://example.com/world.spz', floorY: -2, scale: .8, source: 'worldlabs', numSplats: 500000 });
  pending.shift()!(); await Promise.resolve();
  expect(room.ready).toBe(true);
  room.update(1);
  const mesh = room.root.children[0] as Group & { dispose: ReturnType<typeof vi.fn> };
  room.clear();
  expect(room.ready).toBe(false);
  expect(room.info).toBe(null);
  room.update(2);
  expect(room.root.children).toHaveLength(0);
  expect(mesh.dispose).toHaveBeenCalledOnce();
});

test('a world finishing its download after switching away cannot hide the fallback again', async () => {
  const room = new SplatRoom(); const onReady = vi.fn(); room.onReady = onReady;
  room.load({ url: 'https://example.com/slow.spz', floorY: -1.5, scale: 1, source: 'worldlabs', numSplats: 100000 });
  room.clear(); pending.shift()!(); await Promise.resolve(); room.update(2);
  expect(room.ready).toBe(false);
  expect(onReady).not.toHaveBeenCalled();
  expect(room.root.children).toHaveLength(0);
});
