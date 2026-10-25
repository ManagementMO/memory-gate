// The palace's materials: warm sand-coloured stone with the faintest veining, fluted columns (the rotunda's tinted
// red like Numidian marble), a low golden-ochre dome.
// All are three's standard (PBR) materials with a few lines added: distance haze toward the low sun, the shade
// under the dome (the headset has no shadow maps), mirrored lighting for the lagoon's reflection, and one shared
// "white" that dissolves the whole palace into light as you step under the dome.
import * as THREE from 'three';
import { SIMPLEX3 } from '../shaders/noise.glsl';
import { GLOW_DIR, LAGOON, R, ROT, SUN_DIR, WATER_Y, sc } from './plan';
import { ARC, SITE } from './site';

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
  uPalSunDir: { value: SUN_DIR.clone() },
};

/** Surface kinds. The grounds round the palace add four: the site's floor (paving, lawn, paths and streets from the
 *  site map), foliage, house fronts with their windows, and the exhibition hall's long stucco wall. */
export type PalKind = {
  vein?: boolean; flute?: boolean; shade?: boolean; mirror?: boolean; coffer?: boolean; dome?: boolean; relief?: boolean; pave?: boolean;
  ground?: boolean; leaf?: boolean; still?: boolean; facade?: boolean; hall?: boolean;
};

const VERT_HEAD = /* glsl */ `
varying vec3 vPalW;
varying vec3 vPalL;
varying vec3 vPalT;
uniform float uPalTime;
#ifdef PAL_FACADE
  varying vec2 vPalUv;
#endif
`;

// Leaves stir: a slow sway that grows with height (the trunk stays put), different for every tree. Instanced trees
// take their phase from where they stand; merged ones carry their spot in uv. Far trees stay still.
const VERT_SWAY = /* glsl */ `
#if defined(PAL_LEAF) && !defined(PAL_STILL)
{
  #ifdef USE_INSTANCING
    float palSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
  #else
    float palSeed = uv.x * 0.37 + uv.y * 0.23;
  #endif
  float palLift = max(transformed.y - 1.5, 0.0);
  float palSway = sin(uPalTime * 0.55 + palSeed) + 0.45 * sin(uPalTime * 1.3 + palSeed * 1.7 + transformed.y * 0.4);
  transformed.xz += vec2(0.8, 0.45) * palSway * 0.0085 * palLift;
}
#endif
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
  #ifdef PAL_FACADE
    vPalUv = uv;
  #endif
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
#ifdef PAL_GROUND
  uniform sampler2D uPalSite;
  uniform vec4 uPalSiteBox;
#endif
#if defined(PAL_LEAF) || defined(PAL_FACADE)
  uniform vec3 uPalSunDir;
#endif
#ifdef PAL_FACADE
  varying vec2 vPalUv;
#endif
#if defined(PAL_FACADE) || defined(PAL_HALL)
  float palHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
#endif
// Height above the ground; the lagoon's reflection measures it on the far side of the water.
float palHeight() {
  #ifdef PAL_MIRROR
    return ${(2 * WATER_Y).toFixed(3)} - vPalW.y;
  #else
    return vPalW.y;
  #endif
}
`;

const f = (n: number) => n.toFixed(4);
const v3 = (hex: string) => { const c = lin(hex); return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`; };

// The site's floor. Inside the precinct (the promenade round the basin, the landing behind you, the crescent under
// the colonnades) it keeps the paving computed above; elsewhere it is the park and the city: lawn in broad sunlit
// and shaded patches, gravel paths, sidewalks and streets painted once into the site map, which also carries the soft
// shade under trees and along house fronts.
const GROUND_COLOR = /* glsl */ `
#if defined(PAL_GROUND) || defined(PAL_FACADE)
  float palPave = 1.0;
  float palRough = 0.9;
  float palGlass = 0.0;
  vec3 palGlint = vec3(0.0);
#endif
#ifdef PAL_GROUND
{
  vec2 p = vPalW.xz;
  vec2 lq = abs(p - vec2(${f(LAGOON.cx)}, ${f(LAGOON.cz)})) / vec2(${f(LAGOON.hw + SITE.promenade)}, ${f(LAGOON.hd + SITE.promenade)});
  float se = pow(pow(lq.x, ${f(LAGOON.n)}) + pow(lq.y, ${f(LAGOON.n)}), ${f(1 / LAGOON.n)});
  float sw = fwidth(se);
  float prom = 1.0 - smoothstep(1.0 - sw, 1.0 + sw, se);
  float ld = length(p - vec2(${f(SITE.landing.x)}, ${f(SITE.landing.z)}));
  float lw = fwidth(ld);
  float land = 1.0 - smoothstep(${f(SITE.landing.r)} - lw, ${f(SITE.landing.r)} + lw, ld);
  vec2 ac = p - vec2(${f(ARC.x)}, ${f(ARC.y)});
  float rr = length(ac);
  float fr = fwidth(rr);
  float th = abs(atan(ac.x, -ac.y));
  float cres = smoothstep(${f(SITE.crescent.r0)} - fr, ${f(SITE.crescent.r0)} + fr, rr) * (1.0 - smoothstep(${f(SITE.crescent.r1)} - fr, ${f(SITE.crescent.r1)} + fr, rr))
    * (1.0 - smoothstep(${f(SITE.crescent.span - 0.004)}, ${f(SITE.crescent.span + 0.004)}, th));
  palPave = max(max(prom, land), cres);
  // A kerb of lighter stone where the paving meets the lawn.
  float kerb = max(smoothstep(1.0 - 0.017 - sw, 1.0 - 0.017 + sw, se) * prom, smoothstep(${f(SITE.landing.r - 0.38)} - lw, ${f(SITE.landing.r - 0.38)} + lw, ld) * land) * (1.0 - cres);
  diffuseColor.rgb *= 1.0 + 0.07 * kerb;
  vec4 site = texture2D(uPalSite, (p - uPalSiteBox.xy) * uPalSiteBox.zw);
  float path = smoothstep(0.4, 0.6, site.r);
  float road = smoothstep(0.4, 0.6, site.g);
  float walk = smoothstep(0.4, 0.6, site.b);
  float n1 = snoise(vec3(p * 0.04, 1.7));
  float n2 = snoise(vec3(p * 0.31, 5.3));
  vec3 g = mix(${v3('#899764')}, ${v3('#a5a96c')}, smoothstep(-0.6, 0.7, n1)) * (0.95 + 0.06 * n2);
  g = mix(g, ${v3('#cbb898')} * (0.97 + 0.04 * n2), path);
  g = mix(g, ${v3('#cfc8be')}, walk);
  g = mix(g, ${v3('#7c7787')} * (0.98 + 0.03 * n2), road);
  g *= site.a;
  diffuseColor.rgb = mix(g, diffuseColor.rgb, palPave);
  palRough = mix(mix(mix(0.96, 0.88, path), 0.84, walk), 0.76, road);
}
#endif
`;

// Foliage: clumps of light and shade across each crown (the vertex colours carry the shade inside and under it).
const LEAF_COLOR = /* glsl */ `
#ifdef PAL_LEAF
{
  float n = snoise(vPalW * 0.42);
  diffuseColor.rgb *= 0.86 + 0.28 * (n * 0.5 + 0.5);
}
#endif
`;

// House fronts. uv is in metres on a front (x along it, y up) and negative on walls without windows; x also carries
// the house's upper floors (x 1000) and a seed (x 100). At street level a garage door across the first two bays and
// a door under an arch in the third; above, rows of tall windows in white trim, round-headed on some houses. The
// glass holds the cool sky, and here and there a pane catches the low sun.
const FACADE_COLOR = /* glsl */ `
#ifdef PAL_FACADE
if (vPalUv.x >= 0.0) {
  float floors = floor(vPalUv.x / 1000.0);
  float rest = vPalUv.x - floors * 1000.0;
  float seed = floor(rest / 100.0);
  float u = rest - seed * 100.0;
  float v = vPalUv.y;
  float bayN = floor(u / 2.4);
  float cx = fract(u / 2.4) - 0.5;
  float cy = (v - 2.8) / 3.0;
  float level = floor(cy);
  float qy = fract(cy) - 0.5;
  float arch = step(5.0, seed);
  // A window 1.3 m wide, 1.8 m tall, centred in its bay (round-headed on some houses).
  float rect = max(abs(cx) / 0.27, abs(qy) / 0.3);
  float arcD = length(vec2(cx / 0.27, (qy - 0.083) / 0.2167));
  float wd = mix(rect, max(arcD, abs(cx) / 0.27), arch * step(0.083, qy));
  float aw = fwidth(wd) + 0.02;
  float upper = step(0.0, cy) * step(level, floors - 1.0);
  float win = (1.0 - smoothstep(1.0 - aw, 1.0 + aw, wd)) * upper;
  float trim = clamp((1.0 - smoothstep(1.24 - aw, 1.24 + aw, wd)) * upper - win, 0.0, 1.0);
  // Street level.
  float street = step(v, 2.8) * step(0.06, v);
  float garage = street * step(abs(u - 2.4), 1.95) * step(v, 2.25);
  float door = street * step(length(vec2(u - 6.0, max(v - 1.75, 0.0))), 0.6);
  float lowWin = street * step(3.0, bayN) * (1.0 - smoothstep(1.0 - aw, 1.0 + aw, max(abs(cx) / 0.27, abs(v - 1.55) / 0.75)));
  win = max(win, lowWin);
  float h = palHash(vec2(bayN + seed * 17.0, level + 3.0));
  vec3 glass = mix(vec3(0.075, 0.08, 0.13), vec3(0.25, 0.25, 0.36), smoothstep(-0.4, 0.5, qy)) * (0.75 + 0.5 * h);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.91, 0.87), trim * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.63, 0.6) * (0.92 + 0.08 * step(0.5, fract(v * 2.6))), garage);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.11, 0.08), door);
  palGlass = win;
  palGlint = vec3(1.0, 0.7, 0.4) * win * step(0.88, h) * 0.6;
} else if (vPalUv.x < -1.5) {
  // A lamp's globe, just lit for the evening.
  palGlint = vec3(1.0, 0.8, 0.55) * 0.7;
}
#endif
`;

// The exhibition hall's long front: pilasters marking the bays, and in each bay a tall wooden door in a lattice
// (the hall's original clathrate doors) under a round arch; a plinth below and a frieze under the cornice.
const HALL_COLOR = /* glsl */ `
#ifdef PAL_HALL
{
  vec2 ac = vPalW.xz - vec2(${f(ARC.x)}, ${f(ARC.y)});
  float rr = length(ac);
  float front = 1.0 - smoothstep(0.25, 0.5, abs(rr - ${f(SITE.hall.r0)}));
  float u = atan(ac.x, -ac.y) * ${f(SITE.hall.r0)};
  float v = vPalW.y;
  float cu = fract(u / 7.8 + 0.5) - 0.5;
  float pil = smoothstep(0.42, 0.44, abs(cu));
  float dd = length(vec2(cu * 7.8, max(v - 3.9, 0.0))) / 1.35;
  float door = (1.0 - smoothstep(0.97, 1.0, dd)) * step(0.25, v) * front;
  vec2 lp = vec2(u, v) * 2.4;
  float lat = min(abs(fract(lp.x + lp.y) - 0.5), abs(fract(lp.x - lp.y) - 0.5));
  vec3 wood = mix(vec3(0.3, 0.25, 0.21), vec3(0.62, 0.55, 0.47), smoothstep(0.1, 0.2, lat));
  diffuseColor.rgb *= 1.0 + 0.06 * pil * front;
  diffuseColor.rgb *= 1.0 - 0.07 * front * (step(v, 0.7) + smoothstep(${f(SITE.hall.wall - 2.1)}, ${f(SITE.hall.wall - 2.0)}, v) * (1.0 - smoothstep(${f(SITE.hall.wall - 1.1)}, ${f(SITE.hall.wall - 1.0)}, v)));
  diffuseColor.rgb = mix(diffuseColor.rgb, wood, door);
}
#endif
`;

// The columns' instances carry the colour of their shafts (sand, or the rotunda's red); bases and capitals are
// always the stone.
const SHAFT_COLOR = /* glsl */ `
#if defined(PAL_FLUTE) && defined(USE_INSTANCING_COLOR)
{
  float palShaft = smoothstep(0.062, 0.07, vPalL.y) * (1.0 - smoothstep(0.85, 0.858, vPalL.y));
  diffuseColor.rgb = mix(diffuse * ${v3('#efdcc6')}, diffuseColor.rgb, palShaft);
}
#endif
`;

// Veining and fluting change the surface colour only a little: marble should read as calm light, not as a pattern.
const FRAG_COLOR = /* glsl */ `
${SHAFT_COLOR}
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
${GROUND_COLOR}
${LEAF_COLOR}
${FACADE_COLOR}
${HALL_COLOR}
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
  normal = normalize(normal - gv * 0.03);
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
  // and the open sky reaches in less: the arches stand dark until the oculus fills the dome with light.
  reflectedLight.indirectDiffuse *= 1.0 - inside * 0.4 * (1.0 - uPalOculus);
  // The oculus pours warm light down the middle as you arrive.
  float shaft = exp(-pow(rq / (uPalRotR * 0.45), 2.0)) * inside;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.86, 0.68) * shaft * uPalOculus * 1.6;
  // Warm light bounced up from the sunlit floor and down from the oculus: the inside glows, it is never grey.
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.5, 0.4, 0.3) * inside * (0.3 + uPalOculus * 1.15);
}
#endif
#ifdef PAL_LEAF
{
  // Leaves let the low sun through: a crown's shaded side still glows, warmer toward the light.
  vec3 palSunV = normalize((viewMatrix * vec4(uPalSunDir, 0.0)).xyz);
  float palWrap = clamp((dot(normal, palSunV) + 0.65) / 1.65, 0.0, 1.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.9, 0.7) * (0.26 + 0.5 * palWrap * palWrap);
  // and from below, the sky shows green through the canopy.
  vec3 palUpL = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.8, 0.9, 0.75) * 0.45 * max(-dot(normal, palUpL), 0.0);
}
#endif
#ifdef PAL_GROUND
  // Grass and gravel take more of the open sky than polished paving does (the paving keeps its own light).
  reflectedLight.indirectDiffuse *= mix(1.75, 1.0, palPave);
  reflectedLight.directDiffuse *= mix(1.1, 1.0, palPave);
#endif
#ifdef PAL_FACADE
{
  // House fronts turned to the west hold the sunset sky's warm light, even out of the sun.
  vec3 palGlowV = normalize((viewMatrix * vec4(normalize(vec3(uPalSun.x, 0.0, uPalSun.z)), 0.0)).xyz);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.8, 0.64) * 0.42 * max(dot(normal, palGlowV), 0.0);
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

// The grounds' extra steps: the floor's and the glass's finish, and the panes that catch the sun.
const FRAG_ROUGH = /* glsl */ `
#ifdef PAL_GROUND
  roughnessFactor = mix(palRough, roughnessFactor, palPave);
#endif
#ifdef PAL_FACADE
  roughnessFactor = mix(roughnessFactor, 0.22, palGlass);
#endif
`;
const FRAG_GLINT = /* glsl */ `
#ifdef PAL_FACADE
  totalEmissiveRadiance += palGlint * (1.0 - uPalWhite);
#endif
`;

function patch(material: THREE.MeshStandardMaterial, kind: PalKind, extra?: Record<string, THREE.IUniform>): void {
  const defines: Record<string, string> = {};
  if (kind.vein) defines.PAL_VEIN = '';
  if (kind.flute) defines.PAL_FLUTE = '';
  if (kind.shade) defines.PAL_SHADE = '';
  if (kind.mirror) defines.PAL_MIRROR = '';
  if (kind.coffer) defines.PAL_COFFER = '';
  if (kind.dome) defines.PAL_DOME = '';
  if (kind.relief) defines.PAL_RELIEF = '';
  if (kind.pave) defines.PAL_PAVE = '';
  if (kind.ground) defines.PAL_GROUND = '';
  if (kind.leaf) defines.PAL_LEAF = '';
  if (kind.still) defines.PAL_STILL = '';
  if (kind.facade) defines.PAL_FACADE = '';
  if (kind.hall) defines.PAL_HALL = '';
  const grounds = kind.ground || kind.leaf || kind.facade || kind.hall;
  material.defines = { ...(material.defines ?? {}), ...defines };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, PAL, extra ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    if (kind.leaf) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_SWAY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_LIGHT}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${FRAG_END}`);
    if (grounds) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_GLINT}`);
    }
  };
  material.customProgramCacheKey = () => `palace:${Object.keys(defines).sort().join(',')}`;
}

export function palaceMaterial(params: THREE.MeshStandardMaterialParameters, kind: PalKind, env: THREE.Texture | null, extra?: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ envMap: env, ...params });
  patch(m, kind, extra);
  return m;
}

/** The stone of the columns: warm sand for the colonnades, and the rotunda's red, as the instances are tinted. */
export const STONE = lin('#efdcc6');
export const ROSSO = lin('#c27064');

/** The palette: a warm sand-coloured stone, a golden-ochre dome, and the carved panels a shade deeper. The terrace is
 *  the whole site's floor: paving round the palace, the park and the streets beyond (from `site`). */
export function palaceMaterials(env: THREE.Texture | null, quality: number, site: { texture: THREE.Texture; box: THREE.Vector4 }) {
  const marble = { color: '#efdcc6', roughness: 0.48, metalness: 0, envMapIntensity: 0.24 };
  // Veining costs a few noise lookups per pixel: worth it on a desktop GPU, not on a headset's (it is barely seen).
  const vein = quality >= 0.9;
  const make = (mirror: boolean) => ({
    marble: palaceMaterial(marble, { vein: vein && !mirror, shade: true, mirror }, env),
    column: palaceMaterial({ ...marble, color: '#ffffff', roughness: 0.42 }, { vein: vein && !mirror, flute: true, shade: true, mirror }, env),
    relief: palaceMaterial({ color: '#dcc2a2', roughness: 0.62, metalness: 0, envMapIntensity: 0.4 }, { relief: !mirror, shade: true, mirror }, env),
    dome: palaceMaterial({ color: '#dcae72', roughness: 0.5, metalness: 0, envMapIntensity: 0.36 }, { dome: true, mirror }, env),
  });
  return {
    ...make(false),
    mirror: make(true),
    ceiling: palaceMaterial({ color: '#f1dfc9', roughness: 0.75, metalness: 0, envMapIntensity: 0.35, side: THREE.BackSide }, { coffer: true, shade: true }, env),
    terrace: palaceMaterial({ color: '#dcd4c9', roughness: 0.36, metalness: 0, envMapIntensity: 0.38 }, { vein, shade: true, pave: true, ground: true }, env,
      { uPalSite: { value: site.texture }, uPalSiteBox: { value: site.box } }),
  };
}
export type PalaceMaterials = ReturnType<typeof palaceMaterials>;
