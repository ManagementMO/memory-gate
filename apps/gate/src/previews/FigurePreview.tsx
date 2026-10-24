// ?preview=figure: the Figure companion alone, for visual review and tests.
//   &mood=idle|listening|thinking|speaking   (omit to cycle every 3 s)
//   &expression=neutral|happy|curious|gentle|sleepy   &stage=portal (dormant)   &bg=white   &grid=1 (all expressions)
import { Environment } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FigureCompanion } from '../companion/figure/FigureCompanion';
import { useGate, type Expression, type Mood, type Stage } from '../state/store';

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

/** A voice-like level so speaking/listening previews move the way they do in the experience. */
function FakeVoice({ on }: { on: boolean }) {
  useFrame((st) => {
    if (!on) return;
    const t = st.clock.elapsedTime;
    useGate.getState().set({ level: Math.max(0, 0.35 + 0.3 * Math.sin(t * 6.3) * Math.sin(t * 1.7) + 0.15 * Math.sin(t * 11.1)) });
  });
  return null;
}

function SoftShadow({ y, white }: { y: number; white: boolean }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]}>
      <planeGeometry args={[0.5, 0.5]} />
      <meshBasicMaterial map={tex} color={white ? '#57527a' : '#000000'} transparent opacity={white ? 0.28 : 0.5} depthWrite={false} />
    </mesh>
  );
}

const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'curious', 'gentle', 'sleepy'];
const MOODS: Mood[] = ['idle', 'listening', 'thinking', 'speaking'];

export default function FigurePreview() {
  const p = new URLSearchParams(location.search);
  const white = p.get('bg') === 'white';
  const bg = white ? '#eef0f6' : '#05060d';
  const grid = p.get('grid') === '1';
  const fixedMood = p.get('mood') as Mood | null;
  const expression = (p.get('expression') as Expression | null) ?? 'neutral';
  const stage = (p.get('stage') as Stage | null) ?? 'gathering';
  useEffect(() => {
    useGate.getState().set({ stage, expression, mood: fixedMood ?? 'idle', level: 0 });
    if (fixedMood) return;
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % MOODS.length; useGate.getState().set({ mood: MOODS[i]! }); }, 3000);
    return () => clearInterval(t);
  }, []);
  const voice = !fixedMood || fixedMood === 'speaking' || fixedMood === 'listening';
  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }}>
      <Canvas camera={{ position: grid ? [0, 0.04, 2.1] : [0, 0.03, 1.15], fov: grid ? 42 : 38 }} gl={{ toneMapping: THREE.NeutralToneMapping, antialias: true }}>
        <color attach="background" args={[bg]} />
        <StudioEnvironment />
        <hemisphereLight args={['#f4f2ff', '#cfd2e0', 0.65]} />
        <directionalLight position={[-3, 6, 3]} intensity={1.15} color="#fff6ea" />
        <FakeVoice on={voice} />
        {grid ? (
          <>
            {EXPRESSIONS.map((e, i) => (
              <group key={e} position={[(i - 2) * 0.34, 0.09, 0]}>
                <FigureCompanion visible onLight={white ? 1 : 0} debug={{ expression: e, mood: fixedMood ?? 'idle', stage }} />
                <SoftShadow y={-0.33} white={white} />
              </group>
            ))}
          </>
        ) : (
          <group>
            <FigureCompanion visible onLight={white ? 1 : 0} />
            <SoftShadow y={-0.33} white={white} />
          </group>
        )}
      </Canvas>
    </div>
  );
}
