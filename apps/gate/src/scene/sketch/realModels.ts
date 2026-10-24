// The photoreal object library in the scene. public/models/manifest.json (written by scripts/fetch-models.mjs) lists
// one .glb per object kind. A memory's models are preloaded the moment its plan arrives; each object then gets its
// own copy, fitted to its kind's footprint and height, seated on the floor, and formed with the same dissolve as the
// porcelain. Without the manifest (models not fetched), or with ?objects=porcelain, everything stays porcelain.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { entryOf } from '../../../../../packages/shared/src/scene';
import { applyReveal, type Reveal } from './style';

type Manifest = { kinds: Record<string, { file: string; id: string; title: string }> };

const REAL = new URLSearchParams(location.search).get('objects') !== 'porcelain';
const loader = new GLTFLoader();
const templates = new Map<string, THREE.Object3D>();
const loading = new Map<string, Promise<THREE.Object3D | null>>();
let manifest: Promise<Manifest | null> | null = null;

const getManifest = () => (manifest ??= fetch('/models/manifest.json').then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null)).catch(() => null));

export const realObjectsOn = () => REAL;
export const hasRealModel = (kind: string) => templates.has(kind);

/** Load one kind's model (once); resolves null when the library has none for it. */
export function loadRealModel(kind: string): Promise<THREE.Object3D | null> {
  if (!REAL) return Promise.resolve(null);
  const ready = templates.get(kind);
  if (ready) return Promise.resolve(ready);
  let p = loading.get(kind);
  if (!p) {
    p = getManifest()
      .then((m) => {
        const e = m?.kinds[kind];
        if (!e) return null;
        return loader.loadAsync(`/models/${e.file}`).then((g) => { templates.set(kind, g.scene); return g.scene; });
      })
      .catch(() => null);
    loading.set(kind, p);
  }
  return p;
}

/** Start loading every model a plan will need (called as soon as the plan arrives). */
export function preloadRealModels(kinds: string[]): void {
  for (const k of new Set(kinds)) void loadRealModel(k);
}

/** A fitted copy of a kind's model, ready to dissolve in (null if it isn't loaded). */
export function realObject(kind: string, reveal: Reveal, scale = 1): THREE.Object3D | null {
  const tpl = templates.get(kind);
  if (!tpl) return null;
  const model = tpl.clone(true);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((src) => {
      const m = src.clone() as THREE.MeshStandardMaterial;
      applyReveal(m as unknown as THREE.MeshPhysicalMaterial, reveal); // per-object reveal; standard materials share the chunks
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0]!;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  // Fit: the kind's height, without overflowing its footprint by more than a third.
  const e = entryOf(kind);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const long = Math.max(size.x, size.z, 0.01), short = Math.max(Math.min(size.x, size.z), 0.01);
  const fpLong = Math.max(e.fp[0], e.fp[1]), fpShort = Math.min(e.fp[0], e.fp[1]);
  const s = Math.min(e.h / Math.max(size.y, 0.01), (fpLong / long) * 1.35, (fpShort / short) * 1.35) * scale;
  model.scale.multiplyScalar(s);
  // Seat it on the floor, centred on its place.
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box.min.y;
  const holder = new THREE.Group();
  holder.add(model);
  return holder;
}
