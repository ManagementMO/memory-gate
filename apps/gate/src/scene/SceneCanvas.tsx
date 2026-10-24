// The one canvas. Flat screens get gentle bloom and grain (the gate's hairlines and the companion's light glow);
// XR renders straight to the headset (post-processing is not supported in WebXR) with the shaders' own glow.
import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { XR, useXR } from '@react-three/xr';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { World } from './World';
import { xrStore } from './xr';

function Effects() {
  const presenting = useXR((s) => s.session != null);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    useGate.getState().set({ xr: presenting });
    // The composer tone-maps on flat screens; in the headset the renderer must do it itself.
    if (presenting) gl.toneMapping = THREE.NeutralToneMapping;
  }, [presenting, gl]);
  if (presenting) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.25} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.28} darkness={0.42} />
      <Noise opacity={0.028} premultiply />
    </EffectComposer>
  );
}

/** Lighter rendering for phones and the headset: fewer aurora layers, lower pixel ratio. */
function useQuality(): number {
  const [q] = useState(() => {
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
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.setClearColor('#04050c');
        scene.background = null;
      }}
    >
      <XR store={xrStore}>
        <World quality={quality} />
        <Effects />
      </XR>
    </Canvas>
  );
}
