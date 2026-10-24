// The companion's presence: no face, no avatar. A small warm light with a soft halo and a few orbiting motes,
// floating beside the storyteller's line of sight and following lazily (never head-locked).
// idle: slow breath. listening: halo opens, motes gather, a ring pulses with the mic level.
// thinking: motes circle faster in a flat ring. speaking: the core follows the voice's loudness.
import * as THREE from 'three';
import { VIEWPORT_H, glowBlending } from './palette.js';

export type CompanionState = 'idle' | 'listening' | 'thinking' | 'speaking';

const _head = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _fwd = new THREE.Vector3(), _left = new THREE.Vector3(), _target = new THREE.Vector3();

const BILLBOARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Companion {
  readonly root = new THREE.Group();
  state: CompanionState = 'idle';
  level = 0; // 0..1: mic level while listening, voice envelope while speaking
  visibleTarget = 1;
  private fade = 0;
  private coreU = { uIntensity: { value: 1 }, uFade: { value: 0 } };
  private haloU = { uIntensity: { value: 0.3 }, uFade: { value: 0 } };
  private ringU = { uPhase: { value: 0 }, uAmount: { value: 0 }, uFade: { value: 0 } };
  private orbitU = { uTime: { value: 0 }, uClock: { value: 0 }, uSpin: { value: 1 }, uGather: { value: 0 }, uFlat: { value: 1 }, uFade: { value: 0 }, uViewportH: VIEWPORT_H };
  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  private ring: THREE.Mesh;
  private spin = 0;
  private placed = false;
  private smoothLevel = 0;
  /** 0..1 current visibility (for pause: hide when ~0). */
  get shown(): number { return this.fade; }

  constructor() {
    const add = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), Object.assign(add.clone(), {
      uniforms: this.coreU, vertexShader: BILLBOARD_VERT,
      fragmentShader: /* glsl */ `
        uniform float uIntensity, uFade; varying vec2 vUv;
        void main() { float r2 = dot(vUv - 0.5, vUv - 0.5) * 4.0;
          float core = exp(-r2 * 22.0), glow = exp(-r2 * 5.0) * 0.45;
          vec3 col = mix(vec3(1.0, 0.72, 0.38), vec3(1.0, 0.97, 0.9), core);
          gl_FragColor = vec4(col * (core * 0.7 + glow * 0.55) * uIntensity * uFade, 1.0); }`,
    }));
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), Object.assign(add.clone(), {
      uniforms: this.haloU, vertexShader: BILLBOARD_VERT,
      fragmentShader: /* glsl */ `
        uniform float uIntensity, uFade; varying vec2 vUv;
        void main() { float r2 = dot(vUv - 0.5, vUv - 0.5) * 4.0;
          gl_FragColor = vec4(vec3(1.0, 0.75, 0.45) * exp(-r2 * 3.5) * uIntensity * uFade, 1.0); }`,
    }));
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), Object.assign(add.clone(), {
      uniforms: this.ringU, vertexShader: BILLBOARD_VERT,
      fragmentShader: /* glsl */ `
        uniform float uPhase, uAmount, uFade; varying vec2 vUv;
        void main() { float r = length(vUv - 0.5) * 2.0; float R = mix(0.25, 1.0, uPhase);
          float ring = exp(-pow((r - R) / 0.018, 2.0)) * (1.0 - uPhase);
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * ring * uAmount * uFade, 1.0); }`,
    }));
    const n = 42;
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seed.set([0.05 + Math.random() * 0.07, 0.4 + Math.random() * 0.8, Math.random() * 6.283, (Math.random() - 0.5) * 1.6], 4 * i);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const orbit = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.orbitU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime, uClock, uSpin, uGather, uFlat, uViewportH; varying float vA;
        void main() {
          float a = aSeed.z + uTime * aSeed.y * uSpin;
          float r = aSeed.x * mix(1.0, 0.45, uGather);
          vec3 p = vec3(cos(a) * r, sin(a * 0.7 + aSeed.z) * r * aSeed.w * uFlat, sin(a) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = 0.7 + 0.3 * sin(uClock * 2.6 + aSeed.z * 5.0); // 0.41 Hz twinkle
          gl_PointSize = clamp((0.0026 + aSeed.y * 0.0022) * projectionMatrix[1][1] * uViewportH * 0.5 / max(0.05, -mv.z), 1.0, 24.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade; varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * vA * exp(-r * 3.0) * uFade, 1.0); }`,
    }));
    orbit.frustumCulled = false;
    for (const m of [this.core.material, this.halo.material, this.ring.material, orbit.material] as THREE.Material[]) glowBlending(m);
    for (const [o, ro] of [[this.halo, 1001], [this.ring, 1002], [orbit, 1003], [this.core, 1004]] as const) { o.renderOrder = ro; this.root.add(o); }
  }

  update(dt: number, time: number, camera: THREE.Object3D): void {
    // Follow: beside and slightly below the line of sight, ~0.95 m away, smoothed over ~1 s; a gentle bob.
    const head = _head, q = _q;
    camera.getWorldPosition(head); camera.getWorldQuaternion(q);
    const yaw = _e.setFromQuaternion(q, 'YXZ').y;
    const fwd = _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)), left = _left.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const target = _target.copy(head).addScaledVector(fwd, 0.95).addScaledVector(left, 0.36);
    target.y += -0.1 + 0.012 * Math.sin(time * 0.9);
    if (!this.placed) { this.root.position.copy(target); this.placed = true; }
    this.root.position.lerp(target, 1 - Math.exp(-dt / 0.9));
    for (const m of [this.core, this.halo, this.ring]) m.quaternion.copy(q);

    // Linear ~1.5 s fade (pause hides the companion with everything else, then visible = false).
    this.fade = this.visibleTarget > this.fade ? Math.min(this.visibleTarget, this.fade + dt / 1.5) : Math.max(this.visibleTarget, this.fade - dt / 1.5);
    this.root.visible = this.fade > 0.01;
    this.smoothLevel += (Math.min(1, this.level) - this.smoothLevel) * Math.min(1, dt / 0.35);
    const L = this.smoothLevel;
    const breathe = 0.86 + 0.14 * Math.sin(time * Math.PI * 2 * 0.22);
    const s = this.state;
    const coreI = s === 'speaking' ? 0.75 + 0.45 * L : s === 'listening' ? 0.8 + 0.35 * L : s === 'thinking' ? 0.65 : 0.62 * breathe;
    const haloI = s === 'speaking' ? 0.24 + 0.36 * L : s === 'listening' ? 0.34 + 0.24 * L : s === 'thinking' ? 0.2 : 0.2 * breathe;
    const k = Math.min(1, dt * 3); // ~0.33 s response: no fast brightness steps
    this.coreU.uIntensity.value += (coreI - this.coreU.uIntensity.value) * k;
    this.haloU.uIntensity.value += (haloI - this.haloU.uIntensity.value) * k;
    this.halo.scale.setScalar(1 + (s === 'listening' ? 0.25 : 0) + (s === 'speaking' ? 0.35 * L : 0));
    this.spin += dt * (s === 'thinking' ? 2.6 : s === 'listening' ? 0.6 : 1.0);
    this.orbitU.uTime.value = this.spin;
    this.orbitU.uClock.value = time;
    this.orbitU.uGather.value += ((s === 'listening' ? 0.35 + 0.5 * L : s === 'thinking' ? 0.2 : 0) - this.orbitU.uGather.value) * k;
    this.orbitU.uFlat.value += ((s === 'thinking' ? 0.08 : 1) - this.orbitU.uFlat.value) * k;
    this.ringU.uPhase.value = (time / 2.2) % 1; // 0.45 Hz (calm contract: pulses <= 0.5 Hz)
    this.ringU.uAmount.value += ((s === 'listening' ? 0.5 + L : 0) - this.ringU.uAmount.value) * k;
    for (const u of [this.coreU, this.haloU, this.ringU, this.orbitU]) u.uFade.value = this.fade;
  }
}
