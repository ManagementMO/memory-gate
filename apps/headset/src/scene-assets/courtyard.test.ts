import { test, expect } from 'vitest';
import { InstancedMesh } from '@iwsdk/core';
import { makeCourtyard } from './courtyard.scene-asset';

test('all 100 courtyard tiles have GPU instance capacity (no missing draw batches)', () => {
  const courtyard = makeCourtyard();
  const tiles = courtyard.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
  expect(tiles.reduce((n, mesh) => n + mesh.count, 0)).toBe(100);
  for (const mesh of tiles) expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
});
