// Splat post-processing for the GPU worker (adapted from the V15 prep pipeline: @adobe/spz WASM, no native modules;
// do NOT use @playcanvas/splat-transform, its webgpu module needs macOS 15+).
//
//   node worker/spz.mjs raw <pos.f32> <rest.f16> <outDir> [liteCount]
//       Input from the Modal container: splats ALREADY sorted by importance (sigmoid(opacity) x volume), best first.
//       pos.f32 = N x 3 float32 (x y z); rest.f16 = N x 11 float16 in PLY order
//       (f_dc_0..2, opacity logit, log-scale 0..2, rot_0..3 with rot_0 = w).
//   node worker/spz.mjs ply <in.ply> <outDir> [keep] [liteCount]
//       A standard 3DGS PLY (what SHARP writes): read, rank, keep the top `keep` (default 500000). Local test path.
//
// Writes <outDir>/splat.spz (all N, SPZ v3) and <outDir>/splat-lite.spz (the best liteCount, default 250000),
// reads both back with @adobe/spz to check the counts, estimates the floor height, and prints one JSON line.
// Axes stay as SHARP wrote them (OpenCV: x right, y down, z forward, metric); the headset turns the splat 180 deg
// about X, so floorY is reported in that y-up frame (negative = below the camera).
import createSpzModule from '@adobe/spz';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const t = {};
const time = async (name, fn) => { const t0 = performance.now(); const r = await fn(); t[name] = Math.round(performance.now() - t0); return r; };

function emptyCloud(n) {
  return { numPoints: n, shDegree: 0, antialiased: false, extensions: [], positions: new Float32Array(3 * n), scales: new Float32Array(3 * n),
    rotations: new Float32Array(4 * n), alphas: new Float32Array(n), colors: new Float32Array(3 * n), sh: new Float32Array(0) };
}

/** rest row layout: f_dc 0..2, opacity, scale 0..2, rot_0(w) rot_1 rot_2 rot_3 */
function fromRaw(posFile, restFile) {
  const pb = readFileSync(posFile), rb = readFileSync(restFile);
  const pos = new Float32Array(pb.buffer, pb.byteOffset, pb.byteLength / 4);
  const rest = new Float16Array(rb.buffer.slice(rb.byteOffset, rb.byteOffset + rb.byteLength));
  const n = pos.length / 3;
  if (!Number.isInteger(n) || rest.length !== n * 11) throw new Error(`raw size mismatch: ${pos.length} pos floats, ${rest.length} rest halves`);
  const c = emptyCloud(n);
  c.positions.set(pos);
  for (let i = 0; i < n; i++) {
    const o = 11 * i;
    c.colors[3 * i] = rest[o]; c.colors[3 * i + 1] = rest[o + 1]; c.colors[3 * i + 2] = rest[o + 2];
    c.alphas[i] = rest[o + 3];
    c.scales[3 * i] = rest[o + 4]; c.scales[3 * i + 1] = rest[o + 5]; c.scales[3 * i + 2] = rest[o + 6];
    c.rotations[4 * i] = rest[o + 8]; c.rotations[4 * i + 1] = rest[o + 9]; c.rotations[4 * i + 2] = rest[o + 10]; c.rotations[4 * i + 3] = rest[o + 7]; // spz: x y z w
  }
  return c;
}

const FIELDS = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
function fromPly(file) {
  const buf = readFileSync(file);
  const end = buf.indexOf('end_header\n');
  let n = 0; const props = []; let inVertex = false;
  for (const line of buf.subarray(0, end).toString('ascii').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'element') { inVertex = p[1] === 'vertex'; if (inVertex) n = Number(p[2]); }
    else if (p[0] === 'property' && inVertex) { if (p[1] !== 'float') throw new Error(`unsupported PLY property type ${p[1]}`); props.push(p[2]); }
  }
  const stride = props.length;
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset + end + 11, buf.byteOffset + end + 11 + n * stride * 4));
  const idx = Object.fromEntries(props.map((p, i) => [p, i]));
  for (const f of FIELDS) if (!(f in idx)) throw new Error(`PLY missing ${f}`);
  const c = emptyCloud(n);
  for (let i = 0; i < n; i++) {
    const o = i * stride, g = (f) => data[o + idx[f]];
    c.positions.set([g('x'), g('y'), g('z')], 3 * i);
    c.colors.set([g('f_dc_0'), g('f_dc_1'), g('f_dc_2')], 3 * i);
    c.alphas[i] = g('opacity');
    c.scales.set([g('scale_0'), g('scale_1'), g('scale_2')], 3 * i);
    c.rotations.set([g('rot_1'), g('rot_2'), g('rot_3'), g('rot_0')], 4 * i);
  }
  return c;
}

/** Sort by importance = sigmoid(opacity) x exp(sum of log-scales) (the V15 rule), best first; keep the top `keep`. */
function rank(c, keep) {
  const score = new Float64Array(c.numPoints);
  for (let i = 0; i < c.numPoints; i++) {
    const s = (1 / (1 + Math.exp(-c.alphas[i]))) * Math.exp(c.scales[3 * i] + c.scales[3 * i + 1] + c.scales[3 * i + 2]);
    score[i] = Number.isFinite(s) ? s : -1;
  }
  const order = Array.from(score.keys()).sort((p, q) => score[q] - score[p]).slice(0, Math.min(keep, c.numPoints));
  return subset(c, order);
}
function subset(c, order) {
  const n = order.length, out = emptyCloud(n);
  const pick = (src, dst, k) => { for (let j = 0; j < n; j++) dst.set(src.subarray(order[j] * k, order[j] * k + k), j * k); };
  pick(c.positions, out.positions, 3); pick(c.scales, out.scales, 3); pick(c.rotations, out.rotations, 4); pick(c.alphas, out.alphas, 1); pick(c.colors, out.colors, 3);
  return out;
}
const prefix = (c, n) => subset(c, Array.from({ length: Math.min(n, c.numPoints) }, (_, i) => i));

/**
 * Floor estimate: the dense horizontal layer below the camera. Histograms the height (OpenCV y = down) of opaque
 * splats in front of and below the camera in 2 cm bins, smooths it, and takes the LOWEST strong peak (>= 30% of the
 * strongest), so a tabletop or a wall band does not win over the floor; the peak is refined with a parabola.
 * (SHARP's Gaussians are view-aligned: their thinnest axis points along the camera ray, not the surface normal, so a
 * "flat splats only" filter finds almost nothing. Measured on the 1938 sample: 13 of 132,733 candidates.)
 */
export function estimateFloor(c) {
  const BIN = 0.02, LO = 0.25, HI = 4.0, NB = Math.ceil((HI - LO) / BIN);
  const h = new Float64Array(NB); let used = 0;
  for (let i = 0; i < c.numPoints; i++) {
    const a = 1 / (1 + Math.exp(-c.alphas[i]));
    if (a < 0.3) continue;
    const x = c.positions[3 * i], y = c.positions[3 * i + 1], z = c.positions[3 * i + 2];
    if (!(y > LO && y < HI && z > 0.3 && z < 10 && Math.abs(x) < z * 1.5 + 0.5)) continue;
    h[Math.min(NB - 1, Math.floor((y - LO) / BIN))] += a;
    used++;
  }
  if (used < 500) return { floorY: null, method: 'too-few-splats', used };
  const K = [1, 2, 3, 2, 1];
  const sm = Array.from(h, (_, b) => K.reduce((s, w, j) => s + w * (h[b + j - 2] ?? 0), 0));
  const max = Math.max(...sm);
  let pick = sm.indexOf(max);
  for (let b = 1; b < NB - 1; b++) if (sm[b] >= 0.3 * max && sm[b] >= sm[b - 1] && sm[b] > sm[b + 1] && b > pick) pick = b;
  const l = sm[pick - 1] ?? sm[pick], m = sm[pick], r = sm[pick + 1] ?? sm[pick];
  const den = l - 2 * m + r;
  const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
  const yFloor = LO + (pick + 0.5 + off) * BIN;
  const total = h.reduce((a, b) => a + b, 0);
  const below = h.slice(pick + 3).reduce((a, b) => a + b, 0); // mass more than ~5 cm under the floor (should be small)
  return { floorY: -Math.round(yFloor * 1000) / 1000, method: 'lowest-strong-peak', used, peakRatio: Math.round((m / max) * 100) / 100, belowShare: Math.round((below / total) * 1000) / 1000 };
}

const [mode, ...args] = process.argv.slice(2);
const spz = await createSpzModule();
const CS = spz.CoordinateSystem;
let cloud, outDir, liteCount, inputSplats;
if (mode === 'raw') {
  const [posFile, restFile, dir, lite] = args;
  outDir = dir; liteCount = Number(lite || 250000);
  cloud = await time('read', () => fromRaw(posFile, restFile));
  inputSplats = cloud.numPoints;
} else if (mode === 'ply') {
  const [plyFile, dir, keep, lite] = args;
  outDir = dir; liteCount = Number(lite || 250000);
  const full = await time('read', () => fromPly(plyFile));
  inputSplats = full.numPoints;
  cloud = await time('decimate', () => rank(full, Number(keep || 500000)));
} else {
  console.error('usage: spz.mjs raw <pos.f32> <rest.f16> <outDir> [liteCount] | ply <in.ply> <outDir> [keep] [liteCount]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const lite = prefix(cloud, liteCount);
const main = await time('spz', () => spz.saveSpzToBuffer(cloud, { version: 3, from: CS.UNSPECIFIED, sh1Bits: 5, shRestBits: 4 }));
const liteBuf = await time('spz_lite', () => spz.saveSpzToBuffer(lite, { version: 3, from: CS.UNSPECIFIED, sh1Bits: 5, shRestBits: 4 }));
writeFileSync(path.join(outDir, 'splat.spz'), main);
writeFileSync(path.join(outDir, 'splat-lite.spz'), liteBuf);
const check = await time('verify', () => ({ main: spz.loadSpzFromBuffer(main, { to: CS.UNSPECIFIED }).numPoints, lite: spz.loadSpzFromBuffer(liteBuf, { to: CS.UNSPECIFIED }).numPoints }));
if (check.main !== cloud.numPoints || check.lite !== lite.numPoints) throw new Error(`SPZ round trip mismatch: ${JSON.stringify(check)} vs ${cloud.numPoints}/${lite.numPoints}`);
const floor = await time('floor', () => estimateFloor(cloud));
console.log(JSON.stringify({ ok: true, inputSplats, numSplats: cloud.numPoints, liteSplats: lite.numPoints, bytes: main.length, liteBytes: liteBuf.length,
  roundtrip: check, floor, files: { main: path.join(outDir, 'splat.spz'), lite: path.join(outDir, 'splat-lite.spz') }, ms: t }));
