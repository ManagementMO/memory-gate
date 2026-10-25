import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const folder = new URL('../../apps/gate/public/red-kite/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8'));
const anchors = { kite: ['KiteRoot', 'KiteSail', 'StringAnchor', 'Tail_08'], spool: ['SpoolRoot', 'StringExit'], 'side-table': ['SupportRoot', 'SupportTop'], 'keepsake-box': ['KeepsakeRoot', 'LidPivot', 'StoryCardDock'], 'story-card': ['StoryCardRoot'] };
let totalBytes = 0, totalTriangles = 0;
for (const a of manifest.assets) {
  const raw = readFileSync(new URL(a.file, folder));
  assert.equal(raw.toString('ascii', 0, 4), 'glTF'); assert.equal(raw.readUInt32LE(4), 2);
  assert.equal(raw.length, a.bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), a.sha256);
  const gltf = JSON.parse(raw.toString('utf8', 20, 20 + raw.readUInt32LE(12)));
  assert.equal(gltf.scenes.length, 1, `${a.key} must contain only its active Blender scene`);
  const names = gltf.nodes.map(n => n.name);
  for (const name of anchors[a.key]) assert(names.includes(name), `${a.key}: missing ${name}`);
  for (const other of Object.keys(anchors).filter(k => k !== a.key)) assert(!names.includes(anchors[other][0]), `${a.key} accidentally contains ${other}`);
  assert(!names.includes('Cube') && !names.includes('Camera'), 'factory scene leaked into export');
  const triangles = gltf.meshes.flatMap(m => m.primitives).reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0);
  assert.equal(triangles, a.triangles, `${a.key} measured triangle count differs from actual GLB`);
  assert(a.librarySize > .05 && a.librarySize < 3, `${a.key} meter scale is implausible`);
  totalBytes += raw.length; totalTriangles += triangles;
}
console.log(JSON.stringify({ validatedModels: manifest.assets.length, totalBytes, totalTriangles, source: manifest.source }));
