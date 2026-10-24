// The object library: one builder per LIBRARY key (packages/shared/src/scene.ts), all in the porcelain style
// (style.ts). Builders return a THREE.Group in metres, origin on the floor at the footprint centre, front facing +Z.
// Builders apply o.scale themselves (to an inner group), so the renderer must not scale the returned group again.
import type { Builder } from '../style';
import { cat, bird, dog } from './creatures';
import { bowl_fruit, books, cake, candle, clock, cup, floor_lamp, lamp, picture_frame, potted_plant, radio, teapot, vase_flowers } from './decor';
import { armchair, bed, bookshelf, cabinet, chair, counter, door, fireplace, fridge, piano, round_table, rug, sofa, stove, table, tv, window } from './furniture';
import { bench, bicycle, boat, bush, campfire, car, dock, fence, flowers, house, lamp_post, palm_tree, picnic_blanket, pine_tree, rock, swing, tent, tree, umbrella } from './outdoor';

export const LIBRARY_BUILDERS: Partial<Record<string, Builder>> = {
  table, round_table, chair, armchair, sofa, bed, bookshelf, cabinet, rug, window, door, piano, counter, stove, fridge, fireplace, tv,
  lamp, floor_lamp, potted_plant, vase_flowers, picture_frame, clock, radio, teapot, cup, bowl_fruit, cake, books, candle,
  tree, pine_tree, palm_tree, bush, flowers, bench, fence, swing, lamp_post, umbrella, picnic_blanket, boat, dock, rock, campfire, tent, car, bicycle, house,
  cat, dog, bird,
};
