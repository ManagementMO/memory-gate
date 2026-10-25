// Seeing through someone's eyes on a phone or laptop: you stand where that perspective stands in the memory, at its
// eye height (a grandchild's 1.1 m, a grandparent's 1.6 m), facing the other one across the room, and drag to look
// around. The same pose is what everyone else sees of you, even while you watch the overview instead.
import * as THREE from 'three';
import { useGate } from '../state/store';
import { facingOther, worldSpot } from './spots';
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
  const g = useGate.getState();
  const day = g.stage === 'forming' || g.stage === 'memory' || g.stage === 'leaving';
  return day && !g.xr && (!g.photoWorld || !!worldViewpoints()) && useSocial.getState().view === 'first';
}

/** Where this person's eyes are (and which way they look): at their perspective's spot, facing the other one. */
export function firstPersonPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
  const p = viewingPerspective();
  const at = worldSpot(p.key);
  pos.set(at.x, p.eyeHeight, at.z);
  quat.setFromEuler(_e.set(look.pitch, facingOther(p.key) + look.yaw, 0, 'YXZ'));
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
