// Seeing through someone's eyes in the headset. Inside a memory you stand where that perspective stands, at its eye
// height, facing the other one across the room: behind a short blink the XR origin is scaled (k = perspective eye
// height / your measured eye height, so the world grows around your feet for a grandchild) and moved and turned so
// your head lands on the perspective's spot looking toward the other. Head tracking stays one-to-one; nothing moves
// you while your eyes are open. Outside a memory the origin follows the journey as before, scaled around your feet.
import type * as THREE from 'three';
import { useGate } from '../../state/store';

// `turn` faces the scene toward the wearer: the headset's own "forward" is wherever it was last recentred, not where
// the person is looking when they step in, so PlayerOrigin turns the origin (faceFrom) as the visit and each memory begin.
const state = { k: 1, offX: 0, offZ: 0, turn: 0, anchor: null as null | { x: number; z: number; yaw: number }, target: null as null | { spot: { x: number; z: number }; faceYaw: number },
  // Walking inside a memory (scene/Walk.tsx): how far the stick, a turn or a hop across the ground has carried the
  // wearer from where they were placed, and the ground height under them. `epoch` counts restarts (a new memory, a
  // change of perspective, a recentre), so the walker knows to start again from the new spot.
  walk: { x: 0, y: 0, z: 0, yaw: 0, epoch: 0 } };
const inMemory = () => { const st = useGate.getState().stage; return st === 'forming' || st === 'memory' || st === 'leaving'; };

export const originScale = () => state.k;
/** Whether the wearer is standing in someone's perspective right now (it places and turns the origin itself). */
export const perspectiveAnchored = () => !!state.anchor && inMemory();

/** PlayerOrigin calls this every frame instead of setting the position itself. */
export function applyPerspectiveToOrigin(origin: THREE.Group | null, baseX: number, baseZ: number): void {
  if (!origin) return;
  origin.scale.setScalar(state.k);
  const w = inMemory() ? state.walk : null;
  if (state.anchor && inMemory()) {
    origin.position.set(state.anchor.x + (w?.x ?? 0), w?.y ?? 0, state.anchor.z + (w?.z ?? 0));
    origin.rotation.set(0, state.anchor.yaw + (w?.yaw ?? 0), 0);
    return;
  }
  origin.rotation.set(0, state.turn + (w?.yaw ?? 0), 0);
  origin.position.set(baseX + state.offX + (w?.x ?? 0), w?.y ?? 0, baseZ + state.offZ + (w?.z ?? 0));
}

/** Where walking has carried the wearer (read by scene/Walk.tsx, which moves them). */
export const walkState = (): Readonly<typeof state.walk> => state.walk;
export function setWalk(x: number, y: number, z: number, yaw: number): void { Object.assign(state.walk, { x, y, z, yaw }); }
/** Back to where the wearer was placed: a new memory, a change of perspective, a recentre. */
export function resetWalk(): void { Object.assign(state.walk, { x: 0, y: 0, z: 0, yaw: 0, epoch: state.walk.epoch + 1 }); }

/** Change the scale outside a memory, keeping the head (its position inside the origin) fixed in the world. */
export function setOriginScale(k: number, headLocal: { x: number; z: number }): void {
  const dx = (state.k - k) * headLocal.x, dz = (state.k - k) * headLocal.z;
  const c = Math.cos(state.turn), s = Math.sin(state.turn);
  state.offX += dx * c + dz * s;
  state.offZ += -dx * s + dz * c;
  state.k = k;
}

/**
 * Outside someone's perspective: turn and place the origin so the head (where it is inside the origin, tracked metres,
 * and which way it faces there) stands on the base spot looking along faceYaw (camera-style yaw, -Z forward).
 */
export function faceFrom(headLocal: { x: number; z: number; yaw: number }, faceYaw: number): void {
  const yaw = faceYaw - headLocal.yaw;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hx = headLocal.x * state.k, hz = headLocal.z * state.k;
  state.turn = yaw;
  state.offX = -(hx * c + hz * s);
  state.offZ = -(-hx * s + hz * c);
  resetWalk();
}

/** After the headset is recentred, stand in the same perspective again from the new head pose. */
export function reanchor(headLocal: { x: number; z: number; yaw: number }): void {
  if (state.target) anchorAt(state.target.spot, state.target.faceYaw, state.k, headLocal);
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
  state.target = { spot: { x: spot.x, z: spot.z }, faceYaw };
  resetWalk();
}

export const anchored = () => state.anchor !== null;
export function clearAnchor(): void { state.anchor = null; state.target = null; }
export function resetOriginScale(): void { state.k = 1; state.offX = 0; state.offZ = 0; state.turn = 0; state.anchor = null; state.target = null; resetWalk(); }
