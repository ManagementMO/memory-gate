import { expect, test } from 'vitest';
import { environmentFarPlane, roomPresentation } from './worldPresentation.js';

test('a complete world keeps natural color and a full metric reveal at different provider scales', () => {
  for (const scale of [.38, .95, 2.1]) {
    const look = roomPresentation('worldlabs', scale);
    expect(look.warmth).toBeLessThan(.1);
    expect(look.distanceFade).toBe(false); // the distant hills/sky cannot be cut off by a photo's reveal window
    expect(look.farStart * scale).toBeCloseTo(28);
    expect(look.revealRadius).toBeGreaterThan(look.farEnd);
    expect(look.revealRadius * scale).toBeCloseTo(38);
  }
  expect(roomPresentation('sharp').farEnd).toBeLessThan(10);
  expect(roomPresentation('sharp').distanceFade).toBe(true);
  expect(roomPresentation('prebaked').distanceFade).toBe(true);
});

test('the generated meadow horizon beyond 267 meters stays within the world camera, without changing photo clipping', () => {
  expect(environmentFarPlane('worldlabs')).toBeGreaterThan(410.662); // measured maximum center radius in the cached meadow
  expect(environmentFarPlane('sharp')).toBe(200);
  expect(environmentFarPlane('prebaked')).toBe(200);
});
