// Original illustrative fallback, independent of any uploaded photo. Live splats and props still load from Convex.
// The editor evaluates this too: factories must remain deterministic and side-effect free.
import { defineAssets } from '@iwsdk/core';
import { makeCourtyard } from './scene-assets/courtyard.scene-asset';
import { makeProp } from './scene-assets/props.scene-asset';

export default defineAssets({
  CourtyardBackdrop: makeCourtyard(),
  Bench: makeProp('bench'), Tree: makeProp('tree'), Gate: makeProp('gate'), Photograph: makeProp('photograph'),
});
