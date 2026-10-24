// Where things live in the shared frame (meters, Y up). The viewer stands at the origin facing -Z.
// The gate's opening is far ahead, slightly above the horizon. A memory is built around MEMORY_CENTER,
// a comfortable two and a half meters in front, so a standing Quest wearer is at its edge, not inside a table.
import * as THREE from 'three';

export const EYE_HEIGHT = 1.55;
export const MEMORY_CENTER = new THREE.Vector3(0, 0, -2.6);

/** Where the companion floats in each part of the journey (flat view). XR uses a head-relative follow instead. */
export const COMPANION_SPOT = {
  portal: new THREE.Vector3(0, 1.74, -2.7),
  gathering: new THREE.Vector3(0, 1.66, -2.3),
  gatheringWithMedia: new THREE.Vector3(-0.66, 1.62, -2.3),
  entering: new THREE.Vector3(0, 1.62, -7.5),
  memory: new THREE.Vector3(-1.85, 1.3, -0.45),
  album: new THREE.Vector3(0, 1.3, -3.4),
} as const;

/** The floating photo/video card while the companion and person talk about it. */
export const MEDIA_SPOT = new THREE.Vector3(0.66, 1.66, -2.45);
