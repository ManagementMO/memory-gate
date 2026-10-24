// The photoreal object library: hand-picked Poly Haven models (CC0: free for any use, no credit required) for the
// object kinds Claude plans most, downloaded at 1k textures and packed into one .glb each under public/models/ (not in
// git), with a manifest the app reads. Kinds not listed keep their porcelain sketch, or are generated live.
// Any .glb (a Blender export, for instance) can be added by hand: put it in public/models/ and list it in the manifest.
//   node apps/gate/scripts/fetch-models.mjs            (about 60-100 MB; re-runs skip what is already there)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public/models');
const rawDir = path.join(outDir, '.raw');
const UA = { 'User-Agent': 'MemoryGate/1.0 (Cal Hacks; photoreal object library)' };

/** kind → Poly Haven asset id. One model per kind; fitted to the kind's footprint and height in the app. */
export const PICKS = {
  table: 'dining_table',
  round_table: 'round_wooden_table_01',
  chair: 'WoodenChair_01',
  armchair: 'ArmChair_01',
  sofa: 'Sofa_01',
  bed: 'GothicBed_01',
  bookshelf: 'wooden_bookshelf_worn',
  cabinet: 'vintage_cabinet_01',
  lamp: 'vintage_oil_lamp',
  fireplace: 'scandinavian_masonry_heater',
  radio: 'vintage_radio_transceiver',
  tv: 'Television_01',
  clock: 'mantel_clock_01',
  picture_frame: 'standing_picture_frame_01',
  vase_flowers: 'ceramic_vase_02',
  potted_plant: 'potted_plant_01',
  teapot: 'tea_set_01',
  bowl_fruit: 'wooden_bowl_01',
  cake: 'strawberry_chocolate_cake',
  books: 'decorative_book_set_01',
  candle: 'wooden_candlestick',
  stove: 'electric_stove',
  tree: 'island_tree_01',
  pine_tree: 'pine_tree_01',
  bush: 'shrub_01',
  flowers: 'periwinkle_plant',
  bench: 'painted_wooden_bench',
  lamp_post: 'street_lamp_01',
  dock: 'modular_wooden_pier',
  rock: 'boulder_01',
  campfire: 'stone_fire_pit',
};

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

mkdirSync(outDir, { recursive: true });
const manifest = { source: 'Poly Haven (polyhaven.com), CC0', kinds: {} };
for (const [kind, id] of Object.entries(PICKS)) {
  const glb = path.join(outDir, `${kind}.glb`);
  try {
    const info = await getJson(`https://api.polyhaven.com/info/${id}`);
    if (!existsSync(glb)) {
      const files = await getJson(`https://api.polyhaven.com/files/${id}`);
      const g = files.gltf?.['1k']?.gltf;
      if (!g) throw new Error('no 1k glTF');
      const dir = path.join(rawDir, id);
      const main = path.join(dir, path.basename(new URL(g.url).pathname));
      await download(g.url, main);
      for (const [rel, f] of Object.entries(g.include ?? {})) await download(f.url, path.join(dir, rel));
      // Pack the glTF and its textures into a single .glb (no re-encoding).
      execFileSync('npx', ['-y', '@gltf-transform/cli@4.1.1', 'copy', main, glb], { stdio: 'ignore' });
    }
    manifest.kinds[kind] = { file: `${kind}.glb`, id, title: info.name ?? id, authors: Object.keys(info.authors ?? {}), license: 'CC0', polycount: info.polycount ?? null, bytes: statSync(glb).size };
    console.log(`ok   ${kind.padEnd(14)} ${id} (${(statSync(glb).size / 1e6).toFixed(1)} MB)`);
  } catch (e) {
    console.log(`skip ${kind.padEnd(14)} ${id}: ${String(e).slice(0, 120)}`);
  }
}
rmSync(rawDir, { recursive: true, force: true });
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const total = Object.values(manifest.kinds).reduce((s, k) => s + k.bytes, 0);
console.log(`\n${Object.keys(manifest.kinds).length} models, ${(total / 1e6).toFixed(1)} MB → ${path.relative(process.cwd(), outDir)}`);
