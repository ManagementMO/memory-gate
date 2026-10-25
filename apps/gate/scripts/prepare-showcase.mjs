// The showcase places (a garden, a football field, a classroom...): the scene lab's finished scenes, which a memory
// steps into instead of being planned when it is one of them. Copies each scene and its script into
// src/showcase/scenes/ (kept in git) and every model, sky and texture they use into public/showcase/ (not in git:
// the files come from the scene lab on this machine, apps/gate/.models-cache/scene-lab).
//   node apps/gate/scripts/prepare-showcase.mjs
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lab = path.resolve(here, '../.models-cache/scene-lab');
const srcDir = path.resolve(here, '../src/showcase/scenes');
const pub = path.resolve(here, '../public/showcase');
export const SHOWCASES = ['garden', 'football-field', 'classroom', 'bedroom-1950s-china', 'room-kit', 'house', 'sf-street', 'sf-alamo-square', 'golden-gate', 'palace-lagoon'];
for (const d of [srcDir, path.join(pub, 'models'), path.join(pub, 'hdri'), path.join(pub, 'textures')]) mkdirSync(d, { recursive: true });

const models = new Set(readdirSync(path.join(lab, 'models')).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)));
const hdris = new Set(readdirSync(path.join(lab, 'hdri')).map((f) => f.replace(/\.hdr$/, '')));
const textures = new Set(readdirSync(path.join(lab, 'textures')));
const need = { models: new Set(), hdri: new Set(), textures: new Set(), images: new Set() };
for (const name of SHOWCASES) {
  const json = path.join(lab, 'scenes', `${name}.json`);
  if (!existsSync(json)) { console.log(`skip ${name}: no scene`); continue; }
  const spec = JSON.parse(readFileSync(json, 'utf8'));
  copyFileSync(json, path.join(srcDir, `${name}.json`));
  let text = JSON.stringify(spec);
  if (spec.script && existsSync(path.join(lab, 'scenes', spec.script))) {
    const js = readFileSync(path.join(lab, 'scenes', spec.script), 'utf8');
    writeFileSync(path.join(srcDir, `${name}.js`), `// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/${spec.script}); run in the app by src/showcase/build.js.\n${js}`);
    text += js;
  }
  // every string that names a model, sky or texture the lab has
  for (const [, s] of text.matchAll(/["'`]([A-Za-z0-9_.\/-]{2,80})["'`]/g)) {
    if (models.has(s)) need.models.add(s);
    if (hdris.has(s)) need.hdri.add(s);
    if (textures.has(s)) need.textures.add(s);
    if (/\.(png|jpe?g|svg)$/.test(s) && existsSync(path.join(lab, s.replace(/^\//, '')))) need.images.add(s.replace(/^\//, ''));
  }
}
// the light copy of a model when there is one (the bridge's girders as boxes, scans simplified)
for (const m of need.models) copyFileSync(path.join(lab, 'models', existsSync(path.join(lab, 'models', `${m}_lite.glb`)) ? `${m}_lite.glb` : `${m}.glb`), path.join(pub, 'models', `${m}.glb`));
for (const h of need.hdri) copyFileSync(path.join(lab, 'hdri', `${h}.hdr`), path.join(pub, 'hdri', `${h}.hdr`));
for (const t of need.textures) cpSync(path.join(lab, 'textures', t), path.join(pub, 'textures', t), { recursive: true });
for (const i of need.images) { mkdirSync(path.dirname(path.join(pub, i)), { recursive: true }); copyFileSync(path.join(lab, i), path.join(pub, i)); }
const mb = (d) => readdirSync(d, { recursive: true }).reduce((s, f) => { const p = path.join(d, String(f)); return s + (statSync(p).isFile() ? statSync(p).size : 0); }, 0) / 1e6;
console.log(`${SHOWCASES.length} showcases: ${need.models.size} models, ${need.hdri.size} skies, ${need.textures.size} textures, ${need.images.size} images → public/showcase (${mb(pub).toFixed(0)} MB)`);
