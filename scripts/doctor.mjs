// npm run doctor: health-check the backend, the seeded demo content, the GPU worker and every provider before a demo.
// Prints one table of PASS / WARN / FAIL / SKIP with latency; never prints keys, tokens or the worker secret.
// Provider checks run INSIDE Convex (convex/doctor.ts) with the deployment's own env keys. Exit 1 on any FAIL.
// Options: --modal  also check the Modal token and look for running Memory Gate apps (local CLI, ~2 s)
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const add = (group, name, status, detail = '', ms = null) => rows.push({ group, name, status, detail: String(detail).slice(0, 110), ms });
const time = async (fn) => { const t0 = performance.now(); const r = await fn(); return [r, Math.round(performance.now() - t0)]; };
const readEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));

// ---------- local runtime ----------
const major = Number(process.versions.node.split('.')[0]);
add('local', 'node', major >= 20 ? 'PASS' : 'FAIL', `${process.version}${major >= 20 ? '' : ' (need >= 20)'}`);
const workerEnvFile = path.join(REPO, '.env.worker');
const w = existsSync(workerEnvFile) ? readEnv(workerEnvFile) : {};
if (!w.CONVEX_URL || !w.WORKER_SECRET) add('local', '.env.worker', 'FAIL', 'missing CONVEX_URL or WORKER_SECRET (run npm run env:push)');
else add('local', '.env.worker', 'PASS', `CONVEX_URL ${w.CONVEX_URL}, WORKER_SECRET set`);

// ---------- backend ----------
let status = null;
if (w.CONVEX_URL && w.WORKER_SECRET) {
  const client = new ConvexHttpClient(w.CONVEX_URL);
  try {
    const [s, ms] = await time(() => client.query(api.admin.status, { secret: w.WORKER_SECRET }));
    status = s;
    add('backend', 'convex reachable (admin.status)', 'PASS', `${s.rooms} rooms`, ms);
  } catch (e) {
    add('backend', 'convex reachable (admin.status)', 'FAIL', /fetch failed|ECONNREFUSED/.test(String(e)) ? `no backend at ${w.CONVEX_URL}` : String(e.message || e).split('\n')[0]);
  }
  if (status) {
    const flags = Object.fromEntries(status.flags.map((f) => f.split('=')).map(([k, v]) => [k, v === 'true']));
    const on = Object.entries(flags).filter(([, v]) => v).map(([k]) => k);
    add('backend', 'flags', 'PASS', on.length ? `on: ${on.join(', ')}` : 'all off (mock/fixture mode)');
    if (status.worldGenerationUsage !== null) add('backend', 'world generation reservations', status.worldGenerationUsage >= status.worldGenerationLimit ? 'WARN' : 'PASS',
      `${status.worldGenerationUsage}/${status.worldGenerationLimit}; cached worlds still work; changing the cap is an explicit operator setting`);
    const n = status.library.length;
    add('backend', 'object library', n >= 12 ? 'PASS' : n > 0 ? 'WARN' : 'FAIL', `${n} models: ${status.library.map((l) => l.key).join(', ')}`);
    add('backend', 'sample photo', status.assets.includes('photo.sample') ? 'PASS' : 'FAIL', status.assets.includes('photo.sample') ? 'permitted sample photo stored' : 'missing photo.sample (run npm run seed)');
    const hasSplat = status.assets.includes('splat.sample');
    const hasWorld = status.assets.includes('world.practice-courtyard');
    const hasCourtyard = ['bench', 'tree', 'gate', 'photograph'].every(k => status.library.some(l => l.key === k));
    add('backend', 'scene availability', hasSplat || hasWorld ? 'PASS' : hasCourtyard ? 'WARN' : 'FAIL', hasWorld ? 'cached fictional World Labs courtyard available' : hasSplat ? 'prepared photo splat available' : hasCourtyard ? 'illustrative courtyard available; photo reconstruction not configured' : 'no prepared scene or courtyard props');
    try { // every library row and asset must still point at a stored file
      const [st, ms] = await time(() => client.query(api.doctor.seedState, { secret: w.WORKER_SECRET }));
      const gone = [...st.library, ...st.assets].filter((r) => !r.file).map((r) => r.key);
      const mb = [...st.library, ...st.assets].reduce((a, r) => a + (r.file?.size ?? 0), 0) / 1e6;
      add('backend', 'stored files (library + assets)', gone.length ? 'FAIL' : 'PASS', gone.length ? `missing file for: ${gone.join(', ')} (re-run npm run seed)` : `${st.library.length + st.assets.length} files, ${mb.toFixed(1)} MB`, ms);
    } catch (e) { add('backend', 'stored files (library + assets)', 'FAIL', String(e.message || e).split('\n')[0]); }

    // GPU worker heartbeat (optional): worker/.heartbeat.json is rewritten every poll (1.5 s) while it runs.
    const hb = path.join(REPO, 'worker', '.heartbeat.json');
    let hbState = null;
    try { hbState = JSON.parse(readFileSync(hb, 'utf8')); } catch { /* not running yet */ }
    const age = hbState ? (Date.now() / 1000 - hbState.at) : null;
    const alive = hbState && hbState.state !== 'stopped' && (age < 15 || (hbState.state === 'busy' && age < 180)); // a cold job can take ~30 s
    if (alive) add('worker', 'GPU worker heartbeat', 'PASS', `${hbState.state}, ${age.toFixed(1)} s ago, ~${hbState.gpuEstimateS ?? 0} GPU-s used`);
    else add('worker', 'GPU worker heartbeat', flags['splat.live'] ? 'WARN' : 'SKIP',
      `${hbState ? `${hbState.state}, last seen ${Math.round(age)} s ago` : 'never started'}; ${flags['splat.live'] ? 'photos get the prebaked splat after 150 s; run worker/start.sh' : 'splat.live off'}`);

    try {
      const [p, ms] = await time(() => client.action(api.doctor.providers, { secret: w.WORKER_SECRET }));
      for (const r of p.rows) add('provider', r.name, r.status, r.detail, r.ms);
      const set = Object.entries(p.envSet).filter(([, v]) => v).map(([k]) => k.replace(/_API_KEY$|_ID$/, '').toLowerCase());
      add('provider', 'doctor action round trip (convex/doctor.ts)', 'PASS', `env keys set: ${set.join(' ')}`, ms);
    } catch (e) {
      add('provider', 'doctor action (convex/doctor.ts)', 'FAIL', String(e.message || e).split('\n')[0]);
    }
  }
}

// ---------- local fixtures ----------
const large = path.join(REPO, 'fixtures', 'large');
const sizeMB = (f) => statSync(f).size / 1e6;
for (const f of ['sample-sharp-500k.spz', 'sample-worldlabs-500k.spz']) {
  const p = path.join(large, f);
  add('fixtures', f, existsSync(p) ? 'PASS' : 'WARN', existsSync(p) ? `${sizeMB(p).toFixed(2)} MB` : 'missing (only needed to re-seed)');
}
if (existsSync(large)) {
  const glbs = (await import('node:fs')).readdirSync(large).filter((f) => f.endsWith('.glb'));
  const big = glbs.filter((f) => sizeMB(path.join(large, f)) > 1.5);
  add('fixtures', 'library GLBs <= 1.5 MB', big.length ? 'FAIL' : 'PASS', big.length ? `too big: ${big.join(', ')}` : `${glbs.length} files, largest ${Math.max(...glbs.map((f) => sizeMB(path.join(large, f)))).toFixed(2)} MB`);
}

// ---------- optional: Modal (local CLI; the token stays in the private config) ----------
if (process.argv.includes('--modal')) {
  const auth = process.env.MEMORY_GATE_ENV ?? path.join(REPO, 'auth', 'memory-gate.env');
  const cli = path.join(REPO, 'worker', '.venv', 'bin', 'modal');
  const alt = path.join(REPO, 'worker', '.venv', 'bin', 'modal');
  const bin = existsSync(cli) ? cli : existsSync(alt) ? alt : null;
  const a = existsSync(auth) ? readEnv(auth) : {};
  if (!bin) add('worker', 'modal token', 'SKIP', 'modal CLI not installed (worker/start.sh creates worker/.venv)');
  else if (!a.MODAL_TOKEN_ID || !a.MODAL_TOKEN_SECRET) add('worker', 'modal token', 'SKIP', 'no Modal token in the private config');
  else {
    const t0 = performance.now();
    try {
      const out = execFileSync(bin, ['app', 'list', '--json'], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, MODAL_TOKEN_ID: a.MODAL_TOKEN_ID, MODAL_TOKEN_SECRET: a.MODAL_TOKEN_SECRET } });
      const apps = JSON.parse(out);
      const live = apps.filter((x) => /memgate/i.test(x.Description ?? x.description ?? x.Name ?? '') && !/stopped/i.test(x.State ?? x.state ?? ''));
      add('worker', 'modal token + running apps', live.length ? 'WARN' : 'PASS', live.length ? `${live.length} Memory Gate app(s) still running: ${live.map((x) => `${x.Description ?? x.description} (${x.State ?? x.state})`).join(', ')}` : 'authenticated; no Memory Gate app running', Math.round(performance.now() - t0));
    } catch (e) {
      add('worker', 'modal token', 'FAIL', String(e.stderr || e.message || '').split('\n').filter(Boolean).slice(-1)[0], Math.round(performance.now() - t0));
    }
  }
}

// ---------- report ----------
const lines = [`doctor ${new Date().toISOString()}`];
for (const r of rows) lines.push(`${r.status.padEnd(4)}  ${r.group.padEnd(8)}  ${r.name.padEnd(44)}  ${r.ms != null ? `${String(r.ms).padStart(5)} ms` : '        '}  ${r.detail}`);
const out = lines.join('\n');
console.log(out);
try { mkdirSync(path.join(REPO, 'evidence'), { recursive: true }); writeFileSync(path.join(REPO, 'evidence', 'doctor-latest.txt'), out + '\n'); } catch { /* read-only checkout */ }
process.exit(rows.some((r) => r.status === 'FAIL') ? 1 : 0);
