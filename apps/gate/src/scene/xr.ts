// One XR store for the app. Immersive VR on Quest (the gate and the white space are whole worlds, not overlays).
// ?emulate=1 turns on IWER's emulated Quest 3 for desktop testing; it is never on by default.
import { createXRStore } from '@react-three/xr';

const params = new URLSearchParams(location.search);
const emulate = params.get('emulate') === '1';
// ?emulateYaw=1.2 (radians): the emulated headset starts turned and off-centre, as a real one may be when someone steps
// in (its forward is wherever it was last recentred), to check that the world turns to face them.
const startYaw = Number(params.get('emulateYaw') ?? 0) || 0;

export const xrStore = createXRStore({
  emulate: emulate ? { type: 'metaQuest3', ipd: .064, stereoEnabled: true, syntheticEnvironment: false, ...(startYaw ? { headset: { position: [0.45, 1.6, 0.35], rotation: [0, startYaw, 0] } } : {}) } : false,
  // Controllers point/select and hands pinch. Red Kite adds its own collider-based stick locomotion;
  // shared-store teleport pointers stay off so other Gate scenes keep their existing interactions.
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
