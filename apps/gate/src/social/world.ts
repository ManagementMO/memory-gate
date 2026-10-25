// The team's prepared worlds. When a memory is shown inside one (a cached World Labs world from main), the two
// perspectives stand at that world's checked viewpoints instead of the sketch room's: a generated world only looks
// right from places someone has inspected (including the view back), so nobody is ever put inside a tree.
// The Red Kite meadow reuses Mohammed's verified anchors (apps/gate/src/red-kite/viewpoints.ts, read only), matched
// to his story (packages/shared/src/redKite.ts, docs/red-kite/SCENE_DIRECTION.md): the open path is where the kite
// flies and the spool rests ("Can I try?" — the younger relative lifts it there), so the grandchild stands on the
// path with the kite; beside the oak is the watcher's view across the clearing ("From under the oak, I could see the
// ribbon"), so the grandparent watches from there.
import { VIEWPOINTS } from '../red-kite/viewpoints';
import { useGate } from '../state/store';
import { useSocial, type PerspectiveKey } from './store';

/** fixtures/worlds/red-kite.json `worldId` (the cached meadow; tests/smoke/social.test.ts keeps them in step). */
export const MEADOW_WORLD_ID = '0b84554c-b182-4b3e-a7bb-78f15822a49d';

type Feet = { x: number; z: number };
const at = (feet: readonly [number, number, number]): Feet => ({ x: feet[0], z: feet[2] });
/** fixtures/worlds/courtyard.json `worldId` (the cached courtyard, packages/shared/src/places.ts). */
export const COURTYARD_WORLD_ID = '22679f51-8b8b-4f1c-85dc-6df65b1c5da8';

export const WORLD_VIEWPOINTS: Record<string, Record<PerspectiveKey, Feet>> = {
  [MEADOW_WORLD_ID]: { child: at(VIEWPOINTS.elena.feet), grandparent: at(VIEWPOINTS.rosa.feet) },
  // The courtyard's world camera faces a corner; it opens down the length of the pergola. The grandparent stands near
  // that camera looking down the courtyard, the grandchild at its far end, the table under the vines between them.
  [COURTYARD_WORLD_ID]: { grandparent: { x: 0.15, z: 0.6 }, child: { x: 0.3, z: 4.7 } },
};

export const inMeadow = () => useSocial.getState().worldId === MEADOW_WORLD_ID && !!useGate.getState().photoWorld;

// With ?cast=meadow the meadow is the grandmother's childhood: inside it the two perspectives are her as a girl and her
// friend (store.ts). Otherwise (the demo) the meadow is visited by the family as they are now, the grandmother and the
// grandchild, as everywhere else. At the gate they are always the family, even while the meadow is being prepared.
export const MEADOW_CHILDHOOD = new URLSearchParams(location.search).get('cast') === 'meadow';
const inside = () => ['forming', 'memory', 'leaving'].includes(useGate.getState().stage);
const syncCast = () => useSocial.getState().setCast(MEADOW_CHILDHOOD && inMeadow() && inside() ? 'meadow' : 'family');
useSocial.subscribe((s, before) => { if (s.worldId !== before.worldId) syncCast(); });
useGate.subscribe((s, before) => { if (s.photoWorld !== before.photoWorld || s.stage !== before.stage) syncCast(); });

/** The checked viewpoints of the world this memory is shown in (world space), or null in the sketch room. */
export function worldViewpoints(): Record<PerspectiveKey, Feet> | null {
  const id = useSocial.getState().worldId;
  if (!id || !useGate.getState().photoWorld) return null;
  return WORLD_VIEWPOINTS[id] ?? null;
}
