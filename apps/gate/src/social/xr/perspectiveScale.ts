// Seeing through someone's eyes in the headset. Inside a memory you stand where that perspective stands, at its eye
// height, facing the other one across the room: behind a short blink the XR origin is scaled (k = perspective eye
// height / your measured eye height, so the world grows around your feet for a grandchild) and moved and turned so
// your head lands on the perspective's spot looking toward the other. Head tracking stays one-to-one; nothing moves
// you while your eyes are open. Outside a memory the origin follows the journey as before, scaled around your feet.
import type * as THREE from 'three';
import { useGate } from '../../state/store';

const state = { k: 1, offX: 0, offZ: 0, anchor: null as null | { x: number; z: number; yaw: number } };
const inMemory = () => { const st = useGate.getState().stage; return st === 'forming' || st === 'memory' || st === 'leaving'; };

export const originScale = () => state.k;

/** PlayerOrigin calls this every frame instead of setting the position itself. */
export function applyPerspectiveToOrigin(origin: THREE.Group | null, baseX: number, baseZ: number): void {
  if (!origin) return;
  origin.scale.setScalar(state.k);
  if (state.anchor && inMemory()) {
    origin.position.set(state.anchor.x, 0, state.anchor.z);
    origin.rotation.set(0, state.anchor.yaw, 0);
    return;
  }
  origin.rotation.set(0, 0, 0);
  origin.position.set(baseX + state.offX, 0, baseZ + state.offZ);
}

/** Change the scale outside a memory, keeping the head (its position inside the origin) fixed in the world. */
export function setOriginScale(k: number, headLocal: { x: number; z: number }): void {
  state.offX += (state.k - k) * headLocal.x;
  state.offZ += (state.k - k) * headLocal.z;
  state.k = k;
}

/**
 * Stand at a spot (world x/z) facing a direction (camera-style yaw, -Z forward), at scale k. headLocal is where the
 * head is inside the origin (tracked metres) and which way it faces there; the origin is turned and placed so that
 * the head ends up exactly on the spot, looking that way.
 */
export function anchorAt(spot: { x: number; z: number }, faceYaw: number, k: number, headLocal: { x: number; z: number; yaw: number }): void {
  const yaw = faceYaw - headLocal.yaw;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hx = headLocal.x * k, hz = headLocal.z * k;
  state.k = k;
  state.anchor = { x: spot.x - (hx * c + hz * s), z: spot.z - (-hx * s + hz * c), yaw };
}

export const anchored = () => state.anchor !== null;
export function clearAnchor(): void { state.anchor = null; }
export function resetOriginScale(): void { state.k = 1; state.offX = 0; state.offZ = 0; state.anchor = null; }
