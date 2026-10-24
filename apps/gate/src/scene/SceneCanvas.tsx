// The one canvas. Flat screens get gentle bloom and grain (the gate's hairlines and the companion's light glow);
// XR renders straight to the headset (post-processing is not supported in WebXR) with the shaders' own glow.
import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { XR, useXR } from '@react-three/xr';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { World } from './World';
import { xrStore } from './xr';

/** Diagnostic switches for performance work (?ao=0, ?shadows=0, ?fx=0); never needed in normal use. */
const DIAG = new URLSearchParams(location.search);

function Effects({ quality }: { quality: number }) {
  const presenting = useXR((s) => s.session != null);
  const stage = useGate((s) => s.stage);
  const world = useGate((s) => s.world);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving' || !!(window as unknown as { __scenePreview?: boolean }).__scenePreview;
  // The palace is daylight before the memory too: only its sun, oculus and stepping stones should glow.
  const palace = world === 'palace' && !day;
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    useGate.getState().set({ xr: presenting });
    // The composer tone-maps on flat screens; in the headset the renderer must do it itself.
    if (presenting) gl.toneMapping = THREE.NeutralToneMapping;
  }, [presenting, gl]);
  if (presenting || DIAG.get('fx') === '0') return null;
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      {/* On the white side, ambient occlusion gives porcelain its weight; bloom would wash it out. */}
      {day && quality >= 1 && DIAG.get('ao') === '1' ? <N8AO aoRadius={0.45} intensity={2.2} distanceFalloff={0.6} quality="performance" halfRes color="#4b4766" /> : <></>}
      {/* Only light itself blooms (the gate, eyes, lamps), never white porcelain: keeps the companion crisp. */}
      <Bloom mipmapBlur intensity={day ? 0.18 : palace ? 0.26 : 0.72} luminanceThreshold={day ? 0.92 : palace ? 0.95 : 0.8} luminanceSmoothing={0.2} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.28} darkness={day || stage === 'entering' ? 0.22 : palace ? 0.26 : 0.42} />
      <Noise opacity={day ? 0.018 : palace ? 0.02 : 0.028} premultiply />
    </EffectComposer>
  );
}

/** Lighter rendering for phones and the headset: fewer aurora layers, lower pixel ratio. */
function useQuality(): number {
  const [q] = useState(() => {
    const forced = Number(new URLSearchParams(location.search).get('q'));
    if (forced > 0 && forced <= 1) return forced;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const quest = /OculusBrowser|Quest/i.test(navigator.userAgent);
    return quest ? 0.15 : coarse ? 0.45 : 1;
  });
  return q;
}

export function SceneCanvas() {
  const quality = useQuality();
  return (
    <Canvas
      className="scene"
      dpr={quality < 1 ? [1, 1.5] : [1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: false }}
      camera={{ fov: 50, near: 0.05, far: 200, position: [0, 1.55, 0] }}
      shadows={quality >= 0.45 && DIAG.get('shadows') !== '0' ? 'soft' : false}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.setClearColor('#04050c');
        scene.background = null;
      }}
    >
      <XR store={xrStore}>
        <World quality={quality} />
        <Effects quality={quality} />
      </XR>
    </Canvas>
  );
}
