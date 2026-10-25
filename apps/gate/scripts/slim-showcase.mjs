// Fewer triangles for the showcase models a headset can't afford: a flower scattered seventy times was 31k triangles
// (the garden drew ten million a frame on the Quest, at 20 fps, and took 40 s to put together). Scattered plants go
// to about 2,500 triangles, and a single tree, bush or rock over 40k to 40k (a landmark, a house or a car keeps its
// detail); the shapes hold at the distances they're seen from.
// Works on the copies in public/showcase/models (after prepare-showcase.mjs and lighten-showcase.mjs); the scene
// lab's originals are untouched.
//   node apps/gate/scripts/slim-showcase.mjs [--dry]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lab = path.resolve(here, '../.models-cache/scene-lab/node_modules');
const { NodeIO } = await import(path.join(lab, '@gltf-transform/core/dist/index.modern.js'));
const { ALL_EXTENSIONS } = await import(path.join(lab, '@gltf-transform/extensions/dist/index.modern.js'));
const { MeshoptDecoder } = await import(path.join(lab, 'meshoptimizer/index.js'));
const gt = path.join(lab, '.bin/gltf-transform');
const models = path.resolve(here, '../public/showcase/models');
const scenes = path.resolve(here, '../src/showcase/scenes');
const dry = process.argv.includes('--dry');

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const triangles = async (file) => {
  let n = 0;
  const doc = await io.read(file);
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(n);
};

// what's scattered (many copies) anywhere
const scattered = new Set();
for (const f of readdirSync(scenes).filter((x) => x.endsWith('.json'))) {
  const spec = JSON.parse(readFileSync(path.join(scenes, f), 'utf8'));
  for (const sc of spec.scatter ?? []) if (sc.m) scattered.add(sc.m);
}

let before = 0, after = 0;
for (const f of readdirSync(models).filter((x) => x.endsWith('.glb'))) {
  const file = path.join(models, f), id = f.replace(/\.glb$/, '');
  const tris = await triangles(file).catch(() => 0);
  // scattered plants, and single trees, bushes and rocks; a landmark, a house or a car keeps its detail
  const target = scattered.has(id) ? 2500 : /^nat_/.test(id) ? 40000 : Infinity;
  before += tris;
  if (tris <= target * 1.15) { after += tris; continue; }
  const ratio = Math.max(0.02, target / tris);
  if (dry) { console.log(`${id}: ${tris} → ~${target} (ratio ${ratio.toFixed(3)})`); after += target; continue; }
  const a = `${file}.weld.glb`, b = `${file}.simple.glb`, c = `${file}.slim.glb`;
  try {
    execFileSync(gt, ['weld', file, a], { stdio: 'ignore' });
    execFileSync(gt, ['simplify', a, b, '--ratio', String(ratio), '--error', '0.05'], { stdio: 'ignore' });
    execFileSync(gt, ['meshopt', b, c], { stdio: 'ignore' });
    const now = await triangles(c);
    if (now > 0 && now < tris) { renameSync(c, file); after += now; console.log(`${id}: ${tris} → ${now} triangles (${(statSync(file).size / 1024).toFixed(0)} KB)`); }
    else after += tris;
  } catch (e) { after += tris; console.warn(`${id}: kept (${String(e).slice(0, 80)})`); }
  for (const t of [a, b, c]) rmSync(t, { force: true });
}
console.log(`models: ${(before / 1e6).toFixed(2)} M → ${(after / 1e6).toFixed(2)} M triangles (one of each)`);
