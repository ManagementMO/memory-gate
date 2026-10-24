// The light of a remembered time. Once a memory forms, the white space takes on its hour: warm gold for an
// afternoon, rose and lavender at dusk, a deep blue night with lamplight. The white never fully goes away, so it
// still feels like the same dream; strength ramps in as the place forms.
import * as THREE from 'three';
import { create } from 'zustand';
import type { TimeOfDay, Weather } from '../../../../../packages/shared/src/scene';

export type Atmosphere = {
  zenith: string; horizon: string; ground: string;
  sun: string; sunIntensity: number; sunDir: [number, number, number];
  sky: string; groundLight: string; hemi: number;
  /** how much the memory's hour replaces the porcelain white (0..1) */
  amount: number;
};

export const ATMOSPHERES: Record<TimeOfDay, Atmosphere> = {
  morning: { zenith: '#bcd2ea', horizon: '#f3e8d8', ground: '#e2e4e8', sun: '#fff1da', sunIntensity: 1.25, sunDir: [-4, 5, 3], sky: '#eef4ff', groundLight: '#e9e3d6', hemi: 0.55, amount: 0.7 },
  midday: { zenith: '#b3cde8', horizon: '#eef2f6', ground: '#e4e6e9', sun: '#ffffff', sunIntensity: 1.35, sunDir: [-1.5, 8, 2], sky: '#f2f6ff', groundLight: '#e4e4e0', hemi: 0.6, amount: 0.6 },
  golden: { zenith: '#cdc8e2', horizon: '#f5e1c9', ground: '#e8e2da', sun: '#ffe0b8', sunIntensity: 1.35, sunDir: [-5, 3.4, 2], sky: '#fbf1e6', groundLight: '#e3dbd0', hemi: 0.52, amount: 0.62 },
  dusk: { zenith: '#8f93cc', horizon: '#eab5ba', ground: '#ddd5df', sun: '#ffb9a8', sunIntensity: 1.0, sunDir: [-6, 1.8, 1], sky: '#e6dcf3', groundLight: '#d9cfe0', hemi: 0.5, amount: 0.85 },
  night: { zenith: '#1d2450', horizon: '#4d5a92', ground: '#2c3258', sun: '#aab8ff', sunIntensity: 0.55, sunDir: [3, 6, 2], sky: '#7d8cd0', groundLight: '#2a2f52', hemi: 0.45, amount: 0.9 },
};

export const WEATHER_TINT: Record<Weather, number> = { clear: 0, soft: 0.15, rain: 0.35, snow: 0.25, mist: 0.45 };

type AtmoState = { target: Atmosphere | null; mist: number; snowSky: boolean; set: (time: TimeOfDay | null, weather?: Weather) => void };

export const useAtmosphere = create<AtmoState>((set) => ({
  target: null,
  mist: 0,
  snowSky: false,
  set: (time, weather = 'clear') => set({ target: time ? ATMOSPHERES[time] : null, mist: WEATHER_TINT[weather], snowSky: weather === 'snow' }),
}));

/** Live, eased values the shaders and lights read every frame (no React renders). */
export const atmoLive = {
  amount: 0,
  zenith: new THREE.Color('#dcdeea'), horizon: new THREE.Color('#fbfbfc'), ground: new THREE.Color('#eeeff3'),
  sun: new THREE.Color('#fff6ea'), sunIntensity: 1.15, sky: new THREE.Color('#f4f2ff'), groundLight: new THREE.Color('#cfd2e0'), hemi: 0.65,
  sunDir: new THREE.Vector3(-3, 6, 3),
};

const _c = new THREE.Color();
const NEUTRAL: Atmosphere = { zenith: '#dcdeea', horizon: '#fbfbfc', ground: '#eeeff3', sun: '#fff6ea', sunIntensity: 1.15, sunDir: [-3, 6, 3], sky: '#f4f2ff', groundLight: '#cfd2e0', hemi: 0.65, amount: 0 };

/** Ease the live atmosphere toward the target (or back to neutral white). Call once per frame. */
export function stepAtmosphere(dt: number, active: boolean): void {
  const t = active ? useAtmosphere.getState().target ?? NEUTRAL : NEUTRAL;
  const k = 1 - Math.exp(-dt * 0.55);
  atmoLive.amount += ((active ? t.amount : 0) - atmoLive.amount) * k;
  atmoLive.zenith.lerp(_c.set(t.zenith), k);
  atmoLive.horizon.lerp(_c.set(t.horizon), k);
  atmoLive.ground.lerp(_c.set(t.ground), k);
  atmoLive.sun.lerp(_c.set(t.sun), k);
  atmoLive.sky.lerp(_c.set(t.sky), k);
  atmoLive.groundLight.lerp(_c.set(t.groundLight), k);
  atmoLive.sunIntensity += (t.sunIntensity - atmoLive.sunIntensity) * k;
  atmoLive.hemi += (t.hemi - atmoLive.hemi) * k;
  atmoLive.sunDir.lerp(new THREE.Vector3(...t.sunDir), k);
}
