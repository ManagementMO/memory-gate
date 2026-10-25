import type * as THREE from 'three';

export type BuiltShowcase = {
  group: THREE.Group;
  hdr: THREE.Texture | null;
  envMap: THREE.Texture | null;
  background: THREE.Texture | THREE.Color | null;
  fog: THREE.Fog | THREE.FogExp2 | null;
  exposure: number;
  envIntensity: number;
  backgroundIntensity: number;
  backgroundBlur: number;
  rotation: number;
  uniforms: { value: number }[];
  /** Things held aside until someone names them, by their index in the scene's items. */
  held: { index: number; it: unknown }[];
  place: (it: unknown) => Promise<THREE.Object3D | null>;
};

export function buildShowcase(o: {
  spec: unknown;
  script?: (api: unknown) => Promise<void>;
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  grass?: number;
}): Promise<BuiltShowcase>;
