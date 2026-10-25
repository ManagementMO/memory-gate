/** Input intent. Rapier resolves this desired movement against the actual World Labs collision mesh. */
export type Navigation = { x: number; y: number; z: number; yaw: number; pitch: number; snapReady: boolean };
export const initialNavigation = (): Navigation => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, snapReady: true });
export type WalkInput = { right: number; forward: number };
const finite = (n: number) => Number.isFinite(n) ? n : 0;

export function lookAround(n: Navigation, dx: number, dy: number): Navigation {
  return { ...n, yaw: n.yaw - finite(dx) * .003, pitch: Math.max(-.85, Math.min(.75, n.pitch - finite(dy) * .0025)) };
}

export function stepNavigation(n: Navigation, input: WalkInput & { heading: number; turn: number; speed?: number }, dt: number, paused: boolean): Navigation {
  if (paused) return n;
  const d = Math.max(0, Math.min(.05, finite(dt))), r = finite(input.right), f = finite(input.forward);
  const magnitude = Math.hypot(r, f), scale = magnitude < .18 ? 0 : (input.speed ?? 1.8) * d / Math.max(1, magnitude);
  const heading = finite(input.heading);
  const x = n.x + (r * Math.cos(heading) - f * Math.sin(heading)) * scale;
  const z = n.z + (-r * Math.sin(heading) - f * Math.cos(heading)) * scale;
  const turn = finite(input.turn), snap = n.snapReady && Math.abs(turn) > .65;
  return { ...n, x, z, yaw: n.yaw - (snap ? Math.sign(turn) * Math.PI / 6 : 0), snapReady: Math.abs(turn) < .25 || (n.snapReady && !snap) };
}
