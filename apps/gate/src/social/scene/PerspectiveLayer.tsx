// Inside the memory, what each perspective remembers. Through your own eyes, the things you (or anyone seeing
// through the same eyes) added stand solid in the place, and your archive photographs hang on the wall. What the
// other perspective remembers is there too, as faint ghosts and small lights: select one to hear their side.
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { entryOf, type Placement } from '../../../../../packages/shared/src/scene';
import { MEMORY_CENTER } from '../../scene/layout';
import { SketchObject } from '../../scene/sketch/SketchObject';
import { useMemory } from '../../flow/memory';
import { useGate } from '../../state/store';
import { memoryPlacements } from '../overlay';
import { memoryKey } from '../perspectives';
import { perspectiveById, useSocial, type Pin, type PerspectiveObject, type Story } from '../store';

const GHOST_OPACITY = 0.22;
const open = (storyId: string) => (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); useSocial.getState().set({ openStory: storyId }); };

/** Another perspective's thing: the same sketch, see-through, that opens its story when selected. */
function Ghost({ o }: { o: PerspectiveObject }) {
  const g = useRef<THREE.Group>(null);
  const done = useRef(new WeakSet<THREE.Material>());
  useFrame(() => {
    g.current?.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m || done.current.has(m) || (m as THREE.ShaderMaterial).isShaderMaterial) continue;
        m.transparent = true; m.opacity = GHOST_OPACITY; m.depthWrite = false; m.needsUpdate = true;
        done.current.add(m);
      }
      mesh.castShadow = false;
    });
  });
  return (
    <group ref={g} onClick={o.storyId ? open(o.storyId) : undefined} userData={{ noPoint: true }}>
      <SketchObject obj={o.data} place={o.placement} delay={0.4} />
    </group>
  );
}

/** A story with nothing of its own in the place: a small light where it was told about (or above what it's about). */
function StoryMark({ story, at, color }: { story: Story; at: THREE.Vector3; color: string }) {
  const m = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false, fog: false }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => { if (m.current) m.current.position.y = at.y + Math.sin(clock.elapsedTime * 1.4 + at.x * 3) * 0.03; });
  return (
    <mesh ref={m} position={at} material={mat} onClick={open(story.id)} userData={{ noPoint: true }}>
      <sphereGeometry args={[0.035, 18, 12]} />
    </mesh>
  );
}

const placeToWorld = (p: Placement, lift = 0) => new THREE.Vector3(MEMORY_CENTER.x + p.x, p.y + lift, MEMORY_CENTER.z + p.z);

function markSpot(s: Story, objects: PerspectiveObject[]): THREE.Vector3 | null {
  if (s.at.length === 3) return new THREE.Vector3(s.at[0], s.at[1]! + 0.12, s.at[2]);
  const shared = memoryPlacements.current.get(s.objectId);
  if (shared) return placeToWorld(shared, 0.25 + entryOf(useMemory.getState().plan?.objects.find((o) => o.id === s.objectId)?.kind ?? 'custom').h);
  const mine = objects.find((o) => o.data.id === s.objectId || o.id.endsWith(`:${s.objectId}`));
  return mine ? placeToWorld(mine.placement, 0.25 + entryOf(mine.data.kind).h) : null;
}

/** An archive photograph pinned to a perspective, framed, with what is (and isn't) known about it. */
function ArchiveFrame({ pin, faint }: { pin: Pin; faint: boolean }) {
  const ref = pin.data;
  const tex = useMemo(() => {
    if (!ref.imageUrl) return null;
    const t = new THREE.TextureLoader().load(`/exchange/archive-image/${encodeURIComponent(pin.id)}`);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [pin.id, ref.imageUrl]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const p = pin.placement;
  const w = 0.56, h = 0.42;
  const caption = [ref.title.slice(0, 70), ref.date, 'Library of Congress', ref.dateMatch === 'unknown' ? 'Date uncertain' : ''].filter(Boolean).join(' · ');
  return (
    <group position={[MEMORY_CENTER.x + p.x, p.y, MEMORY_CENTER.z + p.z]} rotation-y={p.yaw} userData={{ noPoint: true }}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.02]} />
        <meshStandardMaterial color="#d9cdb8" roughness={0.6} transparent={faint} opacity={faint ? 0.25 : 1} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        {tex ? <meshBasicMaterial map={tex} toneMapped={false} transparent={faint} opacity={faint ? 0.25 : 1} /> : <meshBasicMaterial color="#efe9de" transparent={faint} opacity={faint ? 0.25 : 1} />}
      </mesh>
      {!tex && <Text font={fontUrl} fontSize={0.03} maxWidth={w - 0.06} anchorX="center" anchorY="middle" position={[0, 0, 0.002]} color="#4a4560" textAlign="center" fillOpacity={faint ? 0.3 : 1}>{ref.title.slice(0, 90)}</Text>}
      <Text font={fontUrl} fontSize={0.018} maxWidth={w + 0.06} anchorX="center" anchorY="top" position={[0, -h / 2 - 0.05, 0]} color="#4a4560" textAlign="center" fillOpacity={faint ? 0.3 : 0.9}>{caption}</Text>
    </group>
  );
}

/** In the headset, an opened story floats beside you (phones and laptops show it as a card instead). */
function StoryCard3D() {
  const openStory = useSocial((s) => s.openStory);
  const story = useSocial((s) => s.stories.find((x) => x.id === s.openStory));
  const xr = useGate((s) => s.xr);
  const camera = useThree((s) => s.camera);
  const g = useRef<THREE.Group>(null);
  const placed = useRef<string | null>(null);
  useFrame(() => {
    if (!g.current || !openStory) return;
    if (placed.current === openStory) return;
    const head = camera.getWorldPosition(new THREE.Vector3());
    const q = camera.getWorldQuaternion(new THREE.Quaternion());
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0).normalize();
    const k = useSocial.getState().xr.k;
    g.current.position.copy(head).addScaledVector(f, 0.9 * k).add(new THREE.Vector3(0, -0.05 * k, 0));
    g.current.scale.setScalar(k);
    placed.current = openStory;
  });
  if (!xr || !story) return null;
  const p = perspectiveById(story.perspectiveId);
  return (
    <group ref={g}>
      <Billboard>
        <mesh onClick={(e) => { e.stopPropagation(); useSocial.getState().set({ openStory: null }); }} userData={{ noPoint: true }}>
          <planeGeometry args={[0.7, 0.3]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.82} toneMapped={false} depthTest={false} />
        </mesh>
        <Text font={fontUrl} fontSize={0.024} anchorX="center" anchorY="top" position={[0, 0.12, 0.002]} color={p?.color ?? '#6a5acd'} material-depthTest={false}>
          {`${story.speakerName}, through the ${(p?.label ?? 'other').toLowerCase()}’s eyes`}
        </Text>
        <Text font={fontUrl} fontSize={0.03} maxWidth={0.62} lineHeight={1.25} anchorX="center" anchorY="top" position={[0, 0.07, 0.002]} color="#24223a" textAlign="center" material-depthTest={false}>
          {`“${story.text.slice(0, 220)}”`}
        </Text>
      </Billboard>
    </group>
  );
}

export function PerspectiveLayer() {
  const viewing = useSocial((s) => s.viewing);
  const perspectives = useSocial((s) => s.perspectives);
  const objects = useSocial((s) => s.objects);
  const stories = useSocial((s) => s.stories);
  const pins = useSocial((s) => s.pins);
  const ghosts = useSocial((s) => s.ghosts);
  const live = useSocial((s) => s.status === 'live');
  if (!live) return null;
  const mem = memoryKey();
  const mine = perspectives.find((p) => p.key === viewing)?.id ?? '';
  const here = objects.filter((o) => o.memoryId === mem);
  const ownObjects = here.filter((o) => o.perspectiveId === mine);
  // A memory handed across keeps its things' ids: once it's yours, its ghost steps aside for your own copy.
  const own = new Set(ownObjects.map((o) => o.data.id));
  const otherObjects = ghosts ? here.filter((o) => o.perspectiveId !== mine && !own.has(o.data.id)) : [];
  const withThings = new Set(here.map((o) => o.storyId).filter(Boolean));
  const marks = ghosts ? stories.filter((s) => s.memoryId === mem && s.perspectiveId !== mine && !withThings.has(s.id)) : [];
  return (
    <group name="perspectives">
      {ownObjects.map((o) => <SketchObject key={`own-${o.id}`} obj={o.data} place={o.placement} delay={0.2} />)}
      {otherObjects.map((o) => <Ghost key={`ghost-${o.id}`} o={o} />)}
      {marks.map((s) => { const at = markSpot(s, here); return at ? <StoryMark key={s.id} story={s} at={at} color={perspectiveById(s.perspectiveId)?.color ?? '#cdb4ff'} /> : null; })}
      {pins.filter((p) => p.perspectiveId === mine || ghosts).map((p) => <ArchiveFrame key={p.id} pin={p} faint={p.perspectiveId !== mine} />)}
      <StoryCard3D />
    </group>
  );
}
