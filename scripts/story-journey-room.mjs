// A repeatable empty stage for a live story. Uses the prepared world; never generates or resets a memory.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const file = '.logs/story-journey-room.json';
const env = Object.fromEntries(readFileSync('.env.worker', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(env.CONVEX_URL);
let saved = existsSync(file) && !process.argv.includes('--new') ? JSON.parse(readFileSync(file, 'utf8')) : null;
if (saved) { try { await client.query(api.rooms.get, { code: saved.code, token: saved.token }); } catch { saved = null; } }
if (!saved) {
  const room = await client.mutation(api.rooms.create, { title: 'The courtyard · a story taking shape', displayName: 'Demo family (fictional)', demo: true });
  await client.mutation(api.consents.give, { ...room, scopes: ['voice_processing', 'voice_recording', 'share_with_family'] });
  await client.mutation(api.splats.usePracticeWorld, room);
  const view = await client.query(api.rooms.get, room);
  saved = { ...room, key: view.joinKey, url: env.CONVEX_URL, createdAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
}
console.log(JSON.stringify({ code: saved.code, phone: `https://localhost:5174/?room=${saved.code}&key=${saved.key}`,
  spectator: `https://localhost:4173/?room=${saved.code}&view=spectator&drift=0`,
  trySaying: 'There was a wooden bench. We used to sit there together after lunch.',
  next: 'Confirm the golden suggestion, then select the bench to hear its original recorded words. Pause whenever you like.',
  note: 'Fictional sample setting. World Labs is already cached; this command uses no generation credits. --new explicitly makes another empty sample room.' }, null, 2));
