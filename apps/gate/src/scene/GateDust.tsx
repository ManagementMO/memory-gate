// Motes of light drifting on a slow spiral toward the gate. All motion lives in the vertex shader; the CPU only
// advances time. Calm contract: twinkle at or below 0.35 Hz.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { damp, glowBlending } from './util';

const COUNT = 900;

export function GateDust() {
  const points = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(COUNT * 4);
    const color = new Float32Array(COUNT * 3);
    const palette = ['#62f3c6', '#9a7cff', '#e7e9f4', '#c592ff', '#46d3e0'].map((c) => new THREE.Color(c));
    for (let i = 0; i < COUNT; i++) {
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      const c = palette[i % palette.length]!;
      color.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    const m = glowBlending(new THREE.ShaderMaterial({
      depthTest: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uPull: { value: 0 }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; attribute vec3 aColor;
        uniform float uTime, uPull, uPx;
        varying vec3 vColor; varying float vA;
        void main() {
          // Each mote lives on a cone of spirals between the viewer and the gate (z from -1 to -16).
          float life = fract(aSeed.x + uTime * (0.012 + aSeed.y * 0.02) * (1.0 + uPull * 6.0));
          float z = mix(-1.5, -17.0, pow(life, 0.8));
          float radius = mix(5.5, 0.4, life) * (0.35 + aSeed.z * 0.9);
          float ang = aSeed.w * 6.2831 + life * (2.4 + aSeed.y * 1.8) + uTime * 0.02;
          vec3 p = vec3(cos(ang) * radius, 1.7 + sin(ang) * radius * 0.55 + z * -0.11, z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float fadeInOut = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.85, 1.0, life));
          vA = fadeInOut * (0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y * 1.2) + aSeed.x * 40.0));
          vColor = aColor;
          gl_PointSize = clamp((0.018 + aSeed.z * 0.03) * uPx / max(0.1, -mv.z), 1.0, 9.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade; varying vec3 vColor; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vColor * exp(-r * 3.2) * vA * uFade * 0.9, 1.0);
        }`,
    }));
    return { geometry: g, material: m };
  }, []);

  useFrame(({ size, viewport }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const u = material.uniforms;
    u.uTime!.value += dt;
    const night = s.stage === 'portal' || s.stage === 'greeting' || s.stage === 'gathering' || s.stage === 'entering' || s.stage === 'album';
    u.uFade!.value = damp(u.uFade!.value, night ? (s.stage === 'portal' ? 0.6 : 1) : 0, 1.5, dt);
    u.uPull!.value = s.stage === 'entering' ? s.enterProgress : damp(u.uPull!.value, 0, 2, dt);
    u.uPx!.value = (size.height * viewport.dpr) * 0.9;
    if (points.current) points.current.visible = u.uFade!.value > 0.01;
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={-900} />;
}
