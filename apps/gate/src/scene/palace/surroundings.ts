// The grounds assembled into meshes, once. Everything is static, so it is merged, but by map cell rather than all in
// one, so the parts behind you are culled and cost nothing: the trees near you (they sway, each in its own time), the
// far trees and the Presidio's woods (still), the houses on each side of the park, the lamps and benches. The
// willows by the water and the exhibition hall also stand in the lagoon's reflection. Materials are the palace's own,
// so the haze, the low sun and the dissolve into white reach everything alike, and they are few: each new kind of
// material is one more shader for the headset to compile before the first frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bayWater, bench, edges, hallGeometry, harbour, hills, housesEast, housesSouth, lampGlobe, lampPost, props, shrub, trees, woodsCrown, type TreeSet } from './grounds';
import { palaceMaterial } from './materials';
import { shrubSpots } from './site';

export type Grounds = { main: THREE.Group; mirror: THREE.Group; dispose: () => void };

/** Crown radius of each kind of tree, for the shade the site map pools under it. */
export const CROWN = { willow: 5.2, cypress: 6.6, eucalyptus: 4.6, park: 3.0 } as const;


export function buildGrounds(o: { env: THREE.Texture | null; quality: number; shadows: boolean; stone: THREE.Material; water: THREE.Material }): Grounds {
  const { env, quality, shadows } = o;
  const main = new THREE.Group();
  main.name = 'grounds';
  const mirror = new THREE.Group();
  mirror.name = 'grounds-mirror';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T) => { mats.push(m); return m; };

  const leafP = { vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.55 };
  const leaf = keep(palaceMaterial(leafP, { leaf: true }, env));
  const leafMirror = keep(palaceMaterial(leafP, { leaf: true, mirror: true }, env));
  const still = keep(palaceMaterial(leafP, { leaf: true, still: true }, env));
  const facade = keep(palaceMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.6 }, { facade: true }, env));
  const hallP = { vertexColors: true, roughness: 0.66, metalness: 0, envMapIntensity: 0.34 };
  const hall = keep(palaceMaterial(hallP, { hall: true, shade: true }, env));
  const hallMirror = keep(palaceMaterial(hallP, { hall: true, shade: true, mirror: true }, env));

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent = main, cast = false, receive = false) => {
    geos.push(g);
    const x = new THREE.Mesh(g, m);
    x.castShadow = cast && shadows;
    x.receiveShadow = receive && shadows;
    parent.add(x);
    return x;
  };

  // Trees. (None of them casts a shadow-map shadow: under a sun this low they would sweep half the lawn into the
  // dark, and the headset has none anyway. The site map pools a soft shade under each crown instead.)
  const t = trees(quality);
  const near = new Cells(56), far = new Cells(110);
  const bake = (s: TreeSet, into: Cells) => s.matrices.forEach((mm, i) => {
    const e = mm.elements;
    into.add(e[12]!, e[14]!, spot(tint(s.geometry.clone().applyMatrix4(mm), s.colors[i]!), e[12]!, e[14]!));
  });
  for (const s of [t.sets.cypressNear!, t.sets.eucalyptusNear!, t.sets.parkNear!, t.sets.willow!]) bake(s, near);
  for (const s of [t.sets.cypressFar!, t.sets.eucalyptusFar!, t.sets.parkFar!]) bake(s, far);
  const hillsBuilt = hills(quality);
  const crown = woodsCrown(quality >= 0.9);
  hillsBuilt.crowns.forEach((mm, i) => far.add(mm.elements[12]!, mm.elements[14]!, tint(crown.clone().applyMatrix4(mm), hillsBuilt.crownColors[i]!)));
  for (const g of near.merged()) mesh(g, leaf);
  for (const g of far.merged()) mesh(g, still);
  // The shrubs at the rotunda's foot. They, and the willows by the water, stand in the lagoon's reflection too.
  const bush = shrub();
  const shrubs = shrubSpots().map((p) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(p.s, p.s * (0.85 + p.tint * 0.3), p.s));
    return spot(tint(bush.clone().applyMatrix4(m), new THREE.Color(1, 1, 1).lerp(new THREE.Color('#e4ead8'), p.tint)), p.x, p.z);
  });
  bush.dispose();
  mesh(merge(shrubs.map((g) => g.clone())), leaf);
  const w = t.sets.willow!;
  mesh(merge([...shrubs, ...w.matrices.map((mm, i) => spot(tint(w.geometry.clone().applyMatrix4(mm), w.colors[i]!), mm.elements[12]!, mm.elements[14]!))]), leafMirror, mirror);
  for (const s of Object.values(t.sets)) s.geometry.dispose();
  crown.dispose();

  // The exhibition hall, and its reflection.
  const hallGeo = hallGeometry(quality);
  mesh(hallGeo, hall, main, true, true);
  mirror.add(new THREE.Mesh(hallGeo, hallMirror));

  // Houses, the harbour, the sea wall, the hills and the bay.
  for (const g of [...housesEast(), ...housesSouth(quality)]) mesh(g, facade);
  mesh(harbour(quality), facade);
  mesh(edges(), o.stone);
  mesh(hillsBuilt.terrain, still);
  const bay = mesh(bayWater(), o.water);
  bay.renderOrder = 2;

  // Lamp posts with their globes, and the benches (drawn with the houses' material; the globes glow by their uv).
  const p = props();
  const post = lampPost(), glow = lampGlobe(), seat = bench();
  const kit = new Cells(56);
  for (const m of p.lampM) for (const g of [post, glow]) kit.add(m.elements[12]!, m.elements[14]!, g.clone().applyMatrix4(m));
  for (const m of p.benchM) kit.add(m.elements[12]!, m.elements[14]!, seat.clone().applyMatrix4(m));
  for (const g of kit.merged()) mesh(g, facade);
  for (const g of [post, glow, seat]) g.dispose();

  return {
    main,
    mirror,
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** Geometry gathered by map cell (cells of `size` metres), merged per cell. */
class Cells {
  private map = new Map<string, THREE.BufferGeometry[]>();
  constructor(private size: number) {}
  add(x: number, z: number, g: THREE.BufferGeometry): void {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    const list = this.map.get(k);
    if (list) list.push(g); else this.map.set(k, [g]);
  }
  merged(): THREE.BufferGeometry[] { return [...this.map.values()].map(merge); }
}

/** Bake an instance's tint into a copy's vertex colours (for merging). */
function tint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const a = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * c.r, a.getY(i) * c.g, a.getZ(i) * c.b);
  return g;
}

/** Where a merged tree stands, in its uv: the sway's phase for every leaf of it. */
function spot(g: THREE.BufferGeometry, x: number, z: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, x, z);
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false);
  for (const x of list) x.dispose();
  if (!g) throw new Error('grounds: merge failed');
  g.computeBoundingSphere();
  return g;
}
