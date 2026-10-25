// Walking about in a memory. Everyone starts at their perspective's spot; from there a laptop walks with W A S D or
// the arrow keys (Shift to hurry, R back to your spot), a phone with the walk pad, and the headset with the left
// stick (the right stick turns in steps), as well as by really stepping about. What the other person sees is that
// movement, carried by their figure's own walk.
// Input becomes movement through the Red Kite controls (red-kite/navigation.ts); in the meadow, movement is resolved
// on the meadow's real ground by its collision mesh (red-kite/traversal.ts: slopes, steps, trees, the edge of the
// world). Elsewhere the floor is flat and you stay in the room (or, in a prepared world without a walking surface,
// near the two spots).
import { ROOM } from '../../../../packages/shared/src/scene';
import type { MeadowTraversal } from '../red-kite/traversal';
import { useMemory } from '../flow/memory';
import { MEMORY_CENTER } from '../scene/layout';
import { useGate } from '../state/store';
import { memoryKey } from './perspectives';
import { spotOf } from './spots';
import { useSocial } from './store';
import { worldViewpoints } from './world';

export const walk = {
  /** The meadow's walking surface, once it has loaded (null elsewhere). */
  traversal: null as MeadowTraversal | null,
  /** Flat screens: how far you've walked from your perspective's spot (world metres), and the ground under you. */
  offset: { x: 0, z: 0 },
  y: 0,
  /** What the offset belongs to (perspective, its spot, the memory): it starts again at the spot when that changes. */
  key: '',
};

/** Walking starts again at the spot whenever the perspective, its spot (a story moved it), the memory or the device's
 *  way of seeing (headset or screen) changes. */
export function walkKey(): string {
  const viewing = useSocial.getState().viewing, spot = spotOf(viewing);
  return `${viewing}|${spot.source}|${spot.objectId}|${memoryKey()}|${useGate.getState().xr}`;
}

/** The phone's walk pad (red-kite/TouchPad) writes here. */
export const walkPad: { current: { right: number; forward: number } } = { current: { right: 0, forward: 0 } };

/** People keep a little room between them: a step that would bring you closer to someone than this slides past
 *  them instead (you can still turn away, or walk on by). */
const APART = 0.6;
export function keepApart(x: number, z: number, dx: number, dz: number, others: { x: number; z: number }[]): [number, number] {
  for (const o of others) {
    if (Math.hypot(x + dx - o.x, z + dz - o.z) >= APART) continue;
    const ux = x - o.x, uz = z - o.z, d = Math.hypot(ux, uz) || 1;
    const toward = (dx * ux + dz * uz) / d;
    if (toward < 0) { dx -= (toward * ux) / d; dz -= (toward * uz) / d; }
  }
  return [dx, dz];
}

/** The ground's height here (world y): the meadow's real ground, otherwise the floor. */
export function groundAt(x: number, z: number, near = 0): number {
  const t = walk.traversal;
  if (!t) return 0;
  return t.groundAt(x, z, near + 2.5, 6) ?? near;
}

const within = (x: number, z: number, cx: number, cz: number, r: number) => {
  const d = Math.hypot(x - cx, z - cz);
  return d <= r ? { x, z } : { x: cx + ((x - cx) / d) * r, z: cz + ((z - cz) / d) * r };
};

/** Without a walking surface: inside the room (an outdoor sketch: its clearing), or within a few metres of where the
 *  two perspectives stand in a prepared world. */
export function keepInside(x: number, z: number): { x: number; z: number } {
  const world = worldViewpoints();
  if (world) {
    const cx = (world.child.x + world.grandparent.x) / 2, cz = (world.child.z + world.grandparent.z) / 2;
    return within(x, z, cx, cz, Math.hypot(world.child.x - world.grandparent.x, world.child.z - world.grandparent.z) / 2 + 3);
  }
  if (useMemory.getState().plan?.setting.indoor === false) return within(x, z, MEMORY_CENTER.x, MEMORY_CENTER.z, ROOM.outdoorRadius - 0.4);
  const hw = ROOM.width / 2 - 0.35, hd = ROOM.depth / 2 - 0.35;
  return { x: Math.max(MEMORY_CENTER.x - hw, Math.min(MEMORY_CENTER.x + hw, x)), z: Math.max(MEMORY_CENTER.z - hd, Math.min(MEMORY_CENTER.z + hd, z)) };
}
