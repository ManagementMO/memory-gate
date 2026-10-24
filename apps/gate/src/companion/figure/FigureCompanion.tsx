// The Figure companion as a React Three Fiber node. CompanionRig positions, scales and turns it toward the viewer;
// the Figure itself aims its head and eyes, breathes, blinks and shows mood and expression (see createFigure.ts).
// `debug` (previews only) overrides the shared store so several Figures can show different states side by side.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { useGate, type Expression, type Mood, type Stage } from '../../state/store';
import { createFigure } from './createFigure';
import { createMarbleFigure } from './createMarble';

// The marble Figure is the companion; the earlier EVE-like one stays for comparison with ?figure=eve.
const EVE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('figure') === 'eve';

export type FigureDebug = Partial<{ mood: Mood; expression: Expression; stage: Stage; level: number }>;

export function FigureCompanion({ visible = true, onLight = 0, debug }: { visible?: boolean; onLight?: number; debug?: FigureDebug }) {
  const rig = useMemo(() => (EVE ? createFigure() : createMarbleFigure()), []);
  const camera = useThree((s) => s.camera);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((state, dt) => {
    const g = useGate.getState();
    rig.update(Math.min(dt, 0.05), state.clock.elapsedTime, {
      mood: debug?.mood ?? g.mood,
      expression: debug?.expression ?? g.expression,
      level: debug?.level ?? g.level,
      stage: debug?.stage ?? g.stage,
    }, { camera, fade: visible ? 1 : 0, onLight });
  });
  return <primitive object={rig.root} />;
}
