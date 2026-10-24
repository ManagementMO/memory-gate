// ?preview=light: the Light companion alone (dark or ?bg=white), cycling through moods.
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { LightCompanion } from '../companion/light/LightCompanion';
import { useGate, type Mood } from '../state/store';

export default function LightPreview() {
  const p = new URLSearchParams(location.search);
  const white = p.get('bg') === 'white';
  const bg = white ? '#eef0f6' : '#05060d';
  useEffect(() => {
    const fixed = p.get('mood') as Mood | null;
    if (fixed) { useGate.getState().set({ mood: fixed, level: 0.55 }); return; }
    const moods: Mood[] = ['idle', 'listening', 'thinking', 'speaking'];
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % moods.length; useGate.getState().set({ mood: moods[i]!, level: 0.5 }); }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }}>
      <Canvas camera={{ position: [0, 0, 1.1], fov: 40 }} gl={{ toneMapping: THREE.NeutralToneMapping }}>
        <color attach="background" args={[bg]} />
        <LightCompanion visible onLight={white ? 1 : 0} />
      </Canvas>
    </div>
  );
}
