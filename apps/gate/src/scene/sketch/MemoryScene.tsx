// The remembered place forming in the white space. Reads the current plan (flow/memory.ts), lays it out
// deterministically, and draws the setting, the air and each thing in a calm order: ground and walls first, then
// the big things, then the small ones resting on them. Things added later form where they're mentioned; nothing
// already there jumps. Also reports how much has formed, so the companion knows when to speak.
import { walkPointer } from '../Walk';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { entryOf, layout, type Placement, type ScenePlan } from '../../../../../packages/shared/src/scene';
import { PLACES, spotOf, whereIs, type PreparedPlace } from '../../../../../packages/shared/src/places';
import { MEMORY_CENTER } from '../layout';
import { useMemory } from '../../flow/memory';
import { preloadRealModels, warmRealModels } from './realModels';
import { useGate } from '../../state/store';
import { Ambience } from './Ambience';
import { atmoLive, stepAtmosphere, useAtmosphere } from './atmosphere';
import { Setting } from './Setting';
import { Landmark } from './Landmark';
import { PlanPeople } from './PlanPeople';
import { formation, SketchObject } from './SketchObject';
import { memoryPlacements } from '../../social/overlay';
import { PerspectiveLayer } from '../../social/scene/PerspectiveLayer';

const ORDER: Record<string, number> = { 'floor-under': 0, wall: 1, backdrop: 1, water: 1, edge: 2, floor: 3, 'wall-mounted': 4, surface: 5 };

/** Things held in the visitor's hands rather than set in the place: a kite, and its spool when there is a kite. */
const held = (plan: ScenePlan, kind: string) => kind === 'kite' || (kind === 'spool' && plan.objects.some((o) => o.kind === 'kite'));

/** In a prepared place every thing has its spot in that world (things on the table sit on its top). */
function placeSpots(place: PreparedPlace, plan: ScenePlan): Map<string, Placement> {
  const out = new Map<string, Placement>();
  for (const o of plan.objects) {
    const base = spotOf(place, plan, o);
    const at = whereIs(place, plan, o);
    if (!base || !at) continue;
    // Where the person said or showed; things on or around something move with it, keeping their own turn.
    const spot = { ...base, x: at[0], z: at[1], yaw: o.at && !base.on && !base.of ? undefined : base.yaw };
    const host = spot.on ? plan.objects.find((h) => h.kind === spot.on || (spot.on === 'table' && h.kind === 'round_table')) : undefined;
    const he = host ? entryOf(host.kind) : null;
    const y = host && he ? (he.surface ?? he.h) * host.scale : spot.y ?? 0;
    // Spots are measured from the visitor; placements from the memory's centre.
    const x = spot.x - MEMORY_CENTER.x, z = spot.z - MEMORY_CENTER.z;
    const yaw = spot.yaw ?? Math.atan2(-spot.x, -spot.z); // facing the visitor unless the spot says otherwise
    out.set(o.id, { id: o.id, x, y: spot.on && !host ? 0.76 : y, z, yaw, scale: o.scale, on: host?.id ?? null });
  }
  return out;
}

/** Keep earlier placements; place new things where layout puts them, nudged off anything already there. */
function stablePlacements(plan: ScenePlan, previous: Map<string, Placement>): Map<string, Placement> {
  const fresh = layout(plan);
  const out = new Map<string, Placement>();
  for (const p of fresh) {
    const old = previous.get(p.id);
    if (old) { out.set(p.id, old); continue; }
    const q = { ...p };
    for (let i = 0; i < 24; i++) {
      const clash = [...out.values()].some((o) => o.on === null && q.on === null && Math.hypot(o.x - q.x, o.z - q.z) < 0.55);
      if (!clash) break;
      q.x += Math.cos(i * 2.4) * 0.25; q.z += Math.sin(i * 2.4) * 0.2;
    }
    out.set(p.id, q);
  }
  return out;
}

export function MemoryScene() {
  const plan = useMemory((s) => s.plan);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const sceneRoot = useThree((s) => s.scene);
  // The photoreal models this place needs start loading the moment its plan arrives (it forms a few seconds later),
  // and are made ready to draw (shaders, textures) in the background so they appear without a stutter.
  useEffect(() => {
    if (!plan) return;
    const things = plan.objects.map((o) => ({ kind: o.kind, label: o.label, id: o.id }));
    preloadRealModels(things);
    void warmRealModels(gl, camera, sceneRoot, things);
  }, [plan, gl, camera, sceneRoot]);
  const stage = useGate((s) => s.stage);
  const preview = !!(window as unknown as { __scenePreview?: boolean }).__scenePreview;
  const active = preview || stage === 'forming' || stage === 'memory' || stage === 'leaving';
  const scene = useThree((s) => s.scene);
  const placed = useRef(new Map<string, Placement>());
  const photoWorld = useGate((s) => s.photoWorld);
  const placeKey = useMemory((s) => s.place);
  const shared = useMemory((s) => !!s.shared);
  const place = placeKey ? PLACES[placeKey] : null;
  const coveredByPhoto = useRef(new Set<string>());
  // When the photo becomes the world, everything planned from it so far is already in the picture.
  // (A prepared place's world is generic: everything named in it is brought in, nothing is assumed to be there.)
  useEffect(() => { if (photoWorld && plan && !place && coveredByPhoto.current.size === 0) coveredByPhoto.current = new Set(plan.objects.map((o) => o.id)); if (!photoWorld || place) coveredByPhoto.current = new Set(); }, [photoWorld, plan, place]);
  const delays = useRef(new Map<string, number>());
  const firstShown = useRef<number | null>(null);

  const placements = useMemo(() => {
    if (!plan) { placed.current = new Map(); return placed.current; }
    placed.current = place ? placeSpots(place, plan) : stablePlacements(plan, placed.current);
    memoryPlacements.current = placed.current; // perspectives place their own things around these
    return placed.current;
  }, [plan, place]);

  // A calm order of appearance; anything that arrives later forms right away.
  const delayOf = (id: string, index: number, kind: string): number => {
    const known = delays.current.get(id);
    if (known !== undefined) return known;
    const initial = firstShown.current === null || performance.now() - firstShown.current < 1500;
    const d = initial ? 0.5 + (ORDER[entryOf(kind).place] ?? 3) * 0.32 + index * 0.26 : 0.2;
    delays.current.set(id, d);
    return d;
  };

  useEffect(() => {
    if (active && plan && firstShown.current === null) firstShown.current = performance.now();
    if (!plan) { firstShown.current = null; delays.current.clear(); }
  }, [active, plan]);

  useEffect(() => { useAtmosphere.getState().set(active && plan ? plan.setting.timeOfDay : null, plan?.setting.weather); }, [active, plan]);

  // Fog that matches the memory's horizon gives the place depth and lets distant things dissolve into the dream.
  useEffect(() => {
    if (!active) { scene.fog = null; return; }
    const fog = new THREE.Fog(new THREE.Color('#f2f2f6'), plan?.setting.water ? 16 : 9, plan?.setting.water ? 52 : 30);
    scene.fog = fog;
    return () => { if (scene.fog === fog) scene.fog = null; };
  }, [active, scene, plan?.setting.water]);

  const lastFormed = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    stepAtmosphere(dt, active && !!plan);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(atmoLive.horizon).lerp(new THREE.Color('#f2f2f6'), 1 - atmoLive.amount);
    if (!plan) { if (lastFormed.current !== 0) { lastFormed.current = 0; useMemory.setState({ formed: 0 }); } return; }
    const counted = (useGate.getState().photoWorld ? plan.objects.filter((o) => !coveredByPhoto.current.has(o.id)) : plan.objects).filter((o) => !held(plan, o.kind));
    let sum = 0;
    for (const o of counted) sum += formation.get(o.id) ?? 0;
    const formed = counted.length ? sum / counted.length : 1;
    if (Math.abs(formed - lastFormed.current) > 0.02 || (formed === 1 && lastFormed.current !== 1)) {
      lastFormed.current = formed;
      useMemory.setState({ formed });
    }
  });

  if (!active || !plan) return null;
  // In a prepared place the floor is the world's own (a splat, which can't be pointed at): an unseen ground catches a
  // tap, pinch or trigger, so "the bench was here" can put something where you pointed; in the headset a pinch held
  // there for a moment is a step to it instead (Walk).
  const ground = place ? (
    <mesh name="ground-catcher" rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} renderOrder={-10}
      onPointerDown={walkPointer.down} onPointerMove={walkPointer.move} onPointerUp={walkPointer.up} onPointerLeave={walkPointer.leave}>
      <circleGeometry args={[20, 64]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  ) : null;
  // Inside a living photograph the photo already shows the room and its furniture; only what's said after forms.
  // A kite (and the spool it flies from) is in the visitor's hands, drawn by HeldKite, not set in the place.
  const shown = (photoWorld ? plan.objects.filter((o) => !coveredByPhoto.current.has(o.id)) : plan.objects).filter((o) => !held(plan, o.kind));
  const sorted = [...shown].sort((a, b) => (ORDER[entryOf(a.kind).place] ?? 3) - (ORDER[entryOf(b.kind).place] ?? 3));
  return (
    <group name="memory">
      {!photoWorld && !place && <Setting plan={plan} />}
      {!photoWorld && plan.landmark && <Landmark landmark={plan.landmark} />}
      {!!plan.people?.length && <PlanPeople plan={plan} />}
      {ground}
      <Ambience kind={plan.ambience} />
      {sorted.map((o, i) => {
        const p = placements.get(o.id);
        if (!p) return null;
        return <SketchObject key={o.id} obj={o} place={p} delay={delayOf(o.id, i, o.kind)} />;
      })}
      {!shared && <PerspectiveLayer />}
    </group>
  );
}
