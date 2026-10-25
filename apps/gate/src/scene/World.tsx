// Everything in the 3D world, composed once and kept alive across the journey; each part fades itself by stage.
import { Environment } from '@react-three/drei';
import { XROrigin } from '@react-three/xr';
import { Snapshotter } from './Snapshotter';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
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
import { PalaceWorld } from './palace/PalaceWorld';
import { SHORE, XR_MOVE_AT } from './palace/plan';
import { WhiteSpace } from './WhiteSpace';
import { PresenceLights } from '../presence/PresenceLights';
import { SocialLayer } from '../social/scene/SocialLayer';
import { OriginRig } from '../social/xr/OriginRig';
import { GateObjectsLayer } from '../memory-objects/GateObjects';
import { applyPerspectiveToOrigin, perspectiveAnchored } from '../social/xr/perspectiveScale';
import { pointBus } from '../presence/presence';
import type { ThreeEvent } from '@react-three/fiber';

/** In the headset, a pinch (hands) or trigger (controllers) on something in the memory marks it for everyone: the
 *  same "look here" as a tap on a phone. (Flat screens use the tap handler in PresenceLights.) */
function pointInHeadset(e: ThreeEvent<MouseEvent>) {
  const g = useGate.getState();
  if (!g.xr || !(g.stage === 'memory' || g.stage === 'forming') || !pointBus.send) return;
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
    const pk = 1 - palace.current;
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

/** The headset wearer's feet. In the palace they begin across the lagoon, and are carried under the dome while the
 *  world is white (never a glide in the headset). Everywhere else they stay at the origin. Seeing through a
 *  grandchild's eyes, the world grows around those feet (social/xr: the origin is scaled, the head stays put). */
function PlayerOrigin() {
  const origin = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = useGate.getState();
    const atShore = s.world === 'palace' && (s.stage === 'portal' || s.stage === 'greeting' || s.stage === 'gathering' || (s.stage === 'entering' && s.enterProgress < XR_MOVE_AT));
    applyPerspectiveToOrigin(origin.current, 0, atShore ? SHORE.z : 0);
    // In a prepared place the wearer faces its best side (turned while the world is white, never in view), unless
    // they stand in someone's perspective, which places and turns them itself.
    const inMemory = s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving';
    if (origin.current && inMemory && !perspectiveAnchored()) origin.current.rotation.y = viewOf(useMemory.getState().place);
  });
  return <XROrigin ref={origin}><OriginRig /></XROrigin>;
}

const PREVIEW = !!(window as unknown as { __scenePreview?: boolean }).__scenePreview;

export function World({ quality }: { quality: number }) {
  const world = useGate((s) => s.world);
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
      <MediaCard />
      <CompanionRig />
      <PresenceLights />
      <SocialLayer />
      <GateObjectsLayer />
      <Snapshotter />
      <XrLayer />
    </>
  );
}
