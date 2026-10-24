/** Floor positions for unpointed courtyard narration are visibly provisional layout suggestions, not AI facts. */
export type PlacementObject = { size: number; anchor: { position: number[] } };
export function storyPlacement(size: number, objects: PlacementObject[]): [number, number, number] | null {
  const radius = size * .5 + .12;
  const slots: [number, number, number][] = [[-.9,0,-2.4],[1.4,0,-3.2],[-3.4,0,-5.1],[3.4,0,-6.6],[0,0,-6.4],[-4.2,0,-7],[4.1,0,-3]];
  return slots.find(([x,,z]) => x-radius >= -5.5 && x+radius <= 5.5 && z-radius >= -8.05 && z+radius <= -1 && objects.every(o => {
    const [ox=0,,oz=0]=o.anchor.position;
    return Math.hypot(x-ox,z-oz) > (o.size+size)*.5+.18;
  })) ?? null;
}
