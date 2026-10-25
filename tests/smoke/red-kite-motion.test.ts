import { describe, expect, it } from 'vitest';
import { beginSwitch, cancelSwitch, initialTransition, stepTransition, clampSpool, stepMotion, initialMotion } from '../../apps/gate/src/red-kite/motion';

describe('Red Kite local motion', () => {
  it('covers the world fully before moving the local viewpoint and fades in only afterward', () => {
    let t = beginSwitch(initialTransition('elena'), 'rosa', false);
    for (let i = 0; i < 3; i++) { t = stepTransition(t, .1, false); expect(t.current).toBe('elena'); }
    t = stepTransition(t, .1, false);
    expect(t).toMatchObject({ current: 'rosa', opacity: 1, phase: 'covered' });
    t = stepTransition(t, .1, false); expect(t.opacity).toBe(1);
    for (let i = 0; i < 8; i++) t = stepTransition(t, .1, false);
    expect(t).toMatchObject({ current: 'rosa', phase: 'idle', opacity: 0 });
  });
  it('freezes a paused switch, ignores paused requests and coalesces rapid requests', () => {
    const initial = initialTransition('elena');
    expect(beginSwitch(initial, 'rosa', true)).toBe(initial);
    const half = stepTransition(beginSwitch(initial, 'rosa', false), .1, false);
    expect(stepTransition(half, 10, true)).toBe(half);
    const latest = beginSwitch(half, 'elena', false);
    let t = latest;
    for (let i = 0; i < 20; i++) t = stepTransition(t, .1, false);
    expect(t.current).toBe('elena'); expect(t.phase).toBe('idle');
    expect(initial.current).toBe('elena'); // another viewer's state was never mutated
  });
  it('bounds a captured pointer near the real spool and docks/release on rest', () => {
    expect(clampSpool([100, -9, 8])).toEqual([-.18, .81, -.35]);
    const moving = { ...initialMotion(), time: 2, breeze: 1, held: [-.5, 1.02, -.7] as [number, number, number] };
    const rested = stepMotion(moving, 3, true);
    expect(rested.time).toBe(2); expect(rested.breeze).toBe(1);
    expect(rested.held).toBeNull(); expect(rested.spool).toEqual(initialMotion().spool);
    const resumed = stepMotion(rested, .04, false);
    expect(resumed.time).toBeGreaterThan(2); expect(resumed.breeze).toBeLessThan(1);
  });
  it('rest or disconnect clears a pending mask at the current safe anchor so hand-only users can continue', () => {
    const half = stepTransition(beginSwitch(initialTransition('elena'), 'rosa', false), .1, false);
    expect(cancelSwitch(half)).toEqual(initialTransition('elena'));
    let moved = half;
    while (moved.phase !== 'covered') moved = stepTransition(moved, .1, false);
    expect(cancelSwitch(moved)).toEqual(initialTransition('rosa'));
  });
  it('a grab without lift stays level; actual lift drives a bounded, smoothed kite response', () => {
    const dock = initialMotion();
    const held = stepMotion({ ...dock, held: [...dock.spool] }, .05, false);
    expect(held.kiteLift).toBe(0);
    const raise = (height: number) => {
      let s: ReturnType<typeof initialMotion> = { ...initialMotion(), held: [dock.spool[0], dock.spool[1] + height, dock.spool[2]] };
      for (let i = 0; i < 20; i++) s = stepMotion(s, .025, false);
      return s;
    };
    const low = raise(.1), high = raise(.3);
    expect(low.kiteLift).toBeGreaterThan(0); expect(high.kiteLift).toBeGreaterThan(low.kiteLift);
    expect(high.kiteLift).toBeLessThan(.3);
    const released = stepMotion({ ...high, held: null }, .016, false);
    expect(Math.abs(released.kiteLift - high.kiteLift)).toBeLessThan(.015);
    expect(stepMotion(high, 1, true).kiteLift).toBe(high.kiteLift);
  });
  it('reduced motion freezes the idle clock while preserving explicit spool movement', () => {
    const s = { ...initialMotion(), time: 3, held: [-.5, 1.1, -.7] as [number, number, number] };
    const next = stepMotion(s, .05, false, true);
    expect(next.time).toBe(3); expect(next.spool[1]).toBeGreaterThan(s.spool[1]);
    expect(stepMotion(next, .05, false, false).time).toBeGreaterThan(3);
  });
});
