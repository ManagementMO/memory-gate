// Things the library doesn't draw. Claude composes them from smooth primitives (convex/sketch.ts `compose`, cached
// per label and colour); this turns those parts into porcelain geometry. Until the parts arrive, or when they
// can't, a "memory token" stands in: a smooth porcelain pebble with a glowing seam, honest about being a placeholder.
import * as THREE from 'three';
import { geo, porcelain, type BuildOptions, type MaterialKind } from './style';

export type Part = { shape: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'capsule'; size: number[]; position: number[]; rotation: number[]; color: string; material: MaterialKind };

const n = (v: number | undefined, d: number, lo = 0.005, hi = 6) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function fromParts(parts: Part[], o: BuildOptions): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts.slice(0, 18)) {
    const s = p.size ?? [];
    let geometry: THREE.BufferGeometry;
    switch (p.shape) {
      case 'box': geometry = geo.box(n(s[0], 0.3), n(s[1], 0.3), n(s[2], 0.3)); break;
      case 'cylinder': geometry = geo.cylinder(n(s[0], 0.1, 0.002), n(s[1], 0.1, 0.002), n(s[2], 0.3)); break;
      case 'sphere': geometry = geo.sphere(n(s[0], 0.15)); break;
      case 'cone': geometry = geo.cone(n(s[0], 0.15), n(s[1], 0.3)); break;
      case 'torus': geometry = geo.torus(n(s[0], 0.15), n(s[1], 0.03, 0.002, 1)); break;
      case 'capsule': geometry = geo.capsule(n(s[0], 0.08), n(s[1], 0.2)); break;
      default: continue;
    }
    const m = new THREE.Mesh(geometry, porcelain(o.color && p.color === '' ? o.color : p.color || o.color, p.material ?? 'ceramic', o.reveal));
    const pos = p.position ?? [0, 0, 0];
    const rot = p.rotation ?? [0, 0, 0];
    m.position.set(n(pos[0], 0, -6), n(pos[1], 0, -6), n(pos[2], 0, -6));
    m.rotation.set(THREE.MathUtils.degToRad(rot[0] ?? 0), THREE.MathUtils.degToRad(rot[1] ?? 0), THREE.MathUtils.degToRad(rot[2] ?? 0));
    g.add(m);
  }
  // Composed parts are authored in metres around the origin; settle the lowest point onto the floor.
  const box = new THREE.Box3().setFromObject(g);
  if (Number.isFinite(box.min.y)) g.position.y -= box.min.y;
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.scale.setScalar(o.scale);
  return wrap;
}

/** A placeholder that never pretends to be the thing: a pebble of porcelain with a soft lit seam. */
export function token(o: BuildOptions, size = 0.5): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo.sphere(size * 0.5, 48, 32), porcelain(o.color, 'ceramic', o.reveal));
  body.scale.set(1, 0.62, 0.8);
  body.position.y = size * 0.31;
  const seam = new THREE.Mesh(geo.torus(size * 0.47, size * 0.012), porcelain('#d9d2ff', 'light', o.reveal));
  seam.rotation.x = Math.PI / 2;
  seam.scale.set(1, 0.8, 1);
  seam.position.y = size * 0.31;
  g.add(body, seam);
  return g;
}
