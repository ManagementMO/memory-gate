// The photoreal library beyond Poly Haven: more kinds, and variants a label chooses ("rocking chair", "old radio",
// "Monterey cypress"). scripts/library.json maps each kind to its models; each model comes from the scene lab's
// compressed copy when this machine has it (apps/gate/.models-cache/scene-lab/models), else it is downloaded from
// its source (Sketchfab needs SKETCHFAB_API_TOKEN; Poly Haven needs nothing) and made headset-light the way
// fetch-models.mjs does. The files go to public/models/lib/ (not in git); manifest.json gains the kinds and
// variants beside fetch-models.mjs's picks, and credits.html lists every author and license (CC-BY needs it shown).
//   node apps/gate/scripts/build-library.mjs          (after fetch-models.mjs; re-runs copy only what is missing)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public/models');
const libDir = path.join(outDir, 'lib');
const labModels = path.resolve(here, '../.models-cache/scene-lab/models');
const rawDir = path.resolve(here, '../.models-cache/.library-raw');
const UA = { 'User-Agent': 'MemoryGate/1.0 (Cal Hacks; photoreal object library)' };
const { kinds, models } = JSON.parse(readFileSync(path.join(here, 'library.json'), 'utf8'));
const gltf = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4.1.1', ...args], { stdio: 'ignore' });

async function download(url, file, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

/** Get one model into public/models/lib/: the lab's copy, else its source, compressed for a headset. */
async function fetchModel(id, m) {
  const to = path.join(libDir, `${id}.glb`);
  if (existsSync(to)) return true;
  const lab = path.join(labModels, `${id}.glb`);
  if (existsSync(lab)) { copyFileSync(lab, to); return true; }
  const raw = path.join(rawDir, `${id}.glb`);
  if (m.uid) {
    const token = process.env.SKETCHFAB_API_TOKEN;
    if (!token) throw new Error('needs SKETCHFAB_API_TOKEN');
    const r = await fetch(`https://api.sketchfab.com/v3/models/${m.uid}/download`, { headers: { ...UA, Authorization: `Token ${token}` } });
    if (!r.ok) throw new Error(`${r.status} sketchfab download`);
    const d = await r.json();
    await download(d.glb.url, raw);
  } else if (m.asset) {
    const files = await (await fetch(`https://api.polyhaven.com/files/${m.asset}`, { headers: UA })).json();
    const g = files.gltf?.['1k']?.gltf;
    if (!g) throw new Error('no 1k glTF');
    const dir = path.join(rawDir, `.ph-${m.asset}`);
    const main = path.join(dir, path.basename(new URL(g.url).pathname));
    await download(g.url, main);
    for (const [rel, f] of Object.entries(g.include ?? {})) await download(f.url, path.join(dir, rel));
    gltf('copy', main, raw);
    rmSync(dir, { recursive: true, force: true });
  } else throw new Error('no source');
  const tris = m.tris ?? 0;
  const ratio = tris > 60_000 ? Math.max(0.05, 60_000 / tris) : 0;
  gltf('optimize', raw, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024',
    ...(ratio ? ['--simplify', 'true', '--simplify-ratio', ratio.toFixed(3)] : ['--simplify', 'false']));
  rmSync(raw, { force: true });
  return true;
}

const credit = (id) => {
  const m = models[id];
  return { id, title: m.title, authors: m.author ? [m.author] : [], license: m.license, url: m.url, ...(m.fix ? { fix: m.fix } : {}) };
};

mkdirSync(libDir, { recursive: true });
const manifestFile = path.join(outDir, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { kinds: {} };
manifest.source = 'Poly Haven (polyhaven.com), CC0, and the scene lab library (Sketchfab, Poly Haven; CC0 / CC-BY / CC-BY-SA): see credits.html';
const ok = new Set();
const failed = [];
for (const id of Object.keys(models)) {
  try {
    if (await fetchModel(id, models[id])) ok.add(id);
  } catch (e) {
    failed.push(`${id} (${String(e.message ?? e).slice(0, 60)})`);
  }
}
for (const [kind, k] of Object.entries(kinds)) {
  const entry = { ...(manifest.kinds[kind] ?? {}) };
  if (k.use && ok.has(k.use)) Object.assign(entry, { file: `lib/${k.use}.glb`, ...credit(k.use) });
  const variants = Object.entries(k.variants ?? {}).filter(([id]) => ok.has(id)).map(([id, syn]) => ({ file: `lib/${id}.glb`, syn, ...credit(id) }));
  if (!entry.file && variants.length) Object.assign(entry, variants.shift()); // no default of its own: the first variant stands in
  if (!entry.file) continue;
  delete entry.syn;
  if (variants.length) entry.variants = variants; else delete entry.variants;
  if (k.mix) entry.mix = true; else delete entry.mix;
  manifest.kinds[kind] = entry;
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

// Credits: every model the app can draw, with its author and license.
const rows = [];
for (const [kind, e] of Object.entries(manifest.kinds)) for (const m of [e, ...(e.variants ?? [])]) {
  rows.push({ kind, title: m.title ?? m.id, authors: (m.authors ?? []).join(', '), license: m.license ?? 'CC0', url: m.url ?? (m.id ? `https://polyhaven.com/a/${m.id}` : '') });
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
writeFileSync(path.join(outDir, 'credits.html'), `<!doctype html><meta charset="utf-8"><title>Model credits</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:960px;padding:0 1rem;color:#222}td,th{padding:4px 10px;text-align:left;border-bottom:1px solid #eee}th{font-weight:600}</style>
<h1>3D model credits</h1><p>The objects in a memory are drawn with these models. Thank you to every author.</p>
<table><tr><th>Kind</th><th>Model</th><th>Author</th><th>License</th></tr>
${rows.map((r) => `<tr><td>${esc(r.kind)}</td><td>${r.url ? `<a href="${esc(r.url)}">${esc(r.title)}</a>` : esc(r.title)}</td><td>${esc(r.authors)}</td><td>${esc(r.license)}</td></tr>`).join('\n')}
</table>`);
const bytes = [...ok].reduce((s, id) => s + statSync(path.join(libDir, `${id}.glb`)).size, 0);
console.log(`${Object.keys(manifest.kinds).length} kinds, ${ok.size} library models (${(bytes / 1e6).toFixed(1)} MB) → ${path.relative(process.cwd(), outDir)}`);
if (failed.length) console.log(`not fetched: ${failed.join(', ')}`);
