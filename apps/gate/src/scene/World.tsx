// Everything in the 3D world, composed once and kept alive across the journey; each part fades itself by stage.
import { Environment } from '@react-three/drei';
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
import { MemoryScene } from './sketch/MemoryScene';
import { WhiteSpace } from './WhiteSpace';
import { XrLayer } from './XrLayer';

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
  useFrame((_, dt) => {
    // Porcelain needs directional light to read: on the white side the environment and sky step back, a warm key
    // light leads from the upper left and a cool fill lifts the shadows from the back right.
    const st = useGate.getState().stage;
    const isDay = st === 'forming' || st === 'memory' || st === 'leaving' || !!(window as unknown as { __scenePreview?: boolean }).__scenePreview;
    day.current += ((isDay ? 1 : 0) - day.current) * (1 - Math.exp(-Math.min(dt, 0.05) * 1.5));
    const k = day.current;
    scene.environmentIntensity = 0.9 - 0.4 * k;
    if (fill.current) fill.current.intensity = 0.35 * k;
    if (sun.current) {
      sun.current.color.copy(atmoLive.sun);
      sun.current.intensity = atmoLive.sunIntensity;
      // The sun is placed relative to the memory's centre so its shadows fall across the room.
      sun.current.position.set(atmoLive.sunDir.x, atmoLive.sunDir.y, -2.6 + atmoLive.sunDir.z);
    }
    if (sky.current) { sky.current.color.copy(atmoLive.sky); sky.current.groundColor.copy(atmoLive.groundLight); sky.current.intensity = atmoLive.hemi * (1 - 0.45 * k); }
    if (sun.current) sun.current.intensity = atmoLive.sunIntensity * (1 + 0.18 * k);
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

export function World({ quality }: { quality: number }) {
  return (
    <>
      <StudioEnvironment />
      <MemoryLights />
      <CameraRig />
      <AuroraSky quality={quality} />
      <GateDust />
      <WhiteSpace />
      <MemoryScene />
      <MediaCard />
      <CompanionRig />
      <Snapshotter />
      <XrLayer />
    </>
  );
}
