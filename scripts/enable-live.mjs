// Enables only successfully authenticated services. No generation request is made by this command.
import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.worker','utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0,2)));
const client = new ConvexHttpClient(env.CONVEX_URL), secret = env.WORKER_SECRET;
const result = await client.action(api.doctor.providers, { secret });
const ready = name => result.rows.some(row => row.name.startsWith(name) && row.status === 'PASS');
const values = { 'ai.live': ready('anthropic'), 'stt.live': ready('cartesia'), 'tts.live': ready('cartesia'), 'worldlabs.generate': ready('worldlabs') };
await client.mutation(api.admin.setFlags, { secret, values });
for (const [name, enabled] of Object.entries(values)) console.log(`${name}: ${enabled ? 'enabled after account check' : 'off (no authenticated service)'}`);
