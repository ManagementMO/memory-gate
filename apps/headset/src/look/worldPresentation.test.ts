import { expect, test } from 'vitest';
import { roomPresentation } from './worldPresentation.js';

test('a complete world keeps natural color and a full metric reveal at different provider scales', () => {
  for (const scale of [.38, .95, 2.1]) {
    const look = roomPresentation('worldlabs', scale);
    expect(look.warmth).toBeLessThan(.1);
    expect(look.farStart * scale).toBeCloseTo(28);
    expect(look.revealRadius).toBeGreaterThan(look.farEnd);
    expect(look.revealRadius * scale).toBeCloseTo(38);
  }
  expect(roomPresentation('sharp').farEnd).toBeLessThan(10);
});
