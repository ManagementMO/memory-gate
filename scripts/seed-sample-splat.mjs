// Upload only the sample SHARP splat of the public-domain 1938 photo (and its 250k lite variant) as the
// 'splat.sample' asset, without the optional legacy sample pack. Used to demo the photo → SHARP path before the
// Modal worker is deployed.   node scripts/seed-sample-splat.mjs
import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.worker', 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
const c = new ConvexHttpClient(env.CONVEX_URL);
const secret = env.WORKER_SECRET;
async function upload(path) {
  const url = await c.mutation(api.admin.uploadUrl, { secret });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: readFileSync(path) });
  if (!r.ok) throw new Error(`upload ${path}: ${r.status}`);
  return (await r.json()).storageId;
}
const lite = await upload('fixtures/large/sample-sharp-250k.spz');
const full = await upload('fixtures/large/sample-sharp-500k.spz');
await c.mutation(api.admin.upsertAsset, { secret, key: 'splat.sample.lite', fileId: lite, meta: { numSplats: 250000 } });
await c.mutation(api.admin.upsertAsset, { secret, key: 'splat.sample', fileId: full, meta: { numSplats: 500000, liteFileId: lite, bytes: readFileSync('fixtures/large/sample-sharp-500k.spz').length, floorY: -1.19, scale: 1, source: 'sharp', credit: 'SHARP (Apple, research license) on the public-domain 1938 LoC FSA/OWI photo' } });
console.log('seeded splat.sample (500k) and splat.sample.lite (250k)');
