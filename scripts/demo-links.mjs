// Reopen a prepared room without resetting it, spending credits, or printing a member/provider token.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.worker', 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(env.CONVEX_URL);
const files = process.argv.includes('--illustrative') ? ['.logs/practice-room.json']
  : ['.logs/courtyard-world-room.json', '.logs/practice-room.json'];
for (const file of files) {
  if (!existsSync(file)) continue;
  const s = JSON.parse(readFileSync(file, 'utf8'));
  let view; try { view = await client.query(api.rooms.get, { code: s.code, token: s.token }); } catch { continue; }
  const key = view.joinKey ?? s.key;
  const ip = ['en0', 'en1', ...Object.keys(os.networkInterfaces())].flatMap(name => os.networkInterfaces()[name] ?? [])
    .find(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))?.address ?? 'localhost';
  const query = `room=${s.code}&key=${key}`;
  console.log(JSON.stringify({ room: s.code, title: view.room.title, scenery: view.splat?.source ?? 'illustrative courtyard',
    laptopPhone: `https://localhost:5174/?${query}`, phoneOnWifi: `https://${ip}:5174/?${query}`,
    questOnWifi: `https://${ip}:4173/?${query}`, spectator: `https://localhost:4173/?room=${s.code}&view=spectator&drift=0`,
    managedDevelopment: `https://localhost:8081/?${query}`,
    note: 'Family links carry the room key. Share only with participants; no new room or provider job was created.' }, null, 2));
  process.exit(0);
}
throw new Error('No reachable prepared room. Start the stack and run npm run demo:room.');
