// Golden path, phone side (practice verification 04:40): create a room as the family, consent to everything,
// upload a NEW photo, and time photo -> SHARP splat ready via the GPU worker. Saves .test-room.json for shoot.mjs.
// Usage: node scripts/golden-room.mjs <photo.jpg> ["<credit>"] ["<room title>"]
import { readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
const root = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env.local', root), 'utf8').match(/^CONVEX_URL=(.+)$/m)[1].trim();
const c = new ConvexHttpClient(url);
const [photo, credit] = [process.argv[2], process.argv[3] ?? 'Library of Congress FSA/OWI (no known restrictions)'];
const title = process.argv[4] ?? (photo.includes('1938') ? 'The living room, 1938 (sample)' : 'A living room, 1934 (sample)');
const { code, token } = await c.mutation(api.rooms.create, { title, displayName: 'Ana (sample family)', demo: true });
await c.mutation(api.consents.give, { code, token, scopes: ['photo_processing', 'voice_processing', 'voice_recording', 'vendor_upload_modal', 'vendor_upload_worldlabs', 'share_with_family'] });
const bytes = readFileSync(photo);
const t0 = Date.now();
const upload = await c.mutation(api.splats.generatePhotoUploadUrl, { code, token });
const r = await fetch(upload, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: bytes });
const { storageId } = await r.json();
const added = await c.mutation(api.splats.addPhoto, { code, token, fileId: storageId, width: 0, height: 0, tone: 'mono', credit });
console.log('photo uploaded; live splat job =', added.live);
for (;;) {
  const v = await c.query(api.rooms.get, { code, token });
  const s = v.recentSplats[0];
  if (s && (s.status === 'ready' || s.status === 'failed')) { console.log(JSON.stringify({ code, status: s.status, source: s.source, error: s.error, photoToReadyMs: Date.now() - t0, active: v.splat?.source, numSplats: v.splat?.numSplats, floorY: v.splat?.floorY })); break; }
  if (Date.now() - t0 > 200000) { console.log('timeout'); break; }
  await new Promise((res) => setTimeout(res, 500));
}
const key = (await c.query(api.rooms.get, { code, token })).joinKey ?? null;
writeFileSync(new URL('../.test-room.json', import.meta.url), JSON.stringify({ code, token, key, url, createdAt: new Date().toISOString() }, null, 2));
const jobs = await c.query(api.splats.jobs, { code, token });
console.log('jobs:', JSON.stringify(jobs.map((j) => ({ kind: j.kind, status: j.status, ms: j.ms }))));
