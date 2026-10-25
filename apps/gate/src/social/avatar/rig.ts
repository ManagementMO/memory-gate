// Driving a person's likeness from just a head and two hands. Bones are found by name in the rigs we expect
// (MPFB's "game engine" skeleton, MPFB's default, Mixamo), matched loosely because exporters rename them
// (GLTFLoader also strips ".", ":" and brackets). The body turns to follow the head; neck and head share its turn;
// each arm reaches its hand with an analytic two-bone solve (CCDIKSolver would need targets inside the skeleton).
import * as THREE from 'three';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const NAMES = {
  head: ['head', 'mixamorighead'],
  neck: ['neck01', 'neck', 'neck1', 'mixamorigneck'],
  upperL: ['upperarml', 'upperarm01l', 'upperarmleft', 'leftarm', 'mixamorigleftarm'],
  lowerL: ['lowerarml', 'lowerarm01l', 'lowerarmleft', 'leftforearm', 'mixamorigleftforearm'],
  handL: ['handl', 'wristl', 'handleft', 'lefthand', 'mixamoriglefthand'],
  upperR: ['upperarmr', 'upperarm01r', 'upperarmright', 'rightarm', 'mixamorigrightarm'],
  lowerR: ['lowerarmr', 'lowerarm01r', 'lowerarmright', 'rightforearm', 'mixamorigrightforearm'],
  handR: ['handr', 'wristr', 'handright', 'righthand', 'mixamorigrighthand'],
} as const;
export type Rig = { -readonly [K in keyof typeof NAMES]: THREE.Bone } & { rest: Map<THREE.Bone, THREE.Quaternion> };

export function findRig(root: THREE.Object3D): Rig | null {
  const byName = new Map<string, THREE.Bone>();
  root.traverse((o) => { if ((o as THREE.Bone).isBone) byName.set(norm(o.name), o as THREE.Bone); });
  const found: Partial<Rig> = {};
  for (const [key, names] of Object.entries(NAMES) as [keyof typeof NAMES, readonly string[]][]) {
    const bone = names.map((n) => byName.get(n)).find(Boolean);
    if (!bone) return null;
    found[key] = bone;
  }
  const rig = found as Rig;
  rig.rest = new Map(Object.keys(NAMES).map((k) => { const b = rig[k as keyof typeof NAMES]; return [b, b.quaternion.clone()]; }));
  return rig;
}

const _pq = new THREE.Quaternion();
const _bq = new THREE.Quaternion();
/** Rotate a bone by a world-space rotation on top of its current pose (children follow). */
export function turnBone(bone: THREE.Object3D, delta: THREE.Quaternion): void {
  bone.getWorldQuaternion(_bq).premultiply(delta);
  if (bone.parent) bone.parent.getWorldQuaternion(_pq); else _pq.identity();
  bone.quaternion.copy(_pq.invert().multiply(_bq));
  bone.updateMatrixWorld(true);
}

const S = new THREE.Vector3(), E = new THREE.Vector3(), W = new THREE.Vector3(), D = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3();
const _q = new THREE.Quaternion();
/** Bend upper → lower so that `end` reaches `target`, the elbow toward `pole` (all world space). */
export function reach(upper: THREE.Bone, lower: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3): void {
  upper.getWorldPosition(S); lower.getWorldPosition(E); end.getWorldPosition(W);
  const a = S.distanceTo(E), b = E.distanceTo(W);
  if (a < 1e-4 || b < 1e-4) return;
  D.subVectors(target, S);
  const d = THREE.MathUtils.clamp(D.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  D.normalize();
  const cos = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  B.subVectors(pole, S); B.addScaledVector(D, -B.dot(D));
  if (B.lengthSq() < 1e-8) B.set(0, -1, 0).addScaledVector(D, -D.y);
  B.normalize();
  X.copy(S).addScaledVector(D, cos * a).addScaledVector(B, Math.sqrt(1 - cos * cos) * a); // where the elbow goes
  turnBone(upper, _q.setFromUnitVectors(Y.subVectors(E, S).normalize(), T.subVectors(X, S).normalize()));
  lower.getWorldPosition(E); end.getWorldPosition(W);
  T.copy(S).addScaledVector(D, d);
  turnBone(lower, _q.setFromUnitVectors(Y.subVectors(W, E).normalize(), X.subVectors(T, E).normalize()));
}

/** The body's facing (a camera-style yaw, -Z forward) eases after the head, faster the further the head has turned. */
export function followYaw(body: number, head: number, dt: number): number {
  let diff = head - body;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const rate = Math.abs(diff) > 0.6 ? 4 : 0.8;
  return body + diff * (1 - Math.exp(-rate * dt));
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
export const yawOf = (q: THREE.Quaternion) => _e.setFromQuaternion(q, 'YXZ').y;
