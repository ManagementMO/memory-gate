// The air of the memory: dust turning in window light, petals, snow, fireflies, soft rain, drifting leaves.
// One small particle system, all motion in the shader; quiet enough to sit behind a conversation.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Ambience as Kind } from '../../../../../packages/shared/src/scene';
import { MEMORY_CENTER } from '../layout';
import { damp } from '../util';

const STYLE: Record<Exclude<Kind, 'none'>, { count: number; fall: number; sway: number; size: number; color: [string, string]; blink: number; glow: number }> = {
  dust: { count: 260, fall: -0.01, sway: 0.08, size: 0.012, color: ['#fff3d6', '#ffe9c2'], blink: 0.4, glow: 0.7 },
  petals: { count: 140, fall: 0.18, sway: 0.35, size: 0.04, color: ['#f6c6d3', '#fbe0e7'], blink: 0, glow: 0 },
  snow: { count: 420, fall: 0.32, sway: 0.18, size: 0.026, color: ['#ffffff', '#eef3ff'], blink: 0, glow: 0.2 },
  fireflies: { count: 90, fall: -0.02, sway: 0.25, size: 0.03, color: ['#fff3a6', '#d8ff9c'], blink: 1, glow: 1 },
  rain: { count: 520, fall: 2.6, sway: 0.0, size: 0.016, color: ['#c7d6ea', '#d9e4f2'], blink: 0, glow: 0 },
  leaves: { count: 110, fall: 0.22, sway: 0.4, size: 0.045, color: ['#d9a35c', '#a9bf7c'], blink: 0, glow: 0 },
};

export function Ambience({ kind }: { kind: Kind }) {
  const pts = useRef<THREE.Points>(null);
  const style = kind === 'none' ? null : STYLE[kind];
  const { geometry, material } = useMemo(() => {
    const st = style ?? STYLE.dust;
    const n = st.count;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([MEMORY_CENTER.x + (Math.random() - 0.5) * 8, Math.random() * 3.6, MEMORY_CENTER.z + (Math.random() - 0.5) * 6.5], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uFade: { value: 0 }, uPx: { value: 900 }, uFall: { value: st.fall }, uSway: { value: st.sway }, uSize: { value: st.size },
        uA: { value: new THREE.Color(st.color[0]) }, uB: { value: new THREE.Color(st.color[1]) }, uBlink: { value: st.blink }, uRain: { value: kind === 'rain' ? 1 : 0 },
        uPetal: { value: kind === 'petals' || kind === 'leaves' ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uPx, uFall, uSway, uSize, uBlink; varying float vA; varying float vS; varying float vRot;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * uFall * (0.7 + aSeed * 0.6) + aSeed * 3.6, 3.6);
          p.x += sin(uTime * (0.3 + aSeed * 0.4) + aSeed * 30.0) * uSway;
          p.z += cos(uTime * (0.25 + aSeed * 0.3) + aSeed * 17.0) * uSway * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float edge = smoothstep(0.0, 0.4, p.y) * (1.0 - smoothstep(3.0, 3.6, p.y));
          float blink = mix(1.0, 0.5 + 0.5 * sin(uTime * (0.9 + aSeed * 1.2) + aSeed * 60.0), uBlink);
          vA = edge * blink;
          vS = aSeed;
          vRot = uTime * (0.5 + aSeed) + aSeed * 6.28;
          gl_PointSize = clamp(uSize * uPx / max(0.1, -mv.z), 1.0, 14.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade, uRain, uPetal; uniform vec3 uA, uB; varying float vA; varying float vS; varying float vRot;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          if (uRain > 0.5) { d.x *= 6.0; }
          if (uPetal > 0.5) { float c = cos(vRot), s = sin(vRot); d = mat2(c, -s, s, c) * d; d.y *= 2.0; }
          float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          vec3 col = mix(uA, uB, step(0.5, vS));
          float a = exp(-r * 2.2) * vA * uFade * (uRain > 0.5 ? 0.35 : 0.85);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    return { geometry: g, material: m };
  }, [kind]);

  useFrame(({ size, viewport }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    material.uniforms.uTime!.value += dt;
    material.uniforms.uFade!.value = damp(material.uniforms.uFade!.value, style ? 1 : 0, 0.5, dt);
    material.uniforms.uPx!.value = size.height * viewport.dpr * 0.9;
    if (pts.current) pts.current.visible = !!style && material.uniforms.uFade!.value > 0.01;
  });
  if (!style) return null;
  // Never a ray's target: a hand ray passing within a metre of any leaf would take it, and a pinch held on the ground
  // behind them would never walk.
  return <points ref={pts} geometry={geometry} material={material} frustumCulled={false} renderOrder={26} raycast={() => null} />;
}
