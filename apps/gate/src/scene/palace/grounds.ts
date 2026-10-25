// The grounds round the palace, built once from the site plan (site.ts): the site map the floor is painted from, the
// exhibition hall, trees (instanced by kind), houses (merged per side of the park), lamp posts and benches, the yacht
// harbour, the sea wall, the southern hills and the bay. Everything is static: a few draw calls in all, with detail
// that thins out with distance and with the device's quality.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAGOON, SHORE, lagoonPoint } from './plan';
import { ARC, SITE, type Spot, fromShore, hillEdge, hillFar, hillHeight, propSpots, seeded, treeSpots } from './site';

const col = (hex: string) => new THREE.Color(hex);

// ---------------------------------------------------------------------------------------------------------------
// A small mesh builder: quads with their own normals, uvs and colours (uv < 0 means "no windows" to the facade shader).

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  /** A quad seen from the front as a, b, c, d counter-clockwise. uvs per corner (default: none). */
  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color, uvs?: [number, number][], normal?: V3): void {
    const n = normal ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const corners = [a, b, c, a, c, d];
    const cu = uvs ? [uvs[0]!, uvs[1]!, uvs[2]!, uvs[0]!, uvs[2]!, uvs[3]!] : null;
    corners.forEach((p, i) => {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(cu ? cu[i]![0] : -1, cu ? cu[i]![1] : -1);
      this.col.push(color.r, color.g, color.b);
    });
  }
  /** A face from its centre, its right and up half-extents (as seen from the front); right x up = outward normal. */
  face(c: V3, right: V3, up: V3, color: THREE.Color, uv?: { u0: number; u1: number; v0: number; v1: number }): void {
    const a = c.clone().sub(right).sub(up), b = c.clone().add(right).sub(up), cc = c.clone().add(right).add(up), d = c.clone().sub(right).add(up);
    this.quad(a, b, cc, d, color, uv ? [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] : undefined);
  }
  /** An axis-aligned box in a local frame (x right along a front facing -z, y up), placed by `m`. Faces are skipped
   *  with `skip` (e.g. the bottom). `front` gives the front face's facade uv. */
  box(m: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color, opts: { skip?: string; front?: { u0: number; u1: number; enc: number }; frontColor?: THREE.Color } = {}): void {
    const P = (x: number, y: number, z: number) => v(x, y, z).applyMatrix4(m);
    const skip = opts.skip ?? '';
    const add = (a: V3, b: V3, c: V3, d: V3, uv?: [number, number][], cc = color) => this.quad(P(a.x, a.y, a.z), P(b.x, b.y, b.z), P(c.x, c.y, c.z), P(d.x, d.y, d.z), cc, uv);
    // front (-z): seen from -z, right is -x
    if (!skip.includes('f')) {
      const fr = opts.front;
      add(v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), fr ? [[fr.enc + fr.u0, y0], [fr.enc + fr.u1, y0], [fr.enc + fr.u1, y1], [fr.enc + fr.u0, y1]] : undefined, opts.frontColor ?? color);
    }
    if (!skip.includes('k')) add(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)); // back (+z)
    if (!skip.includes('l')) add(v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)); // +x side
    if (!skip.includes('r')) add(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)); // -x side
    if (!skip.includes('t')) add(v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0)); // top
    if (!skip.includes('b')) add(v(x0, y0, z1), v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1)); // bottom
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Position, normal, uv (-1: no windows) and a flat colour, non-indexed: ready to merge with anything else. */
function prep(g: THREE.BufferGeometry, color: THREE.Color, ao?: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  const count = n.getAttribute('position').count;
  n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2).fill(-1), 2));
  const c = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const pos = n.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const k = ao ? ao(p.fromBufferAttribute(pos, i)) : 1;
    c[i * 3] = color.r * k; c[i * 3 + 1] = color.g * k; c[i * 3 + 2] = color.b * k;
  }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return n;
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('grounds: merge failed');
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Value noise for shaping foliage (build time only).

function noise3(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.19) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf), t = zf * zf * (3 - 2 * zf);
  const lerp = THREE.MathUtils.lerp;
  const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
  const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, w), lerp(x01, x11, w), t);
}

/** A clump of leaves: an icosphere roughened by noise and squashed (indexed, centred on the origin). `streak`
 *  stretches the roughness vertically, for the hanging curtains of a willow. */
function clump(radius: number, squash: number, detail: number, seed: number, rough = 0.2, streak = false): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = streak
      ? 1 + rough * (noise3(p.x * 4.2 + 3, p.y * 0.7, p.z * 4.2, seed) * 2 - 1)
      : 1 + rough * (noise3(p.x * 1.6 + 3, p.y * 1.6, p.z * 1.6, seed) * 2 - 1) + rough * 0.45 * (noise3(p.x * 3.4, p.y * 3.4 + 7, p.z * 3.4, seed + 1) * 2 - 1);
    // Leaves hang: the underside of a clump is flatter than its top.
    const y = p.y < 0 && !streak ? p.y * 0.88 : p.y;
    pos.setXYZ(i, p.x * k * radius, y * k * radius * squash, p.z * k * radius);
  }
  return g;
}

/** Foliage shading: each clump's normals lean toward the whole crown's (and a little upward), so the crown takes the
 *  light as one soft volume, the way a tree reads from a distance, instead of as a heap of separate lumps. */
function softNormals(g: THREE.BufferGeometry, own: V3, crown: V3, lean = 0.5): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    a.subVectors(p, own).normalize();
    b.subVectors(p, crown).normalize();
    a.multiplyScalar(1 - lean).addScaledVector(b, lean).add(v(0, 0.22, 0)).normalize();
    n.set([a.x, a.y, a.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
}

/** A trunk or branch: a tapered cylinder from `a` to `b`. */
function limb(a: V3, b: V3, r0: number, r1: number, sides: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q).translate(a.x, a.y, a.z);
  return g;
}

type Lobe = [number, number, number, number, number]; // x, y, z, radius, squash

/** A tree from its trunk and branches and its clumps of leaves (big clumps rounder than small ones); the leaves
 *  darken inside the crown and toward its foot. */
function tree(spec: { limbs: [V3, V3, number, number][]; lobes: Lobe[]; bark: string; leaf: string; detail: number; sides: number; seed: number; rough?: number; lean?: number; fine?: boolean }): THREE.BufferGeometry {
  const bark = col(spec.bark), leaf = col(spec.leaf);
  const parts: THREE.BufferGeometry[] = spec.limbs.map(([a, b, r0, r1]) => prep(limb(a, b, r0, r1, spec.sides), bark, (p) => 0.78 + 0.22 * THREE.MathUtils.smoothstep(p.y, 0, 3)));
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y, , r, s] of spec.lobes) { y0 = Math.min(y0, y - r * s); y1 = Math.max(y1, y + r * s); }
  const cx = spec.lobes.reduce((s, l) => s + l[0], 0) / spec.lobes.length, cz = spec.lobes.reduce((s, l) => s + l[2], 0) / spec.lobes.length;
  const centre = v(cx, (y0 + y1) / 2 - (y1 - y0) * 0.1, cz);
  let reach = 1;
  for (const [x, , z, r] of spec.lobes) reach = Math.max(reach, Math.hypot(x - cx, z - cz) + r);
  spec.lobes.forEach(([x, y, z, r, s], i) => {
    const g = clump(r, s, spec.detail + (r >= 1.8 && spec.fine ? 1 : 0), spec.seed * 31 + i, spec.rough).translate(x, y, z);
    softNormals(g, v(x, y, z), centre, spec.lean ?? 0.5);
    parts.push(prep(g, leaf, (p) => {
      const up = THREE.MathUtils.smoothstep(p.y, y0, y1);
      const out = THREE.MathUtils.clamp(Math.hypot(p.x - cx, p.z - cz) / reach, 0, 1);
      return (0.74 + 0.26 * up) * (0.86 + 0.14 * out);
    }));
  });
  return mergeAll(parts);
}

/** Monterey cypress: a short, thick, leaning trunk and broad flat tiers of dark foliage, wider than it is tall. */
export function montereyCypress(far: boolean, fine: boolean): THREE.BufferGeometry {
  return tree({
    fine, seed: 3, detail: far ? 0 : 1, sides: far ? 5 : 7, bark: '#75604f', leaf: '#687d5b', rough: 0.24, lean: 0.55,
    limbs: far ? [[v(0, 0, 0), v(0.5, 6, 0.2), 0.55, 0.32]] : [
      [v(0, 0, 0), v(0.6, 5.5, 0.2), 0.6, 0.38], [v(0.5, 4.8, 0.2), v(3.6, 7.8, 1.4), 0.3, 0.14], [v(0.5, 5, 0.1), v(-3.2, 8.6, -1.4), 0.3, 0.14], [v(0.6, 5.4, 0.2), v(0.8, 10, 0.4), 0.28, 0.12],
    ],
    lobes: far
      ? [[0.4, 7.4, 0.2, 5.2, 0.5], [2.8, 9.3, 1.0, 3.4, 0.55], [-2.6, 9.8, -1.2, 3.3, 0.52], [0.6, 11.4, 0.3, 2.7, 0.55]]
      : [
        [0.3, 7.0, 0.2, 4.4, 0.5], [3.9, 8.2, 1.6, 3.0, 0.55], [-3.6, 8.8, -1.6, 3.0, 0.52], [0.9, 10.2, 0.5, 3.2, 0.5], [-1.4, 11.4, 1.7, 2.3, 0.6],
        [2.6, 11.0, -1.8, 2.2, 0.6], [-4.4, 7.4, 1.9, 2.4, 0.55], [4.8, 7.0, -1.0, 2.1, 0.55], [-0.6, 8.0, -3.4, 2.4, 0.55], [1.6, 8.6, 3.4, 2.2, 0.55],
      ],
  });
}

/** Eucalyptus: a tall pale trunk forking high into a few limbs, each carrying loose rounded clusters of grey-green
 *  leaves, with sky showing between them. */
export function eucalyptus(far: boolean, fine: boolean): THREE.BufferGeometry {
  return tree({
    fine, seed: 5, detail: far ? 0 : 1, sides: far ? 5 : 6, bark: '#ddd2c0', leaf: '#9cad8f', rough: 0.26, lean: 0.4,
    limbs: far ? [[v(0, 0, 0), v(0.6, 15, 0.3), 0.42, 0.18]] : [
      [v(0, 0, 0), v(0.5, 11, 0.2), 0.42, 0.24], [v(0.5, 10.5, 0.2), v(-1.8, 18.5, -1.0), 0.24, 0.1], [v(0.5, 10.5, 0.2), v(2.6, 19.6, 1.1), 0.22, 0.09],
      [v(0.4, 9, 0.2), v(3.9, 13.8, -1.6), 0.15, 0.06], [v(0.5, 12, 0.2), v(-2.4, 15.2, 1.2), 0.12, 0.05],
    ],
    lobes: far
      ? [[-1.4, 18.4, -0.8, 3.2, 0.82], [2.2, 19.8, 0.9, 3.1, 0.82], [3.4, 14.0, -1.3, 2.3, 0.82], [0.4, 21.8, 0.2, 2.4, 0.85], [-2.4, 15.4, 1.0, 2.0, 0.85]]
      : [
        [-1.8, 18.6, -1.0, 2.3, 0.95], [-0.5, 19.9, -1.7, 1.8, 0.95], [-3.0, 17.3, 0.1, 1.7, 0.95], [2.6, 19.9, 1.1, 2.4, 0.95], [3.7, 18.5, 0.1, 1.7, 0.95],
        [1.6, 21.3, 1.5, 1.8, 0.95], [0.4, 22.2, 0.1, 1.9, 0.95], [3.9, 14.1, -1.6, 2.0, 0.95], [4.7, 13.0, -0.6, 1.4, 0.95], [-2.6, 15.3, 1.3, 1.7, 0.95],
        [1.0, 16.8, -2.4, 1.6, 0.95], [-0.7, 17.3, 2.4, 1.7, 0.95],
      ],
  });
}

/** A street or park tree (a plane tree): a round crown on a short trunk. */
export function parkTree(far: boolean, fine: boolean): THREE.BufferGeometry {
  return tree({
    fine, seed: 9, detail: far ? 0 : 1, sides: 5, bark: '#7d6c5c', leaf: '#8ca266', rough: 0.22, lean: 0.6,
    limbs: [[v(0, 0, 0), v(0.1, 3.4, 0), 0.22, 0.16]],
    lobes: far ? [[0, 5.6, 0, 3.0, 0.85]] : [[0, 5.2, 0, 2.7, 0.85], [1.3, 6.5, 0.6, 2.0, 0.85], [-1.1, 6.7, -0.5, 1.9, 0.85], [0.2, 7.4, -0.9, 1.6, 0.85]],
  });
}

/** A weeping willow: a short trunk, a soft dome, and all round it a curtain of long hanging strands of leaves that
 *  fall almost to the ground, pale gold-green, the shade and the trunk glimpsed between them. */
export function willow(quality: number): THREE.BufferGeometry {
  const bark = col('#6f5f4f'), leaf = col('#a2ac82'), deep = col('#535f42');
  const parts: THREE.BufferGeometry[] = [
    limb(v(0, 0, 0), v(0.25, 3.2, 0.1), 0.48, 0.34, 7), limb(v(0.25, 3, 0.1), v(2.2, 6.6, 0.8), 0.24, 0.12, 6),
    limb(v(0.25, 3, 0.1), v(-1.9, 6.9, -0.6), 0.24, 0.12, 6), limb(v(0.2, 3.2, 0.1), v(0.4, 7.4, -1.9), 0.2, 0.1, 6),
  ].map((g) => prep(g, bark));
  const centre = v(0, 4.4, 0);
  const shade = (p: V3) => (0.62 + 0.38 * THREE.MathUtils.smoothstep(p.y, 0.6, 8.6)) * (0.84 + 0.16 * THREE.MathUtils.clamp(Math.hypot(p.x, p.z) / 5, 0, 1));
  // The dome, and a shadowed core inside the curtain.
  const top: Lobe[] = [[0, 7.6, 0, 3.4, 0.62], [2.1, 7.1, 1.1, 2.5, 0.66], [-2.0, 7.2, -1.0, 2.5, 0.66], [0.7, 7.0, -2.2, 2.3, 0.66], [-0.9, 6.9, 2.1, 2.3, 0.66], [0.3, 8.6, 0.6, 1.8, 0.7]];
  top.forEach(([x, y, z, r, s], i) => {
    const g = clump(r, s, quality >= 0.9 ? 2 : 1, 70 + i, 0.22).translate(x, y, z);
    softNormals(g, v(x, y, z), centre, 0.55);
    parts.push(prep(g, leaf, shade));
  });
  const core = clump(3.4, 1.15, 1, 79, 0.12).translate(0, 4.4, 0);
  softNormals(core, v(0, 4.4, 0), centre, 0.3);
  parts.push(prep(core, deep, (p) => 0.55 + 0.45 * THREE.MathUtils.smoothstep(p.y, 1, 8)));
  // The curtain: strands hang from the dome's rim, arcing out a little before they fall, ragged at the hem.
  const r = seeded(77);
  const n = quality >= 0.9 ? 150 : 72;
  const seg = quality >= 0.9 ? 5 : 4;
  const pos: number[] = [], nor: number[] = [], colr: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.08;
    const r0 = 2.6 + r() * 1.7, y0 = 7.6 - (r0 - 2.6) * 0.62 + r() * 0.35;
    const len = Math.min(y0 - 0.45, 4.6 + r() * 2.6);
    const w = 0.26 + r() * 0.22;
    const out = v(Math.sin(a), 0, Math.cos(a)), side = v(Math.cos(a), 0, -Math.sin(a));
    const tint = 0.9 + r() * 0.2;
    const at = (t: number, s: number) => {
      const rad = r0 + 0.75 * Math.sin(Math.min(t * 2.2, Math.PI / 2)) + 0.25 * t;
      const y = y0 - t * len;
      const half = (w / 2) * (1 - 0.45 * t) * s;
      return out.clone().multiplyScalar(rad).addScaledVector(side, half).setY(y);
    };
    // Each strand is two-faced (outside lit as the curtain, inside shaded as the hollow under it), so the willow
    // needs no double-sided material.
    const outN = out.clone().add(v(0, 0.25, 0)).normalize(), inN = out.clone().negate().add(v(0, 0.25, 0)).normalize();
    for (let k = 0; k < seg; k++) {
      const t0 = k / seg, t1 = (k + 1) / seg;
      const quad = [at(t0, -1), at(t0, 1), at(t1, 1), at(t1, -1)];
      for (const [order, nn, dim] of [[[0, 2, 1, 0, 3, 2], outN, 1], [[0, 1, 2, 0, 2, 3], inN, 0.72]] as const) {
        for (const idx of order) {
          const q = quad[idx]!;
          pos.push(q.x, q.y, q.z);
          nor.push(nn.x, nn.y, nn.z);
          const k2 = shade(q) * tint * dim;
          colr.push(leaf.r * k2, leaf.g * k2, leaf.b * k2);
        }
      }
    }
  }
  const curtain = new THREE.BufferGeometry();
  curtain.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  curtain.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  curtain.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(-1), 2));
  curtain.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  parts.push(curtain);
  return mergeAll(parts);
}

/** A rounded shrub, dark green, wider than tall (about 3 m across): a pair of soft clumps. */
export function shrub(): THREE.BufferGeometry {
  const parts = ([[0, 0.9, 0, 1.25, 0.72], [0.55, 1.15, -0.35, 0.85, 0.75]] as Lobe[]).map(([x, y, z, r, sq], i) => {
    const g = clump(r, sq, 1, 40 + i, 0.18).translate(x, y, z);
    softNormals(g, v(x, y, z), v(0.2, 0.6, -0.1), 0.5);
    return prep(g, col('#4d6146'), (p) => 0.7 + 0.3 * THREE.MathUtils.smoothstep(p.y, 0.2, 1.9));
  });
  return mergeAll(parts);
}

/** One rounded crown of the Presidio's woods, for the hills: a few faces, seen far off. */
export function woodsCrown(fine: boolean): THREE.BufferGeometry {
  const g = clump(1, 0.8, fine ? 1 : 0, 21, 0.2);
  softNormals(g, v(0, 0, 0), v(0, -0.6, 0), 0.3);
  return prep(g, col('#4f6149'), (p) => 0.72 + 0.28 * THREE.MathUtils.smoothstep(p.y, -0.6, 0.8));
}

export type TreeSet = { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; colors: THREE.Color[] };

function instances(list: Spot[], baseScale = 1, tintA = '#ffffff', tintB = '#e8eedc'): { matrices: THREE.Matrix4[]; colors: THREE.Color[] } {
  const a = col(tintA), b = col(tintB);
  return {
    matrices: list.map((s) => new THREE.Matrix4().compose(v(s.x, 0, s.z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), s.yaw), v(1, 1, 1).multiplyScalar(s.s * baseScale))),
    colors: list.map((s) => a.clone().lerp(b, s.tint)),
  };
}

/** Every tree on the grounds, by kind, near ones in full and far ones simpler (split at `near` metres from the shore). */
export function trees(quality: number) {
  const spots = treeSpots();
  const fine = quality >= 0.9;
  const near = 70;
  const split = (list: Spot[]) => [list.filter((s) => fromShore(s.x, s.z).r < near), list.filter((s) => fromShore(s.x, s.z).r >= near)] as const;
  const [cyN, cyF] = split(spots.cypress);
  const [euN, euF] = split(spots.eucalyptus);
  const [pkN, pkF] = split(spots.park);
  const sets: Record<string, TreeSet> = {
    willow: { geometry: willow(quality), ...instances(spots.willow, 1, '#ffffff', '#eef2d6') },
    cypressNear: { geometry: montereyCypress(false, fine), ...instances(cyN, 1, '#ffffff', '#e2e8dc') },
    cypressFar: { geometry: montereyCypress(true, fine), ...instances(cyF, 1, '#ffffff', '#e2e8dc') },
    eucalyptusNear: { geometry: eucalyptus(false, fine), ...instances(euN, 1, '#ffffff', '#e9ece2') },
    eucalyptusFar: { geometry: eucalyptus(true, fine), ...instances(euF, 1, '#ffffff', '#e9ece2') },
    parkNear: { geometry: parkTree(false, fine), ...instances(pkN, 1, '#ffffff', '#f0eccc') },
    parkFar: { geometry: parkTree(true, fine), ...instances(pkF, 1, '#ffffff', '#f0eccc') },
  };
  return { sets, spots };
}

// ---------------------------------------------------------------------------------------------------------------
// The site map: paths, streets and sidewalks, and the soft shade under trees and along house fronts, painted once.

/** World x/z covered by the site map (and its size in texels). */
const MAP = { x0: -180, z0: -150, w: 360, h: 390 };

export function siteMap(quality: number, treeList: { x: number; z: number; r: number }[]): { texture: THREE.DataTexture; box: THREE.Vector4 } {
  const size = quality >= 0.9 ? 1024 : 768;
  const sx = size / MAP.w, sz = size / MAP.h;
  const make = () => { const c = document.createElement('canvas'); c.width = size; c.height = size; return c; };
  const ways = make(), shade = make();
  const w = ways.getContext('2d')!, s = shade.getContext('2d')!;
  // World (x, z) to canvas pixels: x along the canvas, z down it (the texture is read with the same mapping).
  w.setTransform(sx, 0, 0, sz, -MAP.x0 * sx, -MAP.z0 * sz);
  s.setTransform(sx, 0, 0, sz, -MAP.x0 * sx, -MAP.z0 * sz);
  w.fillStyle = '#000';
  w.fillRect(MAP.x0, MAP.z0, MAP.w, MAP.h);
  w.globalCompositeOperation = 'lighter';
  w.filter = 'blur(1px)';
  w.lineCap = 'round';
  w.lineJoin = 'round';
  // Paths (red): the ring round the lagoon, the way out to Baker Street, the diagonals and the north and south walks.
  w.strokeStyle = '#f00';
  const stroke = (pts: [number, number][], width: number) => { w.lineWidth = width; w.beginPath(); pts.forEach(([x, z], i) => (i ? w.lineTo(x, z) : w.moveTo(x, z))); w.stroke(); };
  const ring: [number, number][] = [];
  for (let i = 0; i <= 160; i++) { const p = lagoonPoint((i / 160) * Math.PI * 2, SITE.ring.grow); ring.push([p.x, p.y]); }
  stroke(ring, SITE.ring.width);
  stroke([[0, SITE.landing.z + SITE.landing.r - 1], [0, SITE.baker.z - SITE.baker.half - SITE.walk + 0.5]], 3.4);
  const ne = lagoonPoint(Math.PI / 4, SITE.ring.grow), se = lagoonPoint((3 * Math.PI) / 4, SITE.ring.grow);
  stroke([[ne.x, ne.y], [52, 64], [SITE.marina.x - SITE.marina.half - SITE.walk + 0.5, SITE.baker.z - SITE.baker.half - SITE.walk + 0.5]], 2.8);
  stroke([[se.x, se.y], [-52, 64], [SITE.south.x + SITE.south.half + SITE.walk - 0.5, SITE.baker.z - SITE.baker.half - SITE.walk + 0.5]], 2.8);
  stroke([[LAGOON.hw + SITE.ring.grow, 24], [SITE.marina.x - SITE.marina.half - 1, 24]], 2.8);
  stroke([[-LAGOON.hw - SITE.ring.grow, 24], [SITE.south.x + SITE.south.half + 1, 24]], 2.8);
  // Sidewalks (blue) under the streets (green).
  const streets: [number, number, number, number][] = [
    [hillEdge(SITE.baker.z), SITE.marina.x + SITE.marina.half, SITE.baker.z - SITE.baker.half, SITE.baker.z + SITE.baker.half],
    [SITE.marina.x - SITE.marina.half, SITE.marina.x + SITE.marina.half, MAP.z0, MAP.z0 + MAP.h],
    [SITE.south.x - SITE.south.half, SITE.south.x + SITE.south.half, SITE.south.from, SITE.baker.z],
  ];
  w.fillStyle = '#00f';
  for (const [x0, x1, z0, z1] of streets) w.fillRect(x0 - SITE.walk, z0 - SITE.walk, x1 - x0 + 2 * SITE.walk, z1 - z0 + 2 * SITE.walk);
  w.fillStyle = '#0f0';
  for (const [x0, x1, z0, z1] of streets) w.fillRect(x0, z0, x1 - x0, z1 - z0);
  // Shade: white is open ground; soft pools under each crown and along the foot of the house rows.
  s.fillStyle = '#fff';
  s.fillRect(MAP.x0, MAP.z0, MAP.w, MAP.h);
  s.globalCompositeOperation = 'multiply';
  for (const t of treeList) {
    const gr = s.createRadialGradient(t.x, t.z, 0, t.x, t.z, t.r * 1.3);
    gr.addColorStop(0, 'rgb(178,178,178)');
    gr.addColorStop(0.55, 'rgb(214,214,214)');
    gr.addColorStop(1, 'rgb(255,255,255)');
    s.fillStyle = gr;
    s.fillRect(t.x - t.r * 1.3, t.z - t.r * 1.3, t.r * 2.6, t.r * 2.6);
  }
  const foot = (x0: number, z0: number, x1: number, z1: number, gx0: number, gz0: number, gx1: number, gz1: number) => {
    const gr = s.createLinearGradient(gx0, gz0, gx1, gz1);
    gr.addColorStop(0, 'rgb(190,190,190)');
    gr.addColorStop(1, 'rgb(255,255,255)');
    s.fillStyle = gr;
    s.fillRect(x0, z0, x1 - x0, z1 - z0);
  };
  const front = SITE.baker.z + SITE.baker.half + SITE.walk;
  foot(hillEdge(SITE.baker.z), front - 2.5, SITE.marina.x - SITE.marina.half, front, 0, front, 0, front - 2.5);
  const sfront = SITE.south.x - SITE.south.half - SITE.walk;
  foot(sfront, SITE.south.from, sfront + 2.5, SITE.baker.z - SITE.baker.half - SITE.walk, sfront, 0, sfront + 2.5, 0);
  // Into one texture: paths, streets, sidewalks, shade.
  const a = w.getImageData(0, 0, size, size).data, b = s.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = a[i * 4]!; data[i * 4 + 1] = a[i * 4 + 1]!; data[i * 4 + 2] = a[i * 4 + 2]!; data[i * 4 + 3] = b[i * 4]!;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, box: new THREE.Vector4(MAP.x0, MAP.z0, 1 / MAP.w, 1 / MAP.h) };
}

/** The site's floor: everything within reach, up to the sea wall in the north and the hills in the south, with the
 *  lagoon cut out. One flat shape; the paving, lawns and streets are drawn on it by its material. */
export function siteFloor(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 360;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let x = Math.sin(a) * SITE.reach, z = SHORE.z - Math.cos(a) * SITE.reach;
    x = Math.min(x, SITE.seawall);
    x = Math.max(x, hillEdge(z));
    pts.push(new THREE.Vector2(x, -z));
  }
  // Exact corners of the hills' edge, so floor and hills meet without a seam.
  const shape = new THREE.Shape(cleanLoop(pts));
  const hole = new THREE.Path(Array.from({ length: 96 }, (_, i) => { const p = lagoonPoint((i / 96) * Math.PI * 2); return new THREE.Vector2(p.x, -p.y); }));
  hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

/** Drop repeated and collinear points (clamping the circle leaves runs of them along the straight edges). */
function cleanLoop(pts: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of pts) if (!out.length || out[out.length - 1]!.distanceTo(p) > 0.05) out.push(p);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The exhibition hall: a long stucco crescent behind the colonnades (its front pierced by tall lattice doors, drawn by
// its material), a cornice, and a low-pitched roof. Built round the colonnade's arc centre.

export function hallGeometry(quality: number): THREE.BufferGeometry {
  const H = SITE.hall;
  const seg = quality >= 0.9 ? 72 : 44;
  const b = new Builder();
  const wall = col('#e9d8c4'), roofC = col('#c2b4a6'), cornice = col('#f1e4d4');
  const at = (th: number, r: number, y: number) => v(ARC.x + Math.sin(th) * r, y, ARC.y - Math.cos(th) * r);
  const radial = (th: number) => v(Math.sin(th), 0, -Math.cos(th));
  const rm = (H.r0 + H.r1) / 2;
  for (let i = 0; i < seg; i++) {
    const t0 = -H.span + (2 * H.span * i) / seg, t1 = -H.span + (2 * H.span * (i + 1)) / seg;
    // Front wall (faces the colonnades, toward the arc centre), smooth-shaded round the curve.
    const n0 = radial(t0).negate(), n1 = radial(t1).negate();
    const quadS = (a: V3, bb: V3, c: V3, d: V3, na: V3, nb: V3, color: THREE.Color) => {
      // like quad(), but with per-edge normals for a smooth curve
      const tri = [[a, na], [bb, nb], [c, nb], [a, na], [c, nb], [d, na]] as const;
      for (const [p, n] of tri) { b.pos.push(p.x, p.y, p.z); b.nor.push(n.x, n.y, n.z); b.uv.push(-1, -1); b.col.push(color.r, color.g, color.b); }
    };
    // Seen from the arc centre the wall runs left to right with increasing angle... (-sin, cos) side faces centre.
    quadS(at(t0, H.r0, 0), at(t1, H.r0, 0), at(t1, H.r0, H.wall), at(t0, H.r0, H.wall), n0, n1, wall);
    // Cornice: a projecting band at the top of the front.
    const cr = H.r0 - 0.45;
    quadS(at(t0, cr, H.wall - 0.75), at(t1, cr, H.wall - 0.75), at(t1, cr, H.wall + 0.15), at(t0, cr, H.wall + 0.15), n0, n1, cornice);
    b.quad(at(t1, cr, H.wall - 0.75), at(t0, cr, H.wall - 0.75), at(t0, H.r0, H.wall - 0.75), at(t1, H.r0, H.wall - 0.75), cornice, undefined, v(0, -1, 0));
    b.quad(at(t0, cr, H.wall + 0.15), at(t1, cr, H.wall + 0.15), at(t1, H.r0, H.wall + 0.15), at(t0, H.r0, H.wall + 0.15), cornice, undefined, v(0, 1, 0));
    // Plinth.
    const pr = H.r0 - 0.22;
    quadS(at(t0, pr, 0), at(t1, pr, 0), at(t1, pr, 0.75), at(t0, pr, 0.75), n0, n1, wall);
    b.quad(at(t0, pr, 0.75), at(t1, pr, 0.75), at(t1, H.r0, 0.75), at(t0, H.r0, 0.75), wall, undefined, v(0, 1, 0));
    // Back wall (faces away from the palace).
    quadS(at(t1, H.r1, 0), at(t0, H.r1, 0), at(t0, H.r1, H.wall), at(t1, H.r1, H.wall), radial(t1), radial(t0), wall);
    // Roof: up from the front eave to the ridge, and down to the back.
    const up0 = v(0, 1, 0).multiplyScalar(rm - H.r0).add(radial(t0).multiplyScalar(-(H.ridge - H.wall))).normalize();
    const up1 = v(0, 1, 0).multiplyScalar(rm - H.r0).add(radial(t1).multiplyScalar(-(H.ridge - H.wall))).normalize();
    quadS(at(t0, H.r0 - 0.45, H.wall + 0.15), at(t1, H.r0 - 0.45, H.wall + 0.15), at(t1, rm, H.ridge), at(t0, rm, H.ridge), up0, up1, roofC);
    const dn0 = v(0, 1, 0).multiplyScalar(H.r1 - rm).add(radial(t0).multiplyScalar(H.ridge - H.wall)).normalize();
    const dn1 = v(0, 1, 0).multiplyScalar(H.r1 - rm).add(radial(t1).multiplyScalar(H.ridge - H.wall)).normalize();
    quadS(at(t1, H.r1, H.wall), at(t0, H.r1, H.wall), at(t0, rm, H.ridge), at(t1, rm, H.ridge), dn1, dn0, roofC);
  }
  // The two ends: a gable wall at each.
  for (const side of [-1, 1]) {
    const th = side * H.span;
    const [A, B, C, D, E] = [at(th, H.r0, 0), at(th, H.r1, 0), at(th, H.r1, H.wall), at(th, rm, H.ridge), at(th, H.r0, H.wall)] as const;
    const n = v(Math.cos(th), 0, Math.sin(th)).multiplyScalar(side);
    // A pentagon (a gable on a wall), fanned from its front foot; wound to face outward along the arc.
    if (side > 0) { b.quad(A, B, C, D, wall, undefined, n); b.quad(A, D, E, E, wall, undefined, n); }
    else { b.quad(A, E, D, C, wall, undefined, n); b.quad(A, C, B, B, wall, undefined, n); }
  }
  return b.geometry();
}

// ---------------------------------------------------------------------------------------------------------------
// Houses: Marina-style row houses, two or three storeys over a garage, in pastel stucco with white trim; some with a
// bay window, some with a tiled pent roof along the parapet.

const PASTELS = ['#f1e4cf', '#f2cfb6', '#efc8c3', '#efdca6', '#d2dec6', '#cad8e4', '#ddd2e5', '#f4efe6', '#e8d3b2', '#eab9a3', '#f4d9c6', '#dbe4d7', '#f0d4d8', '#e6dcc8'];
const TILE = col('#b9664c');
const TRIM = col('#f6f1e8');

type HouseSpec = { bays: number; floors: number; depth: number; seed: number; color: THREE.Color; bay: boolean; tile: boolean; sink?: number };

/** One house in its local frame (front along +x from 0 to its width, facing -z; ground at y = 0). */
function addHouse(b: Builder, m: THREE.Matrix4, h: HouseSpec): number {
  const W = h.bays * 2.4;
  const top = 2.8 + 3 * h.floors + 0.9;
  const enc = 1000 * h.floors + 100 * h.seed;
  const sink = h.sink ?? 0;
  // The front's uv runs from the viewer's left: the face's right edge (as seen) is local x = 0.
  b.box(m, 0, W, -sink, top, 0, h.depth, h.color, { skip: 'b', front: { u0: 0, u1: W, enc } });
  // Parapet cornice.
  b.box(m, -0.1, W + 0.1, top - 0.35, top + 0.08, -0.22, 0.3, TRIM, { skip: 'bk' });
  if (h.tile) {
    // A pent roof of red tile along the top of the front.
    const P = (x: number, y: number, z: number) => v(x, y, z).applyMatrix4(m);
    b.quad(P(W + 0.15, top - 1.05, -0.75), P(-0.15, top - 1.05, -0.75), P(-0.15, top - 0.35, 0), P(W + 0.15, top - 0.35, 0), TILE);
    b.quad(P(-0.15, top - 1.05, -0.75), P(W + 0.15, top - 1.05, -0.75), P(W + 0.15, top - 1.17, -0.75), P(-0.15, top - 1.17, -0.75), TILE);
  }
  if (h.bay && h.floors >= 1 && h.bays >= 3) {
    // A bay window over the garage, through the upper floors.
    b.box(m, W - 4.8, W, 2.8, 2.8 + 3 * h.floors, -0.85, 0, h.color, { skip: 'bk', front: { u0: 0, u1: 4.8, enc } });
    b.box(m, W - 4.95, W + 0.15, 2.8 + 3 * h.floors, 2.8 + 3 * h.floors + 0.18, -1.0, 0, TRIM, { skip: 'bk' });
  }
  return W;
}

/** A row of houses along a street: starting at `origin`, running along `along`, fronts facing `facing`. */
function houseRow(b: Cells, origin: THREE.Vector2, yaw: number, length: number, seed: number, opts: { floors?: [number, number]; depth?: number; ground?: (x: number, z: number) => number; gap?: number } = {}): void {
  const r = seeded(seed);
  let s = 0;
  const [f0, f1] = opts.floors ?? [1, 3];
  while (s < length) {
    const bays = r() < 0.55 ? 3 : r() < 0.6 ? 4 : 5;
    const W = bays * 2.4;
    if (s + W > length) break;
    const floors = f0 + Math.floor(r() * (f1 - f0 + 1));
    // Local x runs along the street; the house's own local x = 0 is at its right end as seen from the street.
    const dir = v(Math.cos(yaw), 0, -Math.sin(yaw));
    const p = v(origin.x, 0, origin.y).add(dir.clone().multiplyScalar(s));
    const y = opts.ground ? opts.ground(p.x, p.z) : 0;
    const m = new THREE.Matrix4().compose(v(p.x, y, p.z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), v(1, 1, 1));
    addHouse(b.at(p.x, p.z), m, { bays, floors, depth: opts.depth ?? 12, seed: Math.floor(r() * 10), color: col(PASTELS[Math.floor(r() * PASTELS.length)]!), bay: r() < 0.5, tile: r() < 0.4, sink: opts.ground ? 4 : 0 });
    s += W + (opts.gap ?? 0) + (r() < 0.12 ? 1.2 : 0);
  }
}

/** Builders by map cell, so each part of the city is its own mesh and the ones behind you are not drawn at all. */
class Cells {
  private map = new Map<string, Builder>();
  constructor(private size: number) {}
  at(x: number, z: number): Builder {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.map.get(k);
    if (!b) { b = new Builder(); this.map.set(k, b); }
    return b;
  }
  geometries(): THREE.BufferGeometry[] { return [...this.map.values()].filter((b) => b.pos.length).map((b) => b.geometry()); }
}

/** Baker Street's row behind you, facing the park (west), from the south street's corner to Marina Boulevard. */
export function housesEast(): THREE.BufferGeometry[] {
  const b = new Cells(96);
  const front = SITE.baker.z + SITE.baker.half + SITE.walk;
  const x0 = hillEdge(front) + 2, x1 = SITE.marina.x - SITE.marina.half - SITE.walk;
  // yaw 0: local x along world +x, fronts facing world -z (toward the park).
  houseRow(b, new THREE.Vector2(x0, front), 0, x1 - x0, 101);
  // A second row a street further on, taller here and there above the first.
  houseRow(b, new THREE.Vector2(x0 + 3, front + 26), 0, x1 - x0 - 6, 102, { floors: [2, 4] });
  return b.geometries();
}

/** The street along the park's south edge (fronts facing north, over the park) and the city climbing the hill behind. */
export function housesSouth(quality: number): THREE.BufferGeometry[] {
  const b = new Cells(96);
  const front = SITE.south.x - SITE.south.half - SITE.walk;
  // yaw -pi/2: local x along world +z, fronts facing world +x (north, toward the park).
  houseRow(b, new THREE.Vector2(front, SITE.south.from + 2), -Math.PI / 2, SITE.baker.z - SITE.baker.half - SITE.walk - SITE.south.from - 2, 201);
  // The hill: terraces of houses following its contours, thinning toward the reach.
  const r = seeded(202);
  const rows = quality >= 0.9 ? 7 : 5;
  for (let z = -2; z < 210; z += 10.5) {
    const xe = hillEdge(z), xf = hillFar(z);
    const span = xe - xf;
    if (!(span > 14)) continue;
    for (let k = 0; k < rows; k++) {
      if (r() < 0.22) continue;
      const d = 9 + (k / rows) * (span - 12) + r() * 3;
      const x = xe - d;
      const zz = z + (r() - 0.5) * 3;
      if (fromShore(x, zz).r > SITE.reach - 6) continue;
      const y = hillHeight(zz, d, span);
      const m = new THREE.Matrix4().compose(v(x, y, zz), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), -Math.PI / 2 + (r() - 0.5) * 0.12), v(1, 1, 1));
      addHouse(b.at(x, zz), m, { bays: r() < 0.6 ? 3 : 4, floors: 1 + Math.floor(r() * 3), depth: 11, seed: Math.floor(r() * 10), color: col(PASTELS[Math.floor(r() * PASTELS.length)]!), bay: false, tile: r() < 0.35, sink: 5 });
    }
  }
  return b.geometries();
}

// ---------------------------------------------------------------------------------------------------------------
// The southern hills: the Presidio's wooded slopes to the south-west, the city's hill to the south and south-east.

export function hills(quality: number): { terrain: THREE.BufferGeometry; crowns: THREE.Matrix4[]; crownColors: THREE.Color[] } {
  const zs: number[] = [];
  for (let z = -130; z <= 216; z += quality >= 0.9 ? 5 : 7) zs.push(z);
  const U = quality >= 0.9 ? 12 : 8;
  const pos: number[] = [], colr: number[] = [];
  const forest = col('#4b5b47'), city = col('#b6aa9b'), garden = col('#7f8c63');
  const row = (z: number) => {
    const xe = hillEdge(z), xf = Math.min(hillFar(z), xe);
    const span = xe - xf;
    // A low kerb where the hills begin (a skirt down below the park's floor, so the two never fight or part).
    return Array.from({ length: U + 2 }, (_, k) => {
      const i = Math.max(0, k - 1);
      const d = (i / U) * span;
      const x = xe - d + (k === 0 ? 0.6 : 0);
      const y = k === 0 ? -0.6 : 0.25 + (span > 0.5 ? hillHeight(z, d, span) : 0);
      const presidio = THREE.MathUtils.smoothstep(z, 8, -30);
      const n = noise3(x * 0.05, 0, z * 0.05, 31);
      const c = city.clone().lerp(garden, 0.35 + 0.4 * n).lerp(forest, presidio);
      return { p: v(x, y, z), c: c.multiplyScalar(0.92 + 0.12 * n) };
    });
  };
  const rows = zs.map(row);
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < U + 1; i++) {
      const a = rows[j]![i]!, bq = rows[j]![i + 1]!, c = rows[j + 1]![i + 1]!, d = rows[j + 1]![i]!;
      // (x decreasing with i, z increasing with j): wind so the faces look up.
      for (const q of [a, c, d, a, bq, c]) { pos.push(q.p.x, q.p.y, q.p.z); colr.push(q.c.r, q.c.g, q.c.b); }
    }
  }
  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  terrain.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(-1), 2));
  // Smooth normals across the shared grid.
  const terrainOut = mergeVertices(terrain);
  terrainOut.computeVertexNormals();
  terrainOut.computeBoundingSphere();
  // Woods: crowns close together on the Presidio's slopes, sparser street trees through the city.
  const r = seeded(303);
  const crowns: THREE.Matrix4[] = [], crownColors: THREE.Color[] = [];
  const dark = col('#ffffff'), light = col('#dfe6d2');
  const step = quality >= 0.9 ? 5.5 : 7;
  for (let z = -128; z <= 214; z += step) {
    const xe = hillEdge(z), xf = hillFar(z);
    const span = xe - xf;
    if (!(span > 6)) continue;
    const presidio = THREE.MathUtils.smoothstep(z, 8, -30);
    for (let d = 2; d < span - 2; d += step * (presidio > 0.5 ? 1 : 2.2)) {
      if (presidio < 0.5 && r() < 0.55) continue;
      const x = xe - d + (r() - 0.5) * 3, zz = z + (r() - 0.5) * 3;
      if (fromShore(x, zz).r > SITE.reach - 3) continue;
      const y = hillHeight(zz, xe - x, span);
      const s = (presidio > 0.5 ? 3.6 : 2.8) * (0.8 + r() * 0.45);
      crowns.push(new THREE.Matrix4().compose(v(x, y + s * 0.55, zz), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), r() * 6.28), v(s, s * (0.9 + r() * 0.35), s)));
      crownColors.push(dark.clone().lerp(light, r()));
    }
  }
  return { terrain: terrainOut, crowns, crownColors };
}

// ---------------------------------------------------------------------------------------------------------------
// North: the sea wall along Marina Boulevard, the yacht harbour with its masts, and the yacht club on its pier.

export function harbour(quality: number): THREE.BufferGeometry {
  const b = new Builder();
  const r = seeded(404);
  const id = new THREE.Matrix4();
  const hullW = col('#f4f1ea'), hullB = col('#3f4a63'), mast = col('#d9d6d0'), dock = col('#8b7f74');
  const bay = SITE.bayY;
  // Docks running out from the wall (along x), boats moored either side.
  // The harbour lies north-east of the palace: its masts stand against the Marin hills, clear of the bridge.
  const docks = quality >= 0.9 ? [44, 60, 76, 92, 108] : [46, 66, 86, 106];
  for (const dz of docks) {
    const x0 = SITE.seawall + 4, x1 = SITE.seawall + 44;
    b.box(id, x0, x1, bay + 0.15, bay + 0.45, dz - 0.9, dz + 0.9, dock, { skip: 'b' });
    for (let x = x0 + 3; x < x1 - 2; x += 4.2) {
      for (const side of [-1, 1]) {
        if (r() < 0.18) continue;
        if (fromShore(x, dz).r > SITE.reach - 4) continue;
        const L = 7 + r() * 4, Wd = 2.4 + r() * 0.8;
        const zc = dz + side * (1.2 + L / 2);
        const hc = r() < 0.15 ? hullB : hullW;
        b.box(id, x - Wd / 2, x + Wd / 2, bay - 0.2, bay + 0.75, zc - L / 2, zc + L / 2, hc, { skip: 'b' });
        b.box(id, x - Wd / 2 + 0.4, x + Wd / 2 - 0.4, bay + 0.75, bay + 1.35, zc - L / 4, zc + L / 6, hullW, { skip: 'b' });
        if (r() < 0.78) {
          const h = 9 + r() * 7;
          b.box(id, x - 0.09, x + 0.09, bay + 0.75, bay + 0.75 + h, zc - 0.09 + L * 0.05, zc + 0.09 + L * 0.05, mast, { skip: 'b' });
        }
      }
    }
  }
  // The yacht club on its point: white stucco under red tile, a short tower.
  const clubAt = v(138, 0, -34);
  const clubYaw = Math.atan2(-(SHORE.x - clubAt.x), -(SHORE.z - clubAt.z)); // its front turned toward the shore
  const club = new THREE.Matrix4().compose(clubAt, new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), clubYaw), v(1, 1, 1));
  addHouse(b, club, { bays: 9, floors: 2, depth: 14, seed: 6, color: col('#f3eee6'), bay: false, tile: true, sink: 2 });
  const tower = club.clone().multiply(new THREE.Matrix4().makeTranslation(15, 0, 3));
  addHouse(b, tower, { bays: 2, floors: 3, depth: 6, seed: 7, color: col('#f3eee6'), bay: false, tile: true, sink: 2 });
  return b.geometry();
}

/** Stone at the edges: the sea wall with its coping, and kerbs along the streets. Drawn in the palace's marble. */
export function edges(): THREE.BufferGeometry {
  const b = new Builder();
  const id = new THREE.Matrix4();
  const stone = col('#e7ddd0');
  const zMax = SHORE.z + Math.sqrt(SITE.reach ** 2 - SITE.seawall ** 2), zMin = SHORE.z - Math.sqrt(SITE.reach ** 2 - SITE.seawall ** 2);
  b.box(id, SITE.seawall - 0.5, SITE.seawall + 0.5, SITE.bayY - 0.6, 0.55, zMin, zMax, stone, { skip: 'b' });
  b.box(id, SITE.seawall - 0.62, SITE.seawall + 0.62, 0.55, 0.7, zMin, zMax, stone, { skip: 'b' });
  return b.geometry();
}

/** The bay: open water from the sea wall out to the reach (the sky's mirror carries it to the horizon). */
export function bayWater(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const a0 = Math.asin(SITE.seawall / SITE.reach);
  for (let i = 0; i <= 64; i++) {
    const a = a0 + ((Math.PI - 2 * a0) * i) / 64;
    pts.push(new THREE.Vector2(Math.sin(a) * SITE.reach, -(SHORE.z - Math.cos(a) * SITE.reach)));
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1).rotateX(-Math.PI / 2).translate(0, SITE.bayY, 0);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Lamp posts and benches.

export function lampPost(): THREE.BufferGeometry {
  const prof: [number, number][] = [[0, 0], [0.2, 0], [0.2, 0.09], [0.15, 0.13], [0.15, 0.48], [0.1, 0.58], [0.075, 0.72], [0.058, 3.3], [0.09, 3.36], [0.09, 3.44], [0.045, 3.5], [0, 3.5]];
  return prep(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8), col('#3b4640'));
}
/** The lamp's globe: its uv marks it as glowing to the facade shader the props are drawn with. */
export function lampGlobe(): THREE.BufferGeometry {
  const g = prep(new THREE.SphereGeometry(0.2, 10, 7).translate(0, 3.68, 0), col('#fff3e0'));
  (g.getAttribute('uv') as THREE.BufferAttribute).array.fill(-2);
  return g;
}

/** A park bench (the sitter faces -z): wooden slats on cast-iron ends. */
export function bench(): THREE.BufferGeometry {
  const b = new Builder();
  const id = new THREE.Matrix4();
  const wood = col('#9c7a5c'), iron = col('#30342f');
  for (const z of [-0.2, -0.05, 0.1]) b.box(id, -0.9, 0.9, 0.42, 0.46, z - 0.06, z + 0.06, wood);
  const back = new THREE.Matrix4().makeRotationX(0.2).setPosition(0, 0, 0.12);
  for (const y of [0.55, 0.72, 0.89]) b.box(back, -0.9, 0.9, y, y + 0.08, -0.02, 0.02, wood);
  for (const x of [-0.82, 0.82]) {
    b.box(id, x - 0.03, x + 0.03, 0, 0.44, -0.24, -0.18, iron);
    b.box(id, x - 0.03, x + 0.03, 0, 0.95, 0.2, 0.26, iron);
    b.box(id, x - 0.035, x + 0.035, 0.62, 0.66, -0.26, 0.24, iron);
  }
  return b.geometry();
}

export function props() {
  const { lamps, benches } = propSpots();
  const lampM = lamps.map(([x, z]) => new THREE.Matrix4().makeTranslation(x, 0, z));
  const benchM = benches.map((p) => new THREE.Matrix4().compose(v(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), p.yaw), v(1, 1, 1)));
  return { lampM, benchM };
}
