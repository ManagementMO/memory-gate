// Animals as porcelain figurines: a sitting cat with its tail wrapped round its paws, a sitting dog with soft ears, a
// small perched bird. Graceful simplified volumes, no cartoon eyes; the silhouette does the remembering.
import { geo, type Builder } from '../style';
import { TINT, at, ellipsoid, kit, merge, says, taperedTube } from './kit';

export const cat: Builder = (o) => {
  const k = kit(o);
  const dark = says(o, 'black');
  const glaze = k.main(dark ? '#3d3a40' : says(o, 'orange', 'ginger', 'tabby') ? '#e0a46a' : TINT.white, 'ceramic');
  // the classic seated figurine: low haunches, a tall teardrop chest, paws together, the tail wrapped round them
  k.add(merge([
    at(ellipsoid(0.094, 0.1, 0.118, 30, 20), 0, 0.098, -0.045),
    at(ellipsoid(0.064, 0.13, 0.066, 28, 20), 0, 0.19, 0.028, -0.2, 0, 0),
    at(ellipsoid(0.06, 0.054, 0.057, 28, 18), 0, 0.306, 0.046),
    at(ellipsoid(0.028, 0.02, 0.022, 18, 12), 0, 0.292, 0.088),
    at(geo.cone(0.022, 0.05), 0.034, 0.354, 0.04, -0.06, 0, -0.26), at(geo.cone(0.022, 0.05), -0.034, 0.354, 0.04, -0.06, 0, 0.26),
    at(geo.capsule(0.017, 0.11), 0.021, 0.075, 0.072, 0.06, 0, 0), at(geo.capsule(0.017, 0.11), -0.021, 0.075, 0.072, 0.06, 0, 0),
    at(ellipsoid(0.02, 0.012, 0.026, 14, 8), 0.021, 0.012, 0.085), at(ellipsoid(0.02, 0.012, 0.026, 14, 8), -0.021, 0.012, 0.085),
    taperedTube([[0.072, 0.03, -0.13], [0.112, 0.02, -0.03], [0.086, 0.018, 0.068], [0.024, 0.017, 0.108]], 0.018, 0.011, 10, 12),
  ]), glaze);
  return k.done();
};

export const dog: Builder = (o) => {
  const k = kit(o);
  const coat = k.main(says(o, 'black') ? '#3d3a40' : says(o, 'brown', 'golden', 'retriever', 'lab') ? '#d4a774' : '#efe4d0', 'ceramic');
  const nose = k.m(TINT.charcoal, 'ceramic');
  k.add(merge([
    at(ellipsoid(0.13, 0.13, 0.17, 30, 20), 0, 0.14, -0.08),
    at(ellipsoid(0.1, 0.17, 0.1, 30, 20), 0, 0.27, 0.07, -0.3, 0, 0),
    at(ellipsoid(0.085, 0.078, 0.09, 30, 20), 0, 0.45, 0.11),
    at(geo.capsule(0.042, 0.06), 0, 0.43, 0.2, Math.PI / 2 - 0.15, 0, 0),
    at(ellipsoid(0.03, 0.075, 0.022, 18, 12), 0.078, 0.415, 0.09, 0.1, 0, 0.18), at(ellipsoid(0.03, 0.075, 0.022, 18, 12), -0.078, 0.415, 0.09, 0.1, 0, -0.18),
    at(geo.capsule(0.03, 0.2), 0.06, 0.13, 0.14), at(geo.capsule(0.03, 0.2), -0.06, 0.13, 0.14),
    at(ellipsoid(0.05, 0.03, 0.08, 18, 10), 0.105, 0.03, 0.02), at(ellipsoid(0.05, 0.03, 0.08, 18, 10), -0.105, 0.03, 0.02),
    taperedTube([[0, 0.12, -0.24], [0.04, 0.08, -0.3], [0.1, 0.05, -0.28]], 0.022, 0.012, 8, 10),
  ]), coat);
  k.add(geo.sphere(0.016, 14, 10), nose, 0, 0.445, 0.255);
  return k.done();
};

export const bird: Builder = (o) => {
  const k = kit(o);
  const body = k.main(says(o, 'robin') ? '#b9a594' : says(o, 'canary') ? '#ecd47a' : says(o, 'parrot') ? '#86c49a' : '#a9bccb', 'ceramic');
  const beak = k.m(TINT.brass, 'ceramic');
  // a perched songbird: round breast, folded wings along the back, the tail angled down
  k.add(merge([
    at(ellipsoid(0.036, 0.034, 0.058, 26, 18), 0, 0.055, 0, -0.28, 0, 0),
    at(geo.sphere(0.027, 24, 16), 0, 0.094, 0.044),
    at(ellipsoid(0.017, 0.005, 0.048, 16, 8), 0, 0.04, -0.075, 0.42, 0, 0),
    at(ellipsoid(0.011, 0.02, 0.046, 16, 10), 0.028, 0.066, -0.012, -0.22, 0, 0.18), at(ellipsoid(0.011, 0.02, 0.046, 16, 10), -0.028, 0.066, -0.012, -0.22, 0, -0.18),
  ]), body);
  k.add(merge([at(geo.cone(0.0075, 0.022), 0, 0.092, 0.078, Math.PI / 2, 0, 0), at(geo.cylinder(0.003, 0.003, 0.028, 6), 0.011, 0.014, 0.004), at(geo.cylinder(0.003, 0.003, 0.028, 6), -0.011, 0.014, 0.004)]), beak);
  return k.done();
};
