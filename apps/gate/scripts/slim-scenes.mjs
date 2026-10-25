// Fewer triangles for the living room's and the football field's heaviest models, which slim-showcase.mjs leaves alone
// (it only takes scattered plants and single trees). On the Quest the field drew 9.5 M triangles a frame: 76 maples and
// 76 oaks ringing the site at 27 k each, and the players at 34 k each; the room's candlesticks, phone, plants and
// curtains were 40-120 k apiece. Each here goes to a count its distance doesn't show. The background trees get their own
// far copies (`<id>_far`), since the garden and the lagoon show the same trees up close.
// Works on public/showcase/models (git-ignored); copy the results to dist/showcase/models (and any worktree's public).
//   node apps/gate/scripts/slim-scenes.mjs [--dry]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lab = path.resolve(here, '../.models-cache/scene-lab/node_modules');
const { NodeIO } = await import(path.join(lab, '@gltf-transform/core/dist/index.modern.js'));
const { ALL_EXTENSIONS } = await import(path.join(lab, '@gltf-transform/extensions/dist/index.modern.js'));
const { MeshoptDecoder } = await import(path.join(lab, 'meshoptimizer/index.js'));
const gt = path.join(lab, '.bin/gltf-transform');
const models = path.resolve(here, '../public/showcase/models');
const dry = process.argv.includes('--dry');

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const triangles = async (file) => {
  let n = 0;
  const doc = await io.read(file);
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(n);
};

// id → [target triangles, simplification error, into] (into: a copy beside the original, else in place)
const JOBS = {
  // the football field: players on the field, light towers and buses far off, the tree ring 115-185 m away
  sport_player_pads: [6000, 0.15],
  sport_light_tower: [12000, 0.5],
  sport_school_bus: [12000, 0.08],
  nat_maple_tree: [2200, 0.4, 'nat_maple_tree_far'],
  nat_oak_tree: [2200, 0.4, 'nat_oak_tree_far'],
  // the living room: things seen from a metre or two
  obj_candlestick: [6000, 0.03],
  obj_rotary_phone: [8000, 0.03],
  furn_potted_plant_02: [12000, 0.05],
  arch_curtain_victorian: [25000, 0.04],
  arch_sf_shopfront_building: [15000, 0.08],
  obj_tea_set: [8000, 0.03],
};

for (const [id, [target, error, into]] of Object.entries(JOBS)) {
  const src = path.join(models, `${id}.glb`);
  if (!existsSync(src)) { console.warn(`${id}: missing`); continue; }
  const out = path.join(models, `${into ?? id}.glb`);
  const tris = await triangles(src);
  if (into && existsSync(out)) { console.log(`${into}: already made (${await triangles(out)} triangles)`); continue; }
  if (tris <= target * 1.15) { if (into) copyFileSync(src, out); console.log(`${id}: ${tris} triangles, kept`); continue; }
  const ratio = Math.max(0.01, target / tris);
  if (dry) { console.log(`${id}: ${tris} → ~${target} (ratio ${ratio.toFixed(3)})${into ? ` as ${into}` : ''}`); continue; }
  const a = `${out}.weld.glb`, b = `${out}.simple.glb`, c = `${out}.slim.glb`;
  try {
    execFileSync(gt, ['weld', src, a], { stdio: 'ignore' });
    execFileSync(gt, ['simplify', a, b, '--ratio', String(ratio), '--error', String(error)], { stdio: 'ignore' });
    execFileSync(gt, ['meshopt', b, c], { stdio: 'ignore' });
    const now = await triangles(c);
    if (now > 0 && now < tris) { renameSync(c, out); console.log(`${into ?? id}: ${tris} → ${now} triangles (${(statSync(out).size / 1024).toFixed(0)} KB)`); }
    else console.log(`${id}: kept (${now} not fewer)`);
  } catch (e) { console.warn(`${id}: kept (${String(e).slice(0, 80)})`); }
  for (const t of [a, b, c]) rmSync(t, { force: true });
}
