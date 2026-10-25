// A real landmark on the memory's horizon: the Golden Gate Bridge from Crissy Field, the Palace of Fine Arts across its
// lagoon, the Painted Ladies above Alamo Square, the Transamerica Pyramid over Telegraph Hill. The memory's fog would
// swallow anything a few dozen metres off, so the landmark is drawn nearer and smaller in proportion (the same angular
// size it has from the real spot) and softened with the memory's own haze instead.
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { LandmarkId, PlanLandmark } from '../../../../../packages/shared/src/scene';
import { MEMORY_CENTER } from '../layout';
import { atmoLive } from './atmosphere';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const NEAR = 165; // metres: inside the camera's reach (200 m), well beyond the memory's own few metres

/** Each source model in real metres, standing on the water/ground at y = 0, its long side along x. */
function build(id: LandmarkId, src: THREE.Object3D): THREE.Object3D {
  const g = new THREE.Group();
  if (id === 'golden_gate') {
    // damongraphics' bridge (CC-BY), as the scene lab rescaled it: 1280 m main span, deck 67 m up, towers 227 m,
    // painted International Orange; its towers start at the roadway, so the legs and piers below are added.
    const orange = new THREE.MeshStandardMaterial({ color: '#b8402c', roughness: 0.55, metalness: 0.25 });
    const b = src.clone(true);
    b.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (o.name.includes('Landscape') || o.name.includes('Cube_2__4')) { o.visible = false; return; }
      m.material = orange;
    });
    const SX = 5.87, SY = 4.23, SZ = 2.9, BY = 60.8;
    b.scale.set(SX, SY, SZ);
    b.position.y = BY;
    g.add(b);
    const towerBase = -11.95 * SY + BY, legTop = -0.56 * SY + BY;
    const concrete = new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.9 });
    for (const tx of [-111.5 * SX, 106 * SX]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(42, towerBase + 3, 58), concrete);
      pier.position.set(tx, (towerBase + 3) / 2 - 3, 0);
      g.add(pier);
      for (const lz of [-15.6, 15.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(14, legTop - towerBase + 1, 9.5), orange);
        leg.position.set(tx, (towerBase + legTop + 1) / 2, lz);
        g.add(leg);
      }
    }
    return g;
  }
  // The scans and models: fitted to a real size (the Palace's rotunda ~49 m to the top of the dome; three Painted
  // Ladies ~23 m across, shown as a row of six; the Pyramid 260 m).
  const copy = src.clone(true);
  copy.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy);
  const size = box.getSize(new THREE.Vector3());
  const s = id === 'palace_of_fine_arts' ? 46 / size.y : id === 'painted_ladies' ? 23 / Math.max(size.x, size.z) : 260 / size.y;
  copy.scale.multiplyScalar(s);
  copy.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(copy);
  const c = b2.getCenter(new THREE.Vector3());
  copy.position.set(-c.x, -b2.min.y, -c.z);
  if (id === 'painted_ladies') {
    const row = new THREE.Group();
    for (let i = 0; i < 2; i++) { const h = i === 0 ? copy : copy.clone(true); h.position.x += (i - 0.5) * 23.5; row.add(h); }
    g.add(row);
  } else g.add(copy);
  return g;
}

export function Landmark({ landmark }: { landmark: PlanLandmark }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const [mats, setMats] = useState<THREE.MeshStandardMaterial[]>([]);
  useEffect(() => {
    let live = true;
    loader.loadAsync(`/models/landmarks/${landmark.id}.glb`).then((g) => {
      if (!live) return;
      const real = build(landmark.id, g.scene);
      // the memory's haze: no fog (it would hide it), and each surface lifted toward the horizon's colour instead
      const list: THREE.MeshStandardMaterial[] = [];
      const seen = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      real.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = false; m.receiveShadow = false;
        const swap = (src: THREE.Material) => {
          let c = seen.get(src);
          if (!c) {
            c = src.clone() as THREE.MeshStandardMaterial;
            c.fog = false;
            c.userData.base = c.color?.clone() ?? new THREE.Color('#ffffff');
            // lit materials take the haze as a glow too; an unlit scan (no emissive uniform) only in its colour
            seen.set(src, c); list.push(c);
          }
          return c;
        };
        m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
      });
      const k = Math.min(1, NEAR / landmark.distance);
      const d = landmark.distance * k;
      const b = (landmark.bearing * Math.PI) / 180;
      const holder = new THREE.Group();
      holder.add(real);
      holder.scale.setScalar(k);
      holder.position.set(MEMORY_CENTER.x + Math.sin(b) * d, -0.4 - (landmark.above ?? 0) * k, MEMORY_CENTER.z + 2.4 - Math.cos(b) * d);
      holder.rotation.y = (landmark.yaw * Math.PI) / 180;
      setMats(list);
      setObj(holder);
    }).catch((e) => console.warn('[landmark]', landmark.id, e));
    return () => { live = false; };
  }, [landmark.id, landmark.bearing, landmark.distance, landmark.yaw, landmark.above]);
  // Far things take the sky's colour: more of it the farther they really are, and as the memory's hour comes in.
  const haze = THREE.MathUtils.clamp(0.18 + landmark.distance / 6000, 0.18, 0.55);
  const t = useRef({ value: 0 }).current;
  useFrame((_, dt) => {
    t.value = Math.min(1, t.value + dt / 2.5);
    for (const m of mats) {
      m.color.copy(m.userData.base as THREE.Color).lerp(atmoLive.horizon, haze * (m.emissive ? 0.6 : 0.75));
      m.emissive?.copy(atmoLive.horizon).multiplyScalar(haze * 0.55);
      m.opacity = t.value; m.transparent = t.value < 1;
    }
  });
  return obj ? <primitive object={obj} /> : null;
}
