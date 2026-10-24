// The palace, built from a handful of shapes: lathe-turned columns (one instanced mesh for all of them), the rotunda's
// eight arched walls, entablature, drum and dome merged into a few meshes, the colonnade's beams and planter boxes, the
// weeping figures at the boxes' corners, the terrace with the lagoon cut out of it. Everything is computed once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COL, LAGOON, R, ROT, WATER_Y, lagoonPoint, sc } from './plan';

/** Same attributes everywhere (position, normal, uv), non-indexed, so any set of parts can be merged. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.getAttribute('uv')) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}

export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map(clean), false);
  if (!g) throw new Error('palace: merge failed');
  g.computeBoundingSphere();
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) =>
  new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z));

/** Turning by `yaw` maps local (x, z) to world (x·cos + z·sin, −x·sin + z·cos), as Object3D.rotation.y does. */
const turn = (yaw: number, lx: number, lz: number) => new THREE.Vector2(lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw));
/** On the colonnade's arc, the yaw that lays a box's length along the arc and its depth across it. */
const arcYaw = (theta: number) => -theta;

/** One Corinthian column, height 1: base mouldings, a shaft with a gentle swell, a flared capital, the square abacus. */
export function columnGeometry(segments: number): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [0.0, 0.018], [0.071, 0.018], [0.071, 0.026], [0.066, 0.032], [0.068, 0.038], [0.06, 0.044], [0.057, 0.05], [0.061, 0.055],
    [0.055, 0.062], [0.052, 0.066], [0.0515, 0.2], [0.05, 0.42], [0.0475, 0.66], [0.045, 0.85], [0.049, 0.855], [0.049, 0.862],
    [0.045, 0.866], [0.046, 0.885], [0.051, 0.915], [0.058, 0.94], [0.066, 0.962], [0.07, 0.972], [0.0, 0.972],
  ];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const plinth = new THREE.BoxGeometry(0.15, 0.018, 0.15).translate(0, 0.009, 0);
  const abacus = new THREE.BoxGeometry(0.152, 0.028, 0.152).translate(0, 0.986, 0);
  return merge([lathe, plinth, abacus]);
}

export type ColumnSpot = { x: number; z: number; h: number; yaw: number };

/** Where every column stands: two flanking each arch of the rotunda, and the two rows of each colonnade arm. */
export function columnSpots(): ColumnSpot[] {
  const out: ColumnSpot[] = [];
  const d = sc(R.apothem + R.colOut);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const u = side * sc(R.colSide);
      out.push({ x: ROT.x + Math.sin(a) * d + Math.cos(a) * u, z: ROT.z + Math.cos(a) * d - Math.sin(a) * u, h: sc(R.colH), yaw: a });
    }
  }
  for (const c of colonnadeColumns()) out.push(c);
  return out;
}

/** The colonnade arc's centre lies toward you, so its arms curve forward around the lagoon. */
const arcCentre = () => new THREE.Vector2(ROT.x, ROT.z + sc(COL.radius));
export function arcPoint(theta: number, radius: number): THREE.Vector2 {
  const c = arcCentre();
  return new THREE.Vector2(c.x + Math.sin(theta) * radius, c.y - Math.cos(theta) * radius);
}
export function colonnadeAngles(): number[] {
  const step = sc(COL.spacing) / sc(COL.radius);
  const out: number[] = [];
  for (let t = COL.from; t <= COL.to + 1e-6; t += step) out.push(t);
  return out;
}

function colonnadeColumns(): ColumnSpot[] {
  const out: ColumnSpot[] = [];
  for (const side of [-1, 1]) {
    for (const t of colonnadeAngles()) {
      for (const dr of [-1, 1]) {
        const p = arcPoint(side * t, sc(COL.radius + dr * COL.rows));
        out.push({ x: p.x, z: p.y, h: sc(COL.height), yaw: arcYaw(side * t) });
      }
    }
  }
  return out;
}

/** One arched wall of the octagon, facing +Z before it is turned into place. */
function archPanel(): THREE.BufferGeometry {
  const hw = sc(R.apothem) * Math.tan(Math.PI / 8) + 0.02;
  const a = sc(R.archHalf), spring = sc(R.spring), top = sc(R.colH);
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(-a, 0);
  shape.lineTo(-a, spring);
  shape.absarc(0, spring, a, Math.PI, 0, true);
  shape.lineTo(a, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, top);
  shape.lineTo(-hw, top);
  shape.lineTo(-hw, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: sc(R.wall), bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, sc(R.apothem - R.wall));
  return g;
}

/** A ring of eight boxes (an octagonal band) between two heights, outer apothem `out`, depth `depth`. */
function octBand(apothemOut: number, depth: number, y0: number, y1: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const len = 2 * apothemOut * Math.tan(Math.PI / 8) + 0.01;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = apothemOut - depth / 2;
    parts.push(box(len, y1 - y0, depth, ROT.x + Math.sin(a) * r, (y0 + y1) / 2, ROT.z + Math.cos(a) * r, a));
  }
  return parts;
}

function domeProfile(rScale: number, steps: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(t) * sc(R.domeR) * rScale), Math.sin(t) * sc(R.domeH) * (rScale > 0.99 ? 1 : 0.985)));
  }
  return pts;
}

export type RotundaParts = { marble: THREE.BufferGeometry; relief: THREE.BufferGeometry; dome: THREE.BufferGeometry; gold: THREE.BufferGeometry; ceiling: THREE.BufferGeometry; oculus: THREE.Vector3 };

export function rotunda(quality: number): RotundaParts {
  const marble: THREE.BufferGeometry[] = [];
  const panel = archPanel();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    marble.push(panel.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(a).setPosition(ROT.x, 0, ROT.z)));
  }
  // Base moulding round the piers, the entablature over the columns, its cornice, then the drum and its cap.
  const hw = sc(R.apothem) * Math.tan(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const u = side * (sc(R.archHalf) + (hw - sc(R.archHalf)) / 2);
      const d = sc(R.apothem - R.wall / 2);
      const o = turn(a, u, d);
      marble.push(box(hw - sc(R.archHalf) + 0.02, sc(0.9), sc(R.wall + 0.5), ROT.x + o.x, sc(0.45), ROT.z + o.y, a));
    }
  }
  marble.push(...octBand(sc(R.apothem + 1.7), sc(R.wall + 1.7), sc(R.colH), sc(R.entTop)));
  marble.push(...octBand(sc(R.apothem + 2.15), sc(R.wall + 2.15), sc(R.entTop), sc(R.cornice)));
  marble.push(...octBand(sc(R.drumApothem), sc(1.8), sc(R.cornice), sc(R.drumTop)));
  marble.push(...octBand(sc(R.drumApothem + 0.5), sc(2.3), sc(R.drumTop - 0.7), sc(R.drumTop)));
  // Relief panels on the drum (the real one carries Zimm's frieze): a warmer, rougher stone set into each face.
  const relief: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const w = 2 * sc(R.drumApothem) * Math.tan(Math.PI / 8) * 0.74;
    const r = sc(R.drumApothem) + 0.02;
    relief.push(box(w, sc(4.2), 0.08, ROT.x + Math.sin(a) * r, sc(R.cornice + 0.7 + 2.1), ROT.z + Math.cos(a) * r, a));
  }
  // The frieze band under the cornice, the same warm stone.
  relief.push(...octBand(sc(R.apothem + 1.72), 0.1, sc(R.colH + 1.0), sc(R.entTop - 0.15)));

  const domeSeg = quality >= 0.9 ? 64 : 40;
  const dome = new THREE.LatheGeometry(domeProfile(1, 28), domeSeg).translate(ROT.x, sc(R.drumTop), ROT.z);
  const ceiling = new THREE.LatheGeometry(domeProfile(0.975, 28), domeSeg).translate(ROT.x, sc(R.drumTop) - 0.05, ROT.z);

  // Gold: a ring at the dome's foot, eight ribs up its meridians, a hairline on the cornice, a small finial.
  const gold: THREE.BufferGeometry[] = [];
  gold.push(new THREE.TorusGeometry(sc(R.domeR) * 1.005, 0.07, 8, domeSeg).rotateX(Math.PI / 2).translate(ROT.x, sc(R.drumTop) + 0.05, ROT.z));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const pts = domeProfile(1.004, 20).map((p) => new THREE.Vector3(ROT.x + Math.sin(a) * p.x, sc(R.drumTop) + p.y, ROT.z + Math.cos(a) * p.x));
    gold.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.045, 5, false));
  }
  gold.push(...octBand(sc(R.apothem + 2.18), 0.06, sc(R.cornice) - 0.04, sc(R.cornice) + 0.02));
  gold.push(...octBand(sc(R.drumApothem + 0.53), 0.06, sc(R.drumTop) - 0.06, sc(R.drumTop)));
  const top = sc(R.drumTop + R.domeH);
  gold.push(new THREE.SphereGeometry(0.28, 16, 12).translate(ROT.x, top + 0.2, ROT.z));
  gold.push(new THREE.ConeGeometry(0.09, 1.3, 10).translate(ROT.x, top + 0.95, ROT.z));
  return { marble: merge(marble), relief: merge(relief), dome, gold: merge(gold), ceiling, oculus: new THREE.Vector3(ROT.x, top - 0.4, ROT.z) };
}

export type ColonnadeParts = { marble: THREE.BufferGeometry; relief: THREE.BufferGeometry; figures: THREE.Matrix4[] };

/** Beams over both rows, cross-beams, and every third bay a great planter box with a weeping figure at each corner. */
export function colonnade(): ColonnadeParts {
  const marble: THREE.BufferGeometry[] = [];
  const relief: THREE.BufferGeometry[] = [];
  const figures: THREE.Matrix4[] = [];
  const angles = colonnadeAngles();
  const H = sc(COL.height);
  const beam = sc(1.5);
  for (const side of [-1, 1]) {
    for (let i = 0; i < angles.length - 1; i++) {
      const t0 = side * angles[i]!, t1 = side * angles[i + 1]!, tm = (t0 + t1) / 2;
      for (const dr of [-1, 1]) {
        const r = sc(COL.radius + dr * COL.rows);
        const a = arcPoint(t0, r), b = arcPoint(t1, r);
        const len = a.distanceTo(b) + sc(1.0);
        const mid = arcPoint(tm, r);
        marble.push(box(len, beam, sc(1.5), mid.x, H + beam / 2, mid.y, arcYaw(tm)));
        marble.push(box(len + 0.05, sc(0.45), sc(1.9), mid.x, H + beam + sc(0.22), mid.y, arcYaw(tm)));
      }
    }
    // Cross-beams joining the rows at each column pair, and the planter boxes.
    angles.forEach((t, i) => {
      const th = side * t;
      const mid = arcPoint(th, sc(COL.radius));
      marble.push(box(sc(1.1), beam * 0.8, sc(2 * COL.rows + 1.2), mid.x, H + beam * 0.4, mid.y, arcYaw(th)));
      if (i % COL.boxEvery === 1 && i < angles.length - 1) {
        const tb = side * (t + (angles[i + 1]! - t) / 2);
        const c = arcPoint(tb, sc(COL.radius));
        const bw = sc(6.2), bd = sc(2 * COL.rows + 3.0), bh = sc(4.4);
        const y0 = H + beam + sc(0.45);
        const yb = arcYaw(tb);
        marble.push(box(bw, bh, bd, c.x, y0 + bh / 2, c.y, yb));
        marble.push(box(bw + sc(0.7), sc(0.5), bd + sc(0.7), c.x, y0 + bh + sc(0.25), c.y, yb));
        marble.push(box(bw + sc(0.5), sc(0.4), bd + sc(0.5), c.x, y0 + sc(0.2), c.y, yb));
        relief.push(box(bw * 0.72, bh * 0.5, bd + 0.06, c.x, y0 + bh * 0.52, c.y, yb));
        // The weeping women: one at each corner, facing into the box, head bowed against it.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const o = turn(yb, sx * (bw / 2 + sc(0.55)), sz * (bd / 2 + sc(0.55)));
          const wx = c.x + o.x, wz = c.y + o.y;
          const face = Math.atan2(c.x - wx, c.y - wz);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(wx, y0, wz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, face, 0, 'YXZ')), new THREE.Vector3(1, 1, 1).multiplyScalar(sc(1)));
          figures.push(m);
        }
      }
    });
  }
  return { marble: merge(marble), relief: merge(relief), figures };
}

/** A draped figure, about 3 m tall in the real palace: a long robe, bowed shoulders, a head leaning forward. */
export function figureGeometry(): THREE.BufferGeometry {
  const robe = new THREE.LatheGeometry([
    [0.0, 0], [0.62, 0], [0.6, 0.12], [0.5, 0.9], [0.42, 1.7], [0.36, 2.2], [0.44, 2.45], [0.36, 2.62], [0.16, 2.72], [0.0, 2.74],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const head = new THREE.SphereGeometry(0.26, 14, 10).scale(1, 1.15, 1).translate(0, 2.92, 0.12);
  const arms = new THREE.CapsuleGeometry(0.17, 0.9, 4, 8).rotateX(-1.1).translate(0, 2.35, 0.38);
  return merge([robe, head, arms]);
}

/** The ground: a wide terrace of pale stone with the lagoon cut from it, the basin's rim and its inner wall. */
export function terrace(): { floor: THREE.BufferGeometry; rim: THREE.BufferGeometry; water: THREE.BufferGeometry } {
  const N = 96;
  const outline = Array.from({ length: N }, (_, i) => lagoonPoint((i / N) * Math.PI * 2));
  const outer = new THREE.Shape();
  outer.absarc(0, -12, 150, 0, Math.PI * 2, false);
  const hole = new THREE.Path(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  hole.closePath();
  outer.holes.push(hole);
  const floor = new THREE.ShapeGeometry(outer, 48).rotateX(-Math.PI / 2);

  // Rim: a low curb round the basin, and the inner wall down into the water.
  const curb = new THREE.Shape(Array.from({ length: N }, (_, i) => { const p = lagoonPoint((i / N) * Math.PI * 2, 0.55); return new THREE.Vector2(p.x, -p.y); }));
  curb.holes.push(hole);
  const rimTop = new THREE.ExtrudeGeometry(curb, { depth: 0.09, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
  const wallPos: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = outline[i]!, b = outline[(i + 1) % N]!;
    const y0 = WATER_Y - 0.4, y1 = 0.0;
    wallPos.push(a.x, y1, a.y, b.x, y1, b.y, a.x, y0, a.y, b.x, y1, b.y, b.x, y0, b.y, a.x, y0, a.y);
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wall.computeVertexNormals();
  // The wall's faces must look into the basin; flip them if the outline ran the other way.
  const n0 = new THREE.Vector3().fromBufferAttribute(wall.getAttribute('normal') as THREE.BufferAttribute, 0);
  const a0 = outline[0]!;
  if (n0.x * (LAGOON.cx - a0.x) + n0.z * (LAGOON.cz - a0.y) < 0) {
    const p = wall.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
    wall.computeVertexNormals();
  }
  const water = new THREE.ShapeGeometry(new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y))), 4).rotateX(-Math.PI / 2).translate(0, WATER_Y, 0);
  return { floor, rim: merge([rimTop, wall]), water };
}
