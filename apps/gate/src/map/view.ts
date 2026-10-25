// The zoomed map's view: a centre (in map units, the land's own frame) and a zoom, where 1 is the whole world fitted
// to the screen. Pure arithmetic, shared by the gestures (ZoomMap.tsx) and the tests.
import { MAP } from './land';

export type View = { cx: number; cy: number; k: number };
export type Size = { w: number; h: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;
export const WORLD: View = { cx: MAP.width / 2, cy: MAP.height / 2, k: 1 };

/** Map units per screen pixel. */
export const unitsPerPx = (v: View, s: Size) => Math.max(MAP.width / s.w, MAP.height / s.h) / v.k;

/** Within the zoom limits, and never panned past the edge of the world (centred while it all fits). */
export function clampView(v: View, s: Size): View {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k));
  const u = unitsPerPx({ ...v, k }, s);
  const halfW = (s.w * u) / 2, halfH = (s.h * u) / 2;
  const cx = halfW * 2 >= MAP.width ? MAP.width / 2 : Math.min(MAP.width - halfW, Math.max(halfW, v.cx));
  const cy = halfH * 2 >= MAP.height ? MAP.height / 2 : Math.min(MAP.height - halfH, Math.max(halfH, v.cy));
  return { cx, cy, k };
}

/** The SVG viewBox for a view on a screen of this size. */
export function viewBox(v: View, s: Size): { x: number; y: number; w: number; h: number } {
  const u = unitsPerPx(v, s);
  return { x: v.cx - (s.w * u) / 2, y: v.cy - (s.h * u) / 2, w: s.w * u, h: s.h * u };
}

export function toScreen(v: View, s: Size, m: Point): Point {
  const u = unitsPerPx(v, s), b = viewBox(v, s);
  return { x: (m.x - b.x) / u, y: (m.y - b.y) / u };
}

export function toUnits(v: View, s: Size, p: Point): Point {
  const u = unitsPerPx(v, s), b = viewBox(v, s);
  return { x: b.x + p.x * u, y: b.y + p.y * u };
}

/** Zoom to k, keeping the map under the screen point p where it is (as far as the world's edges allow). */
export function zoomAt(v: View, s: Size, k: number, p: Point): View {
  const m = toUnits(v, s, p);
  const kk = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
  const u = unitsPerPx({ ...v, k: kk }, s);
  return clampView({ cx: m.x - p.x * u + (s.w * u) / 2, cy: m.y - p.y * u + (s.h * u) / 2, k: kk }, s);
}

/** Move the map with a drag of (dx, dy) screen pixels. */
export function panBy(v: View, s: Size, dx: number, dy: number): View {
  const u = unitsPerPx(v, s);
  return clampView({ ...v, cx: v.cx - dx * u, cy: v.cy - dy * u }, s);
}
