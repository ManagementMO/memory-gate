// Look-dev palette: one sepia ramp shared by the splat room (GLSL in roomGrade.ts) and every object (gradeMaterial),
// so mixed-source models sit inside the photograph instead of on top of it.
import * as THREE from 'three';

export const SEPIA = {
  shadow: new THREE.Color(0.16, 0.11, 0.075),
  mid: new THREE.Color(0.6, 0.47, 0.33),
  high: new THREE.Color(0.99, 0.93, 0.8),
};
export const GOLD = new THREE.Color(1.0, 0.8, 0.52); // ghost rim, companion core, settle edge
export const INK = '#f8eedc'; // caption text
export const BRASS = '#e7c48d'; // speaker label, source marker

export const SEPIA_GLSL = /* glsl */ `
vec3 mgSepia(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(mix(vec3(0.16, 0.11, 0.075), vec3(0.60, 0.47, 0.33), smoothstep(0.0, 0.55, l)),
             vec3(0.99, 0.93, 0.80), smoothstep(0.45, 1.0, l));
}`;

// Soft round sprite texture for contact shadows and glows (drawn once on a canvas).
export function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

// Point sprites are sized in meters: px = size_m * projectionMatrix[1][1] * viewportHeight / 2 / depth.
// memory.ts updates VIEWPORT_H every frame (drawing buffer height, or the XR layer's framebuffer height).
export const VIEWPORT_H = { value: 800 };

/** Additive glow that leaves the framebuffer's alpha alone. In mixed reality the compositor blends our layer over
 * passthrough by its alpha, so plain AdditiveBlending (which writes alpha = 1) turns every faint glow pixel into an
 * opaque dark speck over the real room. Color adds (ONE, ONE); alpha keeps the destination (ZERO, ONE). Shaders
 * output premultiplied glow (color × intensity), so desktop looks the same as before. */
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
