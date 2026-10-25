import type { Perspective } from '../../../../packages/shared/src/redKite';
export type Point3 = [number, number, number];
export type Viewpoint = { feet: Point3; target: Point3 };
/** Nearby stationary anchors checked in the actual cached meadow, including the reverse view. Meter units. */
export const VIEWPOINTS: Record<Perspective, Viewpoint> = {
  elena: { feet: [0, 0, .25], target: [.2, 1.525, -2.2] },
  rosa: { feet: [-2, 0, -4], target: [.2, 1.95, -1.8] },
};
export function viewpointYaw(p: Viewpoint): number { return Math.atan2(p.feet[0] - p.target[0], p.feet[2] - p.target[2]); }
