import type { Perspective } from '../../../../packages/shared/src/redKite';
import type { Point3 } from './viewpoints';

export type Transition = { current: Perspective; target: Perspective; phase: 'idle' | 'out' | 'covered' | 'in'; opacity: number };
export const initialTransition = (current: Perspective): Transition => ({ current, target: current, phase: 'idle', opacity: 0 });
export const cancelSwitch = (t: Transition): Transition => initialTransition(t.current);
export function beginSwitch(t: Transition, target: Perspective, paused: boolean): Transition {
  if (paused || (t.phase === 'idle' && target === t.current)) return t;
  return { ...t, target, phase: 'out' };
}
export function stepTransition(t: Transition, dt: number, paused: boolean): Transition {
  if (paused || t.phase === 'idle') return t;
  const d = Math.min(.1, Math.max(0, dt));
  if (t.phase === 'out') {
    const opacity = Math.min(1, t.opacity + d / .36);
    return opacity === 1 ? { ...t, current: t.target, phase: 'covered', opacity } : { ...t, opacity };
  }
  // A fully opaque frame is rendered at the new origin before the first fade-in frame.
  if (t.phase === 'covered') return { ...t, phase: 'in', opacity: 1 };
  const opacity = Math.max(0, t.opacity - d / .55);
  return { ...t, opacity, phase: opacity === 0 ? 'idle' : 'in' };
}

export const SPOOL_DOCK: Point3 = [-.55, .825, -.7];
export type MotionState = { time: number; breeze: number; held: Point3 | null; spool: Point3; grabs: number; lifts: number };
export const initialMotion = (): MotionState => ({ time: 0, breeze: 0, held: null, spool: [...SPOOL_DOCK], grabs: 0, lifts: 0 });
export function clampSpool(p: Point3): Point3 {
  return [Math.max(-.92, Math.min(-.18, p[0])), Math.max(.81, Math.min(1.23, p[1])), Math.max(-1.05, Math.min(-.35, p[2]))];
}
export function releaseSpool(s: MotionState): MotionState { return { ...s, held: null, spool: [...SPOOL_DOCK] }; }
export function stepMotion(s: MotionState, dt: number, paused: boolean): MotionState {
  if (paused) return releaseSpool(s);
  const d = Math.min(.05, Math.max(0, dt)), gain = 1 - Math.exp(-d * 7);
  const goal = s.held ?? SPOOL_DOCK;
  return { ...s, time: s.time + d, breeze: Math.max(0, s.breeze - d * .1),
    spool: s.spool.map((x, i) => x + (goal[i]! - x) * gain) as Point3 };
}
