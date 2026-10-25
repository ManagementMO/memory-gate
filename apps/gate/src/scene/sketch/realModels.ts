// The photoreal object library in the scene. public/models/manifest.json (written by scripts/fetch-models.mjs and
// scripts/build-library.mjs) lists one compressed .glb per object kind, and for many kinds a few variants chosen by the
// object's label ("rocking chair", "old radio", "Monterey cypress"). A memory's models are preloaded the moment its plan
// arrives; each object then gets its own copy, fitted to its kind's footprint and height, seated on the floor, and formed
// with the same dissolve as the porcelain. Without the manifest (models not fetched), or with ?objects=porcelain,
// everything stays porcelain.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { entryOf } from '../../../../../packages/shared/src/scene';
import { applyReveal, type Reveal } from './style';

/** A model file and how to stand it up: some sources are authored lying on their side (rx/rz in degrees). */
type ModelFile = { file: string; title?: string; fix?: { rx?: number; rz?: number; ry?: number } };
type Variant = ModelFile & { syn: string[] };
type KindModels = ModelFile & { id?: string; variants?: Variant[]; mix?: boolean };
type Manifest = { kinds: Record<string, KindModels> };

const REAL = new URLSearchParams(location.search).get('objects') !== 'porcelain';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // the library is meshopt-compressed (fetch-models.mjs)
const templates = new Map<string, THREE.Object3D>(); // by url
const loading = new Map<string, Promise<THREE.Object3D | null>>();
const fixes = new Map<string, ModelFile['fix']>(); // by url
let manifest: Promise<Manifest | null> | null = null;
let manifestReady: Manifest | null = null;

const getManifest = () => (manifest ??= fetch('/models/manifest.json').then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null)).catch(() => null).then((m) => (manifestReady = m)));

const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Which file draws this thing: the variant whose words its label uses (longest wins), else the kind's own model, or
 *  for kinds that mix (trees, flowers, cars), a steady pick among them so two trees aren't twins. */
function chooseFile(m: Manifest | null, kind: string, label = '', seed = ''): ModelFile | null {
  if (TEAM_MODELS[kind]) return { file: TEAM_MODELS[kind]! };
  const k = m?.kinds[kind];
  if (!k) return null;
  const l = ` ${label.toLowerCase().replace(/[^\p{L}\p{N}' -]+/gu, ' ')} `;
  let best: { v: Variant; len: number } | null = null;
  for (const v of k.variants ?? []) for (const s of v.syn) {
    if ((l.includes(` ${s} `) || l.includes(` ${s}s `) || l.includes(` ${s}es `)) && (!best || s.length > best.len)) best = { v, len: s.length };
  }
  if (best) return best.v;
  if (k.mix && k.variants?.length) {
    const all: ModelFile[] = [k, ...k.variants];
    return all[hashOf(`${kind}|${seed || label}`) % all.length]!;
  }
  return k;
}
const urlOf = (f: ModelFile) => (f.file.startsWith('/') ? f.file : `/models/${f.file}`);
/** The url drawing this thing, once the manifest is in (null before, or when the library has nothing for it). */
function resolvedUrl(kind: string, label?: string, seed?: string): string | null {
  if (TEAM_MODELS[kind]) return TEAM_MODELS[kind]!;
  const f = manifestReady ? chooseFile(manifestReady, kind, label, seed) : null;
  return f ? urlOf(f) : null;
}

/** The team's own Blender models (in git, metre-scaled, front +z), beside the fetched photoreal library. Always on. */
const TEAM_MODELS: Record<string, string> = {
  kite: '/red-kite/models/kite.glb',
  spool: '/red-kite/models/spool.glb',
  keepsake_box: '/red-kite/models/keepsake-box.glb',
  story_card: '/red-kite/models/story-card.glb',
  side_table: '/red-kite/models/side-table.glb',
};

export const realObjectsOn = () => REAL;
/** Whether this thing's model is loaded and ready to draw. */
export const hasRealModel = (kind: string, label?: string, seed?: string) => { const u = resolvedUrl(kind, label, seed); return !!u && templates.has(u); };
/** Whether the library has a model for this kind at all (so nothing needs composing for it). */
export const hasLibraryModel = (kind: string) => kind in TEAM_MODELS || !!manifestReady?.kinds[kind];

/** A thing to draw: its kind, and the label and id that choose among the kind's variants. */
export type ModelAsk = { kind: string; label?: string; id?: string };

/** Load the model that draws this thing (once per file); resolves null when the library has none for it. */
export function loadRealModel(kind: string, label?: string, seed?: string): Promise<THREE.Object3D | null> {
  if (!REAL && !TEAM_MODELS[kind]) return Promise.resolve(null);
  return getManifest().then((m) => {
    const f = chooseFile(m, kind, label, seed);
    if (!f) return null;
    const url = urlOf(f);
    const ready = templates.get(url);
    if (ready) return ready;
    let p = loading.get(url);
    if (!p) {
      fixes.set(url, f.fix);
      p = loader.loadAsync(url).then((g) => { templates.set(url, g.scene); return g.scene; }).catch(() => null);
      loading.set(url, p);
    }
    return p;
  });
}

/** Start loading every model a plan will need (called as soon as the plan arrives). */
export function preloadRealModels(things: ModelAsk[]): void {
  for (const t of things) void loadRealModel(t.kind, t.label, t.id);
}

const warmed = new Set<string>();
/**
 * Get each model ready to draw before it forms: its shaders compiled (off the main thread where the browser allows)
 * and its textures uploaded. On a headset, doing this the moment a thing appears is what makes the place stutter.
 */
export async function warmRealModels(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, things: ModelAsk[]): Promise<void> {
  for (const t of things) {
    const tpl = await loadRealModel(t.kind, t.label, t.id);
    const url = resolvedUrl(t.kind, t.label, t.id);
    if (!tpl || !url || warmed.has(url)) continue;
    warmed.add(url);
    try {
      const probe = realObject(t.kind, { reveal: { value: 0.5 }, base: { value: 0 }, height: { value: 1 }, id: -1 }, 1, null, t.label, t.id);
      if (!probe) continue;
      probe.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const t of Object.values(m as unknown as Record<string, unknown>)) if (t instanceof THREE.Texture) gl.initTexture(t);
        }
      });
      await gl.compileAsync(probe, camera, scene);
    } catch { /* warming is only a head start */ }
  }
}

/** Whether a remembered colour can be shown on the real model (plants keep their own: a red geranium is drawn). */
export const realTakesColour = (kind: string) => entryOf(kind).material !== 'plant';

/** The surface a remembered colour belongs on: one named for it (a kite's paper, a chair's fabric), else the material
 *  covering most of the model (the upholstery, the paint). */
function mainMaterial(model: THREE.Object3D): THREE.Material | null {
  let named: THREE.Material | null = null;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!named && mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (/paper|sail|fabric|cloth|upholster|cushion|paint/i.test(m.name)) { named = m; break; }
  });
  if (named) return named;
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
export function realObject(kind: string, reveal: Reveal, scale = 1, colour: string | null = null, label?: string, seed?: string): THREE.Object3D | null {
  const url = resolvedUrl(kind, label, seed);
  const tpl = url ? templates.get(url) : undefined;
  if (!url || !tpl) return null;
  const fix = fixes.get(url);
  const model = new THREE.Group();
  const body = tpl.clone(true);
  if (fix) body.rotation.set(((fix.rx ?? 0) * Math.PI) / 180, ((fix.ry ?? 0) * Math.PI) / 180, ((fix.rz ?? 0) * Math.PI) / 180);
  model.add(body);
  model.updateMatrixWorld(true);
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
  // Things without a front (a pier, a boat, a table), and things sized by their footprint, lie along its long side.
  const e = entryOf(kind);
  const raw = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  if ((e.place === 'water' || kind.includes('table') || e.fit === 'footprint') && (raw.x >= raw.z) !== (e.fp[0] >= e.fp[1]) && Math.abs(raw.x - raw.z) > 0.15 * Math.max(raw.x, raw.z)) {
    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);
  }
  // A bed of flowers is many plants, not one stretched: copies of the plant, each its own height, over the footprint.
  if (e.cluster) return cluster(model, e, scale, hashOf(seed ?? label ?? kind));
  // Fit: things on the water, and kinds whose models vary in height (a four-poster, a bus), by their footprint; everything
  // else by the kind's height, letting a model's own proportions overflow the footprint a little.
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const long = Math.max(size.x, size.z, 0.01), short = Math.max(Math.min(size.x, size.z), 0.01);
  const fpLong = Math.max(e.fp[0], e.fp[1]), fpShort = Math.min(e.fp[0], e.fp[1]);
  const s = (e.place === 'water'
    ? Math.min(fpLong / long, (fpShort / short) * 1.2)
    : e.fit === 'footprint'
      ? Math.min(fpLong / long, (fpShort / short) * 1.25, (e.h * 2.4) / Math.max(size.y, 0.01))
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

/** Plants spread over a bed's footprint: each copy stands its own height (about the kind's), turned at random, with a
 *  little space round it, so a flower bed reads as a bed and not as one giant flower. */
function cluster(plant: THREE.Group, e: { fp: [number, number]; h: number; cluster?: number }, scale: number, seed: number): THREE.Object3D {
  let r = seed || 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
  const size = new THREE.Box3().setFromObject(plant).getSize(new THREE.Vector3());
  const [w, d] = [e.fp[0] * scale, e.fp[1] * scale];
  const n = Math.max(3, Math.round((e.cluster ?? 8) * Math.min(2.5, scale * scale)));
  const holder = new THREE.Group();
  const spots: [number, number][] = [];
  for (let tries = 0; spots.length < n && tries < n * 30; tries++) {
    const x = (rnd() - 0.5) * w, z = (rnd() - 0.5) * d;
    if (spots.some(([a, b]) => (a - x) ** 2 + (b - z) ** 2 < (Math.min(w, d) / Math.sqrt(n)) ** 2 * 0.35)) continue;
    spots.push([x, z]);
  }
  for (const [x, z] of spots) {
    const c = plant.clone(true);
    const h = e.h * scale * (0.7 + rnd() * 0.6);
    // As tall as a plant in the bed, never wider than its share of it.
    const s = Math.min(h / Math.max(size.y, 0.01), (Math.min(w, d) * 0.75) / Math.max(size.x, size.z, 0.01));
    c.scale.multiplyScalar(s);
    c.rotation.y = rnd() * Math.PI * 2;
    c.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(c);
    const ctr = b.getCenter(new THREE.Vector3());
    c.position.set(x - ctr.x, -b.min.y, z - ctr.z);
    holder.add(c);
  }
  return holder;
}
