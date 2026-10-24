// Library facing check (?check=models, dev only): each library GLB, normalized like the app does, with its seed
// yawOffset applied, then turned by +0°, +90°, +180°, +270° (columns). The camera sits on +Z looking toward -Z, so
// the column that shows the model's front gives the corrected yawOffset = seed + column angle.
// Models come straight from fixtures/large (the files scripts/seed.mjs uploads), served by Vite's /@fs/.
import type { World } from '@iwsdk/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const LIB = [
  { key: 'piano', file: 'piano.glb', size: 1.45, yaw: -Math.PI / 2 },
  { key: 'armchair', file: 'armchair.glb', size: 0.95, yaw: 0 },
  { key: 'radio', file: 'radio.glb', size: 0.42, yaw: -Math.PI / 2 },
  { key: 'bowl of oranges', file: 'oranges.glb', size: 0.3, yaw: 0 },
  { key: 'chair', file: 'chair-cc0.glb', size: 0.85, yaw: 0 },
];

export async function modelCheck(world: World, fixturesAbs: string): Promise<void> {
  const params = new URLSearchParams(location.search);
  const only = params.get('only');
  const extra = Number(params.get('extra') || 0); // radians added to every model (to verify a proposed offset)
  const lib = only ? LIB.filter((l) => l.key === only) : LIB;
  world.renderer.toneMapping = THREE.NoToneMapping;
  world.scene.background = new THREE.Color(0x2a221b);
  world.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(1, 3, 4);
  world.scene.add(d);
  const loader = new GLTFLoader();
  const cols = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  const cell = 1.9;
  const done: string[] = [];
  for (const [r, l] of lib.entries()) {
    const g = await loader.loadAsync(`/@fs${fixturesAbs}/${l.file}`);
    for (const [c, add] of cols.entries()) {
      const model = g.scene.clone(true);
      const holder = new THREE.Group();
      holder.add(model);
      model.rotation.y = l.yaw + extra; // record yaw (library yawOffset)
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const sz = box.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(1.3 / Math.max(sz.x, sz.y, sz.z)); // same visual size for the check
      model.updateMatrixWorld(true);
      box.setFromObject(model);
      const ctr = box.getCenter(new THREE.Vector3());
      model.position.sub(new THREE.Vector3(ctr.x, box.min.y, ctr.z));
      holder.rotation.y = add; // the column's extra turn
      holder.position.set((c - 1.5) * cell, (lib.length - 1 - r) * cell * 0.9, 0);
      world.scene.add(holder);
      // a small marker on +Z (toward the camera) at the base: the direction the app treats as "front"
      const mark = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12), new THREE.MeshBasicMaterial({ color: 0x66ccff }));
      mark.rotation.x = Math.PI / 2;
      mark.position.set(holder.position.x, holder.position.y + 0.02, 0.8);
      world.scene.add(mark);
    }
    done.push(l.key);
  }
  world.camera.position.set(0, ((lib.length - 1) * cell * 0.9) / 2 + 0.6, lib.length * 2.4 + 4);
  world.camera.lookAt(0, ((lib.length - 1) * cell * 0.9) / 2 + 0.5, 0);
  world.camera.updateMatrixWorld(true);
  (window as unknown as { __mg: { stats: Record<string, unknown> } }).__mg = { stats: { splatLoaded: true, check: done, columns: '+0, +90, +180, +270 degrees' } };
}

/** Object-state check (?check=objects, dev only): placeholder → live model cross-dissolve, ghost → settle →
 * back to ghost, and a dissolve-out, on a timeline the screenshot script samples via __mg.stats.t. */
export async function objectCheck(world: World, fixturesAbs: string): Promise<void> {
  const { MemoryObject } = await import('./look/memoryObject.js');
  const { Motes } = await import('./look/motes.js');
  const { VIEWPORT_H } = await import('./look/palette.js');
  world.renderer.toneMapping = THREE.NoToneMapping;
  world.scene.background = new THREE.Color(0x1a1410);
  world.scene.add(new THREE.HemisphereLight(0xffe6c8, 0x2a1d12, 0.9));
  const key = new THREE.DirectionalLight(0xffe0b0, 1.2);
  key.position.set(-2.5, 3.2, -1);
  world.scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -2.5;
  world.scene.add(floor);
  const motes = new Motes();
  world.scene.add(motes.points);
  const loader = new GLTFLoader();
  const armchair = (await loader.loadAsync(`/@fs${fixturesAbs}/armchair.glb`)).scene;
  const radio = (await loader.loadAsync(`/@fs${fixturesAbs}/radio.glb`)).scene;
  const P = new MemoryObject({ id: 'p', label: 'armchair', size: 0.95, position: new THREE.Vector3(-0.75, 0, -2.6), rootYaw: Math.atan2(0.75, 2.6) },
    { model: null, size: 0.95, modelYaw: -Math.PI / 2 }, motes);
  const G = new MemoryObject({ id: 'g', label: 'radio', size: 0.42, position: new THREE.Vector3(0.7, 0, -2.4), rootYaw: Math.atan2(-0.7, 2.4) },
    { model: radio.clone(true), size: 0.42, modelYaw: -Math.PI / 2 }, motes);
  world.scene.add(P.root, G.root);
  world.camera.position.set(0, 1.25, 0);
  world.camera.lookAt(0, 0.45, -2.5);
  const stats: Record<string, unknown> = { splatLoaded: true, t: 0 };
  (window as unknown as { __mg: { stats: Record<string, unknown> } }).__mg = { stats };
  const steps: [number, () => void][] = [
    [3, () => P.swapModel({ model: armchair.clone(true), size: 0.95, modelYaw: -Math.PI / 2 })],
    [6, () => G.confirm()],
    [9, () => G.unconfirm()],
    [12, () => P.remove(() => undefined)],
  ];
  let t = 0, i = 0;
  const clock = new THREE.Clock();
  const v2 = new THREE.Vector2();
  const orig = world.scene.onBeforeRender;
  world.scene.onBeforeRender = (...args) => {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    while (i < steps.length && steps[i]![0] <= t) steps[i++]![1]();
    VIEWPORT_H.value = world.renderer.getDrawingBufferSize(v2).y;
    motes.uniforms.uTime.value = t;
    P.update(dt, t, world.camera);
    G.update(dt, t, world.camera);
    stats.t = +t.toFixed(2);
    stats.objects = `P:${P.phase},G:${G.phase}`;
    orig.apply(world.scene, args);
  };
}
