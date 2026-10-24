// The photoreal object library in the scene. public/models/manifest.json (written by scripts/fetch-models.mjs) lists
// one compressed .glb per object kind. A memory's models are preloaded the moment its plan arrives; each object then gets its
// own copy, fitted to its kind's footprint and height, seated on the floor, and formed with the same dissolve as the
// porcelain. Without the manifest (models not fetched), or with ?objects=porcelain, everything stays porcelain.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { entryOf } from '../../../../../packages/shared/src/scene';
import { applyReveal, type Reveal } from './style';

type Manifest = { kinds: Record<string, { file: string; id: string; title: string }> };

const REAL = new URLSearchParams(location.search).get('objects') !== 'porcelain';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // the library is meshopt-compressed (fetch-models.mjs)
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

/** Whether a remembered colour can be shown on the real model (plants keep their own: a red geranium is drawn). */
export const realTakesColour = (kind: string) => entryOf(kind).material !== 'plant';

/** The surface a remembered colour belongs on: the material covering most of the model (the upholstery, the paint). */
function mainMaterial(model: THREE.Object3D): THREE.Material | null {
  const share = new Map<THREE.Material, number>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position!.count) / 3;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) share.set(m, (share.get(m) ?? 0) + tris);
  });
  let best: THREE.Material | null = null, most = 0;
  for (const [m, n] of share) if (n > most) { best = m; most = n; }
  return best;
}

/** A fitted copy of a kind's model, ready to dissolve in (null if it isn't loaded), in a remembered colour if one was said. */
export function realObject(kind: string, reveal: Reveal, scale = 1, colour: string | null = null): THREE.Object3D | null {
  const tpl = templates.get(kind);
  if (!tpl) return null;
  const model = tpl.clone(true);
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((src) => {
      let m = copies.get(src);
      if (!m) {
        m = src.clone() as THREE.MeshStandardMaterial;
        applyReveal(m as unknown as THREE.MeshPhysicalMaterial, reveal); // per-object reveal; standard materials share the chunks
        copies.set(src, m);
      }
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0]!;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  // "The green armchair": the main surface takes the colour (its texture still shows through, slightly lifted so a
  // dark colour doesn't turn it black).
  if (colour && realTakesColour(kind)) {
    const main = mainMaterial(model) as THREE.MeshStandardMaterial | null;
    if (main?.color) main.color.set(colour).lerp(new THREE.Color('#ffffff'), 0.18);
  }
  // Things without a front (a pier, a boat, a table) lie along their footprint's long side.
  const e = entryOf(kind);
  const raw = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  if ((e.place === 'water' || kind.includes('table')) && (raw.x >= raw.z) !== (e.fp[0] >= e.fp[1]) && Math.abs(raw.x - raw.z) > 0.15 * Math.max(raw.x, raw.z)) {
    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);
  }
  // Fit: things on the water by their length (a pier's posts would otherwise shrink it to a toy); everything else
  // by the kind's height, letting a model's own proportions overflow the footprint a little.
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const long = Math.max(size.x, size.z, 0.01), short = Math.max(Math.min(size.x, size.z), 0.01);
  const fpLong = Math.max(e.fp[0], e.fp[1]), fpShort = Math.min(e.fp[0], e.fp[1]);
  const s = (e.place === 'water'
    ? Math.min(fpLong / long, (fpShort / short) * 1.2)
    : Math.min(e.h / Math.max(size.y, 0.01), (fpLong / long) * 1.5, (fpShort / short) * 2)) * scale;
  model.scale.multiplyScalar(s);
  // Seat it on the floor, centred on its place.
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box.min.y;
  const holder = new THREE.Group();
  holder.add(model);
  return holder;
}
