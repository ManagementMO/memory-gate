// The people in a memory: the grandchild (a boy of about eight, 1.31 m), the grandparent (a grandmother of about
// seventy-five, 1.56 m) and the grandmother as a girl (about eight, 1.29 m, his friend in the meadow). Rigged
// MakeHuman characters (MPFB 2, CC0) on a Mixamo skeleton, each with one walk-in-place loop. The boy has a second
// export for when he's standing in (nobody seeing through his eyes): the same boy and skeleton holding a daisy, with a
// 10 s "Idle_Flower" loop and no walk. The source exports are 17-20 MB each (2048 px PNG textures); this makes them
// light enough for a headset the way fetch-models.mjs does the object library: meshopt-compressed geometry, WebP
// textures at most 1024 px. The results go to public/people/ (kept in git, a few MB each) and the app reads them from
// there. The girl is built from the boy by make-girl.py; her raw export comes from --girl, else sourceDir/girl.glb,
// and she is skipped (with a note) when it is in neither.
//   node apps/gate/scripts/prepare-people.mjs [sourceDir] [flowerDir] [--girl path/to/girl.glb]
//   (defaults ~/Downloads/spanish_boy_and_grandma_vr and ~/Downloads/boy_flower_idle)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const girlAt = argv.indexOf('--girl');
const girl = girlAt >= 0 ? path.resolve(argv.splice(girlAt, 2)[1] ?? '') : null;
const source = path.resolve(argv[0] ?? path.join(homedir(), 'Downloads/spanish_boy_and_grandma_vr'));
const flower = path.resolve(argv[1] ?? path.join(homedir(), 'Downloads/boy_flower_idle'));
const outDir = path.resolve(here, '../public/people');
const gltf = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4.1.1', ...args], { stdio: 'ignore' });

mkdirSync(outDir, { recursive: true });
for (const [name, from] of [['boy', path.join(source, 'boy.glb')], ['grandma', path.join(source, 'grandma.glb')], ['boy-flower', path.join(flower, 'boy_flower.glb')], ['girl', girl ?? path.join(source, 'girl.glb')]]) {
  if (!existsSync(from)) {
    if (name !== 'girl') throw new Error(`Missing ${from}`);
    console.log(`girl     skipped: no ${from} (make-girl.py builds her)`);
    continue;
  }
  const to = path.join(outDir, `${name}.glb`);
  gltf('optimize', from, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false');
  console.log(`${name.padEnd(10)} ${(statSync(from).size / 1e6).toFixed(1)} MB → ${(statSync(to).size / 1e6).toFixed(2)} MB`);
}
