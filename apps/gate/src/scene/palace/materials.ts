// The palace's materials: warm marble with the faintest veining, fluted columns, a rose-ochre dome, gold hairlines.
// All are three's standard (PBR) materials with a few lines added: distance haze toward the low sun, the shade
// under the dome (the headset has no shadow maps), mirrored lighting for the lagoon's reflection, and one shared
// "white" that dissolves the whole palace into light as you step under the dome.
import * as THREE from 'three';
import { SIMPLEX3 } from '../shaders/noise.glsl';
import { GLOW_DIR, R, ROT, WATER_Y, sc } from './plan';

const lin = (hex: string) => new THREE.Color(hex);

/** Uniforms every palace material shares (one object, so one write per frame reaches them all). */
export const PAL = {
  uPalWhite: { value: 0 },
  uPalWhiteCol: { value: new THREE.Color(0.94, 0.945, 0.965) },
  uPalTime: { value: 0 },
  uPalHazeDen: { value: 0.0058 },
  uPalHazeCool: { value: lin('#d9d3ea') },
  uPalHazeWarm: { value: lin('#f6dcc4') },
  uPalSun: { value: GLOW_DIR.clone() },
  uPalRot: { value: ROT.clone() },
  uPalRotR: { value: sc(R.apothem) },
  uPalDrumTop: { value: sc(R.drumTop) },
  uPalWater: { value: lin('#8d97c4') },
  uPalOculus: { value: 0 },
  uPalDomeY: { value: sc(R.drumTop) },
  uPalDomeR: { value: new THREE.Vector2(sc(R.domeR), sc(R.domeH)) },
  uPalShadeFake: { value: 1 },
};

export type PalKind = { vein?: boolean; flute?: boolean; shade?: boolean; mirror?: boolean; coffer?: boolean; stone?: boolean };

const VERT_HEAD = /* glsl */ `
varying vec3 vPalW;
varying vec3 vPalL;
varying vec3 vPalT;
`;
const VERT_BODY = /* glsl */ `
{
  vec4 palW = vec4(transformed, 1.0);
  vec4 palT = vec4(-transformed.z, 0.0, transformed.x, 0.0);
  #ifdef USE_INSTANCING
    palW = instanceMatrix * palW;
    palT = instanceMatrix * palT;
  #endif
  vPalW = (modelMatrix * palW).xyz;
  vPalT = normalize((modelMatrix * palT).xyz + vec3(1e-5));
  vPalL = transformed;
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vPalW;
varying vec3 vPalL;
varying vec3 vPalT;
uniform float uPalWhite, uPalTime, uPalHazeDen, uPalRotR, uPalDrumTop, uPalOculus, uPalDomeY, uPalShadeFake;
uniform vec3 uPalWhiteCol, uPalHazeCool, uPalHazeWarm, uPalSun, uPalRot, uPalWater;
uniform vec2 uPalDomeR;
${SIMPLEX3}
// Height above the ground; the lagoon's reflection measures it on the far side of the water.
float palHeight() {
  #ifdef PAL_MIRROR
    return ${(2 * WATER_Y).toFixed(3)} - vPalW.y;
  #else
    return vPalW.y;
  #endif
}
`;

// Veining and fluting change the surface colour only a little: marble should read as calm light, not as a pattern.
const FRAG_COLOR = /* glsl */ `
#ifdef PAL_VEIN
{
  // Mostly soft clouding; the veins are a breath, long and thin, never a pattern you notice from afar.
  vec3 vp = vPalW * vec3(0.16, 0.05, 0.16);
  float w = snoise(vp + vec3(snoise(vp * 1.7), snoise(vp * 1.7 + 5.2), 0.0) * 0.8);
  float vein = (1.0 - smoothstep(0.0, 0.018, abs(w))) * smoothstep(0.2, 0.7, snoise(vPalW * 0.11) * 0.5 + 0.5);
  float cloud = snoise(vPalW * 0.07) * 0.5 + 0.5;
  diffuseColor.rgb *= 1.0 - vein * 0.025 - cloud * 0.03;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.012, 0.996, 0.972), cloud);
}
#endif
#ifdef PAL_STONE
{
  float t = snoise(vPalW * vec3(0.9, 0.0, 0.9)) * 0.5 + 0.5;
  diffuseColor.rgb *= 0.985 + t * 0.03;
}
#endif
#ifdef PAL_COFFER
{
  // Coffers in the dome's ceiling: rings of recessed squares, darker in their wells, lighter on their ribs.
  vec3 q = vPalW - vec3(uPalRot.x, uPalDomeY, uPalRot.z);
  float az = atan(q.x, q.z);
  float el = asin(clamp(q.y / uPalDomeR.y, 0.0, 1.0));
  vec2 g = vec2(az / 6.2831853 * 24.0, el / 1.5707963 * 6.0);
  vec2 f = abs(fract(g) - 0.5);
  float well = smoothstep(0.38, 0.30, max(f.x, f.y));
  float band = step(g.y, 5.2);
  diffuseColor.rgb *= mix(1.0, 0.86, well * band);
}
#endif
`;

// Fluting: tilt the normal around the shaft (24 flutes), only on the shaft between base and capital.
const FRAG_NORMAL = /* glsl */ `
#ifdef PAL_FLUTE
{
  float shaft = smoothstep(0.062, 0.07, vPalL.y) * (1.0 - smoothstep(0.85, 0.858, vPalL.y));
  float ang = atan(vPalL.z, vPalL.x);
  vec3 tv = normalize((viewMatrix * vec4(vPalT, 0.0)).xyz);
  normal = normalize(normal + tv * sin(ang * 24.0) * 0.32 * shaft);
}
#endif
#ifdef PAL_MIRROR
{
  // The reflection is the palace seen from under the water: light it with the normals it has above the water.
  vec3 palUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  normal = normal - 2.0 * palUp * dot(palUp, normal);
}
#endif
`;

const FRAG_LIGHT = /* glsl */ `
#ifdef PAL_SHADE
{
  // Under the dome the low sun can't reach. With shadow maps that is real; on the headset it is drawn here.
  float rq = length(vPalW.xz - uPalRot.xz);
  float inside = (1.0 - smoothstep(uPalRotR * 0.8, uPalRotR * 0.98, rq)) * (1.0 - smoothstep(uPalDrumTop * 0.96, uPalDrumTop * 1.02, palHeight()));
  #ifdef PAL_COFFER
    inside = 1.0; // the dome's ceiling is all inside
  #endif
  float k = 1.0 - inside * 0.82 * uPalShadeFake;
  reflectedLight.directDiffuse *= k;
  reflectedLight.directSpecular *= k;
  // The oculus pours warm light down the middle as you arrive.
  float shaft = exp(-pow(rq / (uPalRotR * 0.45), 2.0)) * inside;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.86, 0.68) * shaft * uPalOculus * 1.6;
  // Warm light bounced up from the sunlit floor and down from the oculus: the inside glows, it is never grey.
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.5, 0.4, 0.3) * inside * (0.55 + uPalOculus * 0.9);
}
#endif
reflectedLight.indirectDiffuse *= mix(0.74, 1.0, smoothstep(0.0, 1.8, palHeight()));
`;

const FRAG_END = /* glsl */ `
{
  vec3 palV = vPalW - cameraPosition;
  float palD = length(palV);
  float sunward = pow(max(dot(palV / max(palD, 1e-3), uPalSun), 0.0), 3.0);
  vec3 haze = mix(uPalHazeCool, uPalHazeWarm, 0.35 + 0.65 * sunward);
  float h = (1.0 - exp(-palD * uPalHazeDen)) * smoothstep(4.0, 16.0, palD); // the foreground stays crisp
  #ifdef PAL_COFFER
    gl_FragColor.rgb += vec3(1.0, 0.88, 0.7) * uPalOculus * 0.9 * smoothstep(uPalDomeY + uPalDomeR.y * 0.55, uPalDomeY + uPalDomeR.y, vPalW.y);
  #endif
  #ifdef PAL_MIRROR
    gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.7, uPalWater, 0.2);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, h * 0.82);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uPalWhiteCol, uPalWhite);
}
`;

function patch(material: THREE.MeshStandardMaterial, kind: PalKind): void {
  const defines: Record<string, string> = {};
  if (kind.vein) defines.PAL_VEIN = '';
  if (kind.flute) defines.PAL_FLUTE = '';
  if (kind.shade) defines.PAL_SHADE = '';
  if (kind.mirror) defines.PAL_MIRROR = '';
  if (kind.coffer) defines.PAL_COFFER = '';
  if (kind.stone) defines.PAL_STONE = '';
  material.defines = { ...(material.defines ?? {}), ...defines };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, PAL);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_LIGHT}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${FRAG_END}`);
  };
  material.customProgramCacheKey = () => `palace:${Object.keys(defines).sort().join(',')}`;
}

export function palaceMaterial(params: THREE.MeshStandardMaterialParameters, kind: PalKind, env: THREE.Texture | null): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ envMap: env, ...params });
  patch(m, kind);
  return m;
}

/** The palette: a warm white marble, a soft rose-ochre dome (the real one is ochre), and gold for hairlines. */
export function palaceMaterials(env: THREE.Texture | null, quality: number) {
  const marble = { color: '#f0e9df', roughness: 0.46, metalness: 0, envMapIntensity: 0.42 };
  // Veining costs a few noise lookups per pixel: worth it on a desktop GPU, not on a headset's (it is barely seen).
  const vein = quality >= 0.9;
  const make = (mirror: boolean) => ({
    marble: palaceMaterial(marble, { vein: vein && !mirror, shade: true, mirror }, env),
    column: palaceMaterial({ ...marble, roughness: 0.42 }, { vein: vein && !mirror, flute: true, shade: true, mirror }, env),
    relief: palaceMaterial({ color: '#ebdfcf', roughness: 0.62, metalness: 0, envMapIntensity: 0.4 }, { vein: vein && !mirror, shade: true, mirror }, env),
    dome: palaceMaterial({ color: '#e7b49c', roughness: 0.52, metalness: 0, envMapIntensity: 0.45 }, { stone: true, mirror }, env),
    gold: palaceMaterial({ color: '#d8b46a', roughness: 0.32, metalness: 1, envMapIntensity: 1.1 }, { shade: true, mirror }, env),
  });
  return {
    ...make(false),
    mirror: make(true),
    ceiling: palaceMaterial({ color: '#f1dfc9', roughness: 0.75, metalness: 0, envMapIntensity: 0.35, side: THREE.BackSide }, { coffer: true, shade: true }, env),
    terrace: palaceMaterial({ color: '#dcd5cc', roughness: 0.34, metalness: 0, envMapIntensity: 0.5 }, { vein, shade: true }, env),
  };
}
export type PalaceMaterials = ReturnType<typeof palaceMaterials>;
