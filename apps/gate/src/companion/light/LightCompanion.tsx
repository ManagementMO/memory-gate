import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { useGate } from '../../state/store';
import { createLight } from './createLight';

/** The Light companion as a React Three Fiber node. `onLight` is 1 on the white memory space. */
export function LightCompanion({ visible = true, onLight = 0, scale = 1 }: { visible?: boolean; onLight?: number; scale?: number }) {
  const rig = useMemo(() => createLight(), []);
  const camera = useThree((s) => s.camera);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((state, dt) => {
    const s = useGate.getState();
    rig.update(Math.min(dt, 0.05), state.clock.elapsedTime, { mood: s.mood, level: s.level, expression: s.expression, onLight, camera: camera as THREE.Camera, fade: visible ? 1 : 0 });
  });
  return <primitive object={rig.root} scale={scale} />;
}
