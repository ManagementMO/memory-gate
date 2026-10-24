// Furniture and fixtures in the porcelain style: real proportions, turned and tapered legs, plump upholstery,
// soft rounded edges. Every builder: metres, floor at y = 0, footprint centred on the origin, front facing +Z.
import * as THREE from 'three';
import { geo, type Builder } from '../style';
import { TINT, at, cushion, ellipsoid, glow, kit, merge, pleated, rbox, says, taperLeg, taperedTube, torusLo, turnedLeg, twoSided } from './kit';

const corners = (hx: number, hz: number): [number, number][] => [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]];

export const table: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.oak, 'wood');
  const W = 1.4, D = 0.85, H = 0.76, T = 0.042, inset = 0.075, apronH = 0.08;
  k.add(geo.box(W, T, D, 0.016), wood, 0, H - T / 2, 0);
  k.add(merge([
    at(rbox(W - inset * 2, apronH, 0.024, 0.007), 0, H - T - apronH / 2, D / 2 - inset),
    at(rbox(W - inset * 2, apronH, 0.024, 0.007), 0, H - T - apronH / 2, -(D / 2 - inset)),
    at(rbox(0.024, apronH, D - inset * 2, 0.007), W / 2 - inset, H - T - apronH / 2, 0),
    at(rbox(0.024, apronH, D - inset * 2, 0.007), -(W / 2 - inset), H - T - apronH / 2, 0),
    ...corners(W / 2 - inset, D / 2 - inset).map(([x, z]) => at(turnedLeg(H - T, 0.032), x, 0, z)),
  ]), wood);
  return k.done();
};

export const round_table: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.oak, 'wood');
  const H = 0.74, R = 0.5;
  k.add(geo.lathe([[0.0001, H - 0.04], [R - 0.03, H - 0.04], [R - 0.006, H - 0.032], [R, H - 0.02], [R - 0.004, H - 0.008], [R - 0.02, H], [0.0001, H]], 72), wood);
  // a turned pedestal on three curved feet
  k.add(merge([
    geo.lathe([[0.0001, 0.09], [0.075, 0.09], [0.06, 0.13], [0.044, 0.2], [0.04, 0.42], [0.058, 0.5], [0.044, 0.56], [0.05, 0.62], [0.085, H - 0.06], [0.1, H - 0.04], [0.0001, H - 0.04]], 36),
    ...[0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      return taperedTube([[c * 0.03, 0.12, s * 0.03], [c * 0.16, 0.08, s * 0.16], [c * 0.3, 0.03, s * 0.3], [c * 0.34, 0.015, s * 0.34]], 0.032, 0.016, 8, 12);
    }),
  ]), wood);
  return k.done();
};

export const chair: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.oak, 'wood');
  const pad = twoSided(k.m(says(o, 'cushion', 'pad') && o.color ? o.color : TINT.linen, 'fabric'));
  const seatY = 0.455, hx = 0.19;
  k.add(geo.box(0.44, 0.045, 0.42, 0.016), wood, 0, seatY, 0.0);
  k.add(cushion(0.39, 0.045, 0.37, 0.48), pad, 0, seatY + 0.042, 0.015);
  k.add(merge([
    // front turned legs
    at(turnedLeg(seatY - 0.02, 0.022), hx, 0, 0.17), at(turnedLeg(seatY - 0.02, 0.022), -hx, 0, 0.17),
    // back legs rise into the posts with a gentle rake
    ...[hx, -hx].map((x) => taperedTube([[x, 0, -0.18], [x, seatY, -0.19], [x * 0.98, 0.7, -0.215], [x * 0.96, 0.9, -0.245]], 0.02, 0.016, 10, 12)),
    // curved top rail and a lower rail
    geo.tube([[-hx * 0.96, 0.855, -0.24], [0, 0.875, -0.27], [hx * 0.96, 0.855, -0.24]], 0.024),
    geo.tube([[-hx * 0.98, 0.585, -0.2], [0, 0.6, -0.225], [hx * 0.98, 0.585, -0.2]], 0.014),
    // three turned spindles between them
    ...[-0.075, 0, 0.075].map((x) => {
      const sp = geo.lathe([[0.0001, 0], [0.008, 0], [0.012, 0.06], [0.009, 0.14], [0.012, 0.23], [0.008, 0.27], [0.0001, 0.27]], 14);
      return at(sp, x, 0.588, -0.205 - 0.02 * Math.abs(x) / 0.075, -0.13, 0, 0);
    }),
    // stretchers
    at(geo.cylinder(0.009, 0.009, 0.37, 12), hx, 0.16, -0.005, Math.PI / 2, 0, 0),
    at(geo.cylinder(0.009, 0.009, 0.37, 12), -hx, 0.16, -0.005, Math.PI / 2, 0, 0),
    at(geo.cylinder(0.009, 0.009, hx * 2, 12), 0, 0.22, 0.17, 0, 0, Math.PI / 2),
  ]), wood);
  return k.done();
};

export const armchair: Builder = (o) => {
  const k = kit(o);
  const cloth = k.main('#d9cdbf', 'fabric');
  const legs = k.m(TINT.walnut, 'wood');
  k.add(cushion(0.82, 0.3, 0.8, 0.22), cloth, 0, 0.26, 0);
  k.add(cushion(0.6, 0.15, 0.64, 0.5), cloth, 0, 0.47, 0.06);
  k.add(cushion(0.8, 0.62, 0.16, 0.32), cloth, 0, 0.63, -0.33, -0.08);
  k.add(cushion(0.6, 0.48, 0.18, 0.5), cloth, 0, 0.71, -0.24, -0.16);
  for (const x of [0.345, -0.345]) {
    k.add(cushion(0.13, 0.3, 0.74, 0.42), cloth, x, 0.5, 0.01);
    k.add(geo.capsule(0.078, 0.6), cloth, x, 0.655, 0.03, Math.PI / 2, 0, 0);
  }
  k.add(merge(corners(0.34, 0.32).map(([x, z]) => at(taperLeg(0.12, 0.024, 0.014), x, 0, z, z > 0 ? 0.08 : -0.08, 0, x > 0 ? -0.08 : 0.08))), legs);
  return k.done();
};

export const sofa: Builder = (o) => {
  const k = kit(o);
  const cloth = k.main('#c8d1da', 'fabric');
  const legs = k.m(TINT.walnut, 'wood');
  const W = 2.0;
  k.add(cushion(W - 0.04, 0.28, 0.86, 0.22), cloth, 0, 0.25, 0);
  k.add(cushion(W - 0.06, 0.5, 0.16, 0.32), cloth, 0, 0.56, -0.36, -0.06);
  k.add(merge([-0.58, 0, 0.58].map((x) => at(cushion(0.57, 0.15, 0.66, 0.5), x, 0.45, 0.06))), cloth);
  k.add(merge([-0.58, 0, 0.58].map((x) => at(cushion(0.58, 0.42, 0.18, 0.5), x, 0.66, -0.25, -0.15))), cloth);
  for (const x of [W / 2 - 0.09, -(W / 2 - 0.09)]) {
    k.add(cushion(0.16, 0.3, 0.82, 0.42), cloth, x, 0.45, 0.01);
    k.add(geo.capsule(0.095, 0.62), cloth, x, 0.6, 0.04, Math.PI / 2, 0, 0);
  }
  k.add(merge([...corners(W / 2 - 0.1, 0.33), [0, 0.33], [0, -0.33]].map(([x, z]) => at(taperLeg(0.11, 0.024, 0.014), x, 0, z))), legs);
  return k.done();
};

export const bed: Builder = (o) => {
  const k = kit(o);
  const frame = k.m(TINT.oak, 'wood');
  const linen = k.m(TINT.white, 'fabric');
  const duvet = k.main('#cfdaea', 'fabric');
  k.add(geo.box(1.6, 0.22, 2.06, 0.03), frame, 0, 0.2, 0.02);
  k.add(merge(corners(0.74, 0.96).map(([x, z]) => at(taperLeg(0.1, 0.03, 0.022), x, 0, z))), frame);
  k.add(cushion(1.52, 0.22, 1.98, 0.32), linen, 0, 0.41, 0.02);
  k.add(cushion(1.62, 0.09, 1.42, 0.45), duvet, 0, 0.555, 0.31);
  k.add(cushion(1.62, 0.07, 0.22, 0.48), duvet, 0, 0.6, -0.37, 0.05);
  k.add(merge([0.37, -0.37].map((x) => at(cushion(0.62, 0.15, 0.4, 0.5), x, 0.6, -0.76, -0.22))), linen);
  // an upholstered headboard set into a wooden frame
  k.add(geo.box(1.68, 0.78, 0.07, 0.035), frame, 0, 0.67, -1.02);
  k.add(cushion(1.5, 0.56, 0.07, 0.42), duvet, 0, 0.72, -0.975);
  return k.done();
};

export const bookshelf: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.walnut, 'wood');
  const W = 0.9, H = 1.9, D = 0.32;
  const shelves = [0.42, 0.82, 1.22, 1.6];
  k.add(merge([
    at(rbox(0.026, H, D, 0.008), W / 2 - 0.013, H / 2, 0), at(rbox(0.026, H, D, 0.008), -(W / 2 - 0.013), H / 2, 0),
    at(geo.box(W + 0.03, 0.035, D + 0.02, 0.01), 0, H - 0.0175, 0.005),
    at(rbox(W - 0.03, 0.08, D - 0.02, 0.01), 0, 0.04, 0.0),
    at(rbox(W - 0.04, H - 0.06, 0.012, 0.004), 0, H / 2, -D / 2 + 0.008),
    ...shelves.map((y) => at(rbox(W - 0.05, 0.024, D - 0.02, 0.006), 0, y, 0)),
  ]), wood);
  // books in four soft glazes, a few leaning, the odd gap
  const glazes = ['#8fa8c8', '#d79aa4', '#ece2cd', '#a7bf98'];
  const groups: THREE.BufferGeometry[][] = glazes.map(() => []);
  for (const base of [0.08, ...shelves.slice(0, 3).map((y) => y + 0.012), shelves[3]! + 0.012]) {
    let x = -W / 2 + 0.045;
    const end = W / 2 - 0.045;
    while (x < end - 0.03) {
      if (k.r() < 0.08) { x += 0.06; continue; }
      const w = k.between(0.022, 0.044), h = k.between(0.2, 0.29), d = k.between(0.17, 0.22);
      if (x + w > end) break;
      const lean = k.r() < 0.07 && x > -W / 2 + 0.2 ? 0.22 : 0;
      groups[Math.floor(k.r() * glazes.length)]!.push(at(rbox(w, h, d, 0.004, 1), x + w / 2 + lean * 0.12, base + h / 2 - lean * 0.01, 0.02 - (0.22 - d) / 2, 0, 0, lean));
      x += w + (lean ? 0.03 : 0.002);
    }
  }
  groups.forEach((list, i) => { if (list.length) k.add(merge(list), k.m(glazes[i]!, 'paper')); });
  return k.done();
};

export const cabinet: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.oak, 'wood');
  const brass = k.m(TINT.brass, 'metal');
  k.add(geo.box(0.98, 0.8, 0.44, 0.02), wood, 0, 0.5, 0);
  k.add(geo.box(1.04, 0.035, 0.48, 0.014), wood, 0, 0.917, 0.005);
  k.add(merge([
    ...[0.24, 0.5, 0.76].map((y) => at(rbox(0.9, 0.22, 0.02, 0.012), 0, y, 0.225)),
    ...corners(0.44, 0.17).map(([x, z]) => at(taperLeg(0.1, 0.022, 0.016), x, 0, z)),
  ]), wood);
  k.add(merge([0.24, 0.5, 0.76].flatMap((y) => [0.25, -0.25].map((x) => at(geo.sphere(0.017, 14, 10), x, y, 0.245)))), brass);
  return k.done();
};

function roundedRect(w: number, d: number, r: number, holeInset = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  if (holeInset > 0) s.holes.push(roundedRect(w - holeInset * 2, d - holeInset * 2, Math.max(0.01, r - holeInset * 0.5)) as unknown as THREE.Path);
  return s;
}
function slab(shape: THREE.Shape, thick: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export const rug: Builder = (o) => {
  const k = kit(o);
  const body = k.main('#d7b6b2', 'fabric');
  const border = k.m(TINT.cream, 'fabric');
  const W = 2.2, D = 1.5;
  k.add(slab(roundedRect(W, D, 0.06), 0.008), body, 0, 0.004, 0);
  k.add(slab(roundedRect(W - 0.16, D - 0.16, 0.05, 0.05), 0.004), border, 0, 0.011, 0);
  k.add(slab(roundedRect(0.62, 0.42, 0.21), 0.004), border, 0, 0.011, 0);
  // fringe on the short ends
  k.add(merge([W / 2 + 0.03, -W / 2 - 0.03].flatMap((x) => Array.from({ length: 22 }, (_, i) => at(rbox(0.06, 0.004, 0.012, 0.002, 1), x, 0.004, -D / 2 + 0.07 + (i * (D - 0.14)) / 21)))), border);
  return k.done();
};

export const window: Builder = (o) => {
  const k = kit(o);
  const curtainsColoured = says(o, 'curtain', 'drape') && !!o.color;
  const frame = k.m(!curtainsColoured && o.color ? o.color : TINT.white, 'wood');
  const panes = glow(k.m('#fff3dd', 'light'), '#fff1d8', 1.05);
  const drape = twoSided(k.m(curtainsColoured ? o.color : '#f1ebe1', 'fabric'));
  const brass = k.m(TINT.brass, 'metal');
  const W = 1.3, H = 1.6, F = 0.07;
  // light through the glass (emissive), then the frame and glazing bars in front of it
  k.add(rbox(W - 0.1, H - 0.1, 0.012, 0.004), panes, 0, H / 2, -0.03);
  k.add(merge([
    at(rbox(W, F, 0.1, 0.012), 0, H - F / 2, 0), at(rbox(W, F, 0.1, 0.012), 0, F / 2 + 0.03, 0),
    at(rbox(F, H, 0.1, 0.012), W / 2 - F / 2, H / 2, 0), at(rbox(F, H, 0.1, 0.012), -(W / 2 - F / 2), H / 2, 0),
    at(rbox(0.035, H - 0.1, 0.05, 0.008), 0, H / 2, -0.005), at(rbox(W - 0.1, 0.035, 0.05, 0.008), 0, H * 0.62, -0.005),
    at(geo.box(W + 0.16, 0.045, 0.2, 0.012), 0, 0.022, 0.05),
  ]), frame);
  // tied-back curtains hanging from a rod with round finials
  const cw = 0.5, ch = H + 0.32;
  for (const side of [1, -1]) k.add(pleated(cw, ch, 4, 0.035, 0.42, 0.42), drape, side * (W / 2 + 0.06), -0.12, 0.1);
  k.add(merge([
    at(geo.cylinder(0.013, 0.013, W + 0.62, 18), 0, H + 0.2, 0.1, 0, 0, Math.PI / 2),
    at(geo.sphere(0.03, 18, 12), W / 2 + 0.33, H + 0.2, 0.1), at(geo.sphere(0.03, 18, 12), -(W / 2 + 0.33), H + 0.2, 0.1),
  ]), brass);
  return k.done();
};

export const door: Builder = (o) => {
  const k = kit(o);
  const trim = k.m(TINT.white, 'wood');
  const slabMat = k.main('#b3c6b9', 'wood');
  const brass = k.m(TINT.brass, 'metal');
  const H = 2.05, W = 0.86;
  k.add(merge([
    at(rbox(0.09, H + 0.09, 0.08, 0.012), W / 2 + 0.045, (H + 0.09) / 2, 0), at(rbox(0.09, H + 0.09, 0.08, 0.012), -(W / 2 + 0.045), (H + 0.09) / 2, 0),
    at(rbox(W + 0.2, 0.1, 0.09, 0.012), 0, H + 0.05, 0),
  ]), trim);
  k.add(geo.box(W, H, 0.045, 0.012), slabMat, 0, H / 2, -0.01);
  k.add(merge([
    ...[0.21, -0.21].flatMap((x) => [at(rbox(0.3, 0.72, 0.022, 0.012), x, 1.48, 0.016), at(rbox(0.3, 0.78, 0.022, 0.012), x, 0.55, 0.016)]),
  ]), slabMat);
  k.add(merge([at(geo.cylinder(0.03, 0.03, 0.012, 20), 0.34, 1.0, 0.02, Math.PI / 2, 0, 0), at(geo.sphere(0.026, 18, 14), 0.34, 1.0, 0.055)]), brass);
  return k.done();
};

export const piano: Builder = (o) => {
  const k = kit(o);
  const body = k.main('#7a6658', 'wood');
  const ivory = k.m('#f6f1e6', 'ceramic');
  const ebony = k.m('#2e2b2c', 'ceramic');
  const brass = k.m(TINT.brass, 'metal');
  k.add(geo.box(1.48, 1.18, 0.36, 0.025), body, 0, 0.65, -0.12);
  k.add(geo.box(1.52, 0.035, 0.4, 0.012), body, 0, 1.255, -0.12);
  k.add(merge([
    at(rbox(1.36, 0.07, 0.3, 0.012), 0, 0.69, 0.16),
    at(rbox(1.28, 0.1, 0.02, 0.008), 0, 0.84, 0.06, -0.18, 0, 0),
    at(rbox(0.62, 0.2, 0.014, 0.006), 0, 0.98, 0.05, -0.22, 0, 0),
    ...[0.64, -0.64].flatMap((x) => [at(turnedLeg(0.655, 0.03), x, 0, 0.24), at(rbox(0.09, 0.05, 0.12, 0.015), x, 0.025, 0.24)]),
  ]), body);
  const whites: THREE.BufferGeometry[] = [];
  const blacks: THREE.BufferGeometry[] = [];
  const n = 36, span = 1.22, kw = span / n;
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + kw * (i + 0.5);
    whites.push(at(rbox(kw - 0.002, 0.02, 0.15, 0.003, 1), x, 0.735, 0.22));
    const note = i % 7;
    if (note !== 2 && note !== 6 && i < n - 1) blacks.push(at(rbox(kw * 0.55, 0.022, 0.09, 0.003, 1), x + kw / 2, 0.75, 0.185));
  }
  k.add(merge(whites), ivory);
  k.add(merge(blacks), ebony);
  k.add(merge([-0.05, 0.05].map((x) => at(rbox(0.035, 0.012, 0.07, 0.004, 1), x, 0.06, 0.16))), brass);
  return k.done();
};

export const counter: Builder = (o) => {
  const k = kit(o);
  const cab = k.main('#dfe6dc', 'wood');
  const top = k.m('#f1efea', 'stone');
  const metal = k.m('#c8ccd2', 'metal');
  const W = 1.8;
  k.add(geo.box(W, 0.8, 0.56, 0.015), cab, 0, 0.47, -0.02);
  k.add(merge([
    at(rbox(W - 0.06, 0.07, 0.5, 0.01), 0, 0.035, -0.04),
    ...[-0.6, 0, 0.6].flatMap((x) => [at(rbox(0.56, 0.58, 0.02, 0.012), x, 0.42, 0.27), at(rbox(0.56, 0.15, 0.02, 0.012), x, 0.8, 0.27)]),
  ]), cab);
  k.add(merge([-0.6, 0, 0.6].flatMap((x) => [at(rbox(0.12, 0.016, 0.02, 0.006, 1), x, 0.8, 0.29), at(rbox(0.016, 0.12, 0.02, 0.006, 1), x + 0.22, 0.47, 0.29)])), metal);
  k.add(geo.box(W + 0.04, 0.042, 0.64, 0.012), top, 0, 0.893, 0);
  k.add(rbox(W + 0.04, 0.16, 0.022, 0.008), top, 0, 0.99, -0.31);
  // a sink basin and a gooseneck tap
  k.add(rbox(0.52, 0.006, 0.34, 0.06), k.m('#cdd3d8', 'metal'), 0.38, 0.916, 0.02);
  k.add(merge([at(geo.cylinder(0.022, 0.026, 0.05, 18), 0.38, 0.94, -0.21), geo.tube([[0.38, 0.95, -0.21], [0.38, 1.16, -0.2], [0.38, 1.17, -0.08], [0.38, 1.1, -0.04]], 0.012)]), metal);
  return k.done();
};

export const stove: Builder = (o) => {
  const k = kit(o);
  const enamel = k.main('#efe7d6', 'ceramic');
  const iron = k.m(TINT.charcoal, 'metal');
  const chrome = k.m('#d4d8de', 'metal');
  k.add(geo.box(0.76, 0.84, 0.62, 0.04), enamel, 0, 0.48, 0);
  k.add(merge([at(rbox(0.6, 0.44, 0.025, 0.02), 0, 0.37, 0.315), at(rbox(0.76, 0.17, 0.07, 0.02), 0, 0.99, -0.275)]), enamel);
  k.add(rbox(0.36, 0.16, 0.012, 0.012), k.m('#9aa7b0', 'glass'), 0, 0.42, 0.33);
  k.add(merge([
    geo.tube([[-0.24, 0.64, 0.33], [-0.24, 0.66, 0.37], [0.24, 0.66, 0.37], [0.24, 0.64, 0.33]], 0.011),
    ...[-0.24, -0.08, 0.08, 0.24].map((x) => at(geo.cylinder(0.022, 0.022, 0.025, 18), x, 1.0, -0.233, Math.PI / 2, 0, 0)),
  ]), chrome);
  k.add(merge([
    ...[[-0.17, 0.1], [0.17, 0.1], [-0.17, -0.14], [0.17, -0.14]].flatMap(([x, z]) => [at(torusLo(0.085, 0.009, 8, 40), x!, 0.905, z!, Math.PI / 2, 0, 0), at(geo.cylinder(0.05, 0.05, 0.012, 24), x!, 0.903, z!)]),
    ...corners(0.33, 0.26).map(([x, z]) => at(geo.cylinder(0.025, 0.02, 0.06, 14), x, 0.03, z)),
  ]), iron);
  return k.done();
};

export const fridge: Builder = (o) => {
  const k = kit(o);
  const shell = k.main('#efeae0', 'ceramic');
  const chrome = k.m('#d6dae0', 'metal');
  k.add(geo.box(0.74, 1.64, 0.66, 0.1), shell, 0, 0.9, 0);
  k.add(rbox(0.68, 0.08, 0.56, 0.02), k.m(TINT.charcoal, 'metal'), 0, 0.04, -0.02);
  k.add(rbox(0.72, 0.008, 0.012, 0.003, 1), k.m('#c9c3b6', 'ceramic'), 0, 1.24, 0.333);
  k.add(merge([
    geo.tube([[0.27, 1.02, 0.335], [0.3, 1.04, 0.37], [0.3, 1.18, 0.37], [0.27, 1.2, 0.335]], 0.013),
    at(rbox(0.12, 0.03, 0.01, 0.006, 1), 0, 1.5, 0.336),
  ]), chrome);
  return k.done();
};

export const fireplace: Builder = (o) => {
  const k = kit(o);
  const stoneMat = k.main('#d9d3c8', 'stone');
  const mantel = k.m(TINT.white, 'wood');
  const soot = k.m('#5a5552', 'stone');
  const bark = k.m(TINT.bark, 'wood');
  const flame = glow(k.m(TINT.flame, 'light'), '#ffa95a', 1.35);
  k.add(merge([
    at(rbox(1.62, 0.06, 0.62, 0.015), 0, 0.03, 0.09),
    at(rbox(0.3, 1.0, 0.4, 0.02), 0.6, 0.56, 0), at(rbox(0.3, 1.0, 0.4, 0.02), -0.6, 0.56, 0),
    at(rbox(1.5, 0.2, 0.4, 0.02), 0, 0.98, 0),
  ]), stoneMat);
  k.add(geo.box(1.72, 0.06, 0.5, 0.016), mantel, 0, 1.11, 0.04);
  k.add(merge([at(rbox(0.9, 0.86, 0.05, 0.01), 0, 0.49, -0.17), at(rbox(0.9, 0.04, 0.34, 0.01), 0, 0.075, -0.02)]), soot);
  k.add(merge([at(geo.capsule(0.045, 0.5), 0, 0.15, 0.02, 0, 0.25, Math.PI / 2), at(geo.capsule(0.04, 0.46), 0, 0.2, -0.04, 0, -0.35, Math.PI / 2)]), bark);
  const tongue = (h: number, r: number) => geo.lathe([[0.0001, 0], [r * 0.8, h * 0.08], [r, h * 0.28], [r * 0.7, h * 0.6], [r * 0.25, h * 0.88], [0.0001, h]], 20);
  k.add(merge([at(tongue(0.34, 0.07), 0, 0.17, 0), at(tongue(0.24, 0.05), 0.12, 0.17, 0.02, 0, 0, -0.15), at(tongue(0.22, 0.045), -0.12, 0.17, 0.01, 0, 0, 0.18)]), flame);
  return k.done();
};

export const tv: Builder = (o) => {
  const k = kit(o);
  const wood = k.main(TINT.walnut, 'wood');
  const screen = glow(k.m('#cfe0ea', 'light'), '#cfe6f5', 0.85);
  const knob = k.m(TINT.cream, 'ceramic');
  const metal = k.m(TINT.iron, 'metal');
  k.add(geo.box(0.66, 0.48, 0.44, 0.07), wood, 0, 0.28, 0);
  k.add(geo.box(0.44, 0.34, 0.03, 0.06), screen, -0.07, 0.29, 0.21);
  k.add(merge([-0.0, 0.07].map((dy) => at(geo.cylinder(0.026, 0.026, 0.03, 18), 0.235, 0.33 - dy * 1.4, 0.225, Math.PI / 2, 0, 0))), knob);
  k.add(merge([
    ...Array.from({ length: 5 }, (_, i) => at(rbox(0.08, 0.008, 0.01, 0.003, 1), 0.235, 0.15 + i * 0.022, 0.222)),
    geo.tube([[0.02, 0.52, -0.05], [0.12, 0.72, -0.08], [0.2, 0.88, -0.1]], 0.004), geo.tube([[-0.02, 0.52, -0.05], [-0.1, 0.7, -0.06], [-0.18, 0.86, -0.06]], 0.004),
    at(geo.sphere(0.012, 12, 8), 0.2, 0.88, -0.1), at(geo.sphere(0.012, 12, 8), -0.18, 0.86, -0.06),
    ...corners(0.26, 0.15).map(([x, z]) => at(taperLeg(0.045, 0.012, 0.008), x, 0, z)),
  ]), metal);
  void ellipsoid;
  return k.done();
};
