// The memory's art direction: porcelain and light. Every object, whether drawn by the library or composed from
// Claude's description, is made of the same soft, slightly translucent porcelain, tinted (never painted) with the
// colour someone remembered, lit by a pale studio sky, with a faint aurora rim. It forms out of drifting light:
// the reveal uniform dissolves each surface in from the floor up behind a luminous lavender edge.
// Rules for anything built here: real-world metres, origin at the centre of the footprint on the floor (y = 0),
// front facing +Z, smooth silhouettes (generous segment counts, rounded edges), no flat-shaded facets.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type MaterialKind = 'wood' | 'fabric' | 'metal' | 'ceramic' | 'glass' | 'paper' | 'plant' | 'stone' | 'plastic' | 'water' | 'light';

/** Shared per-object reveal uniforms, animated by the renderer: reveal 0 = not yet formed, 1 = solid.
 * base/height (metres, world space) are set once the object is placed, so the dissolve rises from its own foot. */
export type Reveal = { reveal: { value: number }; base: { value: number }; height: { value: number }; id: number };
let revealSeq = 0;
export const newReveal = (): Reveal => ({ reveal: { value: 0 }, base: { value: 0 }, height: { value: 1 }, id: ++revealSeq });

const PORCELAIN = new THREE.Color('#f4f3f0');
const _c = new THREE.Color();

/**
 * A remembered colour as a porcelain tint: the hue stays recognisable, the saturation and value are softened so a
 * "red chair" reads as a dusty rose glaze on porcelain, not a toy. Unknown/absent colours stay porcelain white.
 */
export function tint(color: string | null | undefined, strength = 0.62): THREE.Color {
  if (!color) return PORCELAIN.clone();
  try { _c.set(color); } catch { return PORCELAIN.clone(); }
  const hsl = { h: 0, s: 0, l: 0 };
  _c.getHSL(hsl);
  // Pastel glaze: clamp saturation, lift lightness, then blend toward porcelain.
  const glaze = new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.62) * 0.85, THREE.MathUtils.clamp(hsl.l * 0.55 + 0.4, 0.42, 0.86));
  return PORCELAIN.clone().lerp(glaze, strength);
}

const FINISH: Record<MaterialKind, { roughness: number; metalness: number; clearcoat: number; sheen: number; transmission: number; strength: number }> = {
  ceramic: { roughness: 0.32, metalness: 0, clearcoat: 0.8, sheen: 0, transmission: 0, strength: 0.6 },
  wood: { roughness: 0.55, metalness: 0, clearcoat: 0.25, sheen: 0, transmission: 0, strength: 0.66 },
  fabric: { roughness: 0.85, metalness: 0, clearcoat: 0, sheen: 0.7, transmission: 0, strength: 0.7 },
  metal: { roughness: 0.3, metalness: 0.55, clearcoat: 0.4, sheen: 0, transmission: 0, strength: 0.5 },
  glass: { roughness: 0.08, metalness: 0, clearcoat: 1, sheen: 0, transmission: 0.85, strength: 0.35 },
  paper: { roughness: 0.9, metalness: 0, clearcoat: 0, sheen: 0.2, transmission: 0, strength: 0.55 },
  plant: { roughness: 0.6, metalness: 0, clearcoat: 0.15, sheen: 0.35, transmission: 0, strength: 0.72 },
  stone: { roughness: 0.75, metalness: 0, clearcoat: 0.05, sheen: 0, transmission: 0, strength: 0.55 },
  plastic: { roughness: 0.4, metalness: 0, clearcoat: 0.6, sheen: 0, transmission: 0, strength: 0.7 },
  water: { roughness: 0.05, metalness: 0, clearcoat: 1, sheen: 0, transmission: 0.6, strength: 0.6 },
  light: { roughness: 0.4, metalness: 0, clearcoat: 0, sheen: 0, transmission: 0, strength: 0.4 },
};

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/**
 * The one material factory. `reveal` is shared by every mesh of one object (the renderer animates it).
 * Materials are cached per (colour, kind, reveal) so an object with many parts costs few programs.
 */
export function porcelain(color: string | null | undefined, kind: MaterialKind = 'ceramic', reveal?: Reveal): THREE.MeshPhysicalMaterial {
  const key = `${color ?? 'none'}|${kind}|${reveal ? reveal.id : 'solid'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const f = FINISH[kind];
  const m = new THREE.MeshPhysicalMaterial({
    color: tint(color, f.strength),
    roughness: f.roughness,
    metalness: f.metalness,
    clearcoat: f.clearcoat,
    clearcoatRoughness: 0.35,
    sheen: f.sheen,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffffff'),
    transmission: f.transmission,
    thickness: f.transmission ? 0.05 : 0,
    ior: 1.4,
    envMapIntensity: 0.85,
    emissive: kind === 'light' ? new THREE.Color('#fff1d6') : new THREE.Color('#000000'),
    emissiveIntensity: kind === 'light' ? 0.9 : 0,
  });
  if (reveal) applyReveal(m, reveal);
  cache.set(key, m);
  return m;
}

/**
 * Dissolve-in from the floor up with a luminous edge, plus a faint aurora rim on every surface.
 * uReveal 0 → nothing; 1 → solid. Object-space height is normalised by uHeight (set by the renderer).
 */
export function applyReveal(m: THREE.MeshPhysicalMaterial, r: Reveal): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = r.reveal;
    shader.uniforms.uHeight = r.height;
    shader.uniforms.uBase = r.base;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMgWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uReveal; uniform float uHeight; uniform float uBase; varying vec3 vMgWorld;
float mgHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float mgNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mgHash(i), mgHash(i + vec3(1,0,0)), f.x), mix(mgHash(i + vec3(0,1,0)), mgHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mgHash(i + vec3(0,0,1)), mgHash(i + vec3(1,0,1)), f.x), mix(mgHash(i + vec3(0,1,1)), mgHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float mgH = (vMgWorld.y - uBase) / max(uHeight, 0.05);
  float mgN = mgNoise(vMgWorld * 9.0) * 0.18;
  float mgCut = uReveal * 1.3 - 0.12;
  if (uReveal < 0.999 && mgH + mgN > mgCut) discard;
  float mgEdge = 1.0 - smoothstep(0.0, 0.07, mgCut - (mgH + mgN));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(0.78, 0.7, 1.0) * mgEdge * 2.2 * (1.0 - step(0.999, uReveal));`)
      .replace('#include <opaque_fragment>', `
  vec3 mgV = normalize(cameraPosition - vMgWorld);
  float mgRim = pow(1.0 - abs(dot(normalize(vNormal), normalize((viewMatrix * vec4(mgV, 0.0)).xyz))), 3.0);
  outgoingLight += mix(vec3(0.82, 0.78, 1.0), vec3(0.74, 0.96, 0.88), smoothstep(0.0, 2.0, vMgWorld.y)) * mgRim * 0.14;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'mg-reveal';
}

// ---------------------------------------------------------------- geometry helpers (smooth by default)
export const geo = {
  box: (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.12) =>
    new RoundedBoxGeometry(w, h, d, 4, Math.max(0.002, Math.min(r, Math.min(w, h, d) / 2 - 1e-4))),
  cylinder: (rTop: number, rBottom: number, h: number, radial = 40) => new THREE.CylinderGeometry(rTop, rBottom, h, radial, 1),
  sphere: (r: number, w = 40, h = 28) => new THREE.SphereGeometry(r, w, h),
  capsule: (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 10, 28),
  torus: (r: number, tube: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, 18, 64, arc),
  cone: (r: number, h: number) => new THREE.ConeGeometry(r, h, 40, 1),
  /** Revolve a profile [(radius, height), ...] around Y: vases, lampshades, cups, turned legs. */
  lathe: (profile: [number, number][], segments = 56) => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments),
  /** A tube along a smooth curve through points: stems, chair rails, handles, branches. */
  tube: (points: [number, number, number][], r: number, closed = false) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed), Math.max(24, points.length * 12), r, 12, closed),
  plane: (w: number, h: number) => new THREE.PlaneGeometry(w, h, 1, 1),
};

/** Add a mesh to a group at a position (and optional rotation), returning the mesh. */
export function part(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

/** What every library builder receives. `seed` gives small natural variation between two of the same thing. */
export type BuildOptions = { color: string | null; material: MaterialKind | null; scale: number; seed: number; reveal: Reveal; label: string };
export type Builder = (o: BuildOptions) => THREE.Group;

/** A seeded random for builders (deterministic: every viewer sees the same chair). */
export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
