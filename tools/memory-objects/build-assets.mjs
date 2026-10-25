// Original, economical geometry for optional memory props. No downloaded artwork.
import * as THREE from '../../apps/gate/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../apps/gate/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../apps/gate/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateMemoryGlb } from '../../packages/shared/src/memoryObjects.ts';
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
const wood = new THREE.MeshStandardMaterial({ color: '#a16d3e', roughness: .85 });
const edge = new THREE.MeshStandardMaterial({ color: '#614733', roughness: .9 });
const metal = new THREE.MeshStandardMaterial({ color: '#3e5949', roughness: .65, metalness: .2 });
const group = () => new THREE.Group();
function mesh(root, geometry, material, at, scale) { const m = new THREE.Mesh(geometry, material); m.position.set(...at); if (scale) m.scale.set(...scale); root.add(m); return m; }
function box(root, dimensions, material, at) { return mesh(root, new THREE.BoxGeometry(...dimensions), material, at); }
function beam(root, a, b, thickness, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const m = box(root, [thickness, delta.length(), thickness], material, start.add(end).multiplyScalar(.5).toArray());
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}
const bridge = group(), arch = x => .15 + .25 * (1 - (x / 1.2) ** 2);
for (let i = 0; i < 17; i++) { const x = -1.12 + i * .14; const plank = box(bridge, [.132, .055, .95], i % 4 === 0 ? edge : wood, [x, arch(x), 0]); plank.rotation.z = Math.atan(-.5 * x / 1.44); }
for (const z of [-.44, .44]) {
  for (let i = 0; i < 8; i++) { const x = -1.2 + i * .3, next = x + .3; beam(bridge, [x, arch(x) + .55, z], [next, arch(next) + .55, z], .065, edge); beam(bridge, [x, arch(x) - .07, z * .85], [next, arch(next) - .07, z * .85], .085, edge); }
  for (const x of [-1.12, -.56, 0, .56, 1.12]) {
    box(bridge, [.065, .59, .065], wood, [x, arch(x) + .26, z]);
    mesh(bridge, new THREE.SphereGeometry(.043, 8, 5), metal, [x, arch(x) + .57, z]);
  }
}
const bench = group();
for (let i = 0; i < 4; i++) box(bench, [1.6, .045, .095], wood, [0, .45, -.18 + i * .12]);
for (const x of [-.61, .61]) {
  for (const z of [-.15, .15]) box(bench, [.055, .43, .055], metal, [x, .215, z]);
  beam(bench, [x, .38, .2], [x, .97, .28], .05, metal);
  beam(bench, [x, .64, -.20], [x, .64, .25], .055, metal);
  box(bench, [.055, .2, .055], metal, [x, .54, -.17]);
}
for (let i = 0; i < 3; i++) box(bench, [1.6, .11, .045], wood, [0, .65 + i * .14, .25]);
const flower = group(), clay = new THREE.MeshStandardMaterial({ color: '#b9704d', roughness: 1 });
const soil = new THREE.MeshStandardMaterial({ color: '#4f4334', roughness: 1 }), leaf = new THREE.MeshStandardMaterial({ color: '#5c7a46', roughness: .9 });
const cream = new THREE.MeshStandardMaterial({ color: '#f3d8a0', roughness: .8 }), coral = new THREE.MeshStandardMaterial({ color: '#d98665', roughness: .8 });
const gold = new THREE.MeshStandardMaterial({ color: '#c58a32', roughness: .85 });
mesh(flower, new THREE.CylinderGeometry(.23, .17, .28, 18), clay, [0, .14, 0]);
mesh(flower, new THREE.TorusGeometry(.22, .025, 6, 18), clay, [0, .275, 0]).rotation.x = Math.PI / 2;
mesh(flower, new THREE.CylinderGeometry(.20, .20, .015, 18), soil, [0, .278, 0]);
for (const [x, y, z, color] of [[-.09, .66, .04, cream], [.075, .74, 0, coral], [0, .56, -.07, cream]]) {
  beam(flower, [x, .28, z], [x, y, z], .012, leaf);
  mesh(flower, new THREE.SphereGeometry(.045, 8, 5), leaf, [x + .04, .43, z], [1.8, .35, .7]);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const petal = mesh(flower, new THREE.SphereGeometry(.06, 8, 5), color, [x + Math.cos(a) * .067, y, z + Math.sin(a) * .067], [1, .3, .65]); petal.rotation.y = -a; }
  mesh(flower, new THREE.SphereGeometry(.033, 8, 5), gold, [x, y + .008, z], [1, .55, 1]);
}
const output = new URL('../../apps/gate/public/memory-objects/', import.meta.url); mkdirSync(output, { recursive: true });
const manifest = { units: 'meters', origin: 'ground-centre', attribution: 'Original Memory Gate procedural illustrations; no claim of landmark accuracy.', source: 'tools/memory-objects/build-assets.mjs', assets: {} };
for (const [key, root] of Object.entries({ bridge, bench, flower })) {
  root.updateMatrixWorld(true); const batches = new Map();
  root.traverse(m => { if (!m.isMesh) return; const list = batches.get(m.material) ?? []; list.push(m.geometry.clone().applyMatrix4(m.matrixWorld).toNonIndexed()); batches.set(m.material, list); });
  const packed = group(); packed.name = 'MemoryGate_' + key;
  for (const [material, geometries] of batches) packed.add(new THREE.Mesh(mergeGeometries(geometries), material));
  const data = new Uint8Array(await new GLTFExporter().parseAsync(packed, { binary: true }));
  const { triangles } = validateMemoryGlb(data); writeFileSync(new URL(key + '.glb', output), data);
  manifest.assets[key] = { bytes: data.byteLength, triangles, drawCalls: packed.children.length, sha256: createHash('sha256').update(data).digest('hex') };
}
writeFileSync(new URL('manifest.json', output), JSON.stringify(manifest, null, 2) + '\n'); console.log(JSON.stringify(manifest.assets, null, 2));
