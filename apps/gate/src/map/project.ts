// A point on the memory map, in percent of its box: the same flat frame as the land (land.ts, prepare-map.mjs).
import { MAP } from './land';

export function toMap(lat: number, lng: number): { x: number; y: number } {
  return { x: ((lng + 180) / 360) * 100, y: ((MAP.north - lat) / (MAP.north - MAP.south)) * 100 };
}

/** The same point in map units (the land's own frame), for the zoomed map. */
export function toMapUnits(lat: number, lng: number): { x: number; y: number } {
  const p = toMap(lat, lng);
  return { x: (p.x / 100) * MAP.width, y: (p.y / 100) * MAP.height };
}
