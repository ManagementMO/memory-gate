import type { InfoTarget } from './state';

/** Authored annotations for existing scenery, independent of the memory planner and its objects.
 * Add another checked world's hints here; never reuse these coordinates for an arbitrary generated world. */
export const SCENE_DISCOVERY_HINTS: readonly { worldId: string; targets: readonly InfoTarget[] }[] = [{
  // fixtures/worlds/red-kite.json; verified against the same world id as social/world.ts.
  worldId: '0b84554c-b182-4b3e-a7bb-78f15822a49d',
  targets: [
    { id: 'meadow:flowers', label: 'Flowers by the path', topic: 'flowers', node: '', lift: 0, anchor: [1.65, .42, -1.8] },
    { id: 'meadow:oak', label: 'The old oak', topic: 'oak', node: '', lift: 0, anchor: [-1.7, 1.5, -3.4] },
    // The path and the hill beyond, where packages/shared/src/places.ts puts the meadow's landmarks.
    { id: 'meadow:path', label: 'The path', topic: 'path', node: '', lift: 0, anchor: [0.75, .3, -2.8] },
    { id: 'meadow:hills', label: 'The golden hills', topic: 'hills', node: '', lift: 0, anchor: [0.4, 1.1, -5.5] },
  ],
}];
