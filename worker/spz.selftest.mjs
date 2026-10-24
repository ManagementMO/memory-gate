// Offline self-test of the worker's local step (no GPU, no network): writes a synthetic splat room in the exact raw
// format the Modal container returns (float32 xyz + float16 attributes, best first), runs `node worker/spz.mjs raw`
// like the worker does, and checks counts, the lite prefix, the read-back and the floor estimate.
// Room: floor 1.30 m below the camera (OpenCV y down, 35% of splats), a tabletop at 0.75 m (45%, the densest layer,
// so picking the strongest peak would fail) and a back wall at z = 4 m (20%).
// Usage: node worker/spz.selftest.mjs        (exit 0 = pass)
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = 60000, LITE = 20000, FLOOR = 1.3;
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pos = new Float32Array(3 * N), rest = new Float16Array(11 * N);
for (let i = 0; i < N; i++) {
  const kind = i % 20 < 7 ? 'floor' : i % 20 < 16 ? 'table' : 'wall'; // the tabletop is the DENSEST layer (45%)
  let x, y, z;
  if (kind === 'floor') { z = 0.8 + rnd() * 3.2; x = (rnd() - 0.5) * 2 * z * 0.6; y = FLOOR + (rnd() - 0.5) * 0.03; }
  else if (kind === 'table') { z = 2 + rnd() * 0.8; x = -0.4 + rnd() * 0.8; y = 0.75 + (rnd() - 0.5) * 0.02; }
  else { z = 4 + (rnd() - 0.5) * 0.02; x = (rnd() - 0.5) * 4; y = -1.2 + rnd() * (FLOOR + 1.2); }
  pos.set([x, y, z], 3 * i);
  const o = 11 * i;
  rest.set([0.2, 0.1, -0.1, 2.0 + rnd(), -4.5, -4.5, -6, 1, 0, 0, 0], o); // f_dc, opacity logit, log-scales, rot w x y z
}
const dir = mkdtempSync(path.join(os.tmpdir(), 'spz-selftest-'));
try {
  writeFileSync(path.join(dir, 'pos.f32'), Buffer.from(pos.buffer));
  writeFileSync(path.join(dir, 'rest.f16'), Buffer.from(rest.buffer));
  const out = execFileSync('node', [path.join(HERE, 'spz.mjs'), 'raw', path.join(dir, 'pos.f32'), path.join(dir, 'rest.f16'), dir, String(LITE)], { encoding: 'utf8' });
  const r = JSON.parse(out.split('\n').filter((l) => l.startsWith('{')).pop());
  const checks = {
    counts: r.numSplats === N && r.liteSplats === LITE,
    roundtrip: r.roundtrip.main === N && r.roundtrip.lite === LITE,
    liteSmaller: r.liteBytes < r.bytes,
    floor: r.floor.floorY !== null && Math.abs(r.floor.floorY + FLOOR) < 0.03, // within 3 cm, and the table did not win
  };
  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks, floorY: r.floor.floorY, expected: -FLOOR, bytes: r.bytes, liteBytes: r.liteBytes, ms: r.ms }));
  process.exit(ok ? 0 : 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
