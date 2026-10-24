// Enables only successfully authenticated services. No generation request is made by this command.
import { existsSync, readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.worker','utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0,2)));
const client = new ConvexHttpClient(env.CONVEX_URL), secret = env.WORKER_SECRET;
const result = await client.action(api.doctor.providers, { secret });
const ready = name => result.rows.some(row => row.name.startsWith(name) && row.status === 'PASS');
// Photo to 3D (SHARP on Modal) runs in the local worker, not the backend, so it is on when Modal tokens are present.
const authPath = process.env.MEMORY_GATE_ENV ?? 'auth/memory-gate.env';
const auth = existsSync(authPath) ? readFileSync(authPath, 'utf8') : '';
const modal = /^MODAL_TOKEN_ID=\S+/m.test(auth) && /^MODAL_TOKEN_SECRET=\S+/m.test(auth);
const values = { 'ai.live': ready('anthropic'), 'stt.live': ready('cartesia'), 'tts.live': ready('cartesia'), 'worldlabs.generate': ready('worldlabs'), 'splat.live': modal };
await client.mutation(api.admin.setFlags, { secret, values });
for (const [name, enabled] of Object.entries(values)) {
  if (name === 'splat.live') console.log(`splat.live: ${enabled ? 'enabled (Modal tokens found; start the GPU worker with worker/start.sh --prewarm)' : 'off (add MODAL_TOKEN_ID and MODAL_TOKEN_SECRET to auth/memory-gate.env)'}`);
  else console.log(`${name}: ${enabled ? 'enabled after account check' : 'off (no authenticated service)'}`);
}
