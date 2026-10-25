// The two people in a memory (apps/gate/public/people, apps/gate/scripts/prepare-people.mjs): light enough for a
// headset, rigged for head and hands, with a walk; each perspective sees from its person's own eyes; walking in the
// meadow happens on the ground you see; and a prepared place is shared, so guests follow into it.
import { readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { createTraversal } from '../../apps/gate/src/red-kite/traversal';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const gltfJson = (path: string) => {
  const b = readFileSync(new URL(path, root));
  expect(b.readUInt32LE(0)).toBe(0x46546c67); // glTF binary
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { nodes: { name?: string }[]; animations?: { name: string }[] };
};

test('the boy and the grandmother are light, rigged for head and hands, and walk', () => {
  for (const name of ['boy', 'grandma']) {
    const file = `apps/gate/public/people/${name}.glb`;
    expect(statSync(new URL(file, root)).size).toBeLessThan(3_000_000);
    const j = gltfJson(file);
    const bones = new Set(j.nodes.map((n) => n.name));
    for (const bone of ['Hips', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftToeBase', 'RightToeBase']) expect(bones.has(`mixamorig:${bone}`)).toBe(true);
    expect(j.animations?.some((a) => /walk/i.test(a.name))).toBe(true);
  }
});

test('each perspective sees from its person’s eyes, the same in the gate and the exchange', () => {
  const gate = read('apps/gate/src/social/store.ts');
  const exchange = read('spacetimedb/src/index.ts');
  const eye = (src: string, key: string) => Number(new RegExp(`${key}: \\{ label: '[^']+', eyeHeight: ([\\d.]+)`).exec(src)?.[1] ?? new RegExp(`key: '${key}', label: '[^']+', eyeHeight: ([\\d.]+)`).exec(src)?.[1]);
  expect(eye(gate, 'grandparent')).toBe(1.45);
  expect(eye(gate, 'child')).toBe(1.21);
  expect(eye(exchange, 'grandparent')).toBe(1.45);
  expect(eye(exchange, 'child')).toBe(1.21);
  const people = read('apps/gate/src/social/avatar/people.ts');
  expect(people).toContain("child: { url: '/people/boy.glb'");
  expect(people).toContain("grandparent: { url: '/people/grandma.glb'");
});

test('walking in the meadow happens on the ground you see: its collision mesh, lifted, meets the splats’ ground', async () => {
  const pack = JSON.parse(read('fixtures/worlds/red-kite.json'));
  const eye = -pack.floorY * pack.scale; // the gate draws the meadow with its floor estimate at y = 0 (PhotoWorld)
  // The visible ground: opaque splat centres of the light meadow near each viewpoint, in the gate's frame.
  const spz = gunzipSync(readFileSync(new URL('fixtures/worlds/red-kite-100k.spz', root)));
  const n = spz.readUInt32LE(8), bits = spz.readUInt8(13);
  const coord = (i: number) => { const o = 16 + i * 3; let v = spz[o]! | (spz[o + 1]! << 8) | (spz[o + 2]! << 16); if (v & 0x800000) v |= ~0xffffff; return v / (1 << bits); };
  const seen = (x: number, z: number) => {
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      if (spz[16 + n * 9 + i]! < 100) continue; // nearly transparent
      const wx = coord(i * 3) * pack.scale, wz = -coord(i * 3 + 2) * pack.scale;
      if (Math.hypot(wx - x, wz - z) < 0.35) ys.push(-coord(i * 3 + 1) * pack.scale + eye);
    }
    return ys.sort((a, b) => a - b)[ys.length >> 1]!;
  };
  // The collision mesh in the same frame, as Terrain builds it (and lifts it: normalizeSpawn).
  const file = readFileSync(new URL(pack.collision.file, root));
  const jsonBytes = file.readUInt32LE(12), gltf = JSON.parse(file.subarray(20, 20 + jsonBytes).toString()), bin = 28 + jsonBytes;
  const accessor = (i: number) => {
    const a = gltf.accessors[i], view = gltf.bufferViews[a.bufferView], count = a.count * (a.type === 'VEC3' ? 3 : 1);
    const Type = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    return new Type(file.buffer, file.byteOffset + bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0), count).slice();
  };
  const meshes = gltf.meshes.flatMap((m: { primitives: { attributes: { POSITION: number }; indices: number }[] }) => m.primitives.map((p) => {
    const v = Float32Array.from(accessor(p.attributes.POSITION));
    for (let i = 0; i < v.length; i += 3) { v[i] *= pack.scale; v[i + 1] = -v[i + 1]! * pack.scale + eye; v[i + 2] *= -pack.scale; }
    return { vertices: v, indices: Uint32Array.from(accessor(p.indices)) };
  }));
  const world = await createTraversal(meshes);
  try {
    for (const [x, z] of [[0, 0.25], [0.85, -4]] as const) { // the grandchild's and the grandparent's places
      const walked = world.groundAt(x, z, 2.5, 6)!;
      expect(Math.abs(walked - seen(x, z))).toBeLessThan(0.06);
    }
  } finally { world.dispose(); }
});

test('a prepared place the host steps into is shared, so a guest follows into it with everything where it was put', async () => {
  const { newT, setupRoom } = await import('./helpers');
  const { api } = await import('../../convex/_generated/api');
  const { PLACES, placePlan } = await import('../../packages/shared/src/places');
  const t = newT();
  const { code, owner, teller } = await setupRoom(t, { library: false });
  const plan = placePlan(PLACES['red-kite'], 'The meadow with the kite');
  plan.objects.push({ id: 'bench-1', kind: 'bench', label: 'bench', color: null, material: null, zone: 'center', relation: 'none', target: null, scale: 1, quote: 'the bench by the oak', at: [-1.7, -3.4] });
  const id = await t.mutation(api.memories.share, { code, token: owner, plan, place: 'red-kite' });
  const seen = await t.query(api.memories.current, { code, token: teller });
  expect(seen?.id).toBe(id);
  expect(seen?.place).toBe('red-kite');
  expect(seen?.mine).toBe(false); // the guest follows it
  expect((seen?.plan as typeof plan).objects.find((o) => o.id === 'bench-1')?.at).toEqual([-1.7, -3.4]);
  // Each thing brought in later updates the same memory.
  expect(await t.mutation(api.memories.share, { code, token: owner, memoryId: id, plan, place: 'red-kite' })).toBe(id);
});
