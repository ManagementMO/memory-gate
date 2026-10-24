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
  uPalHazeDen: { value: 0.0075 },
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

export type PalKind = { vein?: boolean; flute?: boolean; shade?: boolean; mirror?: boolean; coffer?: boolean; dome?: boolean; relief?: boolean; pave?: boolean };

const VERT_HEAD = /* glsl */ `
varying vec3 vPalW;
varying vec3 vPalL;
varying vec3 vPalT;
uniform float uPalTime;
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
  #ifdef PAL_MIRROR
    // A slow ripple bends the reflection, more the further a point stands above the water (as real ripples do).
    float palDepth = max(0.0, ${WATER_Y.toFixed(3)} - vPalW.y);
    vPalW.x += (sin(vPalW.z * 0.55 + uPalTime * 0.8) + 0.5 * sin(vPalW.x * 0.9 - uPalTime * 1.1)) * 0.011 * palDepth;
    gl_Position = projectionMatrix * viewMatrix * vec4(vPalW, 1.0);
  #endif
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
#ifdef PAL_DOME
{
  // Deeper rose at the foot, warmer and lighter toward the crown.
  float hd = clamp((palHeight() - uPalDomeY) / uPalDomeR.y, 0.0, 1.0);
  diffuseColor.rgb *= mix(vec3(0.86, 0.84, 0.86), vec3(1.06, 1.03, 0.98), smoothstep(0.0, 0.95, hd));
}
#endif
#ifdef PAL_PAVE
{
  // Paving: large slabs with fine joints (fading out before they could shimmer in the distance).
  vec2 slab = vPalW.xz / vec2(1.8, 1.35) + vec2(0.0, floor(vPalW.x / 1.8) * 0.5);
  vec2 f = abs(fract(slab) - 0.5) * vec2(1.8, 1.35);
  vec2 fw = fwidth(slab) * vec2(1.8, 1.35);
  float joint = 1.0 - smoothstep(0.012, 0.012 + max(fw.x, fw.y) * 1.5, min(0.9 - f.x, 0.675 - f.y));
  float fade = 1.0 - smoothstep(0.05, 0.16, max(fw.x, fw.y));
  diffuseColor.rgb *= 1.0 - joint * 0.11 * fade;
  diffuseColor.rgb *= 0.985 + 0.03 * fract(sin(dot(floor(slab), vec2(12.9898, 78.233))) * 43758.5453);
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
  // Each coffer steps down in two bevels; the edge facing the oculus is lit, the one below it in shade.
  float step2 = smoothstep(0.3, 0.24, max(f.x, f.y));
  float lip = (well - step2) * sign(fract(g.y) - 0.5);
  diffuseColor.rgb *= mix(1.0, 0.86, well * band) * mix(1.0, 0.92, step2 * band) * (1.0 + lip * 0.08 * band);
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
  // Fluting: 24 concave channels with flat fillets between them.
  float fl = sin(ang * 24.0);
  normal = normalize(normal + tv * sign(fl) * pow(abs(fl), 0.6) * 0.42 * shaft);
  // The capital: two tiers of acanthus leaves round the bell, each leaf a soft ridge curling out at its tip.
  float cap = smoothstep(0.868, 0.874, vPalL.y) * (1.0 - smoothstep(0.962, 0.968, vPalL.y));
  float tier = fract((vPalL.y - 0.868) / 0.047);
  float leaf = sin(ang * 8.0 + step(0.5, fract((vPalL.y - 0.868) / 0.094)) * 0.3927);
  vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  normal = normalize(normal + (tv * leaf * 0.5 + up * (tier - 0.5) * 0.7) * cap);
}
#endif
#ifdef PAL_RELIEF
{
  // Carved relief: soft rounded forms raised from the panel, their edges catching the low sun.
  // Stretched along the panel: a low procession of rounded forms, like a frieze seen from below.
  vec3 rp = vPalW * vec3(0.75, 2.1, 0.75);
  float h0 = snoise(rp);
  vec3 g = vec3(snoise(rp + vec3(0.06, 0.0, 0.0)), snoise(rp + vec3(0.0, 0.06, 0.0)), snoise(rp + vec3(0.0, 0.0, 0.06))) - h0;
  vec3 gv = (viewMatrix * vec4(g / 0.06, 0.0)).xyz;
  gv -= normal * dot(gv, normal);
  normal = normalize(normal - gv * 0.045);
}
#endif
#ifdef PAL_DOME
{
  // Eight gently swelling gores between the gold ribs, so the ribs catch the light and the dome reads as built.
  vec3 q = vPalW - vec3(uPalRot.x, 0.0, uPalRot.z);
  float ang = atan(q.x, q.z);
  float g = fract((ang - 0.3926991) / 6.2831853 * 8.0) - 0.5;
  float hd = clamp((palHeight() - uPalDomeY) / uPalDomeR.y, 0.0, 1.0);
  vec3 tv = normalize((viewMatrix * vec4(cos(ang), 0.0, -sin(ang), 0.0)).xyz);
  normal = normalize(normal + tv * g * 0.55 * (1.0 - hd * 0.8));
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
{
  // Contact shade: where stone meets the ground, at the foot and the head of each column, and under every beam.
  float ao = mix(0.6, 1.0, smoothstep(0.0, 1.5, palHeight()));
  #ifdef PAL_FLUTE
    ao *= mix(0.62, 1.0, smoothstep(0.0, 0.14, vPalL.y)) * mix(1.0, 0.72, smoothstep(0.84, 0.99, vPalL.y));
  #endif
  vec3 palUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  ao *= 1.0 - 0.38 * smoothstep(0.25, 0.9, -dot(normal, palUpV));
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.directDiffuse *= mix(1.0, ao, 0.45);
}
`;

const FRAG_END = /* glsl */ `
{
  vec3 palV = vPalW - cameraPosition;
  float palD = length(palV);
  float sunward = pow(max(dot(palV / max(palD, 1e-3), uPalSun), 0.0), 3.0);
  vec3 haze = mix(uPalHazeCool, uPalHazeWarm, 0.35 + 0.65 * sunward);
  // Depth falloff that stays light through the middle distance (the architecture keeps its carving) and gathers far
  // away; the foreground stays crisp.
  float h = (1.0 - exp(-pow(palD * uPalHazeDen, 1.6))) * smoothstep(4.0, 16.0, palD);
  #ifdef PAL_COFFER
    gl_FragColor.rgb += vec3(1.0, 0.88, 0.7) * uPalOculus * 0.9 * smoothstep(uPalDomeY + uPalDomeR.y * 0.55, uPalDomeY + uPalDomeR.y, vPalW.y);
  #endif
  #ifdef PAL_MIRROR
    gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.7, uPalWater, 0.2);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, h * 0.86);
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
  if (kind.dome) defines.PAL_DOME = '';
  if (kind.relief) defines.PAL_RELIEF = '';
  if (kind.pave) defines.PAL_PAVE = '';
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
  const marble = { color: '#f3ebe0', roughness: 0.46, metalness: 0, envMapIntensity: 0.24 };
  // Veining costs a few noise lookups per pixel: worth it on a desktop GPU, not on a headset's (it is barely seen).
  const vein = quality >= 0.9;
  const make = (mirror: boolean) => ({
    marble: palaceMaterial(marble, { vein: vein && !mirror, shade: true, mirror }, env),
    column: palaceMaterial({ ...marble, roughness: 0.42 }, { vein: vein && !mirror, flute: true, shade: true, mirror }, env),
    relief: palaceMaterial({ color: '#ebdfcf', roughness: 0.62, metalness: 0, envMapIntensity: 0.4 }, { relief: !mirror, shade: true, mirror }, env),
    dome: palaceMaterial({ color: '#e7b49c', roughness: 0.48, metalness: 0, envMapIntensity: 0.36 }, { dome: true, mirror }, env),
    gold: palaceMaterial({ color: '#d8b46a', roughness: 0.32, metalness: 1, envMapIntensity: 1.1 }, { shade: true, mirror }, env),
  });
  return {
    ...make(false),
    mirror: make(true),
    ceiling: palaceMaterial({ color: '#f1dfc9', roughness: 0.75, metalness: 0, envMapIntensity: 0.35, side: THREE.BackSide }, { coffer: true, shade: true }, env),
    terrace: palaceMaterial({ color: '#dcd4c9', roughness: 0.36, metalness: 0, envMapIntensity: 0.38 }, { vein, shade: true, pave: true }, env),
  };
}
export type PalaceMaterials = ReturnType<typeof palaceMaterials>;
