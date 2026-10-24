// Load the checked-in fictional World Labs courtyard. No provider key or generation call is used.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const root = new URL('../fixtures/worlds/', import.meta.url);
if (!existsSync(new URL('courtyard.json', root))) throw new Error('The prepared courtyard pack is absent. No generation was submitted.');
const manifest = JSON.parse(readFileSync(new URL('courtyard.json', root), 'utf8'));
const env = Object.fromEntries(readFileSync('.env.worker', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(env.CONVEX_URL), secret = env.WORKER_SECRET;
const state = await client.query(api.doctor.seedState, { secret });
const files = [
  ['courtyard-500k.spz', 'world.practice-courtyard', 'application/octet-stream'],
  ['courtyard-100k.spz', 'world.practice-courtyard.lite', 'application/octet-stream'],
  ['courtyard-preview.webp', 'world.practice-courtyard.preview', 'image/webp'],
];
const stored = {};
for (const [name, key, type] of files) {
  const bytes = readFileSync(new URL(name, root));
  const hash = createHash('sha256').update(bytes);
  if (hash.copy().digest('hex') !== manifest.files[name].sha256) throw new Error(`Cached courtyard integrity check failed: ${name}`);
  const prior = state.assets.find(a => a.key === key);
  let fileId = prior?.file?.sha256 === hash.digest('base64') ? prior.fileId : null;
  if (!fileId) {
    const url = await client.mutation(api.admin.uploadUrl, { secret });
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: bytes });
    if (!response.ok) throw new Error(`Cached courtyard upload failed: HTTP ${response.status}`);
    fileId = (await response.json()).storageId;
  }
  stored[name] = fileId;
  if (key !== 'world.practice-courtyard') await client.mutation(api.admin.upsertAsset, { secret, key, fileId, meta: { source: manifest.kind } });
}
await client.mutation(api.admin.upsertAsset, { secret, key: 'world.practice-courtyard', fileId: stored['courtyard-500k.spz'], meta: {
  ...manifest, liteFileId: stored['courtyard-100k.spz'], previewFileId: stored['courtyard-preview.webp'],
  bytes: manifest.files['courtyard-500k.spz'].bytes + manifest.files['courtyard-100k.spz'].bytes,
} });
console.log('Cached fictional World Labs courtyard seeded and hashes verified. No generation credits used.');
