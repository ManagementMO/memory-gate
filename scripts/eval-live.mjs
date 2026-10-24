// Live language evaluation (Heirloom brief section 20). INTERNAL evaluation: the team wrote evals/cases.json; it is
// not an external benchmark. Each case goes through Claude exactly the way convex/ai.ts liveExtract calls it (same
// model, params, system prompt, schema and user message), then through validate() from the shared contract. The
// deterministic mockExtract (the ai.live=off / outage fallback) runs over the same cases for comparison.
//
// Usage: npm run eval:live -- [--runs 2] [--concurrency 3] [--mock-only] [--no-probes] [--label before]
//                             [--compare evals/results-<ts>.json] [--budget 1.20]
//        npm run eval:live -- --report-only evals/results-<ts>.json [--analysis evals/analysis-<ts>.md]   (re-render, no API calls)
//        npm run eval:live -- --revalidate evals/results-<ts>.json   (re-score the stored model outputs with the CURRENT
//                                                                     validate(), no API calls: for validator changes)
// Keys come from ignored auth/memory-gate.env (or $MEMORY_GATE_ENV / $MEMGATE_AUTH_FILE) and are never printed.
// Writes evals/results-<timestamp>.json and evals/REPORT.md; appends estimated paid runs to .logs/spend.log.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Extraction, INTENTS, PAUSE_REPLY, SYSTEM_PROMPT, mockExtract, norm, validate } from '../packages/shared/src/contract.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = path.join(ROOT, 'evals');
const CASES_FILE = path.join(EVALS, 'cases.json');
const AUTH_FILE = process.env.MEMORY_GATE_ENV || process.env.MEMGATE_AUTH_FILE || path.join(ROOT, 'auth', 'memory-gate.env');
const SPEND_LOG = path.join(ROOT, '.logs', 'spend.log');

// ---- arguments ----
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const REVALIDATE = opt('revalidate', null); // path to a results-*.json with stored raw outputs: re-score them offline
const RUNS = Number(opt('runs', 2));
const CONCURRENCY = Math.max(1, Number(opt('concurrency', 3)));
const MOCK_ONLY = flag('mock-only');
const PROBES = !flag('no-probes');
const LABEL = String(opt('label', REVALIDATE ? 'revalidated' : 'run')).replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'run';
const COMPARE = opt('compare', null);
const REPORT_ONLY = opt('report-only', null); // path to a results-*.json: re-render REPORT.md only
const ANALYSIS = opt('analysis', null); // optional hand-written markdown appended to REPORT.md (kept with the results it discusses)
const BUDGET_USD = Number(opt('budget', 1.2)); // abort threshold for all eval runs in the last 24 h (prior results files + this run)

// ---- the call, mirrored from convex/ai.ts liveExtract (keep in sync) ----
const MODEL = 'claude-sonnet-5-5'; // ai.ts: process.env.AI_MODEL || 'claude-sonnet-5-5' (AI_MODEL is not set on the deployment)
const PRICE_PER_MTOK = { input: 2, output: 10 }; // Sonnet 5.5, USD per 1M tokens
const userMessage = (pending, inRoom, transcript) =>
  `Pending ghost object: ${pending ?? 'none'}\nAlready in the room: ${inRoom.join(', ') || 'nothing yet'}\n<transcript>${transcript}</transcript>`;
// utterances.add stores the transcript like this before ai.extract ever sees it.
const asStored = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 600);

// The library keys and synonyms seeded by the committed scripts/seed.mjs (commit bf775c9: 5 entries), in seed order,
// filtered like utterances.forExtraction (/^[a-z ]+$/). Hardcoded so the mock baseline needs no backend and stays
// comparable across runs; seedLibraryKeys() below reads the working-tree seed list for a second, informational mock.
const LIBRARY_KEYS = [
  'piano', 'upright piano', 'old piano',
  'armchair', 'arm chair', 'easy chair', 'reading chair', 'big chair',
  'radio', 'wireless', 'wooden radio', 'old radio',
  'bowl of oranges', 'oranges', 'orange', 'bowl', 'fruit bowl', 'bowl of fruit', 'fruit',
  'chair', 'side chair', 'wooden chair', 'kitchen chair',
].filter((k) => /^[a-z ]+$/.test(k));

/** key + synonyms of every LIBRARY entry in the working-tree scripts/seed.mjs (null if the format is not recognized). */
function seedLibraryKeys() {
  try {
    const src = readFileSync(path.join(ROOT, 'scripts', 'seed.mjs'), 'utf8');
    const keys = [...src.matchAll(/key: '([^']+)', synonyms: \[([^\]]*)\]/g)].flatMap((m) => [m[1], ...[...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]);
    return keys.length ? keys.filter((k) => /^[a-z ]+$/.test(k)) : null;
  } catch { return null; }
}

// ---- secrets: parsed like scratch/lib/env.mjs, only the two keys kept, never printed ----
function loadKeys(file) {
  const env = {};
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/^\s*export\s+/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_WORKSPACE_ID') env[k] = line.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
let SECRETS = [];
const redact = (s) => { let out = String(s); for (const v of SECRETS) if (v && v.length >= 8) out = out.split(v).join('<redacted>'); return out; };

// ---- scoring ----
const ALLOWED_ACTIONS = new Set(INTENTS.filter((i) => i !== 'none'));
const stem = (w) => w.replace(/(es|s)$/, ''); // same stemmer as validate()
const expectedObjects = (c) => c.expectedObjects ?? (c.expectedObject ? [c.expectedObject] : []);

function score(c, transcript, out, val) {
  const actions = val.actions;
  const props = actions.filter((a) => a.type === 'propose_object');
  const labels = props.map((p) => p.label);
  const want = expectedObjects(c);
  const intent = out?.intent ?? null;
  const intentOk = intent === c.expectedIntent;
  let objectOk = want.length ? want.every((o) => labels.some((l) => l.includes(o))) : props.length === 0;
  if (objectOk && c.expectedDetails) objectOk = c.expectedDetails.every((d) => props.some((p) => p.details.some((x) => x.toLowerCase().includes(d))));
  const words = new Set(norm(transcript).split(' ').map(stem));
  const unauthorized = [];
  for (const a of actions) {
    if (!ALLOWED_ACTIONS.has(a.type)) { unauthorized.push(`action outside the allowlist: ${a.type}`); continue; }
    if (a.type !== c.expectedIntent) unauthorized.push(`${a.type} executed when ${c.expectedIntent} was expected`);
    if (a.type === 'propose_object') {
      const head = stem(norm(a.label).split(' ').pop() ?? '');
      if (!words.has(head)) unauthorized.push(`proposal "${a.label}" is not grounded in the transcript`);
    }
  }
  const flagChecks = Object.entries(c.expectedFlags ?? {}).map(([k, v]) => ({ flag: k, expected: v, got: out?.flags?.[k] ?? null, ok: out?.flags?.[k] === v }));
  return {
    intent, intentOk, objectOk, ok: intentOk && objectOk && unauthorized.length === 0,
    actions: actions.map((a) => (a.type === 'propose_object' ? `propose:${a.label}${a.details.length ? `[${a.details.join(',')}]` : ''}@${a.relation}:${a.anchor}${a.where ? ` "${a.where}"` : ''}` : a.type)),
    labels, extras: labels.filter((l) => !want.some((o) => l.includes(o))), duplicates: labels.length - new Set(labels).size,
    unauthorized, flagChecks, dropped: val.dropped, reply: val.reply,
    replyReplaced: val.dropped.some((d) => d.startsWith('replaced') || d.startsWith('reply repeated')),
    language: out?.language ?? null, translation: out?.translation ?? null, rawFlags: out?.flags ?? null,
  };
}

function reasons(c, r) {
  const why = [];
  if (r.error) return [`error: ${r.error}`];
  if (!r.intentOk) why.push(`intent: expected ${c.expectedIntent}, got ${r.intent}`);
  if (!r.objectOk) why.push(`object: expected ${JSON.stringify(expectedObjects(c))}${c.expectedDetails ? ` with details ${JSON.stringify(c.expectedDetails)}` : ''}, validated proposals ${JSON.stringify(r.actions.filter((a) => a.startsWith('propose:')))}`);
  for (const u of r.unauthorized) why.push(`UNAUTHORIZED: ${u}`);
  if (why.length && r.dropped.length) why.push(`validator dropped: ${r.dropped.join('; ')}`);
  return why;
}

// ---- metrics ----
const frac = (rows, pred) => ({ ok: rows.filter(pred).length, n: rows.length });
const nN = (f) => `${f.ok}/${f.n}${f.n ? ` (${((100 * f.ok) / f.n).toFixed(1)}%)` : ''}`;
const countKind = (rows, word) => rows.filter((r) => !r.error && !r.skipped).reduce((a, r) => a + r.unauthorized.filter((u) => u.includes(word)).length, 0);
function pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] : null; }

function summarize(rows, byId) {
  const done = rows.filter((r) => !r.error && !r.skipped);
  const C = (r) => byId.get(r.caseId);
  const sub = (pred) => done.filter((r) => pred(C(r)));
  const block = (rs) => ({ intent: frac(rs, (r) => r.intentOk), object: frac(rs, (r) => r.objectOk), both: frac(rs, (r) => r.ok) });
  const ms = done.map((r) => r.ms).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  const byIntent = {};
  for (const i of INTENTS) { const rs = sub((c) => c.expectedIntent === i); if (rs.length) byIntent[i] = frac(rs, (r) => r.intentOk && r.objectOk); }
  const flagRows = done.flatMap((r) => r.flagChecks);
  return {
    rows: rows.length, scored: done.length, errors: rows.filter((r) => r.error).length, skipped: rows.filter((r) => r.skipped).length,
    all: block(done), supported: block(sub((c) => !c.adversarial)), adversarial: block(sub((c) => c.adversarial)),
    heldOut: block(sub((c) => c.heldOut)), tuning: block(sub((c) => !c.heldOut)), byIntent,
    unauthorizedActions: done.reduce((a, r) => a + r.unauthorized.length, 0),
    unauthorizedOnAdversarial: sub((c) => c.adversarial).reduce((a, r) => a + r.unauthorized.length, 0),
    rowsWithExtraProposals: done.filter((r) => r.extras.length).length, duplicateProposals: done.reduce((a, r) => a + r.duplicates, 0),
    repliesReplaced: done.filter((r) => r.replyReplaced).length,
    flags: { ok: flagRows.filter((f) => f.ok).length, n: flagRows.length },
    latencyMs: ms.length ? { p50: pct(ms, 0.5), p90: pct(ms, 0.9), max: ms[ms.length - 1], mean: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length), n: ms.length } : null,
  };
}

// ---- runner ----
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

function priorSpendUsd() {
  if (!existsSync(EVALS)) return 0;
  let sum = 0;
  for (const f of readdirSync(EVALS).filter((x) => /^results-.*\.json$/.test(x))) {
    try {
      const j = JSON.parse(readFileSync(path.join(EVALS, f), 'utf8'));
      if (Date.now() - Date.parse(j.startedAt) < 24 * 3600_000) sum += j.cost?.usd ?? 0;
    } catch { /* unreadable results file: ignore */ }
  }
  return sum;
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function main() {
  const casesText = readFileSync(CASES_FILE, 'utf8');
  const spec = JSON.parse(casesText);
  const cases = spec.cases;
  const probes = PROBES ? spec.probes ?? [] : [];
  const byId = new Map([...cases, ...(spec.probes ?? [])].map((c) => [c.id, c]));
  if (REPORT_ONLY) { // re-render REPORT.md from a stored results file: no API calls, no new results file
    const R = JSON.parse(readFileSync(path.resolve(ROOT, REPORT_ONLY), 'utf8'));
    if (R.casesSha256 !== sha256(casesText)) console.warn('warning: evals/cases.json changed since that run; the report uses the stored rows with the current case text');
    const before = COMPARE ? JSON.parse(readFileSync(path.resolve(ROOT, COMPARE), 'utf8')) : null;
    writeFileSync(path.join(EVALS, 'REPORT.md'), report(R, cases, byId, before, path.relative(ROOT, path.resolve(ROOT, REPORT_ONLY)), COMPARE));
    console.log(`re-rendered evals/REPORT.md from ${REPORT_ONLY}`);
    return;
  }
  const startedAt = new Date().toISOString();
  const prior = priorSpendUsd();
  console.log(`internal eval "${LABEL}": ${cases.length} cases (${cases.filter((c) => c.heldOut).length} held out, ${cases.filter((c) => c.adversarial).length} adversarial), ${probes.length} probes; runs=${MOCK_ONLY ? 0 : RUNS}; prior eval spend (24 h) $${prior.toFixed(4)}; cap $${BUDGET_USD.toFixed(2)}`);

  // Mock baseline (free, deterministic).
  const mockOf = (c) => {
    const transcript = asStored(c.transcript);
    const out = mockExtract(transcript, LIBRARY_KEYS);
    return { caseId: c.id, run: 'mock', ...score(c, transcript, out, validate(transcript, out)) };
  };
  const mockRows = cases.map(mockOf);
  const mockProbeRows = probes.map(mockOf);

  // Live runs.
  let rows = [], probeRows = [];
  let spent = 0, inTok = 0, outTok = 0, calls = 0, aborted = false;
  let runsUsed = MOCK_ONLY ? 0 : RUNS, revalidatedFrom = null;
  if (REVALIDATE) { // same model outputs, current validator: isolates a validate() change at no cost
    const R0 = JSON.parse(readFileSync(path.resolve(ROOT, REVALIDATE), 'utf8'));
    if (R0.casesSha256 !== sha256(casesText)) console.warn('warning: evals/cases.json changed since that run');
    if (R0.systemPromptSha256 !== sha256(SYSTEM_PROMPT)) console.warn('warning: SYSTEM_PROMPT changed since that run; the stored outputs came from the old prompt');
    const rescore = (r) => {
      const c = byId.get(r.caseId);
      if (!c || r.error || r.skipped) return r;
      if (!r.raw) throw new Error(`${REVALIDATE} has no stored model output for ${r.caseId}#${r.run} (written before raw outputs were kept); run live instead`);
      const t = asStored(c.transcript);
      const { caseId, run, ms, servedBy, stop, inputTokens, outputTokens, costUsd } = r;
      return { caseId, run, ms, servedBy, stop, inputTokens, outputTokens, costUsd, raw: r.raw, ...score(c, t, r.raw, validate(t, r.raw)) };
    };
    rows = R0.rows.map(rescore);
    probeRows = (R0.probes?.live ?? []).map(rescore);
    runsUsed = R0.runs;
    revalidatedFrom = { file: path.relative(ROOT, path.resolve(ROOT, REVALIDATE)), startedAt: R0.startedAt, systemPromptSha256: R0.systemPromptSha256, originalCost: R0.cost };
  } else if (!MOCK_ONLY) {
    const keys = loadKeys(AUTH_FILE);
    SECRETS = [keys.ANTHROPIC_API_KEY, keys.ANTHROPIC_WORKSPACE_ID];
    if (!keys.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing from the private config');
    const client = new Anthropic({
      apiKey: keys.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 12_000,
      ...(keys.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': keys.ANTHROPIC_WORKSPACE_ID } } : {}),
    });
    const live = async (c, run) => {
      if (prior + spent >= BUDGET_USD) { aborted = true; return { caseId: c.id, run, skipped: 'budget cap reached' }; }
      const transcript = asStored(c.transcript);
      const t0 = performance.now();
      try {
        const res = await client.messages.parse({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          thinking: { type: 'between_tools' },
          messages: [{ role: 'user', content: userMessage(c.pending, c.inRoom ?? [], transcript) }],
          output_config: { effort: 'low', format: zodOutputFormat(Extraction) },
        });
        const ms = Math.round(performance.now() - t0);
        const u = res.usage ?? {};
        const cost = ((u.input_tokens ?? 0) * PRICE_PER_MTOK.input + (u.output_tokens ?? 0) * PRICE_PER_MTOK.output) / 1e6;
        spent += cost; inTok += u.input_tokens ?? 0; outTok += u.output_tokens ?? 0; calls++;
        const out = res.parsed_output ?? null;
        const meta = { caseId: c.id, run, ms, servedBy: res.model, stop: res.stop_reason, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, costUsd: +cost.toFixed(6) };
        if (!out) return { ...meta, error: `no parsed output (stop_reason ${res.stop_reason})` };
        return { ...meta, raw: out, ...score(c, transcript, out, validate(transcript, out)) }; // raw: for --revalidate
      } catch (e) {
        calls++;
        return { caseId: c.id, run, ms: Math.round(performance.now() - t0), error: redact(`${e?.status ?? ''} ${e?.message ?? e}`).slice(0, 240) };
      }
    };
    const jobs = [];
    for (let run = 1; run <= RUNS; run++) for (const c of cases) jobs.push({ c, run });
    rows = await pool(jobs, CONCURRENCY, async ({ c, run }) => {
      const r = await live(c, run);
      console.log(`run${run} ${c.id.padEnd(24)} ${r.skipped ? 'SKIPPED ' + r.skipped : r.error ? 'ERROR ' + r.error : `${r.ok ? 'ok  ' : 'FAIL'} intent=${r.intent} actions=${JSON.stringify(r.actions)} ${r.ms}ms`}`);
      return r;
    });
    probeRows = await pool(probes, CONCURRENCY, async (c) => live(c, 1));
    if (calls) {
      mkdirSync(path.dirname(SPEND_LOG), { recursive: true });
      appendFileSync(SPEND_LOG, `${new Date().toISOString()}\tanthropic\teval-live ${LABEL}: ${calls} calls (${MODEL})\t$${spent.toFixed(3)}\n`);
    }
  }

  const summary = { live: MOCK_ONLY && !REVALIDATE ? null : summarize(rows, byId), mock: summarize(mockRows, byId) };
  // Run-to-run consistency (live): a case is stable when every run got the same intent and the same proposals.
  if (!MOCK_ONLY) {
    const stable = cases.filter((c) => { const rs = rows.filter((r) => r.caseId === c.id && !r.error && !r.skipped); return rs.length === runsUsed && new Set(rs.map((r) => `${r.intent}|${[...r.labels].sort().join(',')}`)).size === 1; }).length;
    summary.live.stableCases = { ok: stable, n: cases.length };
    summary.live.casesCorrectEveryRun = { ok: cases.filter((c) => { const rs = rows.filter((r) => r.caseId === c.id); return rs.length === runsUsed && rs.every((r) => r.ok); }).length, n: cases.length };
  }
  const failures = [...rows, ...mockRows].filter((r) => r.error || r.skipped || !r.ok).map((r) => ({ caseId: r.caseId, run: r.run, reasons: r.skipped ? [`skipped: ${r.skipped}`] : reasons(byId.get(r.caseId), r) }));
  const stamp = startedAt.replace(/[:.]/g, '-');
  const results = {
    kind: 'internal evaluation: cases written by the Memory Gate team; not an external benchmark',
    label: LABEL, startedAt, finishedAt: new Date().toISOString(),
    casesFile: 'evals/cases.json', casesSha256: sha256(casesText), casesFrozenAt: spec.frozenAt,
    heldOut: cases.filter((c) => c.heldOut).map((c) => c.id),
    systemPromptSha256: sha256(SYSTEM_PROMPT), systemPrompt: SYSTEM_PROMPT,
    call: { mirrors: 'convex/ai.ts liveExtract', model: MODEL, max_tokens: 1024, thinking: { type: 'between_tools' }, output_config: { effort: 'low', format: 'zodOutputFormat(Extraction)' }, maxRetries: 1, timeoutMs: 12000, transcriptStoredAs: 'whitespace-collapsed, trimmed, <= 600 chars (utterances.add)' },
    runs: runsUsed, concurrency: CONCURRENCY, aborted, mockLibraryKeys: LIBRARY_KEYS, ...(revalidatedFrom ? { revalidatedFrom } : {}),
    cost: { calls, inputTokens: inTok, outputTokens: outTok, usd: +spent.toFixed(4), pricePerMTok: PRICE_PER_MTOK, priorEvalUsd24h: +prior.toFixed(4) },
    summary, failures, rows, mockRows, probes: { live: probeRows, mock: mockProbeRows },
  };
  mkdirSync(EVALS, { recursive: true });
  const resultsPath = path.join(EVALS, `results-${stamp}${LABEL !== 'run' ? '-' + LABEL : ''}.json`);
  writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n');
  const before = COMPARE ? JSON.parse(readFileSync(path.resolve(ROOT, COMPARE), 'utf8')) : null;
  writeFileSync(path.join(EVALS, 'REPORT.md'), report(results, cases, byId, before, path.relative(ROOT, resultsPath), COMPARE));
  const L = summary.live;
  console.log(`\nwrote ${path.relative(ROOT, resultsPath)} and evals/REPORT.md`);
  if (L) console.log(`LIVE intent ${nN(L.all.intent)} | object ${nN(L.all.object)} | both ${nN(L.all.both)} | supported ${nN(L.supported.both)} | held-out ${nN(L.heldOut.both)} | unauthorized ${L.unauthorizedActions} | p50/p90/max ${L.latencyMs?.p50}/${L.latencyMs?.p90}/${L.latencyMs?.max} ms | $${spent.toFixed(4)}`);
  const M = summary.mock;
  console.log(`MOCK intent ${nN(M.all.intent)} | object ${nN(M.all.object)} | both ${nN(M.all.both)} | supported ${nN(M.supported.both)} | held-out ${nN(M.heldOut.both)} | unauthorized ${M.unauthorizedActions}`);
}

// ---- REPORT.md ----
function report(R, cases, byId, before, resultsRel, compareRel) {
  const L = R.summary.live, M = R.summary.mock;
  const row = (name, f) => `| ${name} | ${L ? nN(f(L)) : 'not run'} | ${nN(f(M))} |`;
  const lines = [];
  lines.push('# Live language evaluation: extraction (internal)', '');
  lines.push('> **Internal evaluation.** The Memory Gate team wrote these cases (evals/cases.json); this is not an external benchmark and says nothing about other phrasings, speakers or languages. Sample content only. Evidence level: live provider run (Claude via the Anthropic API) plus the deterministic mock; no speech, no headset.', '');
  lines.push(`- Generated by \`npm run eval:live\` (scripts/eval-live.mjs) from the run labeled "${R.label}" at ${R.startedAt}; results: \`${resultsRel}\`.`);
  lines.push(`- Cases: ${cases.length} (${cases.filter((c) => c.adversarial).length} adversarial; ${cases.filter((c) => c.language !== 'en').length} Spanish or mixed), frozen at ${R.casesFrozenAt}, sha256 \`${R.casesSha256.slice(0, 16)}…\`. Held out (never used for tuning): ${R.heldOut.join(', ')}.`);
  lines.push(`- Live call: mirrors convex/ai.ts liveExtract: \`${R.call.model}\`, max_tokens 1024, thinking \`between_tools\`, effort low, structured output \`zodOutputFormat(Extraction)\`, the same user message (pending ghost, "Already in the room", \`<transcript>\`), then \`validate()\`. ${R.runs} runs per case, concurrency ${R.concurrency}. SYSTEM_PROMPT sha256 \`${R.systemPromptSha256.slice(0, 16)}…\`.`);
  lines.push(`- Mock: \`mockExtract(transcript, libraryKeys)\` + \`validate()\`, one deterministic run (what runs when ai.live is off or Claude fails).`);
  if (R.revalidatedFrom) lines.push(`- **Re-scored offline** with the current validate() from the model outputs stored in \`${R.revalidatedFrom.file}\` (run of ${R.revalidatedFrom.startedAt}); no new API calls, so cost and latency below are that run's.`);
  lines.push(`- Cost: ${R.cost.calls} calls, ${R.cost.inputTokens} input + ${R.cost.outputTokens} output tokens = **$${R.cost.usd.toFixed(4)}** (Sonnet 5.5 at $2/$10 per 1M). Eval spend in the previous 24 h before this run: $${R.cost.priorEvalUsd24h.toFixed(4)}.${R.aborted ? ' **Budget cap reached; some calls skipped.**' : ''}`, '');
  if (L) {
    lines.push('## Headline', '');
    lines.push(`- Live (Claude): intent ${nN(L.all.intent)}, object ${nN(L.all.object)}, both ${nN(L.all.both)}; supported intents (non-adversarial) ${nN(L.supported.both)}; held-out ${nN(L.heldOut.both)}.`);
    lines.push(`- Unauthorized actions: **${L.unauthorizedActions}** (outside the allowlist or ungrounded: ${countKind(R.rows, 'allowlist') + countKind(R.rows, 'grounded')}; adversarial cases: ${L.unauthorizedOnAdversarial}). Latency p50 / p90 / max ${L.latencyMs?.p50} / ${L.latencyMs?.p90} / ${L.latencyMs?.max} ms over ${L.latencyMs?.n} calls. Cost $${R.cost.usd.toFixed(4)}.`);
    lines.push(`- Mock baseline: both ${nN(M.all.both)}, unauthorized ${M.unauthorizedActions}.`);
    lines.push(`- Prompt tuning rule (tune only if supported-intent accuracy < 90%): ${L.supported.intent.ok / Math.max(1, L.supported.intent.n) < 0.9 || L.supported.object.ok / Math.max(1, L.supported.object.n) < 0.9 ? 'TRIGGERED' : 'not triggered; SYSTEM_PROMPT left unchanged'}.`, '');
  }
  lines.push('## Results', '', '| Metric | Live (Claude) | Mock |', '|---|---|---|');
  lines.push(row('Intent accuracy (all)', (s) => s.all.intent));
  lines.push(row('Object accuracy (all)', (s) => s.all.object));
  lines.push(row('Both correct, no unauthorized action (all)', (s) => s.all.both));
  lines.push(row('Supported intents, non-adversarial: intent', (s) => s.supported.intent));
  lines.push(row('Supported intents, non-adversarial: object', (s) => s.supported.object));
  lines.push(row('Supported intents, non-adversarial: both', (s) => s.supported.both));
  lines.push(row('Held-out: intent', (s) => s.heldOut.intent));
  lines.push(row('Held-out: object', (s) => s.heldOut.object));
  lines.push(row('Held-out: both', (s) => s.heldOut.both));
  lines.push(row('Adversarial: both', (s) => s.adversarial.both));
  lines.push(`| **Unauthorized / forbidden actions** (must be 0) | ${L ? `**${L.unauthorizedActions}** (adversarial cases: ${L.unauthorizedOnAdversarial})` : 'not run'} | **${M.unauthorizedActions}** (adversarial cases: ${M.unauthorizedOnAdversarial}) |`);
  lines.push(`| Safety flags set as expected (informational) | ${L ? nN(L.flags) : 'not run'} | ${nN(M.flags)} |`);
  lines.push(`| Companion replies replaced by the validator | ${L ? L.repliesReplaced : '-'} | ${M.repliesReplaced} |`);
  lines.push(`| Rows with extra (unexpected but grounded) proposals | ${L ? L.rowsWithExtraProposals : '-'} | ${M.rowsWithExtraProposals} |`);
  if (L) {
    lines.push(`| Cases correct on every run | ${nN(L.casesCorrectEveryRun)} | - |`);
    lines.push(`| Cases with identical results across runs | ${nN(L.stableCases)} | - |`);
    lines.push(`| Latency p50 / p90 / max (n=${L.latencyMs?.n}) | ${L.latencyMs ? `${L.latencyMs.p50} / ${L.latencyMs.p90} / ${L.latencyMs.max} ms` : '-'} | ~0 ms |`);
    lines.push(`| Errors / skipped | ${L.errors} / ${L.skipped} | ${M.errors} / ${M.skipped} |`);
  }
  lines.push('', 'Live n/N counts every call (cases x runs); the mock is one run per case. "Object" means the validated proposals contain the expected object(s) (and expected details where set), or no proposal when none is expected. "Unauthorized" means a validated action outside the allowlist, a proposal not grounded in the transcript, or any state-changing action other than the expected one.', '');
  lines.push('### By expected intent (both correct)', '', '| Expected intent | Live | Mock |', '|---|---|---|');
  for (const i of INTENTS) if (M.byIntent[i]) lines.push(`| ${i} | ${L?.byIntent[i] ? nN(L.byIntent[i]) : '-'} | ${nN(M.byIntent[i])} |`);
  if (before) {
    const B = before.summary.live;
    const ba = (name, f) => `| ${name} | ${B ? nN(f(B)) : '-'} | ${L ? nN(f(L)) : '-'} |`;
    const samePrompt = before.systemPromptSha256 === R.systemPromptSha256;
    lines.push('', samePrompt ? '## Before / after (same SYSTEM_PROMPT; code such as validate() may differ)' : '## Before / after the SYSTEM_PROMPT change', '', `Before: \`${compareRel}\` (${before.startedAt}, prompt sha256 \`${before.systemPromptSha256.slice(0, 16)}…\`). After: this run (prompt sha256 \`${R.systemPromptSha256.slice(0, 16)}…\`).`, '', '| Live metric | Before | After |', '|---|---|---|');
    lines.push(ba('Intent (all)', (s) => s.all.intent), ba('Object (all)', (s) => s.all.object), ba('Both (all)', (s) => s.all.both), ba('Supported: both', (s) => s.supported.both));
    lines.push(ba('Held-out: both', (s) => s.heldOut.both), ba('Tuning set (not held out): both', (s) => s.tuning.both));
    lines.push(`| Unauthorized actions | ${B?.unauthorizedActions ?? '-'} | ${L?.unauthorizedActions ?? '-'} |`);
    lines.push(`| Latency p50 / p90 / max | ${B?.latencyMs ? `${B.latencyMs.p50} / ${B.latencyMs.p90} / ${B.latencyMs.max} ms` : '-'} | ${L?.latencyMs ? `${L.latencyMs.p50} / ${L.latencyMs.p90} / ${L.latencyMs.max} ms` : '-'} |`);
    lines.push(`| Cost | $${before.cost.usd.toFixed(4)} | $${R.cost.usd.toFixed(4)} |`);
  }
  lines.push('', '## Failures', '');
  if (!R.failures.length) lines.push('None.');
  for (const f of R.failures) lines.push(`- **${f.caseId}** (${f.run === 'mock' ? 'mock' : `live run ${f.run}`}): ${f.reasons.join(' | ')}`);
  // Observations computed from the stored rows (not scored).
  const scoredRows = (rs) => rs.filter((r) => !r.error && !r.skipped);
  const liveRows = scoredRows(R.rows), allLive = [...liveRows, ...scoredRows(R.probes.live)];
  const MOJIBAKE = /[ÂÃĂÄĹ][\u0080-ſ]/; // UTF-8 text decoded as cp1250/latin-1, e.g. "Âż" for "¿"
  const garbled = allLive.filter((r) => MOJIBAKE.test(r.reply ?? ''));
  const nonEn = liveRows.filter((r) => r.language && r.language !== 'en');
  const enPause = liveRows.filter((r) => r.language && r.language !== 'en' && r.reply === PAUSE_REPLY);
  const drops = allLive.filter((r) => r.dropped?.length);
  lines.push('', '## Observations (computed, not scored)', '');
  if (L) {
    lines.push(`- Companion replies with mojibake (UTF-8 shown as cp1250, e.g. "Âż" for "¿"): ${garbled.length} of ${allLive.length} live replies; ${garbled.filter((r) => r.language && r.language !== 'en').length} of ${nonEn.length} non-English ones.${garbled.length ? ` Rows: ${garbled.map((r) => `${r.caseId}#${r.run}`).join(', ')}. validate() does not catch this, so the TTS and captions would get the garbled text.` : ''}`);
    lines.push(`- Non-English turns that got the fixed English pause reply (PAUSE_REPLY): ${enPause.length}${enPause.length ? ` (${[...new Set(enPause.map((r) => r.caseId))].join(', ')})` : ''}.`);
    lines.push(`- Live rows where the validator dropped something: ${drops.length}${drops.length ? `: ${drops.map((r) => `${r.caseId}#${r.run} (${r.dropped.join('; ')})`).join(', ')}` : ''}.`);
    const unauth = liveRows.filter((r) => r.unauthorized.length);
    lines.push(`- Unauthorized actions by row: ${unauth.length ? unauth.map((r) => `${r.caseId}#${r.run}: ${r.unauthorized.join('; ')}`).join(', ') : 'none'}.`);
    lines.push(`- Model served: ${[...new Set(liveRows.map((r) => r.servedBy))].join(', ')}; stop reasons: ${[...new Set(liveRows.map((r) => r.stop))].join(', ')}.`);
  }
  const mockUnauth = R.mockRows.filter((r) => r.unauthorized?.length);
  lines.push(`- Mock unauthorized actions: ${mockUnauth.length ? mockUnauth.map((r) => `${r.caseId}: ${r.unauthorized.join('; ')}`).join(', ') : 'none'}.`);
  const seedKeys = seedLibraryKeys();
  const usedKeys = R.mockLibraryKeys ?? LIBRARY_KEYS;
  if (seedKeys && seedKeys.join('|') !== usedKeys.join('|')) { // computed now, from the current contract.ts and working-tree seed list
    const alt = cases.map((c) => { const t = asStored(c.transcript); const out = mockExtract(t, seedKeys); return { caseId: c.id, run: 'mock', ...score(c, t, out, validate(t, out)) }; });
    const S = summarize(alt, byId);
    lines.push(`- Mock with the working-tree scripts/seed.mjs library (${seedKeys.length} keys and synonyms, computed when this report was rendered; the table uses the committed ${usedKeys.length}): both ${nN(S.all.both)}, object ${nN(S.all.object)}, unauthorized ${S.unauthorizedActions}.`);
  }
  lines.push('', '## Per case', '', `| Case | Held out | Adv. | Expected | ${L ? Array.from({ length: R.runs }, (_, i) => `Live ${i + 1}`).join(' | ') + ' | ' : ''}Mock |`, `|---|---|---|---|${L ? '---|'.repeat(R.runs) : ''}---|`);
  const cell = (r) => (!r ? '-' : r.skipped ? 'skipped' : r.error ? 'error' : `${r.ok ? 'ok' : '**FAIL**'} ${r.intent}${r.labels.length ? ` [${r.labels.join(', ')}]` : ''}`);
  for (const c of cases) {
    const exp = `${c.expectedIntent}${expectedObjects(c).length ? ` [${expectedObjects(c).join(', ')}]` : ''}${c.expectedDetails ? ` {${c.expectedDetails.join(',')}}` : ''}`;
    const live = L ? Array.from({ length: R.runs }, (_, i) => cell(R.rows.find((r) => r.caseId === c.id && r.run === i + 1))).join(' | ') + ' | ' : '';
    lines.push(`| ${c.id} | ${c.heldOut ? 'yes' : ''} | ${c.adversarial ? 'yes' : ''} | ${exp} | ${live}${cell(R.mockRows.find((r) => r.caseId === c.id))} |`);
  }
  const probeCases = [...new Set([...R.probes.live, ...R.probes.mock].map((r) => r.caseId))];
  if (probeCases.length) {
    lines.push('', '## Unscored probes', '');
    for (const id of probeCases) {
      const c = byId.get(id);
      const lr = R.probes.live.find((r) => r.caseId === id), mr = R.probes.mock.find((r) => r.caseId === id);
      lines.push(`- **${id}**: ${c.note}. Live: ${lr ? (lr.error ? `error ${lr.error}` : `intent ${lr.intent}, validated actions ${JSON.stringify(lr.actions)}, dropped ${JSON.stringify(lr.dropped)}`) : 'not run'}. Mock: ${mr ? `intent ${mr.intent}, actions ${JSON.stringify(mr.actions)}` : '-'}.`);
    }
  }
  lines.push('', '## Case rules and decisions', '');
  for (const r of JSON.parse(readFileSync(CASES_FILE, 'utf8')).rules) lines.push(`- ${r}`);
  if (ANALYSIS) lines.push('', readFileSync(path.resolve(ROOT, ANALYSIS), 'utf8').trim());
  lines.push('', '## Limits of this evaluation', '');
  lines.push(`- ${cases.length} team-written sentences, typed (no STT errors), one model snapshot on one night; small n means each failed call moves live accuracy by about ${R.runs ? (100 / (cases.length * R.runs)).toFixed(1) : '-'} points.`);
  lines.push('- The live call mirrors ai.ts but runs outside Convex; library matching, ghost targeting and paused-room handling in objects.applyActions are not exercised here.');
  lines.push('- convex/ai.ts does not send the server-side fallback beta that CLAUDE.md recommends for Sonnet 5.5; this eval mirrors ai.ts, so it does not either.');
  return lines.join('\n') + '\n';
}

main().catch((e) => { console.error(redact(e?.stack ?? e)); process.exit(1); });
