// ?preview=album: the moments album exactly as it appears after leaving a memory: the palace behind liquid glass
// (the aurora with ?world=aurora), filled with clearly labelled fictional sample memories. ?empty=1 shows it empty.
// &map=1 shows the memory map instead (the album stage as opened from the start page).
import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import AlbumView from '../album/AlbumView';
import Atlas from '../map/Atlas';
import { sampleMemories } from '../album/samples';
import { useMoments } from '../flow/moments';
import { AuroraSky } from '../scene/AuroraSky';
import { CameraRig } from '../scene/CameraRig';
import { GateDust } from '../scene/GateDust';
import { PalaceWorld } from '../scene/palace/PalaceWorld';
import { useGate } from '../state/store';
import { GlassFilters } from '../ui/GlassFilters';

function Backdrop() {
  const gl = useThree((s) => s.gl);
  const palace = useGate((s) => s.world) === 'palace';
  useEffect(() => { gl.toneMapping = THREE.NeutralToneMapping; gl.setClearColor('#04050c'); }, [gl]);
  return (
    <>
      <CameraRig />
      {palace ? <PalaceWorld quality={1} /> : <><AuroraSky quality={1} /><GateDust /></>}
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={palace ? 0.26 : 0.85} luminanceThreshold={palace ? 0.95 : 0.55} luminanceSmoothing={0.25} radius={0.72} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.28} darkness={palace ? 0.26 : 0.42} />
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
    // Tests only: show the family rows for a real session (?xcode=CODE&xtoken=TOKEN) from the memory exchange.
    const p = new URLSearchParams(location.search);
    const xcode = p.get('xcode'), xtoken = p.get('xtoken');
    if (xcode && xtoken) useGate.getState().set({ session: { code: xcode, token: xtoken, joinKey: null, role: 'guest', name: 'Family' } });
    return true;
  });
  const Album = new URLSearchParams(location.search).get('map') === '1' ? Atlas : AlbumView;
  return (
    <div className="app">
      <Canvas className="scene" dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }} camera={{ fov: 50, near: 0.05, far: 200, position: [0, 1.55, 0] }}>
        <Backdrop />
      </Canvas>
      <div className="overlay" data-world={useGate.getState().world}>
        {ready && <Album onBeginAnother={() => console.info('[album] visit another memory')} onRevisit={(id) => console.info('[album] visit again', id)} />}
      </div>
      <GlassFilters />
    </div>
  );
}
