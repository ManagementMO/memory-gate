// ?preview=album: the moments album exactly as it appears after leaving a memory: the live aurora sky (gate dimmed)
// behind liquid glass, filled with clearly labelled fictional sample memories. ?empty=1 shows the empty album.
import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import AlbumView from '../album/AlbumView';
import { sampleMemories } from '../album/samples';
import { useMoments } from '../flow/moments';
import { AuroraSky } from '../scene/AuroraSky';
import { CameraRig } from '../scene/CameraRig';
import { GateDust } from '../scene/GateDust';
import { useGate } from '../state/store';
import { GlassFilters } from '../ui/GlassFilters';

function Backdrop() {
  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.toneMapping = THREE.NeutralToneMapping; gl.setClearColor('#04050c'); }, [gl]);
  return (
    <>
      <CameraRig />
      <AuroraSky quality={1} />
      <GateDust />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.25} radius={0.72} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.28} darkness={0.42} />
        <Noise opacity={0.028} premultiply />
      </EffectComposer>
    </>
  );
}

export default function AlbumPreview() {
  const [ready] = useState(() => {
    useGate.getState().set({ stage: 'album' });
    const empty = new URLSearchParams(location.search).get('empty') === '1';
    useMoments.setState({ memories: empty ? [] : sampleMemories() });
    return true;
  });
  return (
    <div className="app">
      <Canvas className="scene" dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }} camera={{ fov: 50, near: 0.05, far: 200, position: [0, 1.55, 0] }}>
        <Backdrop />
      </Canvas>
      <div className="overlay">
        {ready && <AlbumView onBeginAnother={() => console.info('[album] visit another memory')} onRevisit={(id) => console.info('[album] visit again', id)} />}
      </div>
      <GlassFilters />
    </div>
  );
}
