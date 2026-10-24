import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.worker', 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)));
const state = await new ConvexHttpClient(env.CONVEX_URL).query(api.admin.status, { secret: env.WORKER_SECRET });
if (['bench', 'tree', 'gate', 'photograph'].every(key => state.library.some(row => row.key === key)) && state.assets.includes('photo.sample')) {
  console.log('Original courtyard props and sample photo are available. Existing service flags preserved.');
} else {
  await import('./build-builtin-assets.mjs');
  // Seeding on startup must never change the operator's service flags.
  process.argv.push('--live');
  await import('./seed-builtin.mjs');
}
