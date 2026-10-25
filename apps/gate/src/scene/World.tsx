// Everything in the 3D world, composed once and kept alive across the journey; each part fades itself by stage.
import { Environment } from '@react-three/drei';
import { XROrigin, useXR } from '@react-three/xr';
import { Snapshotter } from './Snapshotter';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { atmoLive } from './sketch/atmosphere';
import { useGate } from '../state/store';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { CompanionRig } from '../companion/CompanionRig';
import { AuroraSky } from './AuroraSky';
import { CameraRig } from './CameraRig';
import { GateDust } from './GateDust';
import { MediaCard } from './MediaCard';
import { PhotoWorld } from './PhotoWorld';
import { MemoryScene } from './sketch/MemoryScene';
import { HeldKite } from './sketch/HeldKite';
import { Walk, walkPointer } from './Walk';
import { PalaceWorld } from './palace/PalaceWorld';
import { SHORE, XR_MOVE_AT } from './palace/plan';
import { WhiteSpace } from './WhiteSpace';
import { PresenceLights } from '../presence/PresenceLights';
import { SocialLayer } from '../social/scene/SocialLayer';
import { OriginRig } from '../social/xr/OriginRig';
import { MemoryAddOnsScene } from '../memory-addons/MemoryAddOns';
import { applyPerspectiveToOrigin, faceFrom, perspectiveAnchored, reanchor } from '../social/xr/perspectiveScale';
import { pointBus } from '../presence/presence';
import type { ThreeEvent } from '@react-three/fiber';

/** In the headset, a pinch (hands) or trigger (controllers) on something in the memory marks it for everyone: the
 *  same "look here" as a tap on a phone. (Flat screens use the tap handler in PresenceLights.) */
function pointInHeadset(e: ThreeEvent<MouseEvent>) {
  const g = useGate.getState();
  if (!g.xr || !(g.stage === 'memory' || g.stage === 'forming') || !pointBus.send) return;
  if (walkPointer.justMoved()) return; // that pinch was held: a step there, not a "here"
  e.stopPropagation();
  pointBus.send([e.point.x, e.point.y, e.point.z]);
}
import { XrLayer } from './XrLayer';
import { viewOf } from '../../../../packages/shared/src/places';
import { useMemory } from '../flow/memory';

/** A soft studio environment for glossy surfaces (the figure's shell, sketch objects). Generated, no download. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return rt.texture;
  }, [gl]);
  return <Environment map={texture} />;
}

/** Sun and sky light that take on the remembered hour once a memory forms (neutral studio light otherwise). */
function MemoryLights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const day = useRef(0);
  const palace = useRef(0);
  useFrame((_, dt) => {
    // Porcelain needs directional light to read: on the white side the environment and sky step back, a warm key
    // light leads from the upper left and a cool fill lifts the shadows from the back right.
    const st = useGate.getState().stage;
    const isDay = st === 'forming' || st === 'memory' || st === 'leaving' || !!(window as unknown as { __scenePreview?: boolean }).__scenePreview;
    day.current += ((isDay ? 1 : 0) - day.current) * (1 - Math.exp(-Math.min(dt, 0.05) * 1.5));
    const k = day.current;
    // Before the memory, the palace brings its own low sun and sky light; these step aside for it.
    const g = useGate.getState();
    const inPalace = g.world === 'palace' && !isDay;
    palace.current += ((inPalace ? 1 : 0) - palace.current) * (1 - Math.exp(-Math.min(dt, 0.05) * 3));
    const pk = (1 - palace.current) * (useMemory.getState().showcaseReady ? 0.15 : 1); // a showcase brings its own sun
    scene.environmentIntensity = 0.9 - 0.4 * k;
    if (fill.current) fill.current.intensity = 0.35 * k;
    if (sun.current) {
      sun.current.color.copy(atmoLive.sun);
      sun.current.intensity = atmoLive.sunIntensity;
      // The sun is placed relative to the memory's centre so its shadows fall across the room.
      sun.current.position.set(atmoLive.sunDir.x, atmoLive.sunDir.y, -2.6 + atmoLive.sunDir.z);
    }
    if (sky.current) { sky.current.color.copy(atmoLive.sky); sky.current.groundColor.copy(atmoLive.groundLight); sky.current.intensity = atmoLive.hemi * (1 - 0.45 * k) * pk; }
    if (sun.current) sun.current.intensity = atmoLive.sunIntensity * (1 + 0.18 * k) * pk;
  });
  return (
    <>
      <hemisphereLight ref={sky} args={['#f4f2ff', '#cfd2e0', 0.65]} />
      <directionalLight ref={sun} position={[-3, 6, 3]} intensity={1.15} color="#fff6ea" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={6}
        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-near={0.5} shadow-camera-far={30}>
        <object3D attach="target" position={[0, 0, -2.6]} />
      </directionalLight>
      <directionalLight ref={fill} position={[4, 3.5, -7]} intensity={0} color="#dfe6ff" />
    </>
  );
}

const _hq = new THREE.Quaternion();
const _he = new THREE.Euler(0, 0, 0, 'YXZ');
const _hp = new THREE.Vector3();
const EMULATED = new URLSearchParams(location.search).get('emulate') === '1';
/** Where the head is inside the origin (tracked metres) and which way it faces there, from this XR frame. */
function headInOrigin(gl: THREE.WebGLRenderer): { x: number; y: number; z: number; yaw: number } | null {
  const ref = gl.xr.getReferenceSpace();
  const pose = ref ? gl.xr.getFrame()?.getViewerPose(ref) : null;
  if (!pose) return null;
  const { position: p, orientation: o } = pose.transform;
  return { x: p.x, y: p.y, z: p.z, yaw: _he.setFromQuaternion(_hq.set(o.x, o.y, o.z, o.w), 'YXZ').y };
}

/** The headset wearer's feet. In the palace they begin across the lagoon, and are carried under the dome while the
 *  world is white (never a glide in the headset). Everywhere else they stay at the origin. Seeing through a
 *  grandchild's eyes, the world grows around those feet (social/xr: the origin is scaled, the head stays put). */
function PlayerOrigin() {
  const origin = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const space = useXR((s) => s.originReferenceSpace);
  // The headset's own "forward" is wherever it was last recentred, not where the person looks as they step in. So the
  // world turns to face them: the palace and the companion ahead when the visit begins (and again back from a memory),
  // a prepared place's best side as each memory forms (the world is white then, so nothing is seen to move), and once
  // more after the headset is recentred.
  const faced = useRef<'gate' | 'memory' | null>(null);
  const recentred = useRef(false);
  useEffect(() => {
    if (!space) { faced.current = null; return; }
    const onReset = () => { recentred.current = true; };
    space.addEventListener('reset', onReset);
    return () => space.removeEventListener('reset', onReset);
  }, [space]);
  useFrame(() => {
    const s = useGate.getState();
    const atShore = s.world === 'palace' && (s.stage === 'portal' || s.stage === 'greeting' || s.stage === 'gathering' || (s.stage === 'entering' && s.enterProgress < XR_MOVE_AT));
    const inMemory = s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving';
    const want = inMemory ? 'memory' : 'gate';
    if (gl.xr.isPresenting && (faced.current !== want || recentred.current)) {
      const head = headInOrigin(gl);
      if (head && head.y > 0.3) {
        // Someone's perspective places and turns the wearer itself; after a recentre it is stood in again.
        if (inMemory && perspectiveAnchored()) { if (recentred.current) reanchor(head); }
        else faceFrom(head, inMemory ? viewOf(useMemory.getState().place) : 0);
        faced.current = want;
        recentred.current = false;
      }
    } else if (!gl.xr.isPresenting) faced.current = null;
    applyPerspectiveToOrigin(origin.current, 0, atShore ? SHORE.z : 0);
    if (EMULATED && gl.xr.isPresenting) { // diagnostics for scripts/xr-check.mjs: where the wearer stands and looks
      camera.getWorldPosition(_hp);
      (window as unknown as { __xrHead?: number[] }).__xrHead = [_hp.x, _hp.y, _hp.z, _he.setFromQuaternion(camera.getWorldQuaternion(_hq), 'YXZ').y];
    }
  });
  // Diagnostics (scripts/pinch-check.mjs): where a named thing, or a world point, is from the eyes (tracked metres), so
  // the emulated hand can be aimed at it and pinch it the way a wearer would.
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!EMULATED) return;
    const w = window as unknown as { __aim?: (at: string | number[]) => number[] | null; __glInfo?: () => Record<string, number> };
    // What the last frame cost to draw, and the heaviest meshes in the scene (scripts/showcase-check.mjs).
    w.__glInfo = () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries });
    (w as unknown as { __heaviest?: (n: number) => unknown[] }).__heaviest = (n) => {
      const rows: { name: string; tris: number; count: number }[] = [];
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry, per = (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3, count = m.isInstancedMesh ? m.count ?? 1 : 1;
        let who = m.name || '', p: THREE.Object3D | null = m.parent;
        for (let i = 0; i < 4 && p && !who; i++, p = p.parent) who = p.name;
        rows.push({ name: who || m.type, tris: Math.round(per * count), count });
      });
      const by = new Map<string, { tris: number; meshes: number }>();
      for (const r of rows) { const b = by.get(r.name) ?? { tris: 0, meshes: 0 }; b.tris += r.tris; b.meshes++; by.set(r.name, b); }
      return [...by.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, n).map(([name, b]) => ({ name, ...b }));
    };
    // The heaviest single meshes, described (for script-built places, whose meshes have no names).
    (w as unknown as { __heaviestMeshes?: (n: number) => unknown[] }).__heaviestMeshes = (n) => {
      const rows: { what: string; tris: number }[] = [];
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry, per = (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3, count = m.isInstancedMesh ? m.count ?? 1 : 1;
        const mat = [m.material].flat()[0] as THREE.MeshStandardMaterial | undefined;
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        rows.push({ what: `${m.name || g.type} ×${count} (${Math.round(per)} each) ${mat?.name || mat?.type || ''} ${mat?.color ? '#' + mat.color.getHexString() : ''} size ${size.toArray().map((v) => v.toFixed(0)).join('x')} at ${c.toArray().map((v) => v.toFixed(0)).join(',')}`, tris: Math.round(per * count) });
      });
      return rows.sort((a, b) => b.tris - a.tris).slice(0, n);
    };
    w.__aim = (at) => {
      const p = new THREE.Vector3();
      if (typeof at === 'string') { const o = scene.getObjectByName(at); if (!o) return null; o.getWorldPosition(p); } else p.fromArray(at);
      camera.updateWorldMatrix(true, false);
      return camera.worldToLocal(p).toArray();
    };
    return () => { delete w.__aim; delete w.__glInfo; };
  }, [scene, camera, gl]);
  return <XROrigin ref={origin}><OriginRig /></XROrigin>;
}

const PREVIEW = !!(window as unknown as { __scenePreview?: boolean }).__scenePreview;

export function World({ quality }: { quality: number }) {
  const world = useGate((s) => s.world);
  // Someone else's shared memory is seen through their eyes: the family's two perspectives don't stand in it.
  const shared = useMemory((s) => !!s.shared);
  return (
    <>
      <PlayerOrigin />
      <StudioEnvironment />
      <MemoryLights />
      <CameraRig />
      <AuroraSky quality={quality} />
      {world === 'palace' && !PREVIEW && <PalaceWorld quality={quality} />}
      <GateDust />
      <WhiteSpace />
      <PhotoWorld />
      <group onClick={pointInHeadset}>
        <MemoryScene />
      </group>
      <HeldKite />
      <Walk />
      <MediaCard />
      <CompanionRig />
      <PresenceLights />
      {!shared && <SocialLayer />}
      {/* Its objects' loading labels wait on a font: kept here, a wait can't reach past the scene (see SceneCanvas). */}
      <Suspense fallback={null}><MemoryAddOnsScene /></Suspense>
      <Snapshotter />
      <XrLayer />
    </>
  );
}
