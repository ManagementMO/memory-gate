// Outdoors in porcelain: trees with soft cloud crowns (never faceted cones), a pine of drooping skirts, a palm with
// arching fronds, flower beds, a park bench with iron ends, a picket fence, a swing, a street lamp that glows, a beach
// umbrella, a checked picnic blanket, a rowboat, a dock, boulders, a campfire, a tent, a rounded old car, a bicycle,
// and a cottage with lit windows for the horizon.
import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { geo, type Builder } from '../style';
import { TINT, at, capsuleLo, ellipsoid, glow, kit, leaf, leafCard, leafCards, merge, rbox, says, stone, taperedTube, torusLo, twoSided } from './kit';

export const tree: Builder = (o) => {
  const k = kit(o);
  const blossom = says(o, 'cherry', 'blossom', 'magnolia', 'dogwood');
  const leafA = twoSided(k.main(blossom ? '#efbfca' : TINT.leaf, 'plant'));
  const leafB = twoSided(k.m(blossom ? '#f6dde3' : '#bdd3ad', 'plant'));
  const inner = k.m(blossom ? '#d9a3b0' : '#7f9f7c', 'plant');
  const bark = k.m('#a28c7c', 'wood');
  const lean = (k.r() - 0.5) * 0.3;
  // A broad, irregular crown (wider than tall, starting low) of merging clumps: drooping at the edges, fuller on top.
  const cy = 2.7;
  const clumps: [number, number, number, number][] = [[lean, cy, 0, 0.82]];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + k.r() * 0.45;
    const rr = k.between(0.72, 1.18);
    clumps.push([lean + Math.cos(a) * rr, cy + k.between(-0.5, 0.35) - (rr - 0.72) * 0.45, Math.sin(a) * rr * 0.92, k.between(0.44, 0.64)]);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + k.r();
    const rr = k.between(0.18, 0.55);
    clumps.push([lean + Math.cos(a) * rr, cy + k.between(0.55, 0.85), Math.sin(a) * rr, k.between(0.42, 0.56)]);
  }
  k.add(merge([
    taperedTube([[0, 0, 0], [lean * 0.2, 0.8, 0.02], [lean * 0.55, 1.55, -0.02], [lean * 0.85, 2.15, 0]], 0.18, 0.1, 12, 14),
    geo.lathe([[0.0001, 0], [0.3, 0], [0.22, 0.05], [0.17, 0.24], [0.0001, 0.24]], 24),
    ...clumps.slice(1, 8).map(([x, y, z], i) => taperedTube([[lean * 0.6, 1.45 + (i % 4) * 0.14, 0], [(lean + x) * 0.5, (1.8 + y) * 0.5, z * 0.5], [x * 0.88, y - 0.2, z * 0.88]], 0.08, 0.03, 6, 10)),
  ]), bark);
  k.add(merge(clumps.map(([x, y, z, r]) => at(ellipsoid(r * 0.8, r * 0.66, r * 0.8, 16, 10), x, y - r * 0.05, z))), inner);
  const cards = (count: number) => leafCards(k.r, clumps, count, [0.13, 0.2], 0.82);
  k.add(cards(130), leafA);
  k.add(cards(60), leafB);
  if (says(o, 'lemon', 'orange', 'apple', 'fruit', 'peach')) {
    const c = says(o, 'lemon') ? '#e9d06a' : says(o, 'orange', 'peach') ? '#e8a04c' : '#cf5c4a';
    k.add(merge(Array.from({ length: 14 }, (_, i) => { const [x, y, z, r] = clumps[i % clumps.length]!; const a = k.r() * 6.28; return at(geo.sphere(0.055, 14, 10), x + Math.cos(a) * r * 0.85, y - r * 0.25, z + Math.sin(a) * r * 0.85); })), k.m(c, 'plant'));
  }
  return k.done();
};

export const pine_tree: Builder = (o) => {
  const k = kit(o);
  const green = k.main(TINT.deepLeaf, 'plant');
  const needles = twoSided(k.m('#9cbf9f', 'plant'));
  const bark = k.m(TINT.bark, 'wood');
  k.add(taperedTube([[0, 0, 0], [0, 1.2, 0], [0, 2.6, 0]], 0.14, 0.07, 6, 12), bark);
  const tiers: THREE.BufferGeometry[] = [];
  const fringe: THREE.BufferGeometry[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = THREE.MathUtils.lerp(1.0, 0.2, Math.pow(t, 0.9)) * (0.94 + k.r() * 0.12);
    const ht = THREE.MathUtils.lerp(1.05, 0.55, t);
    const top = 1.05 + t * 3.55 + ht * 0.62;
    // overlapping drooping skirts: concave above, a soft turned-under lip, so the silhouette is one continuous cone
    tiers.push(at(geo.lathe([[0.0001, -ht * 0.8], [r * 0.45, -ht * 0.9], [r * 0.9, -ht * 1.05], [r, -ht], [r * 0.86, -ht * 0.86], [r * 0.55, -ht * 0.52], [r * 0.2, -ht * 0.14], [0.0001, 0]], 44), 0, top, 0, 0, k.r() * 6, 0));
    // a feathery fringe of needle tufts along the lip
    const count = Math.round(14 + r * 22);
    for (let j = 0; j < count; j++) {
      const a = (j / count) * Math.PI * 2 + k.r() * 0.2;
      const lip = top - ht * (0.98 + k.r() * 0.06);
      const dir = new THREE.Vector3(Math.cos(a), -0.55 - k.r() * 0.2, Math.sin(a)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, k.r() * Math.PI));
      fringe.push(leafCard(0.06, k.between(0.16, 0.24)).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r * 0.96, lip, Math.sin(a) * r * 0.96), q, new THREE.Vector3(1, 1, 1))));
    }
  }
  tiers.push(geo.lathe([[0.0001, 4.66], [0.06, 4.78], [0.0001, 5.05]], 20));
  k.add(merge(tiers), green);
  k.add(merge(fringe), needles);
  if (says(o, 'christmas', 'xmas', 'lights', 'holiday', 'ornament')) {
    // A remembered Christmas tree: a spiral of small warm lights wound down the tiers, a few glass baubles, a star.
    const lights: THREE.BufferGeometry[] = [];
    const turns = 4.2, count = 70;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 4.55 - t * 3.3;
      const r = THREE.MathUtils.lerp(0.26, 1.02, t) * 0.97;
      const a = t * turns * Math.PI * 2;
      lights.push(at(geo.sphere(0.034, 10, 8), Math.cos(a) * r, y, Math.sin(a) * r));
    }
    k.add(merge(lights), glow(k.m('#fff1c9', 'light'), '#ffd98a', 1.6));
    const baubles: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const t = 0.15 + k.r() * 0.8;
      const a = k.r() * Math.PI * 2;
      const r = THREE.MathUtils.lerp(0.3, 0.98, t) * 0.92;
      baubles.push(at(geo.sphere(0.07, 16, 12), Math.cos(a) * r, 4.4 - t * 3.1, Math.sin(a) * r));
    }
    k.add(merge(baubles), k.m('#c8565a', 'glass'));
    k.add(at(geo.sphere(0.13, 16, 12), 0, 5.12, 0), glow(k.m('#ffe7a8', 'light'), '#ffd27a', 1.4));
  }
  return k.done();
};

export const palm_tree: Builder = (o) => {
  const k = kit(o);
  const trunk = k.m('#b49a7c', 'wood');
  const fronds = twoSided(k.main('#7fae78', 'plant'));
  const bend = 0.5 + k.r() * 0.3;
  const spine: [number, number, number][] = [[0, 0, 0], [bend * 0.15, 1.2, 0], [bend * 0.45, 2.4, 0], [bend * 0.85, 3.5, 0], [bend * 1.1, 4.2, 0]];
  const curve = new THREE.CatmullRomCurve3(spine.map((p) => new THREE.Vector3(...p)));
  k.add(merge([
    taperedTube(spine, 0.16, 0.11, 14, 14),
    ...Array.from({ length: 16 }, (_, i) => { const p = curve.getPoint(0.06 + i * 0.058); return at(torusLo(0.15 - i * 0.0025, 0.016, 6, 24), p.x, p.y, p.z, Math.PI / 2, 0, 0); }),
  ]), trunk);
  const top = curve.getPoint(1);
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + k.r() * 0.3;
    blades.push(leaf([top.x, top.y + 0.05, top.z], [Math.cos(a), 0.45 + k.r() * 0.25, Math.sin(a)], k.between(1.3, 1.6), k.between(0.2, 0.26), 0.85, 0.25));
  }
  k.add(merge(blades), fronds);
  k.add(merge([0, 1, 2].map((i) => { const a = i * 2.1; return at(geo.sphere(0.085, 16, 12), top.x + Math.cos(a) * 0.12, top.y - 0.1, top.z + Math.sin(a) * 0.12); })), k.m('#8a6a52', 'wood'));
  return k.done();
};

export const bush: Builder = (o) => {
  const k = kit(o);
  const flowering = says(o, 'hydrangea', 'rose', 'lilac', 'azalea', 'flower');
  const clumps: [number, number, number, number][] = [[0, 0.5, 0, 0.36]];
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + k.r() * 0.6; clumps.push([Math.cos(a) * 0.3, k.between(0.32, 0.5), Math.sin(a) * 0.22, k.between(0.24, 0.32)]); }
  k.add(merge(clumps.map(([x, y, z, r]) => at(ellipsoid(r * 0.82, r * 0.7, r * 0.82, 14, 10), x, y, z))), k.m('#7f9f7c', 'plant'));
  k.add(leafCards(k.r, clumps, 130, [0.075, 0.12], 0.8), twoSided(k.main(TINT.leaf, 'plant')));
  k.add(leafCards(k.r, clumps, 55, [0.075, 0.12], 0.8), twoSided(k.m('#bdd3ad', 'plant')));
  if (flowering) {
    const c = o.color || (says(o, 'hydrangea') ? '#a9b8e6' : says(o, 'lilac') ? '#c8a8d8' : TINT.rose);
    k.add(merge(Array.from({ length: 12 }, (_, i) => { const [x, y, z, r] = clumps[i % clumps.length]!; const a = k.r() * 6.28; return at(geo.sphere(k.between(0.045, 0.065), 14, 10), x + Math.cos(a) * r * 0.8, y + r * 0.45, z + Math.sin(a) * r * 0.8); })), k.m(c, 'plant'));
  }
  return k.done();
};

export const flowers: Builder = (o) => {
  const k = kit(o);
  const soil = k.m('#a89384', 'stone');
  const green = twoSided(k.m(TINT.leaf, 'plant'));
  const sunflower = says(o, 'sunflower');
  const lavender = says(o, 'lavender');
  const primary = o.color || (sunflower ? '#e9c547' : lavender ? '#a993d1' : TINT.rose);
  k.add(ellipsoid(0.72, 0.07, 0.42, 36, 14), soil, 0, 0.0, 0);
  const tufts: [number, number, number, number][] = Array.from({ length: 9 }, () => { const x = k.between(-0.55, 0.55); return [x, 0.08, k.between(-0.26, 0.26) * Math.sqrt(1 - (x / 0.7) ** 2), 0.12] as [number, number, number, number]; });
  k.add(leafCards(k.r, tufts, 22, [0.05, 0.12], 0.7), green);
  const stems: THREE.BufferGeometry[] = [], a: THREE.BufferGeometry[] = [], b: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const x = k.between(-0.62, 0.62), z = k.between(-0.32, 0.32) * Math.sqrt(1 - (x / 0.7) ** 2), h = k.between(0.26, 0.44) * (sunflower ? 1.6 : 1);
    stems.push(at(geo.cylinder(0.004, 0.005, h, 6), x, h / 2, z, k.between(-0.1, 0.1), 0, k.between(-0.1, 0.1)));
    const s = sunflower ? 0.06 : 0.032;
    const head = lavender ? at(geo.capsule(0.012, 0.07), x, h + 0.03, z) : merge([at(ellipsoid(s, s * 0.45, s, 14, 8), x, h, z), at(geo.sphere(s * 0.38, 10, 8), x, h + s * 0.25, z)]);
    (i % 4 === 3 && !sunflower ? b : a).push(head);
  }
  k.add(merge(stems), green);
  k.add(merge(a), k.m(primary, 'plant'));
  if (b.length) k.add(merge(b), k.m('#f3ece2', 'plant'));
  return k.done();
};

export const bench: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.oak, 'wood');
  const iron = k.m(TINT.iron, 'metal');
  k.add(merge([
    ...[-0.17, -0.085, 0, 0.085, 0.17].map((z) => at(rbox(1.5, 0.03, 0.075, 0.01), 0, 0.455, z)),
    ...[0.6, 0.71, 0.82].map((y, i) => at(rbox(1.5, 0.08, 0.025, 0.01), 0, y, -0.24 - i * 0.025, -0.22, 0, 0)),
  ]), wood);
  k.add(merge([0.64, -0.64].flatMap((x) => [
    taperedTube([[x, 0, 0.21], [x, 0.22, 0.21], [x, 0.44, 0.2]], 0.024, 0.022, 4, 10),
    taperedTube([[x, 0, -0.2], [x, 0.44, -0.21], [x, 0.66, -0.26], [x, 0.9, -0.31]], 0.024, 0.02, 8, 10),
    taperedTube([[x, 0.62, -0.25], [x, 0.66, -0.05], [x, 0.66, 0.15], [x, 0.6, 0.24], [x, 0.5, 0.22]], 0.02, 0.018, 8, 10),
    at(geo.cylinder(0.014, 0.014, 0.42, 10), x, 0.42, 0, Math.PI / 2, 0, 0),
  ])), iron);
  return k.done();
};

export const fence: Builder = (o) => {
  const k = kit(o);
  const paint = k.main(TINT.white, 'wood');
  const W = 3.0;
  const pickets: THREE.BufferGeometry[] = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.18 + (i * (W - 0.36)) / (n - 1);
    const h = 0.86 + Math.sin(i * 0.9) * 0.015;
    pickets.push(at(rbox(0.075, h, 0.022, 0.012), x, h / 2, 0.02), at(ellipsoid(0.038, 0.06, 0.011, 16, 10), x, h, 0.02));
  }
  k.add(merge([
    ...pickets,
    at(rbox(W, 0.07, 0.03, 0.012), 0, 0.25, -0.012), at(rbox(W, 0.07, 0.03, 0.012), 0, 0.68, -0.012),
    ...[W / 2, -W / 2].flatMap((x) => [at(rbox(0.09, 1.0, 0.09, 0.015), x, 0.5, 0), at(geo.sphere(0.055, 18, 12), x, 1.04, 0)]),
  ]), paint);
  return k.done();
};

export const swing: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.oak, 'wood');
  const rope = k.m('#e3d6bd', 'fabric');
  k.add(merge([
    at(geo.cylinder(0.045, 0.045, 1.98, 20), 0, 2.15, 0, 0, 0, Math.PI / 2),
    ...[0.92, -0.92].flatMap((x) => [taperedTube([[x, 2.15, 0], [x * 1.02, 0, 0.55]], 0.04, 0.045, 3, 12), taperedTube([[x, 2.15, 0], [x * 1.02, 0, -0.55]], 0.04, 0.045, 3, 12)]),
    at(rbox(0.52, 0.035, 0.2, 0.012), 0, 0.5, 0),
  ]), wood);
  k.add(merge([0.22, -0.22].map((x) => at(geo.cylinder(0.009, 0.009, 1.64, 8), x, 1.33, 0))), rope);
  return k.done();
};

export const lamp_post: Builder = (o) => {
  const k = kit(o);
  const iron = k.main(TINT.iron, 'metal');
  const lantern = glow(twoSided(k.m('#fff1d6', 'light')), '#ffd79c', 1.2);
  k.add(merge([
    geo.lathe([[0.0001, 0], [0.16, 0], [0.15, 0.08], [0.09, 0.16], [0.07, 0.42], [0.0001, 0.42]], 32),
    at(geo.cylinder(0.035, 0.045, 2.2, 18), 0, 1.52, 0),
    at(geo.torus(0.05, 0.012), 0, 2.6, 0, Math.PI / 2, 0, 0),
    geo.lathe([[0.0001, 3.0], [0.07, 2.96], [0.17, 2.88], [0.16, 2.86], [0.06, 2.9], [0.0001, 2.9]], 32),
    at(geo.sphere(0.03, 14, 10), 0, 3.03, 0),
  ]), iron);
  k.add(geo.lathe([[0.0001, 2.6], [0.06, 2.62], [0.12, 2.74], [0.13, 2.85], [0.0001, 2.86]], 32), lantern);
  return k.done();
};

export const umbrella: Builder = (o) => {
  const k = kit(o);
  const a = k.main('#e8846b', 'fabric');
  const b = k.m(TINT.white, 'fabric');
  twoSided(a); twoSided(b);
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.1;
  k.g.add(tilt);
  const prof = [[0.0001, 2.18], [0.25, 2.16], [0.6, 2.06], [0.92, 1.9], [1.0, 1.84]].map(([x, y]) => new THREE.Vector2(x, y));
  const A: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) (i % 2 ? B : A).push(new THREE.LatheGeometry(prof, 10, (i / 8) * Math.PI * 2, Math.PI / 4));
  k.add(merge(A), a, 0, 0, 0, 0, 0, 0, tilt);
  k.add(merge(B), b, 0, 0, 0, 0, 0, 0, tilt);
  k.add(merge([at(geo.cylinder(0.018, 0.022, 2.2, 12), 0, 1.1, 0), at(geo.sphere(0.035, 14, 10), 0, 2.2, 0)]), k.m(TINT.white, 'wood'), 0, 0, 0, 0, 0, 0, tilt);
  return k.done();
};

export const picnic_blanket: Builder = (o) => {
  const k = kit(o);
  const red = k.main('#c0504d', 'fabric');
  const white = k.m(TINT.white, 'fabric');
  const A: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [];
  const cols = 8, rows = 6, cw = 1.6 / cols, cd = 1.3 / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -0.8 + cw * (i + 0.5), z = -0.65 + cd * (j + 0.5);
    const y = 0.006 + 0.008 * Math.sin(i * 1.3 + j * 0.7) ** 2;
    ((i + j) % 2 ? A : B).push(at(rbox(cw + 0.002, 0.008, cd + 0.002, 0.003, 1), x, y, z, 0.03 * Math.sin(j * 1.7), 0, 0.03 * Math.sin(i * 1.1)));
  }
  k.add(merge(A), red);
  k.add(merge(B), white);
  // a wicker basket waiting on the corner
  const wicker = k.m('#c8a77c', 'wood');
  k.add(merge([at(geo.box(0.38, 0.2, 0.26, 0.03), 0.5, 0.11, -0.38), at(geo.box(0.4, 0.035, 0.28, 0.015), 0.5, 0.225, -0.38), at(geo.torus(0.13, 0.012, Math.PI), 0.5, 0.24, -0.38)]), wicker);
  return k.done();
};

export const boat: Builder = (o) => {
  const k = kit(o);
  const hull = twoSided(k.main('#e9e2d4', 'wood'));
  const trim = k.m('#6d93ad', 'wood');
  const L = 3.5, B = 0.62;
  const half = (u: number) => B * Math.pow(Math.sin(Math.PI * u), u < 0.5 ? 0.42 : 0.72);
  const depth = (u: number) => 0.42 * (0.55 + 0.45 * Math.sin(Math.PI * u));
  const sheer = (u: number) => 0.42 + 0.14 * Math.pow(2 * u - 1, 2);
  k.add(new ParametricGeometry((u, v, t) => {
    const th = Math.PI * v;
    t.set(-Math.cos(th) * half(u), sheer(u) - Math.sin(th) * depth(u), (u - 0.5) * L);
  }, 40, 16), hull);
  const rail = (side: number) => Array.from({ length: 18 }, (_, i) => { const u = 0.02 + (i / 17) * 0.96; return [side * half(u), sheer(u) + 0.01, (u - 0.5) * L] as [number, number, number]; });
  k.add(merge([geo.tube(rail(1), 0.03), geo.tube(rail(-1), 0.03), ...[-0.55, 0.45].map((z) => at(rbox(half(0.5 + z / L) * 1.9, 0.035, 0.2, 0.01), 0, 0.36, z))]), trim);
  // two oars resting inside
  k.add(merge([0.12, -0.12].flatMap((x) => [at(geo.cylinder(0.016, 0.016, 2.2, 10), x, 0.42, 0, Math.PI / 2 - 0.05, 0, x * 0.4), at(ellipsoid(0.06, 0.012, 0.22, 16, 8), x + x * 0.4 * 1.1, 0.47, 1.05)])), k.m(TINT.pine, 'wood'));
  return k.done();
};

export const dock: Builder = (o) => {
  const k = kit(o);
  const wood = k.main('#c9b9a4', 'wood');
  const planks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 22; i++) planks.push(at(rbox(1.6, 0.04, 0.2, 0.012), 0, 0.42 + (k.r() - 0.5) * 0.01, -2.4 + i * 0.228, 0, (k.r() - 0.5) * 0.02, 0));
  k.add(merge([
    ...planks,
    at(rbox(0.1, 0.12, 5.0, 0.02), 0.6, 0.34, 0), at(rbox(0.1, 0.12, 5.0, 0.02), -0.6, 0.34, 0),
    ...[-2.3, 0, 2.3].flatMap((z) => [at(geo.cylinder(0.075, 0.08, 1.3, 16), 0.76, -0.1, z), at(geo.cylinder(0.075, 0.08, 1.3, 16), -0.76, -0.1, z)]),
  ]), wood);
  return k.done();
};

export const rock: Builder = (o) => {
  const k = kit(o);
  const grey = k.main('#8f8a83', 'stone');
  k.add(merge([at(stone(k.r, 0.5, 0.36, 0.42), 0, 0.22, 0), at(stone(k.r, 0.24, 0.18, 0.22), 0.45, 0.1, 0.2), at(stone(k.r, 0.14, 0.1, 0.13), -0.42, 0.06, 0.25)]), grey);
  return k.done();
};

export const campfire: Builder = (o) => {
  const k = kit(o);
  const flame = glow(k.m('#ffbf6a', 'light'), '#ffa95a', 1.35);
  k.add(merge(Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return at(stone(k.r, 0.1, 0.08, 0.09, 2), Math.cos(a) * 0.38, 0.05, Math.sin(a) * 0.38); })), k.m('#8f8a83', 'stone'));
  k.add(merge([0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2 + 0.4; return at(geo.capsule(0.045, 0.42), Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13, -Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55); })), k.m('#6f5d50', 'wood'));
  const tongue = (h: number, r: number) => geo.lathe([[0.0001, 0], [r * 0.8, h * 0.08], [r, h * 0.28], [r * 0.7, h * 0.6], [r * 0.25, h * 0.88], [0.0001, h]], 20);
  k.add(merge([at(tongue(0.46, 0.11), 0, 0.06, 0), at(tongue(0.3, 0.07), 0.1, 0.06, 0.04, 0, 0, -0.2), at(tongue(0.28, 0.07), -0.08, 0.06, -0.05, 0, 0, 0.2), at(geo.cylinder(0.2, 0.22, 0.02, 24), 0, 0.03, 0)]), flame);
  return k.done();
};

export const tent: Builder = (o) => {
  const k = kit(o);
  const canvas = twoSided(k.main('#e9dcc2', 'fabric'));
  const pole = k.m(TINT.bark, 'wood');
  const half = 1.0, H = 1.45, D = 2.3;
  const slope = Math.atan2(half, H);
  const len = Math.hypot(half, H);
  k.add(merge([
    at(rbox(0.025, len, D, 0.01), -half / 2, H / 2, 0, 0, 0, -slope), at(rbox(0.025, len, D, 0.01), half / 2, H / 2, 0, 0, 0, slope),
  ]), canvas);
  const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, H)]);
  const end = new THREE.ExtrudeGeometry(tri, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  // two door flaps folded open; the right one is built from mirrored points (not a negative scale, which would
  // flip its faces and light it from behind)
  const flapR = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(half * 0.95, 0), new THREE.Vector2(0, H * 0.95)]), { depth: 0.015, bevelEnabled: false });
  const flapL = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, H * 0.95), new THREE.Vector2(-half * 0.95, 0)]), { depth: 0.015, bevelEnabled: false });
  k.add(end, canvas, 0, 0, -D / 2);
  k.add(flapR, canvas, 0.04, 0, D / 2, 0, -0.95, 0);
  k.add(flapL, canvas, -0.04, 0, D / 2, 0, 0.95, 0);
  k.add(merge([at(geo.cylinder(0.02, 0.02, D + 0.3, 10), 0, H + 0.01, 0, Math.PI / 2, 0, 0), at(geo.cylinder(0.02, 0.02, H + 0.15, 10), 0, (H + 0.15) / 2, D / 2 + 0.12)]), pole);
  return k.done();
};

export const car: Builder = (o) => {
  const k = kit(o);
  const paint = k.main('#a9cdc6', 'metal');
  const chrome = k.m('#dfe3e8', 'metal');
  const tyre = k.m('#3e3d42', 'plastic');
  const glass = k.m('#c9dbe6', 'glass');
  const lamp = glow(k.m('#fff3dc', 'light'), '#fff0d0', 1.0);
  k.add(geo.box(1.7, 0.5, 4.15, 0.22), paint, 0, 0.6, 0);
  k.add(merge([[0.78, 1.32], [-0.78, 1.32], [0.78, -1.3], [-0.78, -1.3]].map(([x, z]) => at(ellipsoid(0.2, 0.32, 0.62, 22, 12), x!, 0.62, z!))), paint);
  k.add(geo.box(1.46, 0.5, 2.0, 0.22), paint, 0, 1.06, -0.25);
  k.add(merge([
    at(rbox(1.3, 0.34, 0.03, 0.06), 0, 1.07, 0.76, -0.45, 0, 0), at(rbox(1.3, 0.3, 0.03, 0.06), 0, 1.07, -1.26, 0.5, 0, 0),
    ...[0.735, -0.735].flatMap((x) => [at(rbox(0.02, 0.3, 0.75, 0.06), x, 1.08, 0.14), at(rbox(0.02, 0.3, 0.68, 0.06), x, 1.08, -0.68)]),
  ]), glass);
  const wheels: THREE.BufferGeometry[] = [], hubs: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[0.8, 1.32], [-0.8, 1.32], [0.8, -1.3], [-0.8, -1.3]] as const) {
    wheels.push(at(torusLo(0.24, 0.1, 12, 36), x, 0.34, z, 0, Math.PI / 2, 0));
    hubs.push(at(geo.cylinder(0.15, 0.15, 0.2, 28), x, 0.34, z, 0, 0, Math.PI / 2));
  }
  k.add(merge(wheels), tyre);
  k.add(merge([...hubs, at(capsuleLo(0.07, 1.62), 0, 0.42, 2.12, 0, 0, Math.PI / 2), at(capsuleLo(0.07, 1.62), 0, 0.42, -2.1, 0, 0, Math.PI / 2), at(rbox(0.6, 0.18, 0.04, 0.03), 0, 0.68, 2.07)]), chrome);
  k.add(merge([0.55, -0.55].map((x) => at(geo.sphere(0.1, 20, 14), x, 0.72, 2.0))), lamp);
  return k.done();
};

export const bicycle: Builder = (o) => {
  const k = kit(o);
  const frame = k.main('#a6d3c8', 'metal');
  const dark = k.m('#3e3d42', 'plastic');
  const steel = k.m('#d0d4da', 'metal');
  const R = 0.33, rz = 0.53, hy = 0.35;
  k.add(merge([rz, -rz].map((z) => at(geo.torus(R, 0.018), 0, hy, z, 0, Math.PI / 2, 0))), dark);
  k.add(merge([
    ...[rz, -rz].flatMap((z) => Array.from({ length: 8 }, (_, i) => at(geo.cylinder(0.002, 0.002, R * 2 - 0.03, 4), 0, hy, z, (i / 8) * Math.PI, 0, 0))),
    ...[rz, -rz].map((z) => at(geo.cylinder(0.022, 0.022, 0.08, 14), 0, hy, z, 0, 0, Math.PI / 2)),
    geo.tube([[-0.2, 0.98, 0.4], [-0.12, 0.99, 0.43], [0.12, 0.99, 0.43], [0.2, 0.98, 0.4]], 0.012),
  ]), steel);
  k.add(merge([
    geo.tube([[0, hy, -rz], [0, 0.3, 0], [0, 0.78, 0.4]], 0.02), geo.tube([[0, 0.3, 0], [0, 0.82, -0.12]], 0.02),
    geo.tube([[0, 0.8, -0.1], [0, 0.79, 0.4]], 0.018), geo.tube([[0, 0.8, -0.1], [0, hy, -rz]], 0.014),
    geo.tube([[0, 0.97, 0.42], [0, 0.66, 0.47], [0, hy, rz]], 0.017),
  ]), frame);
  k.add(merge([at(ellipsoid(0.07, 0.03, 0.13, 20, 10), 0, 0.9, -0.14), at(geo.cylinder(0.05, 0.05, 0.03, 20), 0, 0.3, 0, 0, 0, Math.PI / 2), at(geo.capsule(0.02, 0.05), 0.18, 0.99, 0.41, 0, 0, Math.PI / 2), at(geo.capsule(0.02, 0.05), -0.18, 0.99, 0.41, 0, 0, Math.PI / 2)]), dark);
  return k.done();
};

export const house: Builder = (o) => {
  const k = kit(o);
  const walls = k.main('#efe6d6', 'stone');
  const roof = k.m('#a5b1c1', 'stone');
  const trim = k.m(TINT.white, 'wood');
  const door = k.m('#9db5a6', 'wood');
  const lit = glow(k.m('#ffeccc', 'light'), '#ffd9a0', 1.1);
  const W = 6.0, D = 5.0, H = 3.0, pitch = 0.62;
  k.add(geo.box(W, H, D, 0.08), walls, 0, H / 2, 0);
  const rise = (D / 2) * Math.tan(pitch);
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise)]);
  const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: W - 0.02, bevelEnabled: false });
  k.add(gableGeo, walls, -(W - 0.02) / 2, H, 0, 0, Math.PI / 2, 0);
  const slabLen = (D / 2 + 0.4) / Math.cos(pitch);
  k.add(merge([1, -1].map((s) => at(geo.box(W + 0.5, 0.14, slabLen, 0.04), 0, H + rise / 2 + 0.08 - 0.08, s * (D / 4 + 0.1), s * pitch, 0, 0))), roof);
  k.add(geo.box(0.55, 1.6, 0.55, 0.04), k.m('#d3b2a0', 'stone'), 1.7, H + rise * 0.55, -0.5);
  k.add(merge([at(rbox(0.95, 2.0, 0.1, 0.02), 0, 1.0, D / 2 + 0.03), at(geo.sphere(0.04, 12, 8), 0.32, 1.0, D / 2 + 0.1)]), door);
  const frames: THREE.BufferGeometry[] = [], panes: THREE.BufferGeometry[] = [];
  for (const x of [-1.85, 1.85]) {
    panes.push(at(rbox(1.0, 1.1, 0.04, 0.02), x, 1.6, D / 2 + 0.01));
    frames.push(at(rbox(1.12, 0.07, 0.1, 0.02), x, 2.18, D / 2 + 0.04), at(rbox(1.12, 0.07, 0.14, 0.02), x, 1.02, D / 2 + 0.06),
      at(rbox(0.06, 1.16, 0.08, 0.02), x - 0.53, 1.6, D / 2 + 0.04), at(rbox(0.06, 1.16, 0.08, 0.02), x + 0.53, 1.6, D / 2 + 0.04),
      at(rbox(0.04, 1.1, 0.06, 0.01), x, 1.6, D / 2 + 0.045), at(rbox(1.0, 0.04, 0.06, 0.01), x, 1.75, D / 2 + 0.045));
  }
  k.add(merge(panes), lit);
  k.add(merge([...frames, at(rbox(1.5, 0.15, 0.5, 0.03), 0, 0.075, D / 2 + 0.3), at(rbox(1.2, 0.15, 0.3, 0.03), 0, 0.2, D / 2 + 0.2)]), trim);
  return k.done();
};
