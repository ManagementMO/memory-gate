// Generate library objects with Tripo v3 text-to-model (one-off library build; NOT used at runtime).
// Usage: node fixtures/library/tripo-generate.mjs <key> [<key> ...]      (keys from PROMPTS below)
// - Reads TRIPO_API_KEY from the private prep config (never printed). Refuses to exceed CAP_CREDITS for tonight,
//   counting what evidence/spend.md already records for Tripo.
// - All tasks run concurrently; each GLB link expires after 5 minutes, so it is downloaded the moment a task succeeds.
// - Writes fixtures/large/raw/<key>.glb (+ <key>.render.webp|png, Tripo's own preview) and appends to evidence/spend.md.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTH = path.join(os.homedir(), 'memory-gate-prep', 'auth', 'memory-gate.env');
const CAP_CREDITS = 150; // tonight's Tripo cap for the library ($1.50)
const CREDITS_PER_TASK = 20; // V24: text-to-model, v3.1, textured
export const PROMPTS = {
  lamp: 'table lamp with fabric lampshade, 1940s, single household object',
  clock: 'wooden mantel clock, 1940s, single household object',
  'sewing machine': 'treadle sewing machine with cast iron stand, 1940s, single household object',
  rug: 'rectangular woven wool rug lying flat, 1940s, single household object',
  'vase with flowers': 'vase with flowers, 1940s, single household object',
  teapot: 'porcelain teapot, 1940s, single household object',
  'rocking chair': 'wooden rocking chair, 1940s, single household object',
  gramophone: 'gramophone with horn, 1940s, single household object',
};

const env = Object.fromEntries(readFileSync(AUTH, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const KEY = env.TRIPO_API_KEY;
const redact = (s) => (KEY ? String(s).split(KEY).join('<redacted>') : String(s));
if (!KEY) { console.log('TRIPO_API_KEY not set; not calling Tripo.'); process.exit(2); }

const keys = process.argv.slice(2);
if (!keys.length || keys.some((k) => !PROMPTS[k])) { console.log(`usage: tripo-generate.mjs <key...>; keys: ${Object.keys(PROMPTS).join(', ')}`); process.exit(2); }

const SPEND = path.join(REPO, 'evidence', 'spend.md');
const spentSoFar = existsSync(SPEND)
  ? readFileSync(SPEND, 'utf8').split('\n').filter((l) => l.includes('| tripo |')).reduce((a, l) => a + Number((l.match(/\|\s*(\d+) credits\s*\|/) || [])[1] || 0), 0)
  : 0;
const planned = keys.length * CREDITS_PER_TASK;
if (spentSoFar + planned > CAP_CREDITS) { console.log(`refusing: ${spentSoFar} credits already logged + ${planned} planned > cap ${CAP_CREDITS}`); process.exit(3); }

const API = 'https://openapi.tripo3d.ai/v3';
async function call(method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok || !j || j.code !== 0) throw new Error(redact(`${method} ${p} -> ${res.status} code=${j?.code ?? '?'} ${(j?.message ?? text).slice(0, 200)}`));
  return j.data;
}

const outDir = path.join(REPO, 'fixtures', 'large', 'raw');
mkdirSync(outDir, { recursive: true });
const balBefore = await call('GET', '/account/balance');
console.log('balance before', JSON.stringify(balBefore));

async function one(key, i) {
  await new Promise((r) => setTimeout(r, i * 800));
  const t0 = Date.now();
  const prompt = PROMPTS[key];
  const { task_id } = await call('POST', '/generation/text-to-model', { prompt, model: 'v3.1-20260211', face_limit: 20000, texture: true, pbr: false });
  console.log(JSON.stringify({ key, task_id, queuedMs: Date.now() - t0 }));
  let t, errs = 0;
  for (;;) {
    try { t = await call('GET', `/tasks/${task_id}`); } catch (e) { if (++errs > 10) throw e; await new Promise((r) => setTimeout(r, 4000)); continue; }
    if (['success', 'failed', 'cancelled', 'banned', 'expired'].includes(t.status)) break;
    if (Date.now() - t0 > 8 * 60_000) throw new Error(`timed out (task ${task_id})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  const row = { key, prompt, task_id, status: t.status, ms: Date.now() - t0, credits: t.credits_consumed ?? null, error_code: t.error_code ?? null };
  if (t.status === 'success' && t.output?.model_url) {
    const glb = Buffer.from(await (await fetch(t.output.model_url)).arrayBuffer()); // expires in 5 min: fetch now, no auth header
    writeFileSync(path.join(outDir, `${key.replace(/ /g, '-')}.glb`), glb);
    row.glbBytes = glb.length;
    if (t.output.rendered_image_url) {
      try {
        const r = await fetch(t.output.rendered_image_url);
        const ext = (r.headers.get('content-type') || '').includes('png') ? 'png' : (r.headers.get('content-type') || '').includes('webp') ? 'webp' : 'jpg';
        writeFileSync(path.join(outDir, `${key.replace(/ /g, '-')}.render.${ext}`), Buffer.from(await r.arrayBuffer()));
        row.render = ext;
      } catch (e) { row.render = `failed: ${e.message}`; }
    }
  }
  console.log(redact(JSON.stringify(row)));
  return row;
}

const settled = await Promise.allSettled(keys.map((k, i) => one(k, i)));
const rows = settled.map((s, i) => (s.status === 'fulfilled' ? s.value : { key: keys[i], status: 'error', error: redact(String(s.reason?.message || s.reason)) }));
const balAfter = await call('GET', '/account/balance').catch((e) => ({ error: e.message }));
const used = typeof balBefore?.balance === 'number' && typeof balAfter?.balance === 'number' ? balBefore.balance - balAfter.balance : rows.reduce((a, r) => a + Number(r.credits || 0), 0);
console.log('balance after', JSON.stringify(balAfter), 'credits used', used);
writeFileSync(path.join(outDir, `tripo-results-${Date.now()}.json`), JSON.stringify({ balBefore, balAfter, used, rows }, null, 2));
const stamp = new Date().toISOString();
appendFileSync(SPEND, `| ${stamp} | tripo | text-to-model x${keys.length} (${keys.join(', ')}); ${rows.filter((r) => r.status === 'success').length} ok | ${used} credits | $${(used * 0.01).toFixed(2)} |\n`);
