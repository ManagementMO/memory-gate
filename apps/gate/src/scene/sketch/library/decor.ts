// Small remembered things and the light in a room: lamps whose shades glow, a plant in a terracotta pot, flowers in a
// vase, a framed picture, a wall clock, a wireless radio, a teapot, a cup on its saucer, fruit, cake, books, a candle.
// Turned (lathe) profiles throughout: ceramics and brass read as made, not modelled.
import * as THREE from 'three';
import { geo, type Builder } from '../style';
import { TINT, at, capsuleLo, ellipsoid, glow, kit, leaf, merge, rbox, ring, says, taperLeg, taperedTube, torusLo, twoSided } from './kit';

export const lamp: Builder = (o) => {
  const k = kit(o);
  const base = k.main('#bcd0c4', 'ceramic');
  const brass = k.m(TINT.brass, 'metal');
  const shade = glow(twoSided(k.m('#fff0d6', 'light')), '#ffe7c2', 1.0);
  k.add(geo.lathe([[0.0001, 0], [0.065, 0], [0.072, 0.012], [0.098, 0.06], [0.108, 0.12], [0.096, 0.19], [0.06, 0.235], [0.034, 0.25], [0.0001, 0.25]], 48), base);
  k.add(merge([at(geo.cylinder(0.009, 0.009, 0.1, 14), 0, 0.3, 0), at(geo.torus(0.13, 0.004), 0, 0.3, 0, Math.PI / 2, 0, 0), at(geo.torus(0.088, 0.004), 0, 0.52, 0, Math.PI / 2, 0, 0)]), brass);
  k.add(geo.lathe([[0.135, 0.3], [0.118, 0.4], [0.092, 0.52]], 48), shade);
  return k.done();
};

export const floor_lamp: Builder = (o) => {
  const k = kit(o);
  const metal = k.main(TINT.brass, 'metal');
  const shade = glow(twoSided(k.m('#fff0d6', 'light')), '#ffe7c2', 1.0);
  k.add(merge([
    geo.lathe([[0.0001, 0], [0.16, 0], [0.165, 0.012], [0.13, 0.035], [0.03, 0.05], [0.0001, 0.05]], 48),
    at(geo.cylinder(0.012, 0.014, 1.3, 14), 0, 0.68, 0),
    at(geo.torus(0.02, 0.006), 0, 0.9, 0, Math.PI / 2, 0, 0),
    at(geo.torus(0.19, 0.005), 0, 1.33, 0, Math.PI / 2, 0, 0), at(geo.torus(0.13, 0.005), 0, 1.6, 0, Math.PI / 2, 0, 0),
    at(geo.sphere(0.02, 14, 10), 0, 1.64, 0),
  ]), metal);
  k.add(geo.lathe([[0.19, 1.33], [0.165, 1.47], [0.13, 1.6]], 48), shade);
  return k.done();
};

export const potted_plant: Builder = (o) => {
  const k = kit(o);
  const pot = k.m(TINT.terracotta, 'ceramic');
  const green = twoSided(k.main(TINT.leaf, 'plant'));
  k.add(geo.lathe([[0.0001, 0], [0.12, 0], [0.135, 0.015], [0.16, 0.27], [0.182, 0.285], [0.182, 0.32], [0.165, 0.32], [0.158, 0.3], [0.0001, 0.3]], 56), pot);
  k.add(geo.cylinder(0.156, 0.156, 0.01, 40), k.m('#6b5446', 'stone'), 0, 0.3, 0);
  const blades: THREE.BufferGeometry[] = [];
  const stems: THREE.BufferGeometry[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = i * 2.399 + k.r() * 0.4;
    const tilt = 0.5 + 0.35 * (i / n) + k.r() * 0.15; // inner leaves stand taller
    const reach = 0.08 + 0.18 * (1 - i / n);
    const sx = Math.cos(a) * 0.03, sz = Math.sin(a) * 0.03;
    const top: [number, number, number] = [Math.cos(a) * reach, 0.42 + 0.3 * tilt + k.r() * 0.08, Math.sin(a) * reach];
    stems.push(taperedTube([[sx, 0.3, sz], [sx * 2 + top[0] * 0.4, (0.3 + top[1]) / 2, sz * 2 + top[2] * 0.4], top], 0.008, 0.005, 6, 8));
    blades.push(leaf(top, [Math.cos(a) * (1 - tilt * 0.6), tilt, Math.sin(a) * (1 - tilt * 0.6)], k.between(0.26, 0.36), k.between(0.085, 0.11), 0.16, 0.18));
  }
  k.add(merge(stems), green);
  k.add(merge(blades), green);
  return k.done();
};

export const vase_flowers: Builder = (o) => {
  const k = kit(o);
  const vase = k.m(o.color && !says(o, 'flower', 'rose', 'tulip', 'bouquet') ? o.color : '#cfe1ea', 'glass');
  const bloomColor = says(o, 'flower', 'rose', 'tulip', 'bouquet', 'peony') && o.color ? o.color : TINT.rose;
  const bloom = k.m(bloomColor, 'plant');
  const pale = k.m('#f4ece4', 'plant');
  const green = twoSided(k.m(TINT.leaf, 'plant'));
  k.add(geo.lathe([[0.0001, 0], [0.055, 0], [0.07, 0.04], [0.078, 0.12], [0.056, 0.2], [0.038, 0.235], [0.046, 0.262], [0.04, 0.265], [0.031, 0.24], [0.0001, 0.24]], 48), vase);
  const stems: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [], paleHeads: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4 + k.r() * 0.5;
    const rr = i === 0 ? 0 : 0.05 + k.r() * 0.07;
    const tip: [number, number, number] = [Math.cos(a) * rr, 0.38 + k.r() * 0.12 - rr * 0.4, Math.sin(a) * rr];
    stems.push(taperedTube([[0, 0.2, 0], [tip[0] * 0.4, 0.3, tip[2] * 0.4], tip], 0.005, 0.004, 6, 6));
    const s = 0.034 + k.r() * 0.012;
    const head = merge([at(ellipsoid(s, s * 0.78, s, 18, 12), ...tip), ...[0, 1, 2, 3, 4].map((p) => {
      const pa = (p / 5) * Math.PI * 2 + a;
      return at(ellipsoid(s * 0.62, s * 0.34, s * 0.8, 12, 8), tip[0] + Math.cos(pa) * s * 0.7, tip[1] - s * 0.15, tip[2] + Math.sin(pa) * s * 0.7, 0, -pa, 0.35);
    })]);
    (i % 3 === 2 ? paleHeads : heads).push(head);
    if (i < 4) leaves.push(leaf([tip[0] * 0.5, 0.29, tip[2] * 0.5], [Math.cos(a), 0.4, Math.sin(a)], 0.09, 0.03, 0.05, 0.1));
  }
  k.add(merge([...stems, ...leaves]), green);
  k.add(merge(heads), bloom);
  if (paleHeads.length) k.add(merge(paleHeads), pale);
  return k.done();
};

export const picture_frame: Builder = (o) => {
  const k = kit(o);
  const frame = k.main('#d6bf86', 'metal');
  const mat = k.m(TINT.cream, 'paper');
  const W = 0.5, H = 0.6, F = 0.045;
  k.add(merge([
    at(rbox(W, F, 0.04, 0.012), 0, H - F / 2, 0), at(rbox(W, F, 0.04, 0.012), 0, F / 2, 0),
    at(rbox(F, H, 0.04, 0.012), W / 2 - F / 2, H / 2, 0), at(rbox(F, H, 0.04, 0.012), -(W / 2 - F / 2), H / 2, 0),
  ]), frame);
  k.add(rbox(W - 0.06, H - 0.06, 0.012, 0.004), mat, 0, H / 2, -0.004);
  // a small painted landscape in relief: sky, a hill, a sun
  k.add(rbox(0.3, 0.38, 0.006, 0.003), k.m('#cfe0ef', 'ceramic'), 0, H / 2, 0.004);
  k.add(ellipsoid(0.17, 0.09, 0.01, 24, 12), k.m('#a9c49a', 'ceramic'), 0.02, H / 2 - 0.14, 0.006);
  k.add(geo.cylinder(0.035, 0.035, 0.006, 24), k.m('#f3d9a0', 'ceramic'), -0.07, H / 2 + 0.08, 0.008, Math.PI / 2, 0, 0);
  return k.done();
};

export const clock: Builder = (o) => {
  const k = kit(o);
  const rim = k.main(TINT.walnut, 'wood');
  const face = k.m(TINT.cream, 'ceramic');
  const ink = k.m(TINT.charcoal, 'metal');
  const C = 0.2;
  const body = geo.lathe([[0.0001, -0.035], [0.18, -0.035], [0.198, -0.018], [0.2, 0.008], [0.186, 0.028], [0.17, 0.022], [0.0001, 0.022]], 64);
  k.add(body, rim, 0, C, 0, Math.PI / 2, 0, 0);
  k.add(geo.cylinder(0.168, 0.168, 0.006, 64), face, 0, C, 0.024, Math.PI / 2, 0, 0);
  k.add(merge([
    ring(12, 0.145, (i) => rbox(i % 3 === 0 ? 0.008 : 0.005, i % 3 === 0 ? 0.03 : 0.018, 0.004, 0.0015, 1), C, 0.03),
    at(rbox(0.012, 0.085, 0.004, 0.002, 1), 0.018, C + 0.03, 0.032, 0, 0, -0.6),
    at(rbox(0.008, 0.125, 0.004, 0.002, 1), -0.02, C + 0.055, 0.035, 0, 0, 0.35),
    at(geo.cylinder(0.01, 0.01, 0.008, 16), 0, C, 0.036, Math.PI / 2, 0, 0),
  ]), ink);
  return k.done();
};

export const radio: Builder = (o) => {
  const k = kit(o);
  const wood = k.main('#c2a98f', 'wood');
  const cloth = k.m('#e6dcc8', 'fabric');
  const brass = k.m(TINT.brass, 'metal');
  const ivory = k.m('#f3ecdd', 'ceramic');
  k.add(geo.box(0.36, 0.22, 0.17, 0.035), wood, 0, 0.125, 0);
  k.add(rbox(0.19, 0.13, 0.01, 0.02), cloth, -0.06, 0.13, 0.083);
  k.add(merge(Array.from({ length: 5 }, (_, i) => at(rbox(0.19, 0.008, 0.012, 0.003, 1), -0.06, 0.08 + i * 0.025, 0.088))), wood);
  k.add(geo.cylinder(0.042, 0.042, 0.01, 32), ivory, 0.1, 0.15, 0.084, Math.PI / 2, 0, 0);
  k.add(merge([
    at(geo.torus(0.043, 0.004), 0.1, 0.15, 0.09), at(rbox(0.003, 0.034, 0.003, 0.001, 1), 0.1, 0.16, 0.092, 0, 0, -0.5),
    at(geo.cylinder(0.016, 0.016, 0.018, 18), 0.075, 0.07, 0.09, Math.PI / 2, 0, 0), at(geo.cylinder(0.016, 0.016, 0.018, 18), 0.125, 0.07, 0.09, Math.PI / 2, 0, 0),
    ...[[0.15, 0.06], [-0.15, 0.06], [0.15, -0.06], [-0.15, -0.06]].map(([x, z]) => at(geo.sphere(0.012, 10, 8), x!, 0.012, z!)),
  ]), brass);
  return k.done();
};

export const teapot: Builder = (o) => {
  const k = kit(o);
  const porcelainBody = k.main(TINT.white, 'ceramic');
  k.add(merge([
    geo.lathe([[0.0001, 0], [0.06, 0], [0.068, 0.006], [0.092, 0.045], [0.1, 0.085], [0.092, 0.122], [0.068, 0.148], [0.05, 0.155], [0.0001, 0.155]], 48),
    geo.lathe([[0.0001, 0.152], [0.054, 0.152], [0.05, 0.166], [0.032, 0.18], [0.0001, 0.186]], 40),
    at(geo.sphere(0.016, 16, 12), 0, 0.195, 0),
    taperedTube([[0.07, 0.05, 0], [0.12, 0.07, 0], [0.15, 0.115, 0], [0.165, 0.15, 0]], 0.021, 0.009, 8, 14),
    geo.tube([[-0.085, 0.125, 0], [-0.135, 0.13, 0], [-0.155, 0.085, 0], [-0.13, 0.045, 0], [-0.09, 0.04, 0]], 0.011),
  ]), porcelainBody);
  return k.done();
};

export const cup: Builder = (o) => {
  const k = kit(o);
  const china = k.main(TINT.white, 'ceramic');
  k.add(merge([
    geo.lathe([[0.0001, 0], [0.05, 0], [0.068, 0.007], [0.074, 0.013], [0.068, 0.014], [0.03, 0.009], [0.0001, 0.009]], 48),
    geo.lathe([[0.0001, 0.012], [0.026, 0.012], [0.032, 0.02], [0.043, 0.055], [0.047, 0.08], [0.044, 0.081], [0.04, 0.057], [0.03, 0.028], [0.0001, 0.026]], 48),
    geo.tube([[0.043, 0.07, 0], [0.066, 0.068, 0], [0.068, 0.045, 0], [0.042, 0.035, 0]], 0.006),
  ]), china);
  k.add(geo.cylinder(0.04, 0.04, 0.004, 32), k.m('#a57c5a', 'ceramic'), 0, 0.064, 0);
  return k.done();
};

export const bowl_fruit: Builder = (o) => {
  const k = kit(o);
  const bowl = k.main('#d7e4ee', 'ceramic');
  k.add(geo.lathe([[0.0001, 0], [0.055, 0], [0.065, 0.014], [0.12, 0.062], [0.15, 0.09], [0.146, 0.095], [0.118, 0.07], [0.058, 0.03], [0.0001, 0.028]], 56), bowl);
  const pile: [number, number, number, number, string][] = [
    [0, 0.07, 0, 0.045, '#e8a04c'], [0.06, 0.06, 0.035, 0.042, '#e8a04c'], [-0.055, 0.062, 0.03, 0.04, '#cf5c4a'],
    [0.01, 0.058, -0.06, 0.041, '#cf5c4a'], [-0.04, 0.11, -0.01, 0.038, '#e9d06a'], [0.035, 0.115, 0.0, 0.039, '#e8a04c'],
  ];
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  for (const [x, y, z, r, c] of pile) {
    const g = c === '#e9d06a' ? ellipsoid(r * 1.25, r * 0.9, r * 0.9, 20, 14) : geo.sphere(r, 22, 16);
    const list = byColor.get(c) ?? [];
    list.push(at(g, x, y + 0.02, z, 0, k.r() * 3, 0));
    byColor.set(c, list);
  }
  for (const [c, list] of byColor) k.add(merge(list), k.m(c, 'plant'));
  k.add(merge([at(geo.cylinder(0.003, 0.003, 0.02, 6), -0.055, 0.12, 0.03), at(geo.cylinder(0.003, 0.003, 0.02, 6), 0.01, 0.118, -0.06)]), k.m(TINT.bark, 'wood'));
  return k.done();
};

export const cake: Builder = (o) => {
  const k = kit(o);
  const stand = k.m(TINT.white, 'ceramic');
  const sponge = k.main('#f3e3cf', 'ceramic');
  const frosting = k.m('#fbf4ec', 'ceramic');
  const berry = k.m('#c44a55', 'plant');
  k.add(geo.lathe([[0.0001, 0], [0.07, 0], [0.072, 0.01], [0.026, 0.03], [0.02, 0.07], [0.15, 0.074], [0.155, 0.083], [0.0001, 0.082]], 56), stand);
  k.add(merge([at(geo.cylinder(0.12, 0.12, 0.075, 56), 0, 0.12, 0), at(geo.cylinder(0.085, 0.085, 0.06, 48), 0, 0.19, 0)]), sponge);
  k.add(merge([
    at(torusLo(0.115, 0.012, 10, 48), 0, 0.158, 0, Math.PI / 2, 0, 0), at(torusLo(0.08, 0.01, 10, 40), 0, 0.22, 0, Math.PI / 2, 0, 0),
    at(geo.cylinder(0.083, 0.083, 0.006, 48), 0, 0.222, 0),
    ...Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return at(capsuleLo(0.007, 0.02 + (i % 3) * 0.008), Math.cos(a) * 0.12, 0.14, Math.sin(a) * 0.12); }),
  ]), frosting);
  k.add(merge([0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return at(geo.sphere(0.014, 14, 10), Math.cos(a) * 0.05, 0.235, Math.sin(a) * 0.05); })), berry);
  return k.done();
};

export const books: Builder = (o) => {
  const k = kit(o);
  const glazes = o.color ? [o.color, '#ece2cd', '#9fb4c9', o.color] : ['#9fb4c9', '#d7a0a8', '#a7bf98', '#ece2cd'];
  const pages = k.m('#f6f0e3', 'paper');
  let y = 0;
  const covers = new Map<string, THREE.BufferGeometry[]>();
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const w = k.between(0.22, 0.27), d = k.between(0.16, 0.19), t = k.between(0.032, 0.048), rot = (k.r() - 0.5) * 0.35;
    const c = glazes[i % glazes.length]!;
    const list = covers.get(c) ?? [];
    list.push(at(rbox(w, t, d, 0.006, 2), 0, y + t / 2, 0, 0, rot, 0));
    covers.set(c, list);
    leaves.push(at(rbox(w - 0.012, t * 0.78, d - 0.01, 0.002, 1), 0.006 * Math.cos(rot), y + t / 2, 0.004, 0, rot, 0));
    y += t;
  }
  for (const [c, list] of covers) k.add(merge(list), k.m(c, 'paper'));
  k.add(merge(leaves), pages);
  return k.done();
};

export const candle: Builder = (o) => {
  const k = kit(o);
  const brass = k.m(TINT.brass, 'metal');
  const wax = k.m(o.color || TINT.cream, 'ceramic'); // only the flame glows, whatever material the plan names
  const flame = glow(k.m(TINT.flame, 'light'), '#ffb066', 1.4);
  k.add(geo.lathe([[0.0001, 0], [0.046, 0], [0.05, 0.008], [0.02, 0.022], [0.013, 0.06], [0.02, 0.078], [0.032, 0.084], [0.03, 0.09], [0.0001, 0.09]], 40), brass);
  k.add(geo.cylinder(0.013, 0.013, 0.11, 24), wax, 0, 0.145, 0);
  k.add(geo.lathe([[0.0001, 0], [0.007, 0.006], [0.009, 0.016], [0.006, 0.03], [0.0001, 0.044]], 18), flame, 0, 0.205, 0);
  void taperLeg;
  return k.done();
};
