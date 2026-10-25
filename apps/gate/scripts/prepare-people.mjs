// The two people in a memory: the grandchild (a boy of about eight, 1.31 m) and the grandparent (a grandmother of
// about seventy-five, 1.56 m). Rigged MakeHuman characters (MPFB 2, CC0) on a Mixamo skeleton, each with one
// walk-in-place loop. The source exports are 17-19 MB each (2048 px PNG textures); this makes them light enough for a
// headset the way fetch-models.mjs does the object library: meshopt-compressed geometry, WebP textures at most
// 1024 px. The results go to public/people/ (kept in git, a few MB each) and the app reads them from there.
//   node apps/gate/scripts/prepare-people.mjs [sourceDir]   (default ~/Downloads/spanish_boy_and_grandma_vr)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] ?? path.join(homedir(), 'Downloads/spanish_boy_and_grandma_vr'));
const outDir = path.resolve(here, '../public/people');
const gltf = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4.1.1', ...args], { stdio: 'ignore' });

mkdirSync(outDir, { recursive: true });
for (const name of ['boy', 'grandma']) {
  const from = path.join(source, `${name}.glb`);
  if (!existsSync(from)) throw new Error(`Missing ${from}`);
  const to = path.join(outDir, `${name}.glb`);
  gltf('optimize', from, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false');
  console.log(`${name.padEnd(8)} ${(statSync(from).size / 1e6).toFixed(1)} MB → ${(statSync(to).size / 1e6).toFixed(2)} MB`);
}
