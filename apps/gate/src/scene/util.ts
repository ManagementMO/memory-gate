import * as THREE from 'three';

/** Frame-rate independent exponential approach: `rate` is roughly 1/seconds-to-settle. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, rate, dt);
}

export function dampVec3(v: THREE.Vector3, target: THREE.Vector3, rate: number, dt: number): THREE.Vector3 {
  const k = 1 - Math.exp(-rate * dt);
  return v.lerp(target, k);
}

export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Additive glow that leaves the framebuffer's alpha alone (mixed reality composites by alpha). */
export function glowBlending<T extends THREE.Material>(m: T): T {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}
