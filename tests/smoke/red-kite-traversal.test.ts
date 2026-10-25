import { describe, expect, it } from 'vitest';
import { createTraversal } from '../../apps/gate/src/red-kite/traversal';

const floor = { vertices: new Float32Array([-30,0,-30, 30,0,-30, -30,0,30, 30,0,30]), indices: new Uint32Array([0,2,1, 2,3,1]) };
describe('Red Kite real character collision', () => {
  it('walks well beyond the original anchor, stays on real ground and freezes on Rest', async () => {
    const p = await createTraversal([floor], { normalizeSpawn: false, table: false });
    try {
      p.place([0,0,0]);
      for (let i = 0; i < 360; i++) p.step([0,-1.8/60], 1/60);
      expect(p.feet[2]).toBeLessThan(-10);
      expect(p.feet[1]).toBeGreaterThanOrEqual(-.02); expect(p.feet[1]).toBeLessThan(.08);
      const before = [...p.feet]; p.step([1,1], 1, true, true); expect(p.feet).toEqual(before);
    } finally { p.dispose(); }
  });
  it('slides against a mesh wall instead of walking through it', async () => {
    const wall = { vertices: new Float32Array([1,0,-20, 1,4,-20, 1,0,20, 1,4,20]), indices: new Uint32Array([0,1,2, 2,1,3]) };
    const p = await createTraversal([floor, wall], { normalizeSpawn: false, table: false });
    try {
      p.place([0,0,0]);
      for (let i = 0; i < 180; i++) p.step([.025,-.015], 1/60);
      expect(p.feet[0]).toBeGreaterThan(.5); expect(p.feet[0]).toBeLessThan(.8);
      expect(p.feet[2]).toBeLessThan(-1.5);
    } finally { p.dispose(); }
  });
  it('jumps from the ground and lands without tunneling through it', async () => {
    const p = await createTraversal([floor], { normalizeSpawn: false, table: false });
    try {
      p.place([0,0,0]);
      let highest = 0;
      for (let i = 0; i < 180; i++) { p.step([0,0], 1/90, i === 0); highest = Math.max(highest, p.feet[1]); }
      expect(highest).toBeGreaterThan(.4); expect(highest).toBeLessThan(1.2);
      expect(p.feet[1]).toBeGreaterThanOrEqual(-.02); expect(p.feet[1]).toBeLessThan(.08);
      expect(p.grounded).toBe(true);
    } finally { p.dispose(); }
  });
  it('stops at missing geometry instead of adding an invisible infinite floor', async () => {
    const small = { vertices: new Float32Array([-2,0,-2, 2,0,-2, -2,0,2, 2,0,2]), indices: floor.indices };
    const p = await createTraversal([small], { normalizeSpawn: false, table: false });
    try {
      p.place([0,0,0]);
      for (let i = 0; i < 300; i++) p.step([0,-.03], 1/60);
      expect(p.feet[2]).toBeGreaterThan(-2.2); expect(p.feet[1]).toBeGreaterThan(-.1);
      expect(p.edgeBlocked).toBe(true);
    } finally { p.dispose(); }
  });
  it('follows an ordinary slope rather than hovering at the original floor height', async () => {
    const slope = { vertices: new Float32Array([-10,-2,-10, 10,-2,-10, -10,2,10, 10,2,10]), indices: floor.indices };
    const p = await createTraversal([slope], { normalizeSpawn: false, table: false });
    try {
      p.place([0,0,0]);
      for (let i = 0; i < 150; i++) p.step([0,.03], 1/60);
      expect(p.feet[2]).toBeGreaterThan(3.5); expect(p.feet[1]).toBeGreaterThan(.65);
      expect(Math.abs(p.feet[1] - p.feet[2] * .2)).toBeLessThan(.1);
    } finally { p.dispose(); }
  });
});
