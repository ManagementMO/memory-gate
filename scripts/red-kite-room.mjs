// Seed the cached fictional meadow and open a reusable demo room. Never calls World Labs.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const root = new URL('../', import.meta.url);
const file = (name) => new URL(name, root);
const manifest = JSON.parse(readFileSync(file('fixtures/worlds/red-kite.json'), 'utf8'));
const env = Object.fromEntries(readFileSync(file('.env.worker'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()];
}));
if (!env.CONVEX_URL || !env.WORKER_SECRET) throw new Error('Local Convex operator configuration is required; no provider API key is needed.');
if (!manifest.worldId || !manifest.sourceWords) throw new Error('Cached meadow metadata is incomplete. No generation was submitted.');
const client = new ConvexHttpClient(env.CONVEX_URL), secret = env.WORKER_SECRET;
const state = await client.query(api.doctor.seedState, { secret });
const stored = {};
for (const [name, key, type] of [
  ['red-kite-500k.spz', 'world.practice-red-kite', 'application/octet-stream'],
  ['red-kite-100k.spz', 'world.practice-red-kite.lite', 'application/octet-stream'],
  ['red-kite-preview.webp', 'world.practice-red-kite.preview', 'image/webp'],
]) {
  const bytes = readFileSync(file(`fixtures/worlds/${name}`));
  const digest = createHash('sha256').update(bytes);
  if (digest.copy().digest('hex') !== manifest.files[name]?.sha256) throw new Error(`Cached meadow hash mismatch: ${name}`);
  const prior = state.assets.find(a => a.key === key);
  let fileId = prior?.file?.sha256 === digest.digest('base64') ? prior.fileId : null;
  if (!fileId) {
    const url = await client.mutation(api.admin.uploadUrl, { secret });
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: bytes, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Cached meadow upload failed: HTTP ${response.status}`);
    fileId = (await response.json()).storageId;
  }
  stored[name] = fileId;
  if (key !== 'world.practice-red-kite') await client.mutation(api.admin.upsertAsset, { secret, key, fileId, meta: { source: manifest.label } });
}
await client.mutation(api.admin.upsertAsset, { secret, key: 'world.practice-red-kite', fileId: stored['red-kite-500k.spz'], meta: {
  ...manifest, liteFileId: stored['red-kite-100k.spz'], previewFileId: stored['red-kite-preview.webp'],
  bytes: manifest.files['red-kite-500k.spz'].bytes + manifest.files['red-kite-100k.spz'].bytes,
} });

const checkpoint = file('.logs/red-kite-demo-room.json');
mkdirSync(file('.logs'), { recursive: true });
let room = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')) : null;
if (!room) {
  const auth = await client.mutation(api.rooms.create, { title: 'The Red Kite · fictional childhood story', displayName: 'Scene curator', demo: true });
  room = { ...auth, createdAt: new Date().toISOString(), kind: 'fictional cached-world rehearsal' };
  writeFileSync(checkpoint, JSON.stringify(room, null, 2), { mode: 0o600 });
}
const auth = { code: room.code, token: room.token };
const before = await client.query(api.rooms.get, auth);
if (!before.consents.some(c => c.scopes.includes('share_with_family'))) {
  await client.mutation(api.consents.give, { ...auth, scopes: ['share_with_family'] });
}
const selected = await client.mutation(api.splats.usePracticeWorld, { ...auth, setting: 'red-kite' });
const view = await client.query(api.rooms.get, auth);
room.joinKey = view.joinKey;
room.splatId = selected.splatId;
writeFileSync(checkpoint, JSON.stringify(room, null, 2), { mode: 0o600 });
chmodSync(checkpoint, 0o600);
console.log(JSON.stringify({ code: room.code, reused: selected.reused, source: 'Cached World Labs meadow; fictional sample setting',
  spectator: `https://localhost:4173/?room=${room.code}&view=spectator&drift=0`,
  managedSpectator: `https://localhost:8081/?room=${room.code}&view=spectator&drift=0`,
  privateSession: '.logs/red-kite-demo-room.json',
  note: 'No generation credits used. No live service flags changed. The separate 3D kite assets and story integration are still a teammate task.' }, null, 2));
