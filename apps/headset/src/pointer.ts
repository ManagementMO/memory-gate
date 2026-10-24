// The release-time ray in memory-root space (placement + voice-confirm targeting): the controller (or hand) target
// ray when one is tracked, else the head ray. `hit` is where it meets the memory's floor plane (y = 0), or null.
import * as THREE from 'three';

export type Vec3 = [number, number, number];
export type PointerSource = 'controller' | 'hand' | 'head';
export type Pointer = { origin: Vec3; direction: Vec3; hit: Vec3 | null; surfaceHit?: Vec3 | null; source: PointerSource };

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4();
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** World-space ray from an Object3D whose local -Z is its pointing direction (WebXR target-ray spaces, cameras). */
export function rayFrom(obj: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3): void {
  obj.updateMatrixWorld(true);
  obj.getWorldPosition(origin);
  obj.getWorldQuaternion(_q);
  dir.set(0, 0, -1).applyQuaternion(_q).normalize();
}

/** Convert a world ray into a memory-root Pointer, intersecting the floor plane (and nothing else). */
export function toPointer(memoryRoot: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3, source: PointerSource, maxDist = 12): Pointer {
  memoryRoot.updateMatrixWorld(true);
  _inv.copy(memoryRoot.matrixWorld).invert();
  _o.copy(origin).applyMatrix4(_inv);
  _d.copy(dir).transformDirection(_inv);
  let hit: Vec3 | null = null;
  if (_d.y < -0.02 && _o.y > 0) {
    const t = -_o.y / _d.y;
    if (t > 0 && t < maxDist) hit = [r3(_o.x + _d.x * t), 0, r3(_o.z + _d.z * t)];
  }
  return { origin: [r3(_o.x), r3(_o.y), r3(_o.z)], direction: [r3(_d.x), r3(_d.y), r3(_d.z)], hit, source };
}
