// The people a photo shows, standing in the memory where they stood: each the closest ready-made person, dressed in the
// photo's colours and breathing in a gentle pose (waiting, waving, sitting on the bench). They step in softly once the
// place has formed. In a shared place (the Golden Gate crowd), each holds a picture of their memory above them, and
// pointing at them steps into it.
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlanPerson, ScenePlan, Zone } from '../../../../../packages/shared/src/scene';
import { MEMORY_CENTER } from '../layout';
import { dressPerson, matchPerson, peopleCatalog, personCopy, posePerson } from '../people/runtime';
import { sfMemory } from '../../sf/memories';
import { showcaseGround } from '../../showcase/Showcase';

const ANCHOR: Record<Zone, [number, number]> = {
  center: [0, 0.1], back: [0, -1.55], left: [-2.2, -0.2], right: [2.2, -0.2],
  'back-left': [-1.9, -1.4], 'back-right': [1.9, -1.4], 'front-left': [-1.8, 0.75], 'front-right': [1.8, 0.75],
};
const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

/** Where each person stands: their own spot, else their zone, side by side with anyone sharing it. */
function spots(people: PlanPerson[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const byZone = new Map<Zone, PlanPerson[]>();
  for (const p of people) if (!p.at) byZone.set(p.zone, [...(byZone.get(p.zone) ?? []), p]);
  for (const p of people) if (p.at) out.set(p.id, p.at);
  for (const [zone, group] of byZone) {
    const [ax, az] = ANCHOR[zone];
    group.forEach((p, i) => out.set(p.id, [ax + (i - (group.length - 1) / 2) * 0.62, az + (i % 2) * 0.12]));
  }
  return out;
}

function photoCard(photo: string): THREE.Mesh {
  // the small copy: a crowd of full-size photographs is too much for a headset
  const tex = new THREE.TextureLoader().load(photo.replace('/memories/sf/', '/memories/sf/thumbs/').replace(/\.\w+$/, '.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.58), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, opacity: 0.95, fog: false }));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.64), new THREE.MeshBasicMaterial({ color: '#fbf8f1', toneMapped: false, transparent: true, opacity: 0.92, fog: false }));
  frame.position.z = -0.004;
  card.add(frame);
  card.renderOrder = 40;
  return card;
}

function Person({ p, at, delay, onStep }: { p: PlanPerson; at: [number, number]; delay: number; onStep: ((id: string) => void) | null }) {
  const [body, setBody] = useState<{ obj: THREE.Object3D; chest: THREE.Object3D | null; height: number } | null>(null);
  const card = useMemo(() => { const m = p.memory ? sfMemory(p.memory) : null; return m ? photoCard(m.photo) : null; }, [p.memory]);
  const camera = useThree((s) => s.camera);
  const t = useRef(-delay);
  const root = useRef<THREE.Group | null>(null);
  const [lift, setLift] = useState(0);
  // On the place's own ground where it isn't flat (a beach running down to the water), not hovering at your feet' height.
  useEffect(() => {
    const parent = root.current?.parent;
    if (!body || !parent) return;
    parent.updateWorldMatrix(true, false);
    const w = parent.localToWorld(new THREE.Vector3(MEMORY_CENTER.x + at[0], 0, MEMORY_CENTER.z + at[1]));
    const y = showcaseGround(w.x, w.z);
    setLift(y === null ? 0 : parent.worldToLocal(w.setY(y)).y);
  }, [body, at[0], at[1]]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const cat = await peopleCatalog();
      if (!cat || !live) return;
      const entry = matchPerson(p, cat.people, taken);
      if (!entry) return;
      taken.add(entry.id);
      const obj = await personCopy(entry);
      dressPerson(obj, p, entry.person.skin);
      if (p.memory || QUEST) obj.traverse((o) => { o.castShadow = false; }); // a crowd's shadows cost a headset more than they give
      // Everyone stands still in a calm pose (a frame of the standing clip, never played on): only their breathing moves.
      await posePerson(obj, 'stand', p.gender, 1.5 + hash(p.id) * 6);
      let chest: THREE.Object3D | null = null;
      obj.traverse((o) => { if (!chest && (o as THREE.Bone).isBone && /Spine2$/.test(o.name)) chest = o; });
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const mat of [m.material].flat()) { mat.transparent = true; mat.opacity = 0; } });
      if (live) setBody({ obj, chest, height: entry.person.height });
    })();
    return () => { live = false; };
  }, [p]);
  useFrame((_, dt) => {
    if (!body) return;
    t.current += dt;
    if (body.chest) { const b = 0.012 * Math.sin(t.current * 1.55 + hash(p.id) * 6.28); body.chest.scale.set(1 + b, 1 + b * 0.35, 1 + b); }
    // step in softly once the place has formed
    const o = THREE.MathUtils.clamp(t.current / 1.4, 0, 1);
    if (o < 1 || t.current < 1.6) body.obj.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) for (const mat of [m.material].flat()) { mat.opacity = o; mat.transparent = o < 1; mat.depthWrite = o > 0.5; } });
    if (card) { card.lookAt(camera.getWorldPosition(new THREE.Vector3())); (card.material as THREE.MeshBasicMaterial).opacity = 0.95 * o; }
  });
  if (!body) return null;
  const click = onStep && p.memory ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onStep(p.memory!); } : undefined;
  return (
    <group position={[MEMORY_CENTER.x + at[0], lift, MEMORY_CENTER.z + at[1]]} rotation-y={(p.facing * Math.PI) / 180} onClick={click}
      // Someone with no memory to step into lets a ray through (a pinch held on the ground behind them still walks).
      ref={(g) => { root.current = g; if (g) (g as unknown as { pointerEvents?: string }).pointerEvents = click ? undefined : 'none'; }}
      onPointerOver={click ? () => { document.body.style.cursor = 'pointer'; } : undefined} onPointerOut={click ? () => { document.body.style.cursor = ''; } : undefined}>
      <primitive object={body.obj} />
      {/* an easy target for a pinch or a click: an animated body is hard to hit with a ray */}
      {click && <mesh position={[0, body.height / 2, 0]} onClick={click}><boxGeometry args={[0.7, body.height + 0.2, 0.6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
      {card && <primitive object={card} position={[0, body.height + 0.5, 0]} onClick={click} />}
    </group>
  );
}
const taken = new Set<string>();

/** Pointing at someone in a shared place steps into their memory (the flow is loaded lazily: it imports the scene). */
const stepInto = (memoryId: string) => { void import('../../flow/controller').then((c) => c.flow.visitShared(memoryId, 'crowd')); };

/** Everyone the plan says is there. `onStep` steps into a person's shared memory (the crowd at a landmark). */
export function PlanPeople({ plan, onStep = stepInto }: { plan: ScenePlan; onStep?: ((memoryId: string) => void) | null }) {
  const people = plan.people ?? [];
  const at = useMemo(() => spots(people), [people]);
  useEffect(() => { taken.clear(); }, [plan]);
  return (
    <group name="memory-people">
      {people.map((p, i) => <Person key={`${plan.title}:${p.id}`} p={p} at={at.get(p.id) ?? [0, 0]} delay={3.2 + i * 0.35} onStep={onStep} />)}
    </group>
  );
}
