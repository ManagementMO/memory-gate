// The saved copy of object context the app shows when a live lookup can't run (offline rooms, no Apify connection, a
// slow run): one Source Atlas batch run on Apify over every topic, kept in apps/gate/src/object-info/saved-references.json.
// Needs APIFY_TOKEN, ALLOW_APIFY_CLOUD=1 and APIFY_MEMORY_ACTOR_ID in the ignored provider file (npm run env:push reads the
// same one). Costs a few cents of Apify compute; run it again to refresh the saved copy.
//   node scripts/atlas-snapshot.mjs [topicKey ...]   (default: every topic)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { OBJECT_TOPIC_KEYS, OBJECT_TOPICS, normalizeObjectReferences } from '../actors/historical-memory-atlas/src/knowledge.mjs';

const parse = path => existsSync(path) ? Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })) : {};
const env = { ...parse('.env.exchange'), ...process.env, ...parse(process.env.MEMORY_GATE_ENV || process.env.MEMGATE_AUTH_FILE || 'auth/memory-gate.env') };
if (!env.APIFY_TOKEN || env.ALLOW_APIFY_CLOUD !== '1' || !env.APIFY_MEMORY_ACTOR_ID) throw Error('Save APIFY_TOKEN, ALLOW_APIFY_CLOUD=1 and APIFY_MEMORY_ACTOR_ID in the ignored provider configuration.');
const OUT = 'apps/gate/src/object-info/saved-references.json';
async function api(path, method = 'GET', body) {
  const response = await fetch('https://api.apify.com/v2/' + path, { method, redirect: 'error', headers: { Authorization: `Bearer ${env.APIFY_TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Apify ${method} ${path.split('?')[0]} returned HTTP ${response.status}.`);
  const json = await response.json();
  return json.data ?? json;
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : [...OBJECT_TOPIC_KEYS];
const actor = encodeURIComponent(env.APIFY_MEMORY_ACTOR_ID.replace('/', '~'));
let run = await api(`acts/${actor}/runs?timeout=1200&memory=256&maxTotalChargeUsd=0.50`, 'POST', { sourceMode: 'object', topicKeys: keys });
console.log(`Run ${run.id} started for ${keys.length} topics.`);
while (['READY', 'RUNNING'].includes(run.status)) { await new Promise(r => setTimeout(r, 10000)); run = await api(`actor-runs/${run.id}`); process.stdout.write('.'); }
console.log(`\nRun ${run.id} ${run.status} ($${(run.usageTotalUsd ?? 0).toFixed(4)}).`);
if (run.status !== 'SUCCEEDED') throw Error(`The run ended ${run.status}; the saved copy was not changed.`);
const rows = await api(`datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=2000`);
const output = await api(`key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`).catch(() => null);

// Merge into the existing copy, so refreshing a few topics keeps the rest.
const saved = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { topics: {} };
const topics = { ...saved.topics };
for (const key of keys) {
  const refs = normalizeObjectReferences(rows.filter(r => r.topicKey === key), key);
  if (refs.some(r => r.kind !== 'photo')) topics[key] = refs;
}
const ordered = Object.fromEntries(Object.keys(topics).sort().map(k => [k, topics[k]]));
writeFileSync(OUT, JSON.stringify({ note: 'Public context retrieved with Apify (Source Atlas). Not from any family story. Regenerate with node scripts/atlas-snapshot.mjs.', actor: env.APIFY_MEMORY_ACTOR_ID, runId: run.id, retrievedAt: new Date().toISOString(), topics: ordered }, null, 1) + '\n');

const missing = OBJECT_TOPIC_KEYS.filter(k => !ordered[k]?.some(r => r.kind !== 'photo'));
const photos = Object.values(ordered).reduce((n, refs) => n + refs.filter(r => r.kind === 'photo').length, 0);
console.log(`Saved ${Object.keys(ordered).length}/${OBJECT_TOPIC_KEYS.length} topics, ${photos} archive photos → ${OUT}`);
if (missing.length) console.log(`Without a passage yet: ${missing.map(k => `${k} (${OBJECT_TOPICS[k].sources.map(s => s.attribution).join(', ')})`).join('; ')}`);
for (const w of output?.warnings ?? []) console.log(`  warning: ${w}`);
