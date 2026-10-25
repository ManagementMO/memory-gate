// Seeing through someone's eyes on a phone or laptop: you start where that perspective stands in the memory, at its
// eye height (the grandchild's 1.21 m, the grandparent's 1.45 m), facing the other one across the room, drag to look
// around and walk about (walk.ts). The same pose is what everyone else sees of you, even while you watch the overview.
import * as THREE from 'three';
import { useGate } from '../state/store';
import { facingOther, worldSpot } from './spots';
import { walk, walkKey } from './walk';
import { worldViewpoints } from './world';
import { useSocial, viewingPerspective } from './store';

const look = { yaw: 0, pitch: -0.06, dragging: false, x: 0, y: 0 };
// A new perspective starts out facing the other one.
useSocial.subscribe((s, prev) => { if (s.viewing !== prev.viewing) { look.yaw = 0; look.pitch = -0.06; } });
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Flat screens, inside the memory, with "My view" chosen. A living photograph only looks right from where it was
 *  taken, so there the photo's own view stays; a prepared world has checked viewpoints, so you stand at yours. */
export function firstPersonActive(): boolean {
  return firstPersonPossible() && useSocial.getState().view === 'first';
}
/** Where "My view" can be had at all (whichever view is chosen now). */
export function firstPersonPossible(): boolean {
  const g = useGate.getState();
  const day = g.stage === 'forming' || g.stage === 'memory' || g.stage === 'leaving';
  return day && !g.xr && (!g.photoWorld || !!worldViewpoints());
}

/** Where this person's eyes are (and which way they look): at their perspective's spot, facing the other one, or
 *  wherever they have walked to from there. */
export function firstPersonPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
  const p = viewingPerspective();
  const at = worldSpot(p.key);
  const walked = walk.key === walkKey();
  pos.set(at.x + (walked ? walk.offset.x : 0), (walked ? walk.y : 0) + p.eyeHeight, at.z + (walked ? walk.offset.z : 0));
  quat.setFromEuler(_e.set(look.pitch, lookHeading(), 0, 'YXZ'));
}

/** Which way a flat screen looks (a camera-style yaw): forward, for walking. */
export const lookHeading = () => facingOther(viewingPerspective().key) + look.yaw;

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
