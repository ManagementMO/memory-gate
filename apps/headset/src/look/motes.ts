// Warm light motes: one GPU particle pool for settle sparks/bursts, plus a separate slow ambient dust field.
// Motion is computed in the vertex shader from per-particle birth data, so the CPU only writes a few attributes
// when particles are emitted (no per-frame allocation). Sizes are in METERS (a few millimetres each), converted to
// pixels with the projection and the real viewport height, and clamped, so a mote can never wash out the view.
import * as THREE from 'three';
import { VIEWPORT_H, glowBlending } from './palette.js';

const VERT = /* glsl */ `
attribute vec3 aStart; attribute vec3 aVel; attribute float aBirth; attribute float aLife; attribute float aSize;
uniform float uTime, uFade, uViewportH;
varying float vA;
void main() {
  float age = uTime - aBirth;
  float k = clamp(age / aLife, 0.0, 1.0);
  vec3 p = aStart + aVel * age + vec3(sin(age * 2.3 + aBirth * 7.0), 0.0, cos(age * 1.9 + aBirth * 5.0)) * 0.012 * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float alive = step(0.0, age) * step(age, aLife);
  vA = alive * (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.25, age) * uFade;
  // meters -> pixels: size_m * P[1][1] * viewportH / 2 / depth, clamped to 1..18 px
  gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uViewportH * 0.5 / max(0.05, -mv.z), 1.0, 18.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  float a = vA * exp(-r * 3.2);
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

export class Motes {
  readonly points: THREE.Points;
  private next = 0;
  private attrs: Record<'aStart' | 'aVel' | 'aBirth' | 'aLife' | 'aSize', THREE.BufferAttribute>;
  readonly uniforms = { uTime: { value: 0 }, uViewportH: VIEWPORT_H, uFade: { value: 1 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.55) } };

  constructor(private capacity = 600) {
    const g = new THREE.BufferGeometry();
    const mk = (n: number) => new THREE.BufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = { aStart: mk(3), aVel: mk(3), aBirth: mk(1), aLife: mk(1), aSize: mk(1) };
    (this.attrs.aBirth.array as Float32Array).fill(-1000);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    for (const [k, a] of Object.entries(this.attrs)) g.setAttribute(k, a);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.points = new THREE.Points(g, glowBlending(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG })));
    this.points.frustumCulled = false;
    this.points.renderOrder = 1000;
  }

  private emit(px: number, py: number, pz: number, vx: number, vy: number, vz: number, life: number, size: number): void {
    const i = this.next; this.next = (this.next + 1) % this.capacity;
    this.attrs.aStart.setXYZ(i, px, py, pz);
    this.attrs.aVel.setXYZ(i, vx, vy, vz);
    this.attrs.aBirth.setX(i, this.uniforms.uTime.value);
    this.attrs.aLife.setX(i, life);
    this.attrs.aSize.setX(i, size);
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }

  /** Sparks on a dissolve front: points on a ring of radius r at height y, drifting up and slightly out. */
  emitRing(cx: number, y: number, cz: number, r: number, count: number, strength: number): void {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      this.emit(cx + c * r, y, cz + s * r, c * 0.03 * strength, (0.05 + Math.random() * 0.08) * strength, s * 0.03 * strength,
        1.1 + Math.random() * 0.9, 0.004 + Math.random() * 0.005);
    }
  }

  /** A soft burst inside a box (center + half extents) as an object settles: slow, outward and upward. */
  emitBurst(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const dx = (Math.random() - 0.5) * 2 * hx, dy = (Math.random() - 0.5) * 2 * hy, dz = (Math.random() - 0.5) * 2 * hz;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = 0.04 + Math.random() * 0.05;
      this.emit(cx + dx, cy + dy, cz + dz, (dx / l) * sp, (dy / l) * sp + 0.05, (dz / l) * sp, 1.4 + Math.random() * 1.2, 0.003 + Math.random() * 0.006);
    }
  }
}

// Ambient dust in the room volume: slow, sparse, barely there (sells "air" and depth without noise).
export function makeDust(count = 220, box = new THREE.Box3(new THREE.Vector3(-2.2, 0.15, -3.4), new THREE.Vector3(2.0, 2.4, -0.4))): { points: THREE.Points; uniforms: { uTime: { value: number }; uFade: { value: number }; uViewportH: { value: number } } } {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[3 * i] = THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random());
    pos[3 * i + 1] = THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random());
    pos[3 * i + 2] = THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random());
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uFade: { value: 1 }, uViewportH: VIEWPORT_H };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uFade, uViewportH; varying float vA;
      void main() {
        float t = uTime * (0.05 + aSeed * 0.05) + aSeed * 40.0;
        vec3 p = position + vec3(sin(t * 1.3) * 0.12, mod(uTime * 0.012 * (0.5 + aSeed), 0.6) - 0.3, cos(t) * 0.12);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = (0.14 + 0.12 * sin(uTime * (0.6 + aSeed) + aSeed * 30.0)) * uFade;
        gl_PointSize = clamp((0.0022 + aSeed * 0.0032) * projectionMatrix[1][1] * uViewportH * 0.5 / max(0.1, -mv.z), 1.0, 10.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.68) * vA * exp(-r * 3.0), 1.0); }`,
  });
  glowBlending(mat);
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 1000;
  return { points, uniforms };
}
