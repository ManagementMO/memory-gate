// Fetch a CC0 Poly Haven model (no login) as 1K glTF and pack it into one shrunken GLB for the library.
// Usage: node fixtures/library/polyhaven-fetch.mjs <assetId> <out.glb>      e.g. ArmChair_01 fixtures/large/armchair-ph.glb
// Files land in fixtures/large/polyhaven/<assetId>/ (gitignored; a fresh directory per asset, treated as data only),
// then `gltf-transform optimize --compress false --texture-compress webp --texture-size 1024` (plain GLB, no meshopt:
// the headset loads plain GLBs). Prints the asset's authors and license from the Poly Haven API for LICENSES.md.
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GLTF_TRANSFORM = path.join(os.homedir(), 'memory-gate-prep', 'scratch', 'glbopt', 'node_modules', '.bin', 'gltf-transform');
const [id, outArg] = process.argv.slice(2);
if (!id || !outArg || !/^[A-Za-z0-9_]+$/.test(id)) { console.error('usage: polyhaven-fetch.mjs <assetId> <out.glb>'); process.exit(2); }
const out = path.resolve(outArg);
const getJson = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'memory-gate-practice/0.1' } }); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); };

const info = await getJson(`https://api.polyhaven.com/info/${id}`);
const files = await getJson(`https://api.polyhaven.com/files/${id}`);
const g = files?.gltf?.['1k']?.gltf;
if (!g?.url) throw new Error(`no 1k glTF for ${id}`);
const dir = path.join(REPO, 'fixtures', 'large', 'polyhaven', id);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const save = async (url, rel) => {
  const target = path.resolve(dir, rel);
  if (!target.startsWith(dir + path.sep)) throw new Error(`refusing path outside the asset dir: ${rel}`);
  mkdirSync(path.dirname(target), { recursive: true });
  const r = await fetch(url); if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  writeFileSync(target, Buffer.from(await r.arrayBuffer()));
};
const gltfName = path.basename(new URL(g.url).pathname);
await save(g.url, gltfName);
for (const [rel, f] of Object.entries(g.include ?? {})) await save(f.url, rel);
execFileSync(GLTF_TRANSFORM, ['optimize', path.join(dir, gltfName), out, '--compress', 'false', '--texture-compress', 'webp', '--texture-size', '1024'], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(JSON.stringify({ id, name: info.name, authors: info.authors, license: 'CC0-1.0 (Poly Haven)', page: `https://polyhaven.com/a/${id}`, polycount: info.polycount ?? null,
  dimensions_mm: info.dimensions ?? null, out: path.relative(REPO, out), glbMB: +(statSync(out).size / 1e6).toFixed(2) }));
