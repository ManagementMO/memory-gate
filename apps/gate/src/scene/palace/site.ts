// The grounds round the palace, laid out as on the map of San Francisco's Marina. The rotunda stands on the west
// edge of the lagoon with the colonnades embracing it and the long exhibition hall curving behind them; the lagoon
// is ringed by a promenade, lawns and a walking path, with willows by the water, eucalyptus and Monterey cypress on
// the lawns. Behind you (east) the park runs out to Baker Street's pastel houses; to the north lie Marina Boulevard,
// the yacht harbour and the bay, with the Golden Gate across the water; to the south the streets climb toward the
// Presidio's wooded hills.
// Same frame as plan.ts (metres, Y up). You face the rotunda, west (-Z): north is +X (your right), east +Z (behind).
// The palace itself is drawn a little over half size (plan.ts S); the grounds keep it company at the same scale for
// distances, while things you could touch (benches, lamps, trees, houses) keep their real size.
import * as THREE from 'three';
import { COL, LAGOON, ROT, SHORE, lagoonPoint, sc } from './plan';

/** The colonnade's arc centre (as in geometry.ts). The hall and the paved crescent are drawn round it too. */
export const ARC = new THREE.Vector2(ROT.x, ROT.z + sc(COL.radius));

export const SITE = {
  /** Nothing stands further than this from the shore: the camera's far plane is 200 m and the album view stands ~14 m off. */
  reach: 176,
  /** The paved promenade round the basin reaches this far past its edge (the basin's superellipse, grown). */
  promenade: 4.5,
  /** The landing behind you at the head of the lagoon: a paved half-round where the stepping stones begin. */
  landing: { x: 0, z: 42.2, r: 8.5 },
  /** The paved crescent under the colonnades and round the rotunda, out under the hall (radii from ARC, half-angle). */
  crescent: { r0: 31, r1: 56.5, span: 1.1 },
  /** The exhibition hall (a 41 m deep stucco crescent behind the colonnades, here at palace scale): radii, half-angle,
   *  wall and ridge heights. Its top stays hidden behind the colonnade's entablature as seen from the shore. */
  hall: { r0: 55, r1: 73.5, span: 0.95, wall: 10.3, ridge: 11.7 },
  /** The walking path that rings the lagoon: superellipse grow at its centre line, and its width. */
  ring: { grow: 13.5, width: 3.2 },
  /** Baker Street (east, along x), Marina Boulevard (north, along z) and the street on the park's south edge. */
  baker: { z: 92, half: 5.5 },
  marina: { x: 100, half: 7 },
  south: { x: -90, half: 5.5, from: -14 },
  /** Sidewalk width. */
  walk: 3,
  /** The sea wall on the bay side of Marina Boulevard; the water lies beyond, a little below the park. */
  seawall: 110,
  bayY: -1.2,
};

/** Distance and bearing from where you stand (0 ahead toward the rotunda, + to the right/north). */
export function fromShore(x: number, z: number): { r: number; az: number } {
  return { r: Math.hypot(x, z - SHORE.z), az: Math.atan2(x, SHORE.z - z) };
}

/** A small seeded generator, so the grounds are the same on every device and every visit. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The near edge of the southern hills: the Presidio's wooded slopes rise close behind the hall's south end, and
 *  further east the ground climbs beyond the houses of the street along the park's south edge. x as a function of z. */
const HILL_EDGE: [number, number][] = [[-130, -50], [-95, -60], [-60, -72], [-34, -86], [-22, -104], [-12, -114], [240, -114]];
export function hillEdge(z: number): number {
  for (let i = 0; i < HILL_EDGE.length - 1; i++) {
    const [z0, x0] = HILL_EDGE[i]!, [z1, x1] = HILL_EDGE[i + 1]!;
    if (z <= z1) return THREE.MathUtils.lerp(x0, x1, THREE.MathUtils.clamp((z - z0) / (z1 - z0), 0, 1));
  }
  return HILL_EDGE[HILL_EDGE.length - 1]![1];
}
/** Where the reach circle closes the hills off, x as a function of z (NaN where it no longer reaches them). */
export function hillFar(z: number): number {
  const dz = z - SHORE.z;
  return -Math.sqrt(Math.max(0, SITE.reach * SITE.reach - dz * dz));
}

/** How the hills rise: depth `d` metres in from their edge (of `span` available), at `z`. The Presidio (south-west)
 *  is wooded and gentler where it shows past the colonnade; the city to the south and south-east climbs higher. */
export function hillHeight(z: number, d: number, span: number): number {
  const t = THREE.MathUtils.clamp(d / Math.max(span, 1), 0, 1);
  const presidio = THREE.MathUtils.smoothstep(z, 10, -40); // 1 in the south-west
  const top = THREE.MathUtils.lerp(23 + 5 * THREE.MathUtils.smoothstep(z, 40, 150), 15, presidio);
  const rise = Math.pow(THREE.MathUtils.smoothstep(t, 0, 1), 1.25);
  const undulate = Math.sin(z * 0.045 + 1.3) * 2.2 + Math.sin(z * 0.11 + d * 0.05) * 1.1;
  return Math.max(0, rise * (top + undulate * t));
}

export type Spot = { x: number; z: number; s: number; yaw: number; tint: number };

function spots(list: [number, number, number][], seed: number): Spot[] {
  const r = seeded(seed);
  return list.map(([x, z, s]) => ({ x, z, s: s * (0.92 + r() * 0.16), yaw: r() * Math.PI * 2, tint: r() }));
}

/** Trees by kind. Kept out of two sight lines: the view across the lagoon (the approved front view) and, to the
 *  north, the open lawn between the colonnade's end and the houses, where the bay and the Golden Gate show. */
export function treeSpots() {
  const willow = spots([[27.5, 21.5, 1.0], [-27.5, 21, 1.05], [-24.8, 37.5, 0.95]], 11);
  const cypress = spots([
    // Behind you on the east lawn, and out on the south lawn.
    [-22, 66, 1.0], [25, 73, 0.92], [-56, 52, 1.08], [60, 73, 1.0], [-41, 37, 0.95], [-72, 30, 1.05], [-30, 74, 0.85],
  ], 12);
  const eucalyptus = spots([
    // East lawn clusters, framing the path to Baker Street.
    [-38, 77, 1.0], [-44, 71, 0.9], [-33, 82, 0.85], [11, 79, 1.0], [16, 75, 0.88], [43, 79, 0.95], [48, 74, 1.05],
    // North-east, beyond the open view over the bay (kept clear from the colonnade's end round to about 118 degrees);
    // and one behind the willow at the colonnade's north end.
    [46, 81, 1.0], [56, 79, 0.9], [40, 72, 1.0], [64, 0, 1.1],
    // The south lawn.
    [-48, 18, 1.05], [-55, 26, 0.95], [-62, 12, 1.1], [-46, 52, 0.9], [-66, 72, 1.0], [-71, 41, 0.92], [-58, 4, 0.9],
  ], 13);
  // Street trees: along the park's side of Baker Street, in front of the houses, and along the south street.
  const street: [number, number, number][] = [];
  for (let x = -78; x <= 88; x += 11.5) if (Math.abs(x) > 9) street.push([x, SITE.baker.z - SITE.baker.half - 1.4, 0.95]);
  for (let x = -73; x <= 84; x += 17) street.push([x + 4, SITE.baker.z + SITE.baker.half + 1.6, 0.85]);
  for (let z = -6; z <= 80; z += 12) street.push([SITE.south.x + SITE.south.half + 1.5, z, 0.9]);
  const park = spots(street, 14);
  return { willow, cypress, eucalyptus, park };
}

/** Rounded shrubs banked round the rotunda's foot, dark against its pale stone: clear of the arch you walk through,
 *  and of the colonnades' first columns. */
export function shrubSpots(): Spot[] {
  const list: [number, number, number][] = [];
  [34, 47, 104, 119, 136, 152, 168].forEach((deg, i) => {
    for (const side of [-1, 1]) {
      const t = (side * deg * Math.PI) / 180;
      const r = 11.5 + (i % 3) * 0.35;
      list.push([ROT.x + Math.sin(t) * r, ROT.z + Math.cos(t) * r, 0.9 + ((i * 5 + (side > 0 ? 2 : 0)) % 4) * 0.12]);
    }
  });
  return spots(list, 16);
}

/** Lamp posts along the paths, two at the landing, and benches facing the water. */
export function propSpots() {
  const lamps: [number, number][] = [
    [-7.4, 46.4], [7.4, 46.4], // flanking the landing
    [-2.3, 64], [2.3, 64], [-2.3, 77], [2.3, 77], // along the path to Baker Street
  ];
  // Round the ring path, on its outer edge, the east half (the west half is under the colonnades).
  for (const a of [0.42, 0.98, 2.16, 2.72]) {
    const p = lagoonPoint(a, SITE.ring.grow + SITE.ring.width / 2 + 0.4);
    lamps.push([p.x, p.y]);
  }
  // Benches just beyond the ring path, each turned to face the lagoon's centre.
  const benches: { x: number; z: number; yaw: number }[] = [];
  for (const a of [0.95, 1.22, 1.92, 2.19, 0.58, 2.56, 0.3, 2.84]) {
    const p = lagoonPoint(a, SITE.ring.grow + SITE.ring.width / 2 + 1.3);
    benches.push({ x: p.x, z: p.y, yaw: Math.atan2(p.x - LAGOON.cx, p.y - LAGOON.cz) });
  }
  // Two on the north lawn looking out over the bay.
  benches.push({ x: 82, z: 34, yaw: -Math.PI / 2 }, { x: 82, z: 22, yaw: -Math.PI / 2 });
  return { lamps, benches };
}
