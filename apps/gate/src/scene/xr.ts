// One XR store for the app. Immersive VR on Quest (the gate and the white space are whole worlds, not overlays).
// ?emulate=1 turns on IWER's emulated Quest 3 for desktop testing; it is never on by default.
import { createXRStore } from '@react-three/xr';

const emulate = new URLSearchParams(location.search).get('emulate') === '1';

export const xrStore = createXRStore({
  emulate: emulate ? { type: 'metaQuest3', ipd: .064, stereoEnabled: true, syntheticEnvironment: false } : false,
  // Controllers point and select; hands pinch. No teleport: a memory is a place to stand in, not to run through.
  controller: { teleportPointer: false },
  hand: { teleportPointer: false },
  // Only what a memory needs: the floor and hands. Room scanning (planes, the room mesh, anchors, hit tests) would
  // make the Quest ask for spatial data or a space setup before the visit can begin, and nothing here uses it.
  anchors: false,
  planeDetection: false,
  meshDetection: false,
  hitTest: false,
  domOverlay: false,
  depthSensing: false,
  offerSession: false,
  enterGrantedSession: true,
  frameRate: 'high',
  foveation: 0.4,
});
