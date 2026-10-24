// The Palace world's ground plan, in the shared frame (metres, Y up). It is the Palace of Fine Arts in San Francisco,
// drawn at a little over half size: the open octagonal rotunda under its dome, the two curving colonnades that hold
// the lagoon, and the still water in front. The dome stands over MEMORY_CENTER, so a memory forms exactly beneath
// it; you begin across the lagoon at SHORE, facing the rotunda (-Z), the same way you face the gate in the aurora.
import * as THREE from 'three';
import { MEMORY_CENTER } from '../layout';
import { clamp01, easeInOutCubic } from '../util';

/** Real palace → this world. The 49 m rotunda becomes about 23 m: grand, and still a walk you can take. */
export const S = 0.55;
export const sc = (metres: number) => metres * S;

/** The dome's centre, on the floor. */
export const ROT = new THREE.Vector3(MEMORY_CENTER.x, 0, MEMORY_CENTER.z);
/** Where you stand at the start, across the lagoon (feet). */
export const SHORE = new THREE.Vector3(0, 0, 42.4);
export const EYE = 1.55;
/** Across the lagoon the view lifts only ~4°: the whole dome fits, and the companion floats a little above centre,
 *  clear of the words at the bottom of the screen (as in the aurora gate, at the same distance and size). */
export const LOOK_Y = EYE + 0.28;
export const SPOT = {
  portal: new THREE.Vector3(0, 1.95, SHORE.z - 2.7),
  gathering: new THREE.Vector3(0, 1.88, SHORE.z - 2.3),
  gatheringWithMedia: new THREE.Vector3(-0.66, 1.86, SHORE.z - 2.3),
  media: new THREE.Vector3(0.66, 1.86, SHORE.z - 2.45),
} as const;
export const WATER_Y = -0.3;

/** The rotunda in real metres (scaled by S where used): an octagon of eight arches under a raised dome. */
export const R = {
  apothem: 14, wall: 2.6, archHalf: 3.55, spring: 9.3,
  colH: 14.2, colR: 0.72, colOut: 0.85, colSide: 4.75,
  entTop: 16.1, cornice: 16.8, drumApothem: 12.1, drumTop: 23.4,
  domeR: 11.4, domeH: 16.4, oculus: 1.6,
};
export const ROT_RADIUS = sc(R.apothem);

/** The colonnade: two arms of an arc that embraces the lagoon (centre toward you), in real metres. */
export const COL = { radius: 70, from: 0.25, to: 1.06, rows: 2.6, spacing: 5.3, height: 13, boxEvery: 3 };

/** The lagoon: a formal basin with softly rounded corners (a superellipse), on the axis between you and the dome. */
export const LAGOON = { cx: 0, cz: 23.6, hw: 21, hd: 15.4, n: 3.4 };

export function lagoonPoint(t: number, grow = 0): THREE.Vector2 {
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / LAGOON.n;
  const x = Math.sign(c) * Math.pow(Math.abs(c), e) * (LAGOON.hw + grow);
  const z = Math.sign(s) * Math.pow(Math.abs(s), e) * (LAGOON.hd + grow);
  return new THREE.Vector2(LAGOON.cx + x, LAGOON.cz + z);
}

/** A low golden-hour sun from the right: one warm flank on every column, the other in cool shade, long shadows
 *  falling to the left. The sky's own glow sits low on the right behind the colonnade, where the sun is going down. */
export const SUN_DIR = new THREE.Vector3(0.86, 0.33, 0.39).normalize();
export const GLOW_DIR = new THREE.Vector3(0.62, 0.07, -0.78).normalize();

/** The walk under the dome takes longer than the aurora's step through: it is a place you cross, not a door. */
export const PALACE_ENTER_MS = 11500;

const ARRIVE = 0.78; // the share of the walk spent moving; the rest is standing under the dome as the light gathers

/** How far along the causeway of stones you are (0 at the shore, 1 under the dome). */
const walked = (p: number) => easeInOutCubic(clamp01(p / ARRIVE));

/** Desktop and phone: where your eyes are during the walk (p = 0..1) and what you look at. Returns the field of view. */
export function walkView(p: number, eye: THREE.Vector3, look: THREE.Vector3): number {
  const w = walked(p);
  const z = THREE.MathUtils.lerp(SHORE.z, 0, w);
  eye.set(0, EYE + Math.sin(w * Math.PI) * 0.3, z);
  const up = THREE.MathUtils.smoothstep(p, 0.72, 0.97);
  // Ahead toward the arch while crossing, then (once under the dome) up into its light.
  look.set(0, THREE.MathUtils.lerp(EYE + 0.35 + w * 2.2, sc(R.drumTop + R.domeH * 0.8), up), THREE.MathUtils.lerp(z - 7, ROT.z - 0.4, up));
  return 50 + up * 12;
}

/** Where the companion floats during the walk: a few steps ahead, leading, then up into the light under the dome. */
export function walkCompanion(p: number, out: THREE.Vector3): THREE.Vector3 {
  const z = Math.max(ROT.z, THREE.MathUtils.lerp(SHORE.z, 0, walked(p)) - 3.4);
  const centre = THREE.MathUtils.smoothstep(p, 0.66, 0.9);
  const rise = THREE.MathUtils.smoothstep(p, 0.72, 0.97);
  out.set(THREE.MathUtils.lerp(0.5, 0, centre), 1.72 + rise * 1.15, THREE.MathUtils.lerp(z, ROT.z, centre));
  return out;
}

/** Behind the album: from the near shore, a little to the right, looking diagonally back across the lagoon. The
 *  lit rotunda sits high on the right (clear of the title), the far colonnade and its reflection run behind the
 *  cards, and the low sun is behind you so the brightest sky stays out of frame. A slow drift along the shore. */
export function albumView(t: number, aspect: number, eye: THREE.Vector3, look: THREE.Vector3): number {
  const drift = Math.sin(t * 0.04);
  const portrait = aspect < 0.8; // a narrow screen sees a slice: centre it on the rotunda, a little wider
  eye.set(13.5 + drift * 0.8, 2.1 + Math.sin(t * 0.06) * 0.05, SHORE.z - 1.5 + drift * 0.3);
  look.set((portrait ? -0.5 : -6.5) + Math.sin(t * 0.03) * 0.5, portrait ? 17.5 : 7.2, ROT.z + 6);
  return portrait ? 60 : 50;
}

/** The headset never glides: the world dissolves into light, you are under the dome, and it clears around you. */
export const XR_MOVE_AT = 0.34;
export function xrWhite(p: number): number {
  if (p < 0.3) return THREE.MathUtils.smoothstep(p, 0.02, 0.28);
  if (p < 0.4) return 1;
  if (p < 0.7) return 1 - THREE.MathUtils.smoothstep(p, 0.4, 0.62);
  return THREE.MathUtils.smoothstep(p, 0.8, 0.985);
}
export const flatWhite = (p: number) => THREE.MathUtils.smoothstep(p, 0.83, 0.985);
