// Generation accuracy: does the place that forms match what someone said?
// For each case: plan with Claude (through the local backend; ~$0.03 each) and with the free offline planner, then
// score against a hand-written checklist: mentioned things present, their colours, where they are, the setting.
// Plans are saved to apps/gate/public/eval/ (so ?preview=scene&plan=/eval/<id>.json can draw them) and the scores to
// docs/eval/generation-accuracy.json.   node apps/gate/scripts/eval-generation.mjs [--offline-only]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
import { planOffline, validatePlan, layout } from '../../../packages/shared/src/scene.ts';

const offlineOnly = process.argv.includes('--offline-only');
// --rescore: score the Claude plans already saved in apps/gate/public/eval (no new model calls). Timings from the
// last live run are kept in docs/eval/live-timings.json.
const rescore = process.argv.includes('--rescore');
const HUE = { red: [[0, 18], [340, 360]], pink: [[300, 360], [0, 12]], orange: [[15, 42]], yellow: [[38, 68]], green: [[70, 170]], blue: [[180, 260]], purple: [[255, 300]], brown: [[10, 45]] };
const LIGHT = { white: (s, l) => l > 0.8 && s < 0.35, cream: (s, l) => l > 0.72 && s < 0.6 };

function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
function colorMatches(hex, name) {
  if (!hex) return false;
  const { h, s, l } = hsl(hex);
  if (LIGHT[name]) return LIGHT[name](s, l);
  if (name === 'striped' || name === 'floral') return true;
  return (HUE[name] ?? []).some(([a, b]) => h >= a && h <= b) && s > 0.15;
}

// expect: things that must be there. kinds = acceptable library kinds; words = label words that also count;
// color = remembered colour; on/near = relation to another expected thing (by its key).
const CASES = [
  { id: 'kitchen', text: 'My grandmother’s kitchen in the morning. Yellow curtains on the window, a round wooden table with two chairs, and her radio on the counter.',
    setting: { indoor: true, type: /kitchen/, time: ['morning'] },
    expect: [{ key: 'window', kinds: ['window'], color: 'yellow' }, { key: 'table', kinds: ['round_table', 'table'] }, { key: 'chair', kinds: ['chair'], count: 2 }, { key: 'counter', kinds: ['counter'] }, { key: 'radio', kinds: ['radio'], on: 'counter' }] },
  { id: 'lake', text: 'Our cabin by the lake at dusk. A wooden dock going out over the water, a little red rowboat tied to it, and tall pine trees all around.',
    setting: { indoor: false, water: true, time: ['dusk', 'golden'] },
    expect: [{ key: 'dock', kinds: ['dock'] }, { key: 'boat', kinds: ['boat'], color: 'red' }, { key: 'pines', kinds: ['pine_tree'] }] },
  { id: 'beach', text: 'The beach in summer when I was a girl. A striped umbrella, a blue towel on the sand, and the sea going on forever.',
    setting: { indoor: false, water: true, floor: 'sand' },
    expect: [{ key: 'umbrella', kinds: ['umbrella'] }, { key: 'towel', kinds: ['picnic_blanket'], words: ['towel'], color: 'blue' }] },
  { id: 'livingroom', text: 'Dad’s living room. A green armchair by the fireplace, a big bookshelf full of books, and a lamp with a cream shade next to the sofa.',
    setting: { indoor: true, type: /living/ },
    expect: [{ key: 'armchair', kinds: ['armchair'], color: 'green', near: 'fireplace' }, { key: 'fireplace', kinds: ['fireplace'] }, { key: 'bookshelf', kinds: ['bookshelf'] }, { key: 'lamp', kinds: ['lamp', 'floor_lamp'], color: 'cream' }, { key: 'sofa', kinds: ['sofa'] }] },
  { id: 'garden', text: 'Mom’s garden in spring. Rows of pink tulips, a white picket fence, and an old apple tree with a swing hanging from it.',
    setting: { indoor: false, type: /garden|yard/ },
    expect: [{ key: 'tulips', kinds: ['flowers'], color: 'pink' }, { key: 'fence', kinds: ['fence'], color: 'white' }, { key: 'tree', kinds: ['tree'] }, { key: 'swing', kinds: ['swing'], near: 'tree' }] },
  { id: 'bedroom', text: 'My childhood bedroom. A small bed with a patchwork quilt, a wooden dresser, a window with blue curtains, and my teddy bear on the pillow.',
    setting: { indoor: true, type: /bed/ },
    expect: [{ key: 'bed', kinds: ['bed'] }, { key: 'dresser', kinds: ['cabinet'], words: ['dresser'] }, { key: 'window', kinds: ['window'], color: 'blue' }, { key: 'teddy', kinds: ['custom'], words: ['teddy', 'bear'], on: 'bed' }] },
  { id: 'classroom', text: 'My first classroom. Rows of little wooden desks, a big chalkboard on the wall, and a globe on the teacher’s desk.',
    setting: { indoor: true, type: /class|school/ },
    expect: [{ key: 'desks', kinds: ['table', 'round_table'], words: ['desk'] }, { key: 'chalkboard', kinds: ['custom', 'picture_frame'], words: ['chalkboard', 'blackboard', 'board'] }, { key: 'globe', kinds: ['custom'], words: ['globe'], on: 'desks' }] },
  { id: 'cafe', text: 'The little café in Paris where we met. A small round marble table outside, two metal chairs, two coffee cups, and a lamp post on the corner.',
    setting: { indoor: false },
    expect: [{ key: 'table', kinds: ['round_table', 'table'] }, { key: 'chairs', kinds: ['chair'], count: 2 }, { key: 'cups', kinds: ['cup'], on: 'table' }, { key: 'lamppost', kinds: ['lamp_post'] }] },
  { id: 'christmas', text: 'Christmas morning at my aunt’s house. A tall Christmas tree with lights, a red armchair, presents under the tree, and snow falling outside the window.',
    setting: { indoor: true, time: ['morning'] },
    expect: [{ key: 'tree', kinds: ['pine_tree'], words: ['christmas tree'] }, { key: 'armchair', kinds: ['armchair'], color: 'red' }, { key: 'presents', kinds: ['custom'], words: ['present', 'gift'], near: 'tree' }, { key: 'window', kinds: ['window'] }] },
  { id: 'campsite', text: 'Camping with my brothers. An orange tent, a campfire with a ring of stones, and the night sky full of stars.',
    setting: { indoor: false, time: ['night'] },
    expect: [{ key: 'tent', kinds: ['tent'], color: 'orange' }, { key: 'campfire', kinds: ['campfire'] }] },
  { id: 'porch', text: 'Sitting on the front porch at sunset. A wooden porch swing, a pot of red geraniums, and a pitcher of lemonade on a little table.',
    setting: { indoor: false, time: ['dusk', 'golden'] },
    expect: [{ key: 'swing', kinds: ['swing'] }, { key: 'geraniums', kinds: ['potted_plant', 'flowers', 'vase_flowers'], color: 'red' }, { key: 'table', kinds: ['round_table', 'table'] }, { key: 'pitcher', kinds: ['custom', 'teapot'], words: ['pitcher', 'lemonade'], on: 'table' }] },
  { id: 'chapel', text: 'Our wedding day in the little white chapel. Rows of wooden benches, candles by the altar, and white flowers everywhere.',
    setting: { indoor: true },
    expect: [{ key: 'benches', kinds: ['bench'] }, { key: 'candles', kinds: ['candle'] }, { key: 'flowers', kinds: ['flowers', 'vase_flowers'], color: 'white' }, { key: 'altar', kinds: ['custom', 'table', 'cabinet'], words: ['altar'] }] },
];

function score(plan, c) {
  const found = new Map();
  const items = [];
  const pos = new Map(layout(plan).map((p) => [p.id, p]));
  for (const e of c.expect) {
    const matches = plan.objects.filter((o) => e.kinds.includes(o.kind) && (o.kind !== 'custom' || !e.words || e.words.some((w) => o.label.includes(w)))
      || (e.words && e.words.some((w) => o.label.includes(w))));
    const present = matches.length >= (e.count ?? 1) || (e.count && matches.length >= 1 && matches.length < e.count ? false : matches.length > 0);
    if (matches.length) found.set(e.key, matches);
    const r = { key: e.key, present, count: matches.length, kinds: [...new Set(matches.map((m) => m.kind))] };
    if (e.color) r.color = matches.some((m) => colorMatches(m.color, e.color)) || (e.color === 'striped' && matches.length > 0);
    items.push(r);
  }
  // relations
  for (const e of c.expect) {
    const r = items.find((x) => x.key === e.key);
    const mine = found.get(e.key) ?? [];
    if (e.on) {
      const hosts = (found.get(e.on) ?? []).map((h) => h.id);
      r.relation = mine.some((m) => pos.get(m.id)?.on && hosts.includes(pos.get(m.id).on)) || mine.some((m) => m.relation === 'on' && hosts.includes(m.target));
    }
    if (e.near) {
      const others = (found.get(e.near) ?? []).map((o) => pos.get(o.id)).filter(Boolean);
      r.relation = mine.some((m) => { const p = pos.get(m.id); return p && others.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 2.4); });
    }
  }
  const s = c.setting;
  const setting = {
    indoor: s.indoor === undefined ? null : plan.setting.indoor === s.indoor,
    type: s.type ? s.type.test(plan.setting.type) : null,
    time: s.time ? s.time.includes(plan.setting.timeOfDay) : null,
    water: s.water === undefined ? null : plan.setting.water === s.water,
    floor: s.floor ? plan.setting.floor === s.floor : null,
  };
  const presentN = items.filter((i) => i.present).length;
  const colorItems = items.filter((i) => 'color' in i);
  const relItems = items.filter((i) => 'relation' in i);
  const setVals = Object.values(setting).filter((v) => v !== null);
  return {
    items, setting,
    recall: presentN / items.length,
    color: colorItems.length ? colorItems.filter((i) => i.color).length / colorItems.length : null,
    relation: relItems.length ? relItems.filter((i) => i.relation).length / relItems.length : null,
    settingScore: setVals.length ? setVals.filter(Boolean).length / setVals.length : null,
    objects: plan.objects.length,
    library: plan.objects.filter((o) => o.kind !== 'custom').length / Math.max(1, plan.objects.length),
    extras: plan.objects.filter((o) => ![...found.values()].flat().includes(o)).map((o) => o.label),
  };
}

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(env.CONVEX_URL);
mkdirSync('apps/gate/public/eval', { recursive: true });
mkdirSync('docs/eval', { recursive: true });
let room = null;
if (!offlineOnly && !rescore) {
  room = await client.mutation(api.rooms.create, { title: 'Generation eval', displayName: 'Evaluator', demo: false, offline: false });
  await client.mutation(api.consents.give, { code: room.code, token: room.token, scopes: ['voice_processing', 'photo_processing', 'share_with_family'] });
}
const spend0 = await client.query(api.budget.status, {});
const results = [];
for (const c of CASES) {
  const off = validatePlan(planOffline(c.text));
  writeFileSync(`apps/gate/public/eval/${c.id}-offline.json`, JSON.stringify(off, null, 1));
  const row = { id: c.id, text: c.text, offline: score(off, c) };
  if (room) {
    const t0 = Date.now();
    const r = await client.action(api.sketch.plan, { code: room.code, token: room.token, words: [c.text] });
    row.ms = Date.now() - t0;
    row.source = r.source;
    const plan = validatePlan(r.plan);
    writeFileSync(`apps/gate/public/eval/${c.id}.json`, JSON.stringify(plan, null, 1));
    row.claude = score(plan, c);
    row.title = plan.title;
    row.intro = plan.intro;
    row.setting = plan.setting;
    row.objectsList = plan.objects.map((o) => `${o.label} [${o.kind}${o.color ? ' ' + o.color : ''}${o.relation !== 'none' ? ` ${o.relation} ${o.target ?? ''}` : ''}]`);
  }
  if (rescore) {
    try {
      const plan = validatePlan(JSON.parse(readFileSync(`apps/gate/public/eval/${c.id}.json`, 'utf8')));
      const timings = (() => { try { return JSON.parse(readFileSync('docs/eval/live-timings.json', 'utf8')); } catch { return {}; } })();
      row.ms = timings[c.id] ?? null; row.source = 'claude (saved)';
      row.claude = score(plan, c); row.title = plan.title; row.intro = plan.intro; row.setting = plan.setting;
      row.objectsList = plan.objects.map((o) => `${o.label} [${o.kind}${o.color ? ' ' + o.color : ''}${o.relation !== 'none' ? ` ${o.relation} ${o.target ?? ''}` : ''}]`);
    } catch { /* no saved plan for this case */ }
  }
  results.push(row);
  const f = (x) => (x === null || x === undefined ? '  –' : `${Math.round(x * 100)}%`.padStart(4));
  console.log(`${c.id.padEnd(11)} claude recall ${f(row.claude?.recall)} colour ${f(row.claude?.color)} relation ${f(row.claude?.relation)} setting ${f(row.claude?.settingScore)} | offline recall ${f(row.offline.recall)} colour ${f(row.offline.color)} ${row.ms ? `(${(row.ms / 1000).toFixed(1)} s)` : ''}`);
}
const spend1 = await client.query(api.budget.status, {});
const mean = (k, src) => { const v = results.map((r) => r[src]?.[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const summary = {};
for (const src of ['claude', 'offline']) summary[src] = { recall: mean('recall', src), color: mean('color', src), relation: mean('relation', src), setting: mean('settingScore', src), library: mean('library', src) };
summary.spentUsd = rescore ? 0.34 : spend1.usd - spend0.usd; // the live run of these 12 plans cost $0.34 (ledger estimate)
summary.medianMs = (() => { const v = results.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; })();
writeFileSync('docs/eval/generation-accuracy.json', JSON.stringify({ at: new Date().toISOString(), summary, results }, null, 1));
console.log('\nsummary', JSON.stringify(summary, null, 1));
