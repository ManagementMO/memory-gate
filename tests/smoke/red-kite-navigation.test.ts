import { describe, expect, it } from 'vitest';
import { initialNavigation, lookAround, stepNavigation } from '../../apps/gate/src/red-kite/navigation';

describe('Red Kite exploration', () => {
  it('moves relative to the view, limits diagonal speed and permits continuous traversal', () => {
    const zero = initialNavigation();
    const forward = stepNavigation(zero, { right: 0, forward: 1, heading: 0, turn: 0 }, .05, false);
    expect(forward.x).toBe(0); expect(forward.z).toBeCloseTo(-.09);
    const east = stepNavigation(zero, { right: 0, forward: 1, heading: -Math.PI / 2, turn: 0 }, .05, false);
    expect(east.x).toBeCloseTo(.09); expect(east.z).toBeCloseTo(0);
    let diagonal = stepNavigation(zero, { right: 1, forward: 1, heading: 0, turn: 0 }, .05, false);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(.09);
    for (let i = 0; i < 500; i++) diagonal = stepNavigation(diagonal, { right: 1, forward: 1, heading: 0, turn: 0 }, .05, false);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeGreaterThan(40);
  });
  it('ignores stick drift and paused input; requires stick release before another snap turn', () => {
    const zero = initialNavigation();
    const quiet = { right: .05, forward: -.04, heading: 0, turn: .1 };
    expect(stepNavigation(zero, quiet, .05, false)).toEqual(zero);
    expect(stepNavigation(zero, { ...quiet, forward: 1, turn: 1 }, .05, true)).toBe(zero);
    const turned = stepNavigation(zero, { ...quiet, right: 0, forward: 0, turn: 1 }, .05, false);
    expect(turned.yaw).toBeCloseTo(-Math.PI / 6);
    const held = stepNavigation(turned, { ...quiet, right: 0, forward: 0, turn: 1 }, .05, false);
    expect(held.yaw).toBe(turned.yaw);
    const released = stepNavigation(held, { ...quiet, right: 0, forward: 0, turn: 0 }, .05, false);
    expect(stepNavigation(released, { ...quiet, right: 0, forward: 0, turn: 1 }, .05, false).yaw).toBeCloseTo(-Math.PI / 3);
  });
  it('allows looking without roll or a camera flip', () => {
    const looked = lookAround(initialNavigation(), 120, 40);
    expect(looked.yaw).not.toBe(0); expect(looked.pitch).toBeLessThan(0);
    expect(lookAround(looked, 0, 100000).pitch).toBeGreaterThan(-Math.PI / 2);
    expect(lookAround(looked, 0, -100000).pitch).toBeLessThan(Math.PI / 2);
  });
});
