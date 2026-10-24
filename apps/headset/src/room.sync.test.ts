import { beforeEach, expect, test, vi } from 'vitest';
import { Group } from '@iwsdk/core';

const pending = vi.hoisted(() => [] as (() => void)[]);
const failures = vi.hoisted(() => [] as ((error: Error) => void)[]);
const grades = vi.hoisted(() => [] as { reveal: { value: number } }[]);
vi.mock('@sparkjsdev/spark', async () => {
  const { Group } = await import('@iwsdk/core');
  return { SparkRenderer: class {}, SplatMesh: class extends Group {
    opacity = 0;
    initialized = new Promise<void>((resolve, reject) => { pending.push(resolve); failures.push(reject); });
    dispose = vi.fn();
    updateVersion() {}
  } };
});
vi.mock('./look/roomGrade.js', () => ({ applyRoomGrade: () => { const grade = { reveal: { value: 0 } }; grades.push(grade); return grade; } }));
import { SplatRoom } from './room.js';
beforeEach(() => { pending.length = 0; failures.length = 0; grades.length = 0; });

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

test('the complete metric world is revealed and taking a break freezes the forming scene', async () => {
  const room = new SplatRoom();
  room.load({ url: 'https://example.com/full-world.spz', floorY: -4, scale: .4, source: 'worldlabs', numSplats: 500000 });
  pending.shift()!(); await Promise.resolve();
  expect(room.eyeHeight).toBeCloseTo(1.6);
  room.update(.2);
  const before = grades.at(-1)!.reveal.value;
  room.setPaused(true); room.update(2);
  expect(grades.at(-1)!.reveal.value).toBe(before);
  room.setPaused(false); room.update(4);
  expect(grades.at(-1)!.reveal.value * .4).toBeCloseTo(38);
});

test('new B cannot replace ready A after the family already selected new C', async () => {
  const room = new SplatRoom(); const onReady = vi.fn(); room.onReady = onReady;
  const info = (name: string) => ({ url: `https://example.com/${name}.spz`, floorY: -1.5, scale: 1, source: 'worldlabs', numSplats: 100000 });
  room.load(info('A')); pending.shift()!(); await Promise.resolve(); room.update(1);
  const a = room.root.children[0]; onReady.mockClear();
  room.load(info('B')); const b = room.root.children[1];
  room.load(info('C')); const c = room.root.children[2];
  pending.shift()!(); await Promise.resolve(); // B finishes first but is now obsolete
  expect(onReady).not.toHaveBeenCalled();
  expect(room.ready).toBe(true); // A remains until the selected replacement is ready
  expect(room.root.children).toContain(a);
  pending.shift()!(); await Promise.resolve(); room.update(2);
  expect(onReady).toHaveBeenCalledOnce();
  expect(room.root.children).toEqual([c]);
  expect(room.root.children).not.toContain(b);
  expect(room.info?.url).toBe(info('C').url);
});

test('a superseded world failure cannot report an error over a successful selection', async () => {
  const room = new SplatRoom();
  room.load({ url: 'https://example.com/old.spz', floorY: -1.5, scale: 1, source: 'worldlabs', numSplats: 100000 });
  const obsoleteFailure = failures.at(-1)!;
  room.load({ url: 'https://example.com/current.spz', floorY: -1.5, scale: 1, source: 'worldlabs', numSplats: 100000 });
  pending.shift(); pending.shift()!(); await Promise.resolve();
  obsoleteFailure(new Error('An obsolete transfer failed')); await Promise.resolve(); await Promise.resolve();
  expect(room.ready).toBe(true);
  expect(room.error).toBe(null);
});
