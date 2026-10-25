// The team's prepared worlds. When a memory is shown inside one (a cached World Labs world from main), the two
// perspectives stand at that world's checked viewpoints instead of the sketch room's: a generated world only looks
// right from places someone has inspected (including the view back), so nobody is ever put inside a tree.
// The Red Kite meadow reuses Mohammed's verified anchors (apps/gate/src/red-kite/viewpoints.ts, read only): the
// grandparent on the path (the world's own camera position), the grandchild beside the oak, across the clearing.
import { VIEWPOINTS } from '../red-kite/viewpoints';
import { useGate } from '../state/store';
import { useSocial, type PerspectiveKey } from './store';

/** fixtures/worlds/red-kite.json `worldId` (the cached meadow; tests/smoke/social.test.ts keeps them in step). */
export const MEADOW_WORLD_ID = '0b84554c-b182-4b3e-a7bb-78f15822a49d';

type Feet = { x: number; z: number };
const at = (feet: readonly [number, number, number]): Feet => ({ x: feet[0], z: feet[2] });
export const WORLD_VIEWPOINTS: Record<string, Record<PerspectiveKey, Feet>> = {
  [MEADOW_WORLD_ID]: { grandparent: at(VIEWPOINTS.elena.feet), child: at(VIEWPOINTS.rosa.feet) },
};

/** The checked viewpoints of the world this memory is shown in (world space), or null in the sketch room. */
export function worldViewpoints(): Record<PerspectiveKey, Feet> | null {
  const id = useSocial.getState().worldId;
  if (!id || !useGate.getState().photoWorld) return null;
  return WORLD_VIEWPOINTS[id] ?? null;
}
