// The proposal: the world memory showcased in San Francisco (src/world-memory). Two rigged MakeHuman characters
// (MPFB 2, CC0) in one scene: a man on one knee holding an open ring box, a woman with her hands over her mouth, and
// a 4 s breathing loop. The source export is 29 MB of PNG textures; this makes it light enough for a headset the way
// prepare-people.mjs does the boy and grandmother: meshopt-compressed geometry, WebP textures at most 1024 px.
// The result goes to public/memories/proposal/ (kept in git) and the page reads it from there.
//   node apps/gate/scripts/prepare-proposal.mjs [sourceDir]   (default ~/Downloads/proposal_scene_vr)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] ?? path.join(homedir(), 'Downloads/proposal_scene_vr'));
const outDir = path.resolve(here, '../public/memories/proposal');
const from = path.join(source, 'proposal_scene.glb');
if (!existsSync(from)) throw new Error(`Missing ${from}`);

mkdirSync(outDir, { recursive: true });
const to = path.join(outDir, 'proposal.glb');
execFileSync('npx', ['-y', '@gltf-transform/cli@4.1.1', 'optimize', from, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'], { stdio: 'ignore' });
console.log(`proposal ${(statSync(from).size / 1e6).toFixed(1)} MB → ${(statSync(to).size / 1e6).toFixed(2)} MB`);
