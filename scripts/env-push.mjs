// Push provider keys from the ignored local config into the LOCAL Convex deployment's environment (never printed),
// and create the worker secret shared by the backend, the seed script and the GPU worker (.env.worker, gitignored).
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const AUTH = process.env.MEMORY_GATE_ENV || process.env.MEMGATE_AUTH_FILE || 'auth/memory-gate.env';
const env = existsSync(AUTH) ? Object.fromEntries(readFileSync(AUTH, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })) : {};
if (!existsSync(AUTH)) console.log('No private provider file supplied. Preparing local fixture mode; no paid API calls.');
if (env.WORLDLABS_API_KEY && !env.WORLD_LABS_API_KEY) env.WORLD_LABS_API_KEY = env.WORLDLABS_API_KEY;
let worker = existsSync('.env.worker') ? Object.fromEntries(readFileSync('.env.worker', 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))) : {};
if (!worker.WORKER_SECRET) worker.WORKER_SECRET = randomBytes(24).toString('hex');
// The operator code gates the deployment-global live-service flags on the phone's admin screen (not a provider key).
if (!worker.ADMIN_CODE) worker.ADMIN_CODE = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
const local = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
worker.CONVEX_URL = local.CONVEX_URL;
writeFileSync('.env.worker', Object.entries(worker).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
chmodSync('.env.worker', 0o600);
if (env.WORLD_LABS_GENERATION_LIMIT && !/^(?:0|[1-9]\d{0,2}|1000)$/.test(env.WORLD_LABS_GENERATION_LIMIT)) throw new Error('WORLD_LABS_GENERATION_LIMIT must be a whole number from 0 to 1000.');
const push = { ...Object.fromEntries(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', 'CARTESIA_API_KEY', 'TRIPO_API_KEY', 'WORLD_LABS_API_KEY', 'WORLD_LABS_GENERATION_LIMIT'].filter((k) => env[k]).map((k) => [k, env[k]])), WORKER_SECRET: worker.WORKER_SECRET, ADMIN_CODE: worker.ADMIN_CODE };
let failed = false;
for (const [k, v] of Object.entries(push)) {
  const r = spawnSync('npx', ['convex', 'env', 'set', k, v], { encoding: 'utf8' });
  console.log(`${r.status === 0 ? 'SET ' : 'FAIL'} ${k}${r.status === 0 ? '' : ' ' + (r.stderr || '').split(v).join('<redacted>').slice(0, 160)}`);
  if (r.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
