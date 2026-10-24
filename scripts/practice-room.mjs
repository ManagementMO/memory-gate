// Explicit sample fixture, never a claim about a real family. Provider keys stay in the backend.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.worker','utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0,2)));
const client = new ConvexHttpClient(env.CONVEX_URL);
const room = await client.mutation(api.rooms.create, { title: 'The courtyard we remember · illustrative practice', displayName: 'Ana (sample family)', demo: true });
await client.mutation(api.consents.give, { code: room.code, token: room.token, scopes: ['photo_processing', 'voice_processing', 'voice_recording', 'share_with_family'] });
await client.mutation(api.objects.practiceCourtyard, { code: room.code, token: room.token, commandId: crypto.randomUUID() });
const view = await client.query(api.rooms.get, { code: room.code, token: room.token });
const saved = { ...room, key: view.joinKey, url: env.CONVEX_URL, createdAt: new Date().toISOString() };
mkdirSync('.logs', { recursive: true });
writeFileSync('.logs/practice-room.json', JSON.stringify(saved, null, 2), { mode: 0o600 });
writeFileSync('apps/headset/.test-room.json', JSON.stringify(saved, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ code: room.code,
  phone: `https://localhost:5174/?room=${room.code}&key=${view.joinKey}`,
  headset: `https://localhost:8081/?room=${room.code}&key=${view.joinKey}`,
  spectator: `https://localhost:8081/?room=${room.code}&view=spectator&drift=0`,
  note: 'Fictional sample props, independent of any photo. Say or type: Move the bench beside the tree, facing the gate.' }, null, 2));
