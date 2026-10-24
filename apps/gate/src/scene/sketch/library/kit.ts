// Shared tools for the library builders: a per-object kit (materials bound to the object's reveal, an inner group
// already scaled by o.scale), transform-and-merge helpers that keep mesh counts low, and the recurring shapes of
// the porcelain style: turned legs, plump cushions, pleated curtains, soft foliage clusters, smooth stones, leaf blades.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { geo, porcelain, rng, type BuildOptions, type MaterialKind } from '../style';

export type Kit = ReturnType<typeof kit>;

/**
 * A builder's workspace. Parts are added to `g`, which is scaled by o.scale (so builders work in true default
 * sizes); `done()` returns the unscaled root. `main(fallback, kind)` is the object's principal surface: it takes
 * the remembered colour and material when they were given.
 */
export function kit(input: BuildOptions) {
  // An empty colour/material means "not remembered": treat it exactly like null.
  const o: BuildOptions = { ...input, color: input.color || null, material: input.material || null };
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(o.scale || 1);
  root.add(g);
  const r = rng((o.seed >>> 0) || 7);
  const m = (color: string | null, kind: MaterialKind) => porcelain(color, kind, o.reveal);
  const main = (fallback: string | null, kind: MaterialKind) => porcelain(o.color || fallback, o.material || kind, o.reveal);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = g): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  };
  /** Random in [a, b). */
  const between = (a: number, b: number) => a + (b - a) * r();
  return { root, g, r, between, m, main, add, o, done: () => root };
}

/** Does the object's label mention any of these words? (e.g. "yellow curtains" → curtains are the coloured part) */
export const says = (o: BuildOptions, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(o.label ?? ''));

// ---------------------------------------------------------------- transform + merge
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A transformed copy of a geometry (position, Euler rotation, optional scale), ready to merge. */
export function at(geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return geometry.clone().applyMatrix4(_m4.compose(_p, _q, _s));
}

/** Merge many parts that share one material into a single mesh geometry (keeps draw calls low on Quest). */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = list.map((g0) => {
    let g = g0;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) g = mergeVertices(g);
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('library: merge failed (mismatched attributes)');
  return merged;
}

// ---------------------------------------------------------------- recurring shapes
/** A small rounded box with fewer segments (books, slats, keys): soft edges, light on triangles. */
export const rbox = (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.18, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.max(0.0015, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)));

/** Lighter rings and capsules for small repeated details (trunk rings, drips, tyres, burners). */
export const torusLo = (r: number, tube: number, radial = 8, tubular = 32, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, radial, tubular, arc);
export const capsuleLo = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 12);

/** A plump cushion: a rounded box whose radius is most of its thickness. */
export const cushion = (w: number, h: number, d: number, plump = 0.46) => geo.box(w, h, d, Math.min(w, h, d) * plump);

/** An ellipsoid (a sphere scaled into the geometry so merged parts keep correct normals). */
export const ellipsoid = (rx: number, ry: number, rz: number, ws = 28, hs = 18) => geo.sphere(1, ws, hs).scale(rx, ry, rz);

/** A classic turned leg: slim foot, long taper, a bead, a collar. h tall, r = widest radius. */
export function turnedLeg(h: number, r: number, segments = 24): THREE.BufferGeometry {
  return geo.lathe([
    [0.0001, 0], [r * 0.6, 0], [r * 0.7, h * 0.025], [r * 0.56, h * 0.06], [r * 0.62, h * 0.32], [r * 0.82, h * 0.62],
    [r * 0.98, h * 0.67], [r * 0.74, h * 0.72], [r * 0.86, h * 0.8], [r * 1.0, h * 0.86], [r * 1.0, h * 0.995], [0.0001, h],
  ], segments);
}

/** A slender tapered leg (mid-century): wider at the top, a gentle point at the floor. */
export const taperLeg = (h: number, rTop: number, rBottom: number) => geo.cylinder(rTop, rBottom, h, 18).translate(0, h / 2, 0);

/**
 * A pleated fabric panel hanging from y = h down to 0, x centred. `pinch` gathers it at `pinchAt` (0..1 of height)
 * like a tied-back curtain. Single-surfaced: give it a DoubleSide material.
 */
export function pleated(w: number, h: number, folds: number, depth: number, pinch = 0, pinchAt = 0.45): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, Math.max(8, folds * 10), 28);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const v = (y + h / 2) / h; // 0 bottom, 1 top
    const squeeze = 1 - pinch * Math.exp(-Math.pow((v - pinchAt) / 0.16, 2)) - pinch * 0.35 * (1 - v) * Math.exp(-Math.pow((v - pinchAt * 0.5) / 0.3, 2));
    const wave = Math.sin((x / w + 0.5) * folds * Math.PI * 2);
    pos.setXYZ(i, x * squeeze, y + h / 2, wave * depth * (0.55 + 0.45 * v) * (squeeze < 0.9 ? 0.85 : 1));
  }
  g.computeVertexNormals();
  return g;
}

/** A soft crown of overlapping ellipsoids (trees, bushes): reads as foliage without a single facet. */
export function foliage(r: () => number, count: number, radius: number, cy: number, spread: [number, number, number], squash = 0.82, seg = 22): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const unit = geo.sphere(1, seg, Math.round(seg * 0.7));
  for (let i = 0; i < count; i++) {
    // golden-angle distribution over a dome, larger blobs near the middle
    const t = (i + 0.5) / count;
    const a = i * 2.399963 + r() * 0.6;
    const rr = Math.sqrt(t);
    const s = radius * (0.58 + 0.42 * (1 - rr) + r() * 0.18);
    const x = Math.cos(a) * rr * spread[0];
    const z = Math.sin(a) * rr * spread[2];
    const y = cy + (1 - rr * rr) * spread[1] * 0.6 - rr * spread[1] * 0.25 + (r() - 0.5) * spread[1] * 0.25;
    parts.push(at(unit, x, y, z, 0, r() * 3, 0, s, s * squash, s));
  }
  return merge(parts);
}

/** One small folded leaf card (4 triangles): base at the origin, tip along +Y, the halves folded toward +Z. */
function leafCardGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // base, left, tip, right; then the same four mirrored slightly behind so both faces shade (still cheap)
  const p = [0, 0, 0, -0.5, 0.45, 0.16, 0, 1, 0, 0.5, 0.45, 0.16];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}
const LEAF_CARD = leafCardGeometry();
/** A single leaf/needle card of width w and length l, base at the origin pointing +Y (orient it yourself). */
export const leafCard = (w: number, l: number) => LEAF_CARD.clone().scale(w, l, w);

/**
 * Foliage as hundreds of tiny folded porcelain leaves scattered over clump surfaces (a delicate porcelain-figurine
 * tree, never a cartoon cloud). `clumps` are [x, y, z, radius]; leaves face outward with random twist and tilt.
 * Single-surfaced: give it a DoubleSide material.
 */
export function leafCards(r: () => number, clumps: [number, number, number, number][], perClump: number, size: [number, number], squash = 0.85): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);
  const q = new THREE.Quaternion(), twist = new THREE.Quaternion(), tip = new THREE.Quaternion(), m = new THREE.Matrix4();
  const p = new THREE.Vector3(), s3 = new THREE.Vector3();
  for (const [cx, cy, cz, rad] of clumps) {
    for (let i = 0; i < perClump; i++) {
      // a point on the clump's surface, fewer underneath
      const u = r() * 1.7 - 0.7, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      n.set(Math.cos(a) * s, u, Math.sin(a) * s).normalize();
      const depth = 0.93 + r() * 0.12;
      p.set(cx + n.x * rad * depth, cy + n.y * rad * depth * squash, cz + n.z * rad * depth);
      // The leaf's face looks outward (lies on the surface like a scale), twisted at random about the normal, and its
      // tip lifts off the surface a little, so the crown reads as overlapping leaves rather than a smooth ball.
      q.setFromUnitVectors(Z, n);
      twist.setFromAxisAngle(n, r() * Math.PI * 2);
      q.premultiply(twist);
      tip.setFromAxisAngle(X, -(0.25 + r() * 0.35));
      q.multiply(tip);
      const w = size[0] * (0.75 + r() * 0.5), l = size[1] * (0.75 + r() * 0.5);
      m.compose(p, q, s3.set(w, l, w));
      parts.push(LEAF_CARD.clone().applyMatrix4(m));
    }
  }
  return merge(parts);
}

/** A smooth stone or boulder: a sphere gently displaced by low-frequency noise, welded so it shades without seams. */
export function stone(r: () => number, rx: number, ry: number, rz: number, detail = 3): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position!;
  const k1 = r() * 10, k2 = r() * 10, k3 = r() * 10;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // low, broad undulations plus a few planar "cleavage" flats: weathered stone, not a marshmallow
    let n = 1 + 0.2 * Math.sin(x * 1.5 + k1) * Math.cos(z * 1.3 + k2) + 0.13 * Math.sin(y * 2.1 + k3) + 0.07 * Math.sin((x + z) * 3.4 + k1) + 0.035 * Math.sin((x - y) * 6.3 + k2);
    const facet = Math.max(Math.abs(x + 0.3 * z), Math.abs(z - 0.25 * x) * 0.92, Math.abs(y) * 1.05);
    n *= THREE.MathUtils.lerp(1, 0.9 / Math.max(facet, 0.6), 0.35);
    const flat = y < -0.3 ? -0.3 + (y + 0.3) * 0.3 : y; // a flattened underside so it sits on the ground
    pos.setXYZ(i, x * n * rx, flat * n * ry, z * n * rz);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  g.computeVertexNormals();
  // Smooth across gentle curvature, crisp where the stone turns sharply: chiselled, not lumpy.
  return toCreasedNormals(g, 0.55);
}

/**
 * A leaf blade along a curved midrib (start → end, bending by `droop`), `width` at its widest, gently cupped.
 * Single-surfaced: use a DoubleSide material.
 */
export function leaf(start: [number, number, number], dir: [number, number, number], length: number, width: number, droop = 0.25, cup = 0.15, tip = 0.85): THREE.BufferGeometry {
  const d = new THREE.Vector3(...dir).normalize();
  const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const s0 = new THREE.Vector3(...start);
  const fn = (u: number, v: number, target: THREE.Vector3) => {
    const along = u * length;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, u * (1 / tip) * 0.5 + u * 0.5)), 0.85) * (1 - Math.pow(u, 6));
    const across = (v - 0.5) * 2;
    target.copy(s0)
      .addScaledVector(d, along)
      .addScaledVector(new THREE.Vector3(0, -1, 0), droop * along * along / Math.max(length, 1e-3))
      .addScaledVector(side, across * w)
      .addScaledVector(up, cup * w * across * across);
  };
  const g = new ParametricGeometry(fn, 18, 6);
  g.computeVertexNormals();
  return g;
}

/** A gently curving stem/branch with a taper: a series of short cylinders merged along a smooth curve. */
export function taperedTube(points: [number, number, number][], r0: number, r1: number, segments = 10, radial = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments, t1 = (i + 1) / segments;
    const a = curve.getPoint(t0), b = curve.getPoint(t1);
    const len = a.distanceTo(b);
    const rad0 = THREE.MathUtils.lerp(r0, r1, t0), rad1 = THREE.MathUtils.lerp(r0, r1, t1);
    const c = new THREE.CylinderGeometry(rad1, rad0, len * 1.04, radial, 1, true);
    const dirv = new THREE.Vector3().subVectors(b, a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dirv);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    c.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    parts.push(c);
  }
  // a rounded cap at the tip
  const tipPt = curve.getPoint(1);
  parts.push(geo.sphere(r1, radial, 6).translate(tipPt.x, tipPt.y, tipPt.z));
  return merge(parts);
}

/** A ring of short radial blocks (clock markers, burner grates, petals), merged. */
export function ring(count: number, radius: number, make: (i: number) => THREE.BufferGeometry, y = 0, z = 0, plane: 'xz' | 'xy' = 'xy'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    if (plane === 'xy') parts.push(at(make(i), Math.sin(a) * radius, y + Math.cos(a) * radius, z, 0, 0, -a));
    else parts.push(at(make(i), Math.sin(a) * radius, y, z + Math.cos(a) * radius, 0, a, 0));
  }
  return merge(parts);
}

/** Colour an emissive part's light (flames amber, a TV screen cool, a window warm). Only this object's material. */
export function glow<T extends THREE.MeshPhysicalMaterial>(m: T, hex: string, intensity = 1): T { m.emissive.set(hex); m.emissiveIntensity = intensity; return m; }

/** Make a material double-sided (for thin surfaces: curtains, leaves, canopies). */
export function twoSided<T extends THREE.Material>(m: T): T { m.side = THREE.DoubleSide; return m; }

/**
 * Default tints for things nobody gave a colour to. Deliberately light and low in saturation: the memory is a white
 * porcelain world in which what someone remembered (their "yellow curtains") is what carries colour.
 */
export const TINT = {
  oak: '#d2bea6', walnut: '#ae9886', pine: '#ddcdb4', cream: '#f2ece0', white: '#f5f3ee', linen: '#ebe4d8', sage: '#b4c3a7',
  leaf: '#9dbb93', deepLeaf: '#82a68c', bark: '#ab9888', terracotta: '#d7ab97', brass: '#d6bf86', iron: '#7b7e86', slate: '#9aa1ab',
  rose: '#e0a3ad', sky: '#b3cfe8', lavender: '#c6b8e2', butter: '#efdc96', stone: '#cdc8be', charcoal: '#606068', glass: '#e2eef4',
  flame: '#ffd88a', glow: '#fff4dc',
} as const;
