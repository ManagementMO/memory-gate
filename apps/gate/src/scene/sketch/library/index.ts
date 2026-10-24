// The object library: one builder per LIBRARY key (packages/shared/src/scene.ts), all in the porcelain style
// (style.ts). Builders return a THREE.Group in metres, origin on the floor at the footprint centre, front facing +Z.
import type { Builder } from '../style';

export const LIBRARY_BUILDERS: Partial<Record<string, Builder>> = {};
