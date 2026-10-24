// Seeing through a grandchild's eyes in the headset: the world grows around your feet until your eyes sit at their
// eye line. Technically the XR origin is scaled by k = perspective eye height / your measured eye height, so the
// floor stays under you and head tracking stays one-to-one; nothing moves you. When k changes, the origin shifts so
// your head stays exactly where it was over the floor (the world grows around you, not around the room's corner).
import type * as THREE from 'three';

const state = { k: 1, offX: 0, offZ: 0 };

export const originScale = () => state.k;

/** PlayerOrigin calls this every frame instead of setting the position itself. */
export function applyPerspectiveToOrigin(origin: THREE.Group | null, baseX: number, baseZ: number): void {
  if (!origin) return;
  origin.scale.setScalar(state.k);
  origin.position.set(baseX + state.offX, 0, baseZ + state.offZ);
}

/** Change the scale, keeping the head (its position inside the origin) fixed in the world. */
export function setOriginScale(k: number, headLocal: { x: number; z: number }): void {
  state.offX += (state.k - k) * headLocal.x;
  state.offZ += (state.k - k) * headLocal.z;
  state.k = k;
}

export function resetOriginScale(): void { state.k = 1; state.offX = 0; state.offZ = 0; }
