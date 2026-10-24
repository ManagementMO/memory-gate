// ?preview=figure: the Figure companion alone, cycling through every mood (for visual review and tests).
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { FigureCompanion } from '../companion/figure/FigureCompanion';
import { useGate, type Mood } from '../state/store';

export default function FigurePreview() {
  const p = new URLSearchParams(location.search);
  const bg = p.get('bg') === 'white' ? '#eef0f6' : '#05060d';
  useEffect(() => {
    const fixed = p.get('mood') as Mood | null;
    if (fixed) { useGate.getState().set({ mood: fixed, level: fixed === 'speaking' || fixed === 'listening' ? 0.55 : 0 }); return; }
    const moods: Mood[] = ['idle', 'listening', 'thinking', 'speaking'];
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % moods.length; useGate.getState().set({ mood: moods[i]!, level: 0.5 }); }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }}>
      <Canvas camera={{ position: [0, 0.05, 1.25], fov: 40 }} gl={{ toneMapping: THREE.NeutralToneMapping }}>
        <color attach="background" args={[bg]} />
        <hemisphereLight args={['#f4f2ff', '#cfd2e0', 0.8]} />
        <directionalLight position={[-2, 3, 2]} intensity={1.2} />
        <FigureCompanion visible onLight={p.get('bg') === 'white' ? 1 : 0} />
      </Canvas>
    </div>
  );
}
