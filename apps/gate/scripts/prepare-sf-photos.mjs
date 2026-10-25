// The San Francisco memories' photographs (src/sf/memories.ts): the demo photos in /photos at the repository root,
// made light for the page (at most 1600 px) with a small square-ish thumbnail for each map pin. They are demo
// photographs whose rights we don't hold for redistribution, so neither the originals nor these copies are in git.
//   node apps/gate/scripts/prepare-sf-photos.mjs [photosDir]      (macOS: uses sips)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(process.argv[2] ?? path.join(here, '../../../photos'));
const out = path.resolve(here, '../public/memories/sf');
mkdirSync(path.join(out, 'thumbs'), { recursive: true });
const sips = (...a) => execFileSync('sips', a, { stdio: 'ignore' });
let n = 0;
for (const f of readdirSync(src).filter((x) => /\.(jpe?g|png|webp)$/i.test(x))) {
  const from = path.join(src, f), to = path.join(out, f);
  if (!existsSync(to)) {
    copyFileSync(from, to);
    if (!/\.webp$/i.test(f)) sips('-Z', '1600', to);
  }
  const thumb = path.join(out, 'thumbs', f.replace(/\.\w+$/, '.jpg'));
  if (!existsSync(thumb)) sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '-Z', '360', from, '--out', thumb);
  n++;
}
const kb = readdirSync(out).filter((x) => !x.startsWith('.') && x !== 'thumbs').reduce((s, x) => s + statSync(path.join(out, x)).size, 0) / 1024;
console.log(`${n} photos → ${path.relative(process.cwd(), out)} (${(kb / 1024).toFixed(1)} MB, thumbnails in thumbs/)`);
