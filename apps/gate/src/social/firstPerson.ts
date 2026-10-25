// Seeing through someone's eyes on a phone or laptop: you stand at your own spot at the front of the memory, at the
// eye height of the perspective you see through (a grandchild's 1.1 m, a grandparent's 1.6 m), and drag to look
// around. The same pose is what everyone else sees of you, even while you watch the overview instead.
import * as THREE from 'three';
import { MEMORY_CENTER } from '../scene/layout';
import { usePresence } from '../presence/presence';
import { useGate } from '../state/store';
import { useSocial, viewingPerspective } from './store';

/** Standing spots by seat, relative to the memory's centre: along its open front, so even a grandchild's low view
 *  takes in the room rather than the nearest tabletop. The headset wearer stands at the middle of it (z ≈ 2.6). */
const SPOTS: [number, number][] = [[-1.0, 2.3], [1.0, 2.3], [-2.0, 1.9], [2.0, 1.9], [-1.6, 2.8], [1.6, 2.8]];

export function spotOf(seat: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = SPOTS[((seat % SPOTS.length) + SPOTS.length) % SPOTS.length]!;
  return out.set(MEMORY_CENTER.x + s[0], 0, MEMORY_CENTER.z + s[1]);
}

const look = { yaw: 0, pitch: -0.06, dragging: false, x: 0, y: 0 };
const _spot = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Flat screens, inside the memory, with "My view" chosen (and not standing inside a living photograph). */
export function firstPersonActive(): boolean {
  const g = useGate.getState();
  const day = g.stage === 'forming' || g.stage === 'memory' || g.stage === 'leaving';
  return day && !g.xr && !g.photoWorld && useSocial.getState().view === 'first';
}

/** Where this person's eyes are (and which way they look) when seeing through their perspective from their spot. */
export function firstPersonPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
  spotOf(usePresence.getState().me?.seat ?? 0, _spot);
  const toCentre = Math.atan2(-(MEMORY_CENTER.x - _spot.x), -(MEMORY_CENTER.z - _spot.z));
  pos.set(_spot.x, viewingPerspective().eyeHeight, _spot.z);
  quat.setFromEuler(_e.set(look.pitch, toCentre + look.yaw, 0, 'YXZ'));
}

/** CameraRig's first-person branch: fills the camera target and returns the field of view. */
export function firstPersonView(pos: THREE.Vector3, target: THREE.Vector3, aspect: number): number {
  firstPersonPose(pos, _q);
  target.set(0, 0, -3).applyQuaternion(_q).add(pos);
  return aspect < 0.8 ? 70 : 60;
}

/** Drag to look around (only while first person is active; the overview keeps its own drag). */
export function attachFirstPersonLook(el: HTMLElement): () => void {
  const down = (e: PointerEvent) => { if (!firstPersonActive()) return; look.dragging = true; look.x = e.clientX; look.y = e.clientY; };
  const move = (e: PointerEvent) => {
    if (!look.dragging) return;
    const w = el.clientWidth || 1;
    look.yaw = THREE.MathUtils.clamp(look.yaw - ((e.clientX - look.x) / w) * 2.6, -Math.PI, Math.PI);
    look.pitch = THREE.MathUtils.clamp(look.pitch + ((e.clientY - look.y) / w) * 1.6, -0.9, 0.55);
    look.x = e.clientX; look.y = e.clientY;
  };
  const up = () => { look.dragging = false; };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}
