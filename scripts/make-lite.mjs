// Write the 250k "lite" SPZ for the prebaked sample room (flag splat.lite, the Quest frame-rate fallback):
// keep the top splats by importance = sigmoid(opacity) x exp(sum of log-scales), the same rule as the worker (V15).
// Usage: node scripts/make-lite.mjs [in.spz] [out.spz] [count]
import { readFileSync, writeFileSync } from 'node:fs';
import createSpzModule from '../worker/node_modules/@adobe/spz/dist/spz.js';
const [inFile = 'fixtures/large/sample-sharp-500k.spz', outFile = 'fixtures/large/sample-sharp-250k.spz', count = '250000'] = process.argv.slice(2);
const spz = await createSpzModule();
const CS = spz.CoordinateSystem;
const c = spz.loadSpzFromBuffer(new Uint8Array(readFileSync(inFile)), { to: CS.UNSPECIFIED });
const keep = Math.min(Number(count), c.numPoints);
const score = new Float64Array(c.numPoints);
for (let i = 0; i < c.numPoints; i++) {
  const s = (1 / (1 + Math.exp(-c.alphas[i]))) * Math.exp(c.scales[3 * i] + c.scales[3 * i + 1] + c.scales[3 * i + 2]);
  score[i] = Number.isFinite(s) ? s : -1;
}
const order = Array.from(score.keys()).sort((p, q) => score[q] - score[p]).slice(0, keep);
const pick = (src, k) => { const dst = new Float32Array(keep * k); for (let j = 0; j < keep; j++) dst.set(src.subarray(order[j] * k, order[j] * k + k), j * k); return dst; };
const lite = { ...c, numPoints: keep, positions: pick(c.positions, 3), scales: pick(c.scales, 3), rotations: pick(c.rotations, 4), alphas: pick(c.alphas, 1), colors: pick(c.colors, 3), sh: new Float32Array(0), shDegree: 0 };
const buf = spz.saveSpzToBuffer(lite, { version: 3, from: CS.UNSPECIFIED, sh1Bits: 5, shRestBits: 4 });
writeFileSync(outFile, buf);
const back = spz.loadSpzFromBuffer(buf, { to: CS.UNSPECIFIED });
console.log(JSON.stringify({ in: c.numPoints, out: back.numPoints, bytes: buf.length, shDegree: c.shDegree }));
