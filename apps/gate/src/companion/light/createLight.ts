// The Light companion: no face, no body. A warm core inside an aurora-tinted halo, two hairline orbits that turn
// like a slow orrery, and a few motes. Ported from the headset build's companion and polished:
//   idle       slow breath (0.22 Hz), the halo's tint drifts between lavender and mint
//   listening  the halo opens, motes gather, a ring pulses outward with the voice
//   thinking   motes flatten into a ring and circle faster; the orbits speed up
//   speaking   the core follows the voice's loudness
// On the white memory space additive light would vanish, so the same shapes switch to tinted, alpha-blended paint.
// Calm contract: pulses ≤ 0.5 Hz, brightness changes over ≥ 0.33 s.
import * as THREE from 'three';
import type { Expression, Mood } from '../../state/store';
import { glowBlending } from '../../scene/util';

const BILLBOARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export type LightRig = {
  root: THREE.Group;
  update(dt: number, time: number, o: { mood: Mood; level: number; expression: Expression; onLight: number; camera: THREE.Camera; fade: number }): void;
  dispose(): void;
};

export function createLight(): LightRig {
  const root = new THREE.Group();
  root.name = 'light-companion';
  const facing = new THREE.Group(); // billboarded parts
  root.add(facing);

  const common = { uFade: { value: 0 }, uOnLight: { value: 0 }, uTime: { value: 0 } };
  const coreU = { ...common, uIntensity: { value: 0.7 }, uWarm: { value: 0.5 } };
  const haloU = { ...common, uIntensity: { value: 0.3 }, uTint: { value: new THREE.Color('#b9a6ff') } };
  const ringU = { ...common, uPhase: { value: 0 }, uAmount: { value: 0 } };
  const orbitU = { ...common, uIntensity: { value: 0.6 }, uTint: { value: new THREE.Color('#d9d2ff') } };
  const moteU = { ...common, uSpin: { value: 0 }, uGather: { value: 0 }, uFlat: { value: 1 }, uPx: { value: 800 } };

  // Two blend modes from one material: additive light at night, tinted paint on white.
  const additive = <T extends THREE.Material>(m: T) => glowBlending(m);
  const make = (uniforms: Record<string, THREE.IUniform>, frag: string, vert = BILLBOARD_VERT) =>
    additive(new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false, transparent: true }));

  const LIGHT_FN = /* glsl */ `
  // On white, light must be painted: premultiplied colour over the background (alpha-blended).
  vec4 emit(vec3 col, float a) {
    if (uOnLight < 0.5) return vec4(col * a * uFade, 1.0);
    return vec4(col * a * uFade, a * uFade);
  }`;

  const coreMat = make(coreU, /* glsl */ `
    uniform float uIntensity, uFade, uOnLight, uTime, uWarm; varying vec2 vUv;
    ${LIGHT_FN}
    void main() {
      vec2 d = vUv - 0.5; float r2 = dot(d, d) * 4.0;
      float hot = exp(-r2 * 26.0), body = exp(-r2 * 6.0);
      vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.86, 0.66), uWarm);
      vec3 col = mix(warm, vec3(1.0, 0.98, 0.94), hot);
      if (uOnLight > 0.5) col = mix(vec3(1.0, 0.72, 0.38), vec3(1.0, 0.93, 0.8), hot);
      float a = clamp((hot * 0.95 + body * (uOnLight > 0.5 ? 0.85 : 0.5)) * uIntensity, 0.0, 1.0);
      gl_FragColor = emit(col, a);
    }`);
  const core = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), coreMat);

  const haloMat = make(haloU, /* glsl */ `
    uniform float uIntensity, uFade, uOnLight, uTime; uniform vec3 uTint; varying vec2 vUv;
    ${LIGHT_FN}
    void main() {
      vec2 d = vUv - 0.5; float r2 = dot(d, d) * 4.0;
      float g = exp(-r2 * 3.2);
      // A faint iridescent edge: the halo is a little greener at its rim.
      vec3 col = mix(uTint, vec3(0.62, 0.95, 0.84), smoothstep(0.15, 0.9, r2) * 0.55);
      float a = g * uIntensity * (uOnLight > 0.5 ? 1.35 : 1.0);
      gl_FragColor = emit(col, clamp(a, 0.0, 1.0));
    }`);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), haloMat);

  const ringMat = make(ringU, /* glsl */ `
    uniform float uPhase, uAmount, uFade, uOnLight, uTime; varying vec2 vUv;
    ${LIGHT_FN}
    void main() {
      float r = length(vUv - 0.5) * 2.0; float R = mix(0.22, 1.0, uPhase);
      float ring = exp(-pow((r - R) / 0.02, 2.0)) * (1.0 - uPhase);
      vec3 col = uOnLight > 0.5 ? vec3(0.55, 0.45, 0.95) : vec3(1.0, 0.9, 0.72);
      gl_FragColor = emit(col, clamp(ring * uAmount, 0.0, 1.0));
    }`);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), ringMat);

  for (const [m, order] of [[halo, 1001], [ring, 1002], [core, 1005]] as const) { m.renderOrder = order; facing.add(m); }

  // Two hairline orbits: flat rings in 3D, tilted differently, slowly turning.
  const orbitFrag = /* glsl */ `
    uniform float uIntensity, uFade, uOnLight, uTime; uniform vec3 uTint; varying vec2 vUv;
    ${LIGHT_FN}
    void main() {
      vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x);
      float w = fwidth(r) * 1.2;
      float line = 1.0 - smoothstep(0.0, w * 1.6, abs(r - 0.92));
      // a comet-like brightening travelling around the orbit
      float comet = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(a - uTime * 0.9), 6.0);
      vec3 col = uOnLight > 0.5 ? mix(vec3(0.42, 0.36, 0.86), vec3(0.2, 0.62, 0.55), 0.5 + 0.5 * sin(a)) : uTint;
      gl_FragColor = emit(col, clamp(line * comet * uIntensity, 0.0, 1.0));
    }`;
  const orbitA = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), make(orbitU, orbitFrag));
  const orbitB = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), make({ ...orbitU, uIntensity: { value: 0.5 }, uTint: { value: new THREE.Color('#bff6e4') } }, orbitFrag));
  const orbits = new THREE.Group();
  orbitA.rotation.x = Math.PI / 2 - 0.42;
  orbitB.rotation.x = Math.PI / 2 + 0.7; orbitB.rotation.y = 0.5;
  orbitA.renderOrder = 1003; orbitB.renderOrder = 1003;
  orbits.add(orbitA, orbitB);
  root.add(orbits);

  // Motes
  const n = 64;
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) seed.set([0.06 + Math.random() * 0.1, 0.4 + Math.random() * 0.8, Math.random() * 6.283, (Math.random() - 0.5) * 1.6], 4 * i);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const moteMat = additive(new THREE.ShaderMaterial({
    uniforms: moteU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime, uSpin, uGather, uFlat, uPx; varying float vA; varying float vHue;
      void main() {
        float a = aSeed.z + uSpin * aSeed.y;
        float r = aSeed.x * mix(1.0, 0.45, uGather);
        vec3 p = vec3(cos(a) * r, sin(a * 0.7 + aSeed.z) * r * aSeed.w * uFlat, sin(a) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = 0.7 + 0.3 * sin(uTime * 2.4 + aSeed.z * 5.0);
        vHue = fract(aSeed.z * 0.31);
        gl_PointSize = clamp((0.0032 + aSeed.y * 0.0026) * uPx / max(0.05, -mv.z), 1.0, 26.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFade, uOnLight; varying float vA; varying float vHue;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
        vec3 night = mix(vec3(1.0, 0.86, 0.62), mix(vec3(0.75, 0.68, 1.0), vec3(0.62, 0.98, 0.84), step(0.5, vHue)), 0.45);
        vec3 day = mix(vec3(0.5, 0.42, 0.95), vec3(0.18, 0.62, 0.52), step(0.5, vHue));
        float a = vA * exp(-r * 3.0) * uFade;
        gl_FragColor = uOnLight > 0.5 ? vec4(day * a, a) : vec4(night * a, 1.0);
      }`,
  }));
  const motes = new THREE.Points(g, moteMat);
  motes.frustumCulled = false;
  motes.renderOrder = 1004;
  root.add(motes);

  const allMats = [coreMat, haloMat, ringMat, orbitA.material as THREE.ShaderMaterial, orbitB.material as THREE.ShaderMaterial, moteMat];
  let blendIsLight = false;
  const setBlend = (light: boolean) => {
    if (light === blendIsLight) return;
    blendIsLight = light;
    for (const m of allMats) {
      if (light) {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
        m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      } else glowBlending(m);
      m.needsUpdate = true;
    }
  };

  let fade = 0, spin = 0, smooth = 0, wake = 0;
  const tintA = new THREE.Color('#b9a6ff'), tintB = new THREE.Color('#9ff3d8'), tint = new THREE.Color();
  const q = new THREE.Quaternion();

  return {
    root,
    update(dt, time, o) {
      fade += (o.fade - fade) * Math.min(1, dt * 2.2);
      root.visible = fade > 0.01;
      wake = Math.min(1, wake + dt / 1.6);
      setBlend(o.onLight > 0.5);
      smooth += (Math.min(1, o.level) - smooth) * Math.min(1, dt / 0.3);
      const L = smooth;
      const breathe = 0.86 + 0.14 * Math.sin(time * Math.PI * 2 * 0.22);
      const s = o.mood;
      const k = Math.min(1, dt * 3);
      const coreI = s === 'speaking' ? 0.8 + 0.5 * L : s === 'listening' ? 0.85 + 0.35 * L : s === 'thinking' ? 0.72 : 0.68 * breathe;
      const haloI = s === 'speaking' ? 0.3 + 0.38 * L : s === 'listening' ? 0.4 + 0.26 * L : s === 'thinking' ? 0.26 : 0.24 * breathe;
      coreU.uIntensity.value += (coreI * (0.4 + 0.6 * wake) - coreU.uIntensity.value) * k;
      haloU.uIntensity.value += (haloI - haloU.uIntensity.value) * k;
      coreU.uWarm.value += ((o.expression === 'happy' ? 1 : o.expression === 'gentle' ? 0.7 : 0.4) - coreU.uWarm.value) * k * 0.5;
      tint.copy(tintA).lerp(tintB, 0.5 + 0.5 * Math.sin(time * 0.31));
      haloU.uTint.value.copy(tint);
      halo.scale.setScalar((1 + (s === 'listening' ? 0.22 : 0) + (s === 'speaking' ? 0.3 * L : 0)) * (0.6 + 0.4 * wake));
      spin += dt * (s === 'thinking' ? 2.6 : s === 'listening' ? 0.6 : 1.0);
      moteU.uSpin.value = spin;
      moteU.uGather.value += ((s === 'listening' ? 0.35 + 0.5 * L : s === 'thinking' ? 0.2 : 0) - moteU.uGather.value) * k;
      moteU.uFlat.value += ((s === 'thinking' ? 0.08 : 1) - moteU.uFlat.value) * k;
      ringU.uPhase.value = (time / 2.2) % 1; // 0.45 Hz
      ringU.uAmount.value += ((s === 'listening' ? 0.5 + L : 0) - ringU.uAmount.value) * k;
      orbitU.uIntensity.value += ((s === 'thinking' ? 0.95 : s === 'speaking' ? 0.7 + 0.3 * L : 0.55) * wake - orbitU.uIntensity.value) * k;
      orbits.rotation.y += dt * (s === 'thinking' ? 0.9 : 0.25);
      orbits.rotation.z = Math.sin(time * 0.17) * 0.15;
      for (const u of [coreU, haloU, ringU, orbitU, moteU]) { u.uFade.value = fade; u.uOnLight.value = o.onLight; u.uTime.value = time; }
      (orbitB.material as THREE.ShaderMaterial).uniforms.uIntensity!.value = orbitU.uIntensity.value * 0.8;
      o.camera.getWorldQuaternion(q);
      facing.quaternion.copy(q);
    },
    dispose() {
      for (const m of allMats) m.dispose();
      for (const mesh of [core, halo, ring, orbitA, orbitB]) mesh.geometry.dispose();
      g.dispose();
    },
  };
}
