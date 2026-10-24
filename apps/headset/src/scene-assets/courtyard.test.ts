import { test, expect } from 'vitest';
import { InstancedMesh } from '@iwsdk/core';
import { makeCourtyard } from './courtyard.scene-asset';

test('all courtyard paving and architectural batches have GPU instance capacity', () => {
  const courtyard = makeCourtyard();
  const tiles = courtyard.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
  expect(tiles.filter(mesh => mesh.name === 'LimestonePaving').reduce((n, mesh) => n + mesh.count, 0)).toBe(360);
  for (const mesh of tiles) expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
});
