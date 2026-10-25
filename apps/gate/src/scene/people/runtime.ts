// People in a memory: ready-made realistic people (Microsoft Rocketbox, MIT) on the app's own Mixamo skeleton (the boy's
// frames, public/people/boy.glb), so one set of clips (standing, waiting, waving, sitting, walking...) plays on every one
// of them. A reading of a photo (age group, presentation, skin, hair, clothes) picks the closest person, who is dressed
// in the photo's colours. Built in the scene lab (people/runtime.js); public/models/people/ by scripts/build-library.mjs.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { PersonAge, PersonPose, PlanPerson } from '../../../../../packages/shared/src/scene';

export type PersonEntry = {
  id: string; file: string; title: string;
  person: { age: PersonAge; gender: 'female' | 'male'; height: number; skin?: string; hair?: string; headwear?: boolean };
};
type Catalog = { clipHipsRest: [number, number, number]; people: PersonEntry[] };

const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();
const load = (url: string) => { if (!files.has(url)) files.set(url, gltf.loadAsync(url)); return files.get(url)!; };
let catalog: Promise<Catalog | null> | null = null;
export const peopleCatalog = () => (catalog ??= fetch('/models/people/people.json').then((r) => (r.ok ? (r.json() as Promise<Catalog>) : null)).catch(() => null));

/** A fresh, independently posable copy of a person. */
export async function personCopy(entry: PersonEntry): Promise<THREE.Object3D> {
  const src = (await load(`/models/${entry.file}`)).scene;
  const p = SkeletonUtils.clone(src);
  p.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); // each copy fades and dresses on its own
    }
    if ((o as THREE.Bone).isBone && !o.userData.restPosition) o.userData.restPosition = o.position.clone();
  });
  return p;
}

/** A pose's clip: the women's and men's mocap where both exist. */
const CLIPS: Record<PersonPose, { female: string; male: string }> = {
  stand: { female: 'idle_f', male: 'idle_m' },
  wait: { female: 'idle_wait_f', male: 'idle_look_m' },
  walk: { female: 'walk_f', male: 'walk_m' },
  wave: { female: 'wave_f', male: 'wave_m' },
  talk: { female: 'talk_f', male: 'talk_m' },
  sit: { female: 'sit_f', male: 'sit_m' },
  cheer: { female: 'clap_f', male: 'cheer_m' },
  photo: { female: 'photo_m', male: 'photo_m' },
};

/** A shared clip fitted to this person: the clips' hip height is the boy's, so it is scaled to theirs. */
function fitClip(clip: THREE.AnimationClip, person: THREE.Object3D, hipsRest: [number, number, number]): THREE.AnimationClip {
  let hips: THREE.Object3D | null = null;
  person.traverse((o) => { if (!hips && (o as THREE.Bone).isBone && /Hips$/.test(o.name)) hips = o; });
  if (!hips) return clip;
  const rest = ((hips as THREE.Object3D).userData.restPosition as THREE.Vector3) ?? (hips as THREE.Object3D).position.clone();
  const s = rest.y / hipsRest[1];
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    if (t.name.endsWith('.scale')) continue;
    if (t.name.endsWith('.position')) {
      if (!/Hips\.position$/.test(t.name)) continue;
      const v = t.values.slice();
      for (let i = 0; i < v.length; i += 3) {
        v[i] = rest.x + (v[i]! - hipsRest[0]) * s;
        v[i + 1] = rest.y + (v[i + 1]! - hipsRest[1]) * s;
        v[i + 2] = rest.z + (v[i + 2]! - hipsRest[2]) * s;
      }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times as unknown as number[], v as unknown as number[]));
      continue;
    }
    tracks.push(t);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Start a person's pose (a looping clip, begun at `offset` seconds so a crowd doesn't move in step). */
export async function posePerson(person: THREE.Object3D, pose: PersonPose, gender: 'female' | 'male', offset = 0): Promise<THREE.AnimationMixer | null> {
  const cat = await peopleCatalog();
  if (!cat) return null;
  const name = CLIPS[pose][gender];
  const g = await load(`/models/people/anims/${name}.glb`).catch(() => null);
  const clip = g?.animations[0];
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(person);
  const action = mixer.clipAction(fitClip(clip, person, cat.clipHipsRest));
  action.play();
  mixer.setTime(offset % clip.duration);
  return mixer;
}

/** Dress a person in a photo's colours: clothes and hair are grey "dye" textures, so the colour given is the colour
 *  worn; skin keeps its texture and is shifted from the person's own tone toward the photo's. */
export function dressPerson(person: THREE.Object3D, p: Pick<PlanPerson, 'skin' | 'hair' | 'top' | 'bottom'>, ownSkin?: string): void {
  const want: Record<string, string | null> = { top: p.top, bottom: p.bottom, hair: p.hair, skin: p.skin };
  person.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const region = (m.userData?.region as string | undefined) ?? m.name;
      const key = region === 'hair_cards' ? 'hair' : region === 'face' ? 'skin' : region;
      const colour = want[key];
      if (!colour) return m;
      const c = m.clone() as THREE.MeshStandardMaterial;
      if (key === 'skin') {
        if (!ownSkin) return m;
        const a = new THREE.Color(colour), b = new THREE.Color(ownSkin);
        c.color.setRGB(THREE.MathUtils.clamp(a.r / b.r, 0.3, 1.6), THREE.MathUtils.clamp(a.g / b.g, 0.3, 1.6), THREE.MathUtils.clamp(a.b / b.b, 0.3, 1.6));
      } else if (m.userData?.dye) c.color.copy(new THREE.Color(colour)).multiplyScalar(1 / (m.userData.dye as number));
      else return m;
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0]!;
  });
}

// ---- the closest person for a reading of a photo ----
function lab(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * c.r + 0.3576 * c.g + 0.1805 * c.b) / 0.95047), y = f(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b), z = f((0.0193 * c.r + 0.1192 * c.g + 0.9505 * c.b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a?: string | null, b?: string | null) => { if (!a || !b) return 30; const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const AGES: PersonAge[] = ['child', 'teen', 'young adult', 'adult', 'middle-aged', 'older'];

/** The best person for this reading (age group, presentation, skin and hair; clothes don't matter, they're dyed),
 *  avoiding anyone already standing in the place so a crowd isn't twins. */
export function matchPerson(r: Pick<PlanPerson, 'age' | 'gender' | 'skin' | 'hair'>, people: PersonEntry[], taken: Set<string>): PersonEntry | null {
  let best: { e: PersonEntry; s: number } | null = null;
  for (const e of people) {
    const p = e.person;
    let s = p.gender === r.gender ? 0 : 60;
    s += Math.abs(AGES.indexOf(p.age) - AGES.indexOf(r.age)) * 18;
    s += dE(p.skin, r.skin) + dE(p.hair, r.hair) * 0.35;
    if (taken.has(e.id)) s += 40;
    if (!best || s < best.s) best = { e, s };
  }
  return best?.e ?? null;
}
