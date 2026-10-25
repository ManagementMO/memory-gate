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
export type MotionState = { time: number; breeze: number; kiteLift: number; kiteLiftVelocity: number; held: Point3 | null; spool: Point3; spoolVelocity: Point3; grabs: number; lifts: number };
export const initialMotion = (): MotionState => ({ time: 0, breeze: 0, kiteLift: 0, kiteLiftVelocity: 0, held: null, spool: [...SPOOL_DOCK], spoolVelocity: [0, 0, 0], grabs: 0, lifts: 0 });
export function clampSpool(p: Point3): Point3 {
  return [Math.max(-.92, Math.min(-.18, p[0])), Math.max(SPOOL_DOCK[1], Math.min(1.23, p[1])), Math.max(-1.05, Math.min(-.35, p[2]))];
}
export function releaseSpool(s: MotionState): MotionState { return { ...s, held: null, spool: [...SPOOL_DOCK], spoolVelocity: [0, 0, 0], kiteLiftVelocity: 0 }; }
/** Exact critically damped spring for a constant target: stable at both headset and desktop rates. */
function spring(position: number, velocity: number, target: number, frequency: number, dt: number): [number, number] {
  const offset = position - target, c = velocity + frequency * offset, decay = Math.exp(-frequency * dt);
  return [target + (offset + c * dt) * decay, (velocity - frequency * c * dt) * decay];
}
export function stepMotion(s: MotionState, dt: number, paused: boolean, reduced = false): MotionState {
  if (paused) return releaseSpool(s);
  const d = Number.isFinite(dt) ? Math.min(.05, Math.max(0, dt)) : 0;
  const steps = Math.max(1, Math.ceil(d * 120)), h = d / steps, goal = s.held ? clampSpool(s.held) : SPOOL_DOCK;
  const spool = [...s.spool] as Point3, spoolVelocity = [...s.spoolVelocity] as Point3;
  let kiteLift = s.kiteLift, kiteLiftVelocity = s.kiteLiftVelocity, breeze = s.breeze;
  for (let k = 0; k < steps; k++) {
    for (let i = 0; i < 3; i++) [spool[i], spoolVelocity[i]] = spring(spool[i]!, spoolVelocity[i]!, goal[i]!, 14, h);
    // The spool's bottom rests on the support; it is tethered, never a freely thrown object.
    if (spool[1] < SPOOL_DOCK[1]) { spool[1] = SPOOL_DOCK[1]; spoolVelocity[1] = 0; }
    const lift = Math.max(0, Math.min(1, (spool[1] - SPOOL_DOCK[1]) / .35));
    const target = (breeze * .42 + lift * .28) * (reduced ? .35 : 1);
    [kiteLift, kiteLiftVelocity] = spring(kiteLift, kiteLiftVelocity, target, 7, h);
    breeze = Math.max(0, breeze - h * .1);
  }
  return { ...s, time: s.time + (reduced ? 0 : d), breeze, spool, spoolVelocity, kiteLift, kiteLiftVelocity };
}
