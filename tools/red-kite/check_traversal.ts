// Real cached collider + the production Rapier controller. No renderer, credentials or provider calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createTraversal } from '../../apps/gate/src/red-kite/traversal';

const root = new URL('../../', import.meta.url);
const pack = JSON.parse(readFileSync(new URL('fixtures/worlds/red-kite.json', root), 'utf8'));
const fullSource = readFileSync(new URL(pack.fullResolution.file, root));
assert.equal(fullSource.byteLength, pack.fullResolution.bytes);
assert.equal(createHash('sha256').update(fullSource).digest('hex'), pack.fullResolution.sha256);
const file = readFileSync(new URL(pack.collision.file, root));
assert.equal(createHash('sha256').update(file).digest('hex'), pack.collision.sha256);
assert.equal(file.readUInt32LE(0), 0x46546c67);
const jsonBytes = file.readUInt32LE(12), gltf = JSON.parse(file.subarray(20, 20 + jsonBytes).toString()), binOffset = 28 + jsonBytes;
assert(gltf.nodes.every((n: Record<string, unknown>) => !n.matrix && !n.translation && !n.rotation && !n.scale), 'This verification parser expects the cached mesh identity nodes.');
function read(index: number): Float32Array | Uint32Array | Uint16Array {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView], elements = a.count * (a.type === 'VEC3' ? 3 : 1);
  const Type = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
  return new Type(file.buffer, file.byteOffset + binOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0), elements).slice();
}
const meshes = gltf.meshes.flatMap((mesh: { primitives: { attributes: { POSITION: number }; indices: number }[] }) => mesh.primitives.map(p => {
  const vertices = Float32Array.from(read(p.attributes.POSITION));
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] *= pack.scale; vertices[i + 1] = -vertices[i + 1]! * pack.scale - pack.floorY * pack.scale; vertices[i + 2] *= -pack.scale;
  }
  return { vertices, indices: Uint32Array.from(read(p.indices)) };
}));
const world = await createTraversal(meshes);
const visited: unknown[] = [], started = performance.now();
try {
  assert.equal(world.triangles, 51610);
  for (const [x, z] of [[0,-8], [6,-8], [6,0], [0,.25], [.85,-4]]) {
    let reached = false;
    for (let i = 0; i < 1500; i++) {
      const p = world.feet, dx = x! - p[0], dz = z! - p[2], length = Math.hypot(dx, dz);
      if (length < .15) { reached = true; break; }
      const step = Math.min(length, 2.2 / 60);
      world.step([dx / length * step, dz / length * step], 1 / 60);
      assert(world.feet.every(Number.isFinite));
    }
    visited.push({ target: [x, z], reached, feet: world.feet, grounded: world.grounded });
    assert(reached, `The real collider route was blocked before ${x},${z}: ${JSON.stringify(world.feet)}`);
  }
  assert(world.distance > 30, 'The visitor must traverse tens of metres, not only the story anchors.');
  const report = { date: new Date().toISOString(), engine: 'Rapier 0.21.0 kinematic capsule', worldId: pack.worldId, colliderSha256: pack.collision.sha256, triangles: world.triangles, verticalShift: world.verticalShift, distanceMeters: world.distance, visited, elapsedMs: performance.now() - started, providerCalls: 0, physicalQuestTested: false };
  mkdirSync(new URL('evidence/red-kite/', root), { recursive: true });
  writeFileSync(new URL('evidence/red-kite/traversal-report.json', root), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { world.dispose(); }
