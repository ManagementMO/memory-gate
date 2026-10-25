// Make the showcase places light enough to arrive in a few seconds over a tunnel, on a headset: their textures at
// most 512 px, their skies the 1k HDRIs, their models' textures 512 px. Works on the copies in public/showcase/ (made by
// prepare-showcase.mjs); the scene lab's originals are untouched. macOS (sips) and the scene lab's glTF-Transform.
//   node apps/gate/scripts/lighten-showcase.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../public/showcase');
const gt = path.resolve(here, '../.models-cache/scene-lab/node_modules/.bin/gltf-transform');
const size = (d) => readdirSync(d, { recursive: true }).reduce((s, f) => { const p = path.join(d, String(f)); return s + (statSync(p).isFile() ? statSync(p).size : 0); }, 0);
const before = size(pub);

// textures: 512 px, plain JPEG
for (const t of readdirSync(path.join(pub, 'textures'))) for (const f of ['diff.jpg', 'nor.jpg', 'rough.jpg']) {
  const p = path.join(pub, 'textures', t, f);
  if (existsSync(p)) execFileSync('sips', ['-Z', '512', '-s', 'formatOptions', '72', p], { stdio: 'ignore' });
}
// skies: the 1k HDRIs
for (const f of readdirSync(path.join(pub, 'hdri'))) {
  const name = f.replace(/\.hdr$/, '');
  try {
    const files = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json();
    const url = files.hdri?.['1k']?.hdr?.url;
    if (!url) continue;
    writeFileSync(path.join(pub, 'hdri', f), Buffer.from(await (await fetch(url)).arrayBuffer()));
  } catch { /* keep the larger sky */ }
}
// models: their textures at 512 px
for (const f of readdirSync(path.join(pub, 'models')).filter((x) => x.endsWith('.glb'))) {
  const p = path.join(pub, 'models', f), tmp = `${p}.tmp.glb`;
  try {
    execFileSync(gt, ['resize', p, tmp, '--width', '512', '--height', '512'], { stdio: 'ignore' });
    renameSync(tmp, p);
  } catch { /* keep it as it was */ }
}
console.log(`public/showcase: ${(before / 1e6).toFixed(0)} MB → ${(size(pub) / 1e6).toFixed(0)} MB`);
