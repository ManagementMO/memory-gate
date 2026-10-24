// Everything in the 3D world, composed once and kept alive across the journey; each part fades itself by stage.
import { Environment } from '@react-three/drei';
import { Snapshotter } from './Snapshotter';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { CompanionRig } from '../companion/CompanionRig';
import { AuroraSky } from './AuroraSky';
import { CameraRig } from './CameraRig';
import { GateDust } from './GateDust';
import { MediaCard } from './MediaCard';
import { MemoryScene } from './sketch/MemoryScene';
import { WhiteSpace } from './WhiteSpace';

/** A soft studio environment for glossy surfaces (the figure's shell, sketch objects). Generated, no download. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return rt.texture;
  }, [gl]);
  return <Environment map={texture} environmentIntensity={0.9} />;
}

export function World({ quality }: { quality: number }) {
  return (
    <>
      <StudioEnvironment />
      <hemisphereLight args={['#f4f2ff', '#cfd2e0', 0.65]} />
      <directionalLight position={[-3, 6, 3]} intensity={1.15} color="#fff6ea" />
      <CameraRig />
      <AuroraSky quality={quality} />
      <GateDust />
      <WhiteSpace />
      <MemoryScene />
      <MediaCard />
      <CompanionRig />
      <Snapshotter />
    </>
  );
}
