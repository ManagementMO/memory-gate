// Bake a fixed orientation into a library GLB, for a model that a yaw alone cannot fix (Tripo returned the rug
// standing on its edge). Wraps the scene's root nodes in one node with scale S then rotation R (glTF applies S first).
//   node fixtures/library/orient.mjs <in.glb> <out.glb> --rot-z-deg 90 [--scale-x 0.25]
// Rug (2026-10-23): raw thin axis = X, patterned face = +X. --rot-z-deg 90 turns +X to +Y (pattern up, long side
// along X); --scale-x 0.25 (applied before the rotation) flattens Tripo's ~9 cm-per-metre bow to ~2 cm per metre.
// Uses @gltf-transform 4.5.1 from the prep glbopt install (GLBOPT_MODULES overrides the location).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODS = process.env.GLBOPT_MODULES || path.join(process.env.HOME, 'memory-gate-prep', 'scratch', 'glbopt', 'node_modules');
const { NodeIO } = await import(pathToFileURL(path.join(MODS, '@gltf-transform', 'core', 'dist', 'index.js')).href);
const { ALL_EXTENSIONS } = await import(pathToFileURL(path.join(MODS, '@gltf-transform', 'extensions', 'dist', 'index.js')).href);

const [input, output, ...rest] = process.argv.slice(2);
const opt = (name, dflt) => { const i = rest.indexOf(name); return i >= 0 ? Number(rest[i + 1]) : dflt; };
if (!input || !output) { console.error('usage: orient.mjs <in.glb> <out.glb> [--rot-z-deg D] [--rot-x-deg D] [--scale-x S] [--scale-y S] [--scale-z S]'); process.exit(2); }
const zDeg = opt('--rot-z-deg', 0), xDeg = opt('--rot-x-deg', 0);
const scale = [opt('--scale-x', 1), opt('--scale-y', 1), opt('--scale-z', 1)];
const qz = [0, 0, Math.sin((zDeg * Math.PI) / 360), Math.cos((zDeg * Math.PI) / 360)];
const qx = [Math.sin((xDeg * Math.PI) / 360), 0, 0, Math.cos((xDeg * Math.PI) / 360)];
// q = qz * qx (x rotation first, then z)
const q = [
  qz[3] * qx[0] + qz[0] * qx[3] + qz[1] * qx[2] - qz[2] * qx[1],
  qz[3] * qx[1] - qz[0] * qx[2] + qz[1] * qx[3] + qz[2] * qx[0],
  qz[3] * qx[2] + qz[0] * qx[1] - qz[1] * qx[0] + qz[2] * qx[3],
  qz[3] * qx[3] - qz[0] * qx[0] - qz[1] * qx[1] - qz[2] * qx[2],
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const wrap = doc.createNode('library_orient').setRotation(q).setScale(scale);
for (const child of scene.listChildren()) { scene.removeChild(child); wrap.addChild(child); }
scene.addChild(wrap);
await io.write(output, doc);
console.log(JSON.stringify({ input: path.basename(input), output: path.basename(output), rotation: q.map((v) => +v.toFixed(6)), scale }));
