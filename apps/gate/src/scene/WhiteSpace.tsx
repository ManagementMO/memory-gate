// The far side of the gate: cool porcelain light with no walls and a horizon you never reach. A faint aurora wash
// lingers near the horizon (mint to one side, lavender to the other) so it reads as the same world, now in daylight.
// The floor is a soft disc that fades into the sky; things that form here cast gentle contact shadows.
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { MEMORY_CENTER } from './layout';
import { HASH, SIMPLEX3 } from './shaders/noise.glsl';
import { damp, glowBlending } from './util';

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uFade, uTime;
${HASH}
${SIMPLEX3}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 zenith = vec3(0.86, 0.87, 0.93);
  vec3 horizon = vec3(0.985, 0.985, 0.99);
  vec3 ground = vec3(0.93, 0.932, 0.95);
  vec3 col = y > 0.0 ? mix(horizon, zenith, pow(smoothstep(0.0, 1.0, y), 0.7)) : mix(horizon, ground, smoothstep(0.0, -0.25, y));
  // A memory of the aurora: barely-there tints that drift along the horizon.
  float band = exp(-abs(y - 0.06) * 7.0);
  float n = snoise(vec3(d.x * 1.4, d.z * 1.4, uTime * 0.02)) * 0.5 + 0.5;
  vec3 mint = vec3(0.80, 0.97, 0.91), lav = vec3(0.89, 0.86, 1.0);
  col = mix(col, mix(lav, mint, smoothstep(-0.6, 0.6, d.x + (n - 0.5) * 0.8)), band * 0.55);
  gl_FragColor = vec4(mix(vec3(0.94, 0.945, 0.965), col, uFade), 1.0);
  #include <colorspace_fragment>
}`;

const FLOOR_FRAG = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld;
uniform float uFade, uTime;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  // Concentric hairlines, very faint, that soften toward the horizon: a sense of ground without a grid.
  float ringR = length(vWorld.xz - vec2(0.0, ${MEMORY_CENTER.z.toFixed(2)}));
  float w = max(fwidth(ringR), 1e-4);
  float dRing = abs(fract(ringR / 0.9 + 0.5) - 0.5) * 0.9; // meters to the nearest ring
  float rings = 1.0 - smoothstep(0.0, w * 1.3, dRing);
  float fadeOut = 1.0 - smoothstep(0.25, 1.0, r);
  vec3 col = vec3(0.955, 0.957, 0.968);
  col -= vec3(0.05, 0.05, 0.035) * rings * fadeOut * 0.35 * smoothstep(0.0, 0.2, ringR);
  float a = fadeOut * uFade;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function WhiteSpace() {
  const sky = useRef<THREE.Mesh>(null);
  const floor = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.Points>(null);
  const camera = useThree((s) => s.camera);
  const skyMat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uFade: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = c.xyww; }`,
    fragmentShader: SKY_FRAG,
  }), []);
  const floorMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uFade: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: FLOOR_FRAG,
  }), []);
  const moteGeo = useMemo(() => {
    const n = 260;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 14, Math.random() * 4.5, MEMORY_CENTER.z + (Math.random() - 0.5) * 12], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const moteMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uPx: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uPx; varying float vA; varying float vS;
        void main() {
          vec3 p = position;
          p.y += mod(uTime * (0.03 + aSeed * 0.04) + aSeed * 9.0, 4.5) - position.y * 0.0;
          p.y = mod(p.y, 4.5);
          p.x += sin(uTime * 0.11 + aSeed * 30.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.6, p.y) * (1.0 - smoothstep(3.6, 4.5, p.y)) * (0.5 + 0.5 * sin(uTime * 0.5 + aSeed * 50.0));
          vS = aSeed;
          gl_PointSize = clamp((0.012 + aSeed * 0.018) * uPx / max(0.1, -mv.z), 1.0, 7.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade; varying float vA; varying float vS;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          vec3 c = mix(vec3(0.62, 0.55, 0.98), vec3(0.42, 0.82, 0.72), step(0.5, vS));
          float a = exp(-r * 2.5) * vA * uFade * 0.55;
          gl_FragColor = vec4(c * a, a);
        }`,
    });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    void glowBlending;
    return m;
  }, []);

  useFrame(({ size, viewport }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const day = s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving' || (s.stage === 'entering' && s.enterProgress > 0.9);
    const target = day ? 1 : 0;
    const u = skyMat.uniforms;
    u.uFade!.value = damp(u.uFade!.value, target, day ? 1.2 : 3, dt);
    u.uTime!.value += dt;
    floorMat.uniforms.uFade!.value = damp(floorMat.uniforms.uFade!.value, target, 0.9, dt);
    moteMat.uniforms.uFade!.value = damp(moteMat.uniforms.uFade!.value, target, 0.6, dt);
    moteMat.uniforms.uTime!.value += dt;
    moteMat.uniforms.uPx!.value = size.height * viewport.dpr * 0.9;
    const vis = u.uFade!.value > 0.004;
    if (sky.current) { sky.current.visible = vis; sky.current.position.copy(camera.position); }
    if (floor.current) floor.current.visible = floorMat.uniforms.uFade!.value > 0.004;
    if (motes.current) motes.current.visible = moteMat.uniforms.uFade!.value > 0.01;
  });

  return (
    <>
      <mesh ref={sky} material={skyMat} frustumCulled={false} renderOrder={-999}>
        <sphereGeometry args={[58, 48, 24]} />
      </mesh>
      <mesh ref={floor} material={floorMat} rotation-x={-Math.PI / 2} position={[MEMORY_CENTER.x, 0, MEMORY_CENTER.z]} renderOrder={-5}>
        <circleGeometry args={[16, 96]} />
      </mesh>
      <points ref={motes} geometry={moteGeo} material={moteMat} frustumCulled={false} renderOrder={20} />
    </>
  );
}
