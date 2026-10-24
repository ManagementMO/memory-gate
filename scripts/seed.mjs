// Seed the local deployment: the object library (shrunken GLBs, V25), the prebaked sample splats and photo, and the
// demo flags. Needs .env.worker (from `npm run env:push`). Sample content only: public-domain LoC FSA/OWI photos;
// 3 CC0 Poly Haven models + 9 Tripo v3.1 models (4 from prep, 5 from the practice build, 2026-10-23). Sources,
// prompts, task ids and licenses: fixtures/LICENSES.md.
// size = largest real-world dimension in meters. yawOffset turns the model so its front faces +Z (rotation.y), and
// every value was checked by rendering: `node fixtures/library/views.mjs` -> evidence/library/<key>.png. Each GLB
// must be <= 1.5 MB (gltf-transform optimize, webp 1024); the rug has a baked lie-flat node (fixtures/library/orient.mjs).
// Idempotent: rows are upserted by key, and a file whose sha256 matches the stored one is NOT re-uploaded. (A new
// upload makes admin.upsert* delete the old file, and existing rooms still point at it from splat/object rows.)
// Usage: npm run seed -- [--mocks]   (--mocks turns every live flag off)
import { readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
if (!existsSync('fixtures/large/piano.glb') || !existsSync('fixtures/large/sample-sharp-500k.spz')) {
  console.log('Original machine-specific demo assets are absent. Seeding the portable original-geometry library instead.');
  await import('./build-builtin-assets.mjs');
  await import('./seed-builtin.mjs');
  process.exit(0);
}
const w = Object.fromEntries(readFileSync('.env.worker', 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(w.CONVEX_URL);
const secret = w.WORKER_SECRET;
const state = await client.query(api.doctor.seedState, { secret });
const counts = { uploaded: 0, reused: 0 };
/** Upload a file unless the stored file for this row already has the same sha256; returns the storage id. */
async function ensureFile(path, type, existing) {
  const buf = readFileSync(path);
  if (existing?.file && existing.file.sha256 === createHash('sha256').update(buf).digest('base64')) { counts.reused++; return existing.fileId; }
  const url = await client.mutation(api.admin.uploadUrl, { secret });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: buf });
  if (!r.ok) throw new Error(`upload ${path}: ${r.status}`);
  counts.uploaded++;
  return (await r.json()).storageId;
}
const libRow = (key) => state.library.find((l) => l.key === key);
const assetRow = (key) => state.assets.find((a) => a.key === key);
const LIBRARY = [
  { key: 'piano', synonyms: ['upright piano', 'old piano'], file: 'fixtures/large/piano.glb', size: 1.45, yawOffset: -Math.PI / 2, source: 'tripo', credit: 'Generated with Tripo v3.1 (prep, 2026-10-23)' },
  { key: 'armchair', synonyms: ['arm chair', 'easy chair', 'reading chair', 'big chair'], file: 'fixtures/large/armchair.glb', size: 0.95, yawOffset: -Math.PI / 2, source: 'tripo', credit: 'Generated with Tripo v3.1 (prep, 2026-10-23)' },
  { key: 'radio', synonyms: ['wireless', 'wooden radio', 'old radio'], file: 'fixtures/large/radio.glb', size: 0.42, yawOffset: -Math.PI / 2, source: 'tripo', credit: 'Generated with Tripo v3.1 (prep, 2026-10-23)' },
  { key: 'bowl of oranges', synonyms: ['oranges', 'orange', 'bowl', 'fruit bowl', 'bowl of fruit', 'fruit'], file: 'fixtures/large/oranges.glb', size: 0.3, yawOffset: 0, source: 'tripo', credit: 'Generated with Tripo v3.1 (prep, 2026-10-23)' },
  { key: 'chair', synonyms: ['side chair', 'wooden chair', 'kitchen chair', 'painted chair', 'dining chair'], file: 'fixtures/large/chair-ph.glb', size: 0.96, yawOffset: 0, source: 'cc0', credit: 'Painted Wooden Chair 01 by Kuutti Siitonen, Poly Haven (CC0)' },
  { key: 'lamp', synonyms: ['table lamp', 'reading lamp', 'old lamp', 'lampshade', 'lamp shade'], file: 'fixtures/large/lamp.glb', size: 0.55, yawOffset: 0, source: 'tripo', credit: 'Generated with Tripo v3.1 (practice build, 2026-10-23)' },
  { key: 'clock', synonyms: ['mantel clock', 'mantelpiece clock', 'old clock', 'wooden clock', 'chiming clock'], file: 'fixtures/large/clock-ph.glb', size: 0.48, yawOffset: 0, source: 'cc0', credit: 'Mantel Clock 01 by Rico Cilliers (model, textures) and Yann Kervran (rig), Poly Haven (CC0)' },
  { key: 'sewing machine', synonyms: ['treadle sewing machine', 'old sewing machine', 'singer sewing machine', 'singer machine', 'treadle', 'sewing table'], file: 'fixtures/large/sewing-machine.glb', size: 1.0, yawOffset: -Math.PI / 2, source: 'tripo', credit: 'Generated with Tripo v3.1 (practice build, 2026-10-23)' },
  { key: 'rug', synonyms: ['carpet', 'rag rug', 'woven rug', 'braided rug', 'hearth rug', 'area rug', 'old rug'], file: 'fixtures/large/rug.glb', size: 1.8, yawOffset: 0, source: 'tripo', credit: 'Generated with Tripo v3.1 (practice build, 2026-10-23)' },
  { key: 'vase with flowers', synonyms: ['vase of flowers', 'flowers in a vase', 'flower vase', 'vase', 'flowers', 'flower', 'bouquet', 'bunch of flowers'], file: 'fixtures/large/vase-with-flowers.glb', size: 0.5, yawOffset: 0, source: 'tripo', credit: 'Generated with Tripo v3.1 (practice build, 2026-10-23)' },
  { key: 'teapot', synonyms: ['tea pot', 'china teapot', 'porcelain teapot', 'pot of tea'], file: 'fixtures/large/teapot.glb', size: 0.25, yawOffset: -Math.PI / 2, source: 'tripo', credit: 'Generated with Tripo v3.1 (practice build, 2026-10-23)' },
  { key: 'rocking chair', synonyms: ['rocker', 'rocking-chair', 'old rocking chair', 'wooden rocking chair'], file: 'fixtures/large/rocking-chair-ph.glb', size: 1.0, yawOffset: 0, source: 'cc0', credit: 'Rockingchair 01 by Jorge Camacho, Poly Haven (CC0)' },
];
const MAX_GLB_BYTES = 1.5e6; // CLAUDE.md: GLBs <= 1.5 MB (Convex free-plan egress + Quest memory)
const tooBig = LIBRARY.map((l) => ({ file: l.file, bytes: statSync(l.file).size })).filter((f) => f.bytes > MAX_GLB_BYTES);
if (tooBig.length) {
  console.error(`seed: GLB over 1.5 MB, shrink it first (gltf-transform optimize --texture-compress webp --texture-size 1024):\n${tooBig.map((f) => `  ${f.file} ${(f.bytes / 1e6).toFixed(2)} MB`).join('\n')}`);
  process.exit(1);
}
for (const l of LIBRARY) {
  const fileId = await ensureFile(l.file, 'model/gltf-binary', libRow(l.key));
  await client.mutation(api.admin.upsertLibrary, { secret, key: l.key, synonyms: l.synonyms, fileId, size: l.size, yawOffset: l.yawOffset, source: l.source, credit: l.credit });
  console.log('library', l.key);
}
const sharp = await ensureFile('fixtures/large/sample-sharp-500k.spz', 'application/octet-stream', assetRow('splat.sample'));
const sharpLite = await ensureFile('fixtures/large/sample-sharp-250k.spz', 'application/octet-stream', assetRow('splat.sample.lite')); // node scripts/make-lite.mjs
await client.mutation(api.admin.upsertAsset, { secret, key: 'splat.sample.lite', fileId: sharpLite, meta: { numSplats: 250000 } });
await client.mutation(api.admin.upsertAsset, { secret, key: 'splat.sample', fileId: sharp, meta: { numSplats: 500000, liteFileId: sharpLite, bytes: readFileSync('fixtures/large/sample-sharp-500k.spz').length, floorY: -1.19, scale: 1, source: 'sharp', credit: 'SHARP (Apple, research license) on the public-domain 1938 LoC FSA/OWI photo' } });
const wl = await ensureFile('fixtures/large/sample-worldlabs-500k.spz', 'application/octet-stream', assetRow('splat.worldlabs'));
await client.mutation(api.admin.upsertAsset, { secret, key: 'splat.worldlabs', fileId: wl, meta: { numSplats: 497664, floorY: -2.37, scale: 0.64, source: 'worldlabs' } });
const photo = await ensureFile('fixtures/sample-photo-1938.jpg', 'image/jpeg', assetRow('photo.sample'));
await client.mutation(api.admin.upsertAsset, { secret, key: 'photo.sample', fileId: photo, meta: { credit: 'Library of Congress, FSA/OWI collection, 1938 (no known restrictions)' } });
const live = process.argv.includes('--mocks') ? false : true;
await client.mutation(api.admin.setFlags, { secret, values: { 'splat.live': live, 'objects.live': live, 'ai.live': live, 'stt.live': live, 'tts.live': live, 'worldlabs.backdrop': false, 'splat.lite': false } });
console.log('flags live =', live, '| files uploaded', counts.uploaded, 'reused', counts.reused);
console.log(JSON.stringify(await client.query(api.admin.status, { secret })));
