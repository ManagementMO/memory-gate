// One explicitly authorized World Labs submission. Repeated runs recover the same source/job.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const transcript = 'Our courtyard had pale limestone walls, deep green shutters and a wooden pergola covered in grape vines. Warm afternoon light fell across the worn stone paving. We would sit together in that quiet open space and talk while the birds sang.';
const checkpoint = '.logs/story-world-demo.json';
const room = JSON.parse(readFileSync('.logs/practice-room.json', 'utf8'));
const env = Object.fromEntries(readFileSync('.env.worker', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(env.CONVEX_URL);
let saved = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')) : null;
if (saved && saved.code !== room.code) throw new Error('The saved story world belongs to a different practice room. Reopen it deliberately; do not submit another world.');

if (!saved && !process.argv.includes('--generate')) {
  console.log(JSON.stringify({ action: 'No generation submitted', transcript,
    next: 'Run npm run demo:world -- --generate only after authorizing a funded World Labs submission (estimated 1,580 credits).',
    note: 'This is a fictional demo source. A real participant can request a place from their own words in the family tools.' }, null, 2));
  process.exit(0);
}

const auth = { code: room.code, token: room.token };
if (!saved) {
  const status = await client.query(api.admin.status, { secret: env.WORKER_SECRET });
  if (status.worldGenerationUsage >= status.worldGenerationLimit) throw new Error('The configured World Labs submission cap is exhausted; no paid request was sent.');
  await client.mutation(api.consents.give, { ...auth, scopes: ['vendor_upload_worldlabs'] });
  const source = await client.mutation(api.utterances.add, { ...auth, transcript, source: 'fixture', commandId: 'photoreal-courtyard-source-v1' });
  saved = { code: room.code, sourceUtteranceId: source.utteranceId, transcript, kind: 'fictional sample words, not a real family history', createdAt: new Date().toISOString() };
  writeFileSync(checkpoint, JSON.stringify(saved, null, 2), { mode: 0o600 });
}

if (!saved.splatId && process.argv.includes('--generate')) {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const lines = await client.query(api.utterances.recent, auth);
    const source = lines.find(u => u.id === saved.sourceUtteranceId);
    if (source?.status === 'done') { ready = true; break; }
    if (source?.status === 'failed') throw new Error('The source could not be processed. No World Labs request was sent.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('The source is still processing. Rerun with --generate to reuse this exact source.');
  const world = await client.mutation(api.splats.fromStory, { ...auth, utteranceId: saved.sourceUtteranceId });
  saved.splatId = world.splatId;
  writeFileSync(checkpoint, JSON.stringify(saved, null, 2), { mode: 0o600 });
}
const view = await client.query(api.rooms.get, auth);
const world = view.recentSplats.find(s => s.id === saved.splatId);
console.log(JSON.stringify({ code: room.code, source: saved.kind, status: world?.status ?? 'source saved',
  error: world?.error ?? null, active: view.splat?.id === saved.splatId,
  spectator: `https://localhost:4173/?room=${room.code}&view=spectator&drift=0`,
  note: 'The world waits for family review. Reopening and quality changes never submit another generation.' }, null, 2));
