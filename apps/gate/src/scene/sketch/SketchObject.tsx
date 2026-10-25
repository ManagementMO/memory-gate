// One remembered thing forming in the white space: motes of light drift down onto its surface, then the porcelain
// rises from the floor up behind a luminous edge, and settles with a soft shadow. Library objects are drawn by code;
// anything else is composed by Claude from primitives (cached), with an honest placeholder until it arrives.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { api } from '../../../../../convex/_generated/api';
import { entryOf, type PlanObject, type Placement } from '../../../../../packages/shared/src/scene';
import { convex } from '../../backend/client';
import { useGate } from '../../state/store';
import { MEMORY_CENTER } from '../layout';
import { glowBlending } from '../util';
import { fromParts, token, type Part } from './custom';
import { LIBRARY_BUILDERS } from './library';
import { hasLibraryModel, hasRealModel, loadRealModel, realObject, realTakesColour } from './realModels';
import { newReveal, type BuildOptions } from './style';

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Per-object formation progress, read by MemoryScene to know when the place has formed. */
export const formation = new Map<string, number>();

const DURATION = 2.6;
const MOTES = 520;

function sampleSurface(root: THREE.Object3D, count: number): Float32Array {
  const meshes: THREE.Mesh[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry?.attributes.position) meshes.push(o as THREE.Mesh); });
  const out = new Float32Array(count * 3);
  if (!meshes.length) return out;
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const weights = meshes.map((m) => Math.max(1, (m.geometry.index?.count ?? m.geometry.attributes.position!.count) / 3));
  const total = weights.reduce((a, b) => a + b, 0);
  const p = new THREE.Vector3();
  let k = 0;
  meshes.forEach((m, i) => {
    const n = i === meshes.length - 1 ? count - k : Math.round((weights[i]! / total) * count);
    if (n <= 0) return;
    let sampler: MeshSurfaceSampler;
    try { sampler = new MeshSurfaceSampler(m).build(); } catch { return; }
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    for (let j = 0; j < n && k < count; j++, k++) {
      sampler.sample(p);
      p.applyMatrix4(toRoot);
      out.set([p.x, p.y, p.z], k * 3);
    }
  });
  return out;
}

function makeMotes(targets: Float32Array, seed: number, height: number): THREE.Points {
  const n = targets.length / 3;
  const start = new Float32Array(n * 3);
  const delay = new Float32Array(n);
  let s = seed || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  for (let i = 0; i < n; i++) {
    start.set([targets[i * 3]! + (rnd() - 0.5) * 1.4, targets[i * 3 + 1]! + 0.6 + rnd() * (1.2 + height), targets[i * 3 + 2]! + (rnd() - 0.5) * 1.4], i * 3);
    delay[i] = rnd() * 0.45;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(targets, 3));
  g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uPx: { value: 900 }, uOnLight: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aStart; attribute float aDelay; uniform float uT, uPx; varying float vA;
      void main() {
        float t = clamp((uT - aDelay) / 0.62, 0.0, 1.0);
        float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
        vec3 p = mix(aStart, position, e);
        p.x += sin(uT * 3.0 + aDelay * 40.0) * 0.02 * (1.0 - e);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.0, 0.15, uT - aDelay) * (1.0 - smoothstep(0.75, 1.0, uT));
        gl_PointSize = clamp(0.022 * uPx / max(0.1, -mv.z), 1.0, 8.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOnLight; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
        float a = exp(-r * 2.6) * vA;
        vec3 c = mix(vec3(0.66, 0.58, 1.0), vec3(0.5, 0.9, 0.8), step(0.5, fract(gl_FragCoord.x * 0.37)));
        if (uOnLight > 0.5) gl_FragColor = vec4(c * 0.85 * a, a * 0.9);
        else gl_FragColor = vec4(c * a, 1.0);
      }`,
  });
  // Paint on white (premultiplied alpha); glow on dark.
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  void glowBlending;
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 25;
  return pts;
}

let shadowTex: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export function SketchObject({ obj, place, delay, onLight = 1 }: { obj: PlanObject; place: Placement; delay: number; onLight?: number }) {
  const reveal = useMemo(() => newReveal(), [obj.id]);
  const [parts, setParts] = useState<Part[] | null>(null);
  // The photoreal library, when it has this kind (usually preloaded when the plan arrived).
  const [real, setReal] = useState(() => hasRealModel(obj.kind));
  useEffect(() => {
    if (real) return;
    let live = true;
    void loadRealModel(obj.kind).then((m) => { if (live && m) setReal(true); });
    return () => { live = false; };
  }, [obj.kind, real]);
  const entry = entryOf(obj.kind);
  const built = useMemo(() => {
    if (real && (!obj.color || realTakesColour(obj.kind))) { const r = realObject(obj.kind, reveal, obj.scale ?? 1, obj.color); if (r) return r; }
    // Only a remembered material overrides the builder's own per-part finishes.
    const o: BuildOptions = { color: obj.color, material: obj.material, scale: obj.scale, seed: hash(obj.id), reveal, label: obj.label };
    const builder = LIBRARY_BUILDERS[obj.kind];
    if (builder) {
      try { return builder(o); } catch (e) { console.warn('[sketch] builder failed', obj.kind, e); }
    }
    if (parts?.length) return fromParts(parts, o);
    return token(o, Math.min(0.7, Math.max(0.3, entry.h * 0.6)));
  }, [obj.kind, obj.color, obj.material, obj.scale, obj.label, obj.id, parts, reveal, entry, real]);

  // Ask Claude to compose things the library can't draw (cached server-side per label + colour).
  useEffect(() => {
    if (LIBRARY_BUILDERS[obj.kind] || hasLibraryModel(obj.kind)) return; // the library draws it: nothing to compose
    const s = useGate.getState().session;
    if (!s) return;
    let live = true;
    convex.action(api.sketch.compose, { code: s.code, token: s.token, label: obj.label, ...(obj.color ? { color: obj.color } : {}) })
      .then((r) => { if (live && r?.parts?.length) setParts(r.parts as Part[]); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [obj.kind, obj.label, obj.color]);

  const holder = useRef<THREE.Group>(null);
  const state = useRef({ t: -delay, motes: null as THREE.Points | null, shadow: null as THREE.Mesh | null, height: 1 });

  // (Re)build the motes and the soft shadow whenever the geometry changes, and restart the formation.
  useEffect(() => {
    const h = holder.current;
    if (!h) return;
    const st = state.current;
    h.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(built);
    const size = box.getSize(new THREE.Vector3());
    st.height = Math.max(0.05, size.y);
    reveal.base.value = box.min.y;
    reveal.height.value = st.height;
    if (st.t > 0) st.t = Math.min(st.t, 0); // a replaced body forms again
    built.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const targets = sampleSurface(built, MOTES);
    const motes = makeMotes(targets, hash(obj.id), st.height);
    built.add(motes);
    st.motes = motes;
    const floorish = place.y < 0.05 && entry.place !== 'floor-under' && entry.place !== 'wall-mounted';
    if (floorish) {
      const local = new THREE.Box3().setFromObject(built, true);
      void local;
      const w = Math.max(0.3, size.x * 1.25), d = Math.max(0.3, size.z * 1.25);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#4f4a6e', map: blobTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(w, d, 1);
      shadow.position.y = 0.004;
      shadow.renderOrder = 4;
      h.add(shadow);
      st.shadow = shadow;
    }
    return () => {
      built.remove(motes);
      motes.geometry.dispose();
      (motes.material as THREE.Material).dispose();
      if (st.shadow) { h.remove(st.shadow); st.shadow.geometry.dispose(); (st.shadow.material as THREE.Material).dispose(); st.shadow = null; }
    };
  }, [built, obj.id, reveal, place.y, entry.place]);

  useFrame(({ size, viewport }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = state.current;
    const g = useGate.getState();
    if (g.stage !== 'forming' && g.stage !== 'memory' && g.stage !== 'leaving' && !g.xr && !(window as unknown as { __scenePreview?: boolean }).__scenePreview) return;
    st.t += dt;
    const p = Math.min(1, Math.max(0, st.t / DURATION));
    // Motes arrive first; the surface starts rising a third of the way in.
    reveal.reveal.value = ease(Math.min(1, Math.max(0, (p - 0.28) / 0.72)));
    if (st.motes) {
      const u = (st.motes.material as THREE.ShaderMaterial).uniforms;
      u.uT!.value = p;
      u.uPx!.value = size.height * viewport.dpr * 0.9;
      u.uOnLight!.value = onLight;
      st.motes.visible = p > 0 && p < 1;
    }
    if (st.shadow) (st.shadow.material as THREE.MeshBasicMaterial).opacity = 0.22 * reveal.reveal.value;
    formation.set(obj.id, p);
    // A kite rides the breeze: a slow drift and roll, its tail rippling behind (the team model's Tail_00..08 nodes).
    if (obj.kind === 'kite') {
      const t = st.t;
      built.position.set(Math.sin(t * 0.63) * 0.12, Math.sin(t * 1.1) * 0.07, Math.sin(t * 0.47) * 0.1);
      built.rotation.z = Math.sin(t * 0.8) * 0.07;
      tail.forEach((n, i) => { n.rotation.x = Math.sin(t * 2.6 - i * 0.7) * 0.16 * (i + 1) / tail.length; n.rotation.z = Math.sin(t * 1.9 - i * 0.55) * 0.12 * (i + 1) / tail.length; });
    }
  });
  const tail = useMemo(() => {
    const nodes: THREE.Object3D[] = [];
    if (obj.kind === 'kite') built.traverse((o) => { if (/^Tail_\d+$/.test(o.name)) nodes.push(o); });
    return nodes.sort((a, b) => a.name.localeCompare(b.name));
  }, [built, obj.kind]);
  useEffect(() => () => { formation.delete(obj.id); }, [obj.id]);

  return (
    <group ref={holder} position={[MEMORY_CENTER.x + place.x, place.y, MEMORY_CENTER.z + place.z]} rotation-y={place.yaw} name={`memory-${obj.id}`} userData={{ planId: obj.id, label: obj.label, quote: obj.quote }}>
      <primitive object={built} />
    </group>
  );
}
