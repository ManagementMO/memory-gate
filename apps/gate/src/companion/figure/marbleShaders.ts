// Shader injections for the marble Figure: polished white marble with a branching network of grey and gold veins,
// warm where light passes through the stone, and every detail carved into it: a recessed oval face plate edged with a
// fine line of light, arched eyes and a star of warm light set into the stone, a seam over the crown, a gold-framed
// diamond on the chest, a polished scoop, a seam and a lit window on each wing. The carving is real shading (the
// surface normal follows each cut, so its edges catch the light) drawn in the shader, so it stays crisp at any
// distance and costs no geometry.
// Feature positions are in each mesh's own space (metres): the head's origin is its centre, the body's its top, a
// wing's its root (local +x faces the body).
import * as THREE from 'three';

export type MarbleFeature = 'shell' | 'face' | 'chest' | 'wing';

export type MarbleUniforms = {
  uRim: { value: THREE.Color };
  uRimAmt: { value: number };
  uOcclusion: { value: number };
  uExposure: { value: number };
  uWarm: { value: THREE.Color };    // light through stone, just inside the silhouette
  uGold: { value: THREE.Color };
  uChrome: { value: THREE.Color };
  uVein: { value: number };          // 0 plain → 1 full veining
  uGlowCore: { value: THREE.Color };
  uGlowEdge: { value: THREE.Color };
  uDiaBright: { value: number };     // the brow star, the chest diamond and the wing windows
};

export type MarbleFaceUniforms = {
  /** Per eye: centre (x, y) in metres on the face, scale (x, y). */
  uEyeL: { value: THREE.Vector4 };
  uEyeR: { value: THREE.Vector4 };
  uCut: { value: number };           // where the eye's soft base sits above its centre (metres): 0 a near half-oval, higher a slimmer arch
  uLineL: { value: number };         // 0 open → 1 a thin arc (blink, sleep)
  uLineR: { value: number };
  uBright: { value: number };
  uTilt: { value: number };          // outer tips down (kind), radians
};

/** Where the face sits on the head (metres, head space): a recessed oval plate following the head's shape, the brow
 *  star inside its top, the arched eyes below. Shared with the glow sprites in createMarble.ts. */
export const FACE = { ovalY: 0.0, ovalA: 0.094, ovalB: 0.066, starY: 0.034, star: [0.011, 0.018] as const, eyeX: 0.047, eyeY: -0.0135, chestY: -0.05, chest: [0.0085, 0.0135] as const };
/** The wings' length and sweep (metres), shared with the geometry in createMarble.ts. */
export const WING = { len: 0.215, bend: -0.012, windowY: -0.15 };

export function marbleUniforms(): MarbleUniforms {
  return {
    uRim: { value: new THREE.Color('#c9b8ff') },
    uRimAmt: { value: 0.2 },
    uOcclusion: { value: 0.2 },
    uExposure: { value: 1 },
    uWarm: { value: new THREE.Color('#ffd6a8') },
    uGold: { value: new THREE.Color('#b08a4c') },
    uChrome: { value: new THREE.Color('#d9d4cb') },
    uVein: { value: 1 },
    uGlowCore: { value: new THREE.Color('#fff1cc') },
    uGlowEdge: { value: new THREE.Color('#ffaa45') },
    uDiaBright: { value: 0.6 },
  };
}

export function marbleFaceUniforms(): MarbleFaceUniforms {
  return {
    uEyeL: { value: new THREE.Vector4(-FACE.eyeX, FACE.eyeY, 1, 1) },
    uEyeR: { value: new THREE.Vector4(FACE.eyeX, FACE.eyeY, 1, 1) },
    uCut: { value: 0.004 },
    uLineL: { value: 0 },
    uLineR: { value: 0 },
    uBright: { value: 0.3 },
    uTilt: { value: 0.1 },
  };
}

const f = (n: number) => n.toFixed(5);

const COMMON = /* glsl */ `
varying vec3 vMPos;
varying vec3 vMNor;
uniform vec3 uRim; uniform float uRimAmt; uniform float uOcclusion; uniform float uExposure;
uniform vec3 uWarm; uniform vec3 uGold; uniform vec3 uChrome; uniform float uVein;
uniform vec3 uGlowCore; uniform vec3 uGlowEdge; uniform float uDiaBright;
float mgHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mgNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mgHash(i), mgHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(mgHash(i + vec3(0.0, 1.0, 0.0)), mgHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(mgHash(i + vec3(0.0, 0.0, 1.0)), mgHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(mgHash(i + vec3(0.0, 1.0, 1.0)), mgHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float mgFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * mgNoise(p); p = p * 2.07 + 7.3; a *= 0.5; } return s; }
// Inigo Quilez's exact rhombus distance.
float mgRhombus(vec2 p, vec2 b) {
  p = abs(p);
  float h = clamp((b.x * (b.x - 2.0 * p.x) - b.y * (b.y - 2.0 * p.y)) / dot(b, b), -1.0, 1.0);
  float d = length(p - 0.5 * b * vec2(1.0 - h, 1.0 + h));
  return d * sign(p.x * b.y + p.y * b.x - b.x * b.y);
}
// Marble: wandering grey veins, a finer branching hairline network, and rarer gold veins. Each fades out where it
// would be finer than a pixel, so the stone never shimmers at a distance.
vec2 mgVeins(vec3 p) {
  float t = dot(p, vec3(17.0, 25.0, 9.0)) + mgFbm(p * 15.0) * 3.6;
  float fw = fwidth(t);
  float grey = (1.0 - smoothstep(0.0, 0.15 + fw * 2.5, abs(sin(t * 3.14159)))) * (1.0 - smoothstep(0.3, 0.7, fw)) * smoothstep(0.3, 0.68, mgNoise(p * 7.0 + 2.0));
  float t3 = dot(p, vec3(-23.0, 9.0, 31.0)) + mgFbm(p * 26.0 + 11.0) * 4.2;
  float fw3 = fwidth(t3);
  float hair = (1.0 - smoothstep(0.0, 0.06 + fw3 * 2.5, abs(sin(t3 * 3.14159)))) * (1.0 - smoothstep(0.22, 0.5, fw3)) * smoothstep(0.42, 0.74, mgNoise(p * 9.0 + 5.0));
  float t2 = dot(p, vec3(-11.0, 19.0, 13.0)) + mgFbm(p * 12.0 + 4.0) * 2.8;
  float fw2 = fwidth(t2);
  float gold = (1.0 - smoothstep(0.0, 0.065 + fw2 * 2.5, abs(sin(t2 * 3.14159)))) * (1.0 - smoothstep(0.25, 0.6, fw2)) * smoothstep(0.56, 0.8, mgNoise(p * 5.0 + 9.0));
  return vec2(max(grey, hair * 0.55), gold);
}
// Carving: bend the surface normal along a height field (a cut, a bevel, a raised frame) using screen-space
// derivatives, so no tangents or textures are needed (Mikkelsen's surface-gradient bump).
vec3 mgPerturb(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const FACE_COMMON = /* glsl */ `
uniform vec4 uEyeL; uniform vec4 uEyeR;
uniform float uCut, uLineL, uLineR, uBright, uTilt;
// Inigo Quilez's exact crescent ("moon") distance: a circle of radius ra with one of radius rb, d along +x, cut out.
// Exact around the tips too, so a glow hugs the arch instead of tracing the hidden circle underneath.
float mgMoon(vec2 p, float d, float ra, float rb) {
  p.y = abs(p.y);
  float a = (ra * ra - rb * rb + d * d) / (2.0 * d);
  float b = sqrt(max(ra * ra - a * a, 0.0));
  if (d * (p.x * b - p.y * a) > d * d * max(b - p.y, 0.0)) return length(p - vec2(a, b));
  return max(length(p) - ra, -(length(p - vec2(d, 0.0)) - rb));
}
// An eye of light: the top of an oval over a softly curved base (between a calm arch and a half-oval), cut by a large
// circle below. Lowering the base opens the eye; a blink raises it to a fine arc.
float mgEyeSd(vec2 p, vec4 e, float side, float line) {
  vec2 q = p - e.xy;
  float c = cos(uTilt * side), s = sin(uTilt * side);
  q = mat2(c, -s, s, c) * q;
  q /= e.zw;
  const float R0 = 0.0235;
  const float RB = 0.04;
  const float SY = 0.76;
  float cut = mix(uCut, R0 - 0.0016, line);
  vec2 qq = vec2(q.x, q.y / SY);
  // The cut-out circle sits below the eye's centre: turn the frame so "below" is the moon's +x.
  return mgMoon(vec2(-qq.y, qq.x), RB - cut, R0, RB) * SY * min(e.z, e.w);
}
// The brow star: a four-pointed diamond with softly drawn-in sides.
float mgStar(vec2 p, vec2 r) {
  vec2 q = abs(p) / r;
  return pow(pow(q.x, 0.72) + pow(q.y, 0.72), 1.0 / 0.72) - 1.0;
}
`;

const WING_COMMON = /* glsl */ `
float mgBend(float y) { float t = max(0.0, -y) / ${f(WING.len)}; return ${f(WING.bend)} * t * t; }
`;

function featureBlock(feature: MarbleFeature): string {
  const base = /* glsl */ `
  float mgFront = smoothstep(0.18, 0.55, normalize(vMNor).z);
  float mgGoldMask = 0.0, mgChromeMask = 0.0, mgGlowMask = 0.0, mgH = 0.0, mgShadePlate = 0.0, mgCut = 0.0;
  vec3 mgEmit = vec3(0.0);
  vec2 mgP = vMPos.xy;
  // Carving fades where a pixel spans more than a few millimetres (no shimmer far away); glow does the opposite: its
  // halo widens with distance so it always spans a few pixels and stays visible.
  float mgPx = length(fwidth(vMPos));
  float mgNear = 1.0 - smoothstep(0.0012, 0.004, mgPx);
  float mgHaloW = max(0.0024, mgPx * 4.5);`;
  if (feature === 'face') {
    return base + /* glsl */ `
  // The brow star, inside the top of the oval.
  vec2 mgSq = mgP - vec2(0.0, ${f(FACE.starY)});
  float mgSf = mgStar(mgSq, vec2(${f(FACE.star[0])}, ${f(FACE.star[1])}));
  float mgSw = max(fwidth(mgSf), 1e-5);
  float mgDia = (1.0 - smoothstep(-mgSw, mgSw, mgSf)) * mgFront;
  float mgSd = max(mgSf, 0.0) * ${f(FACE.star[0])};
  float mgDiaCore = smoothstep(0.0, -0.45, mgSf);
  float mgDiaHalo = exp(-mgSd / mgHaloW) * (1.0 - mgDia) * mgFront;
  // The face plate: an oval set a little into the head, its edge a fine bevel with a line of warm light. The
  // distance is estimated to first order, so the edge keeps one width all the way round.
  vec2 mgOq = mgP - vec2(0.0, ${f(FACE.ovalY)});
  float mgOl = max(length(mgOq / vec2(${f(FACE.ovalA)}, ${f(FACE.ovalB)})), 1e-5);
  float mgC = (mgOl - 1.0) * mgOl / max(length(mgOq / vec2(${f(FACE.ovalA * FACE.ovalA)}, ${f(FACE.ovalB * FACE.ovalB)})), 1e-5);
  float mgRc = abs(mgC);
  float mgRw = max(fwidth(mgRc), 1e-5);
  float mgRing = (1.0 - smoothstep(0.0004 - mgRw, 0.0004 + mgRw, mgRc)) * mgFront;
  mgCut = (1.0 - smoothstep(0.0009 - mgRw, 0.0009 + mgRw, mgRc)) * mgFront;
  float mgPlate = (1.0 - smoothstep(-0.0016, 0.0, mgC)) * mgFront;
  mgShadePlate = mgPlate;
  // The seam: from the crown down through the star, fading out between the eyes.
  float mgXw = max(fwidth(mgP.x), 1e-5);
  float mgSeamLine = (1.0 - smoothstep(0.0004 - mgXw, 0.0004 + mgXw, abs(mgP.x))) * step(0.0, vMPos.z);
  float mgSeamFade = smoothstep(-0.012, 0.012, mgP.y);
  float mgSeam = mgSeamLine * mgSeamFade * step(0.0015, mgSf);
  // The eyes.
  float mgD = min(mgEyeSd(mgP, uEyeL, -1.0, uLineL), mgEyeSd(mgP, uEyeR, 1.0, uLineR));
  float mgW = max(fwidth(mgD), 1e-5);
  float mgEye = (1.0 - smoothstep(-mgW, mgW, mgD)) * mgFront;
  // One light across the whole arch: brightest at its crown, easing warmer toward the tips (no edge/core split).
  float mgEx = min(abs(mgP.x - uEyeL.x), abs(mgP.x - uEyeR.x)) / 0.0235;
  float mgArc = 1.0 - smoothstep(0.1, 1.0, mgEx);
  // A hard gold outline round each eye, like the rims of the wing windows; the glow starts beyond it.
  float mgEyeRim = (smoothstep(-mgW, mgW, mgD) - smoothstep(0.0009 - mgW, 0.0009 + mgW, mgD)) * mgFront;
  float mgHalo = exp(-max(mgD - 0.0009, 0.0) / mgHaloW) * (1.0 - mgEye) * (1.0 - mgEyeRim) * mgFront;
  mgGlowMask = max(mgEye, mgDia);
  mgGoldMask = max(mgSeam * 0.85, mgEyeRim);
  // Carving: the plate sits a little lower than the head; the seam is a fine V-cut; the eyes and star are set in.
  mgH = (-0.0008 * mgPlate - 0.00035 * mgSeamLine * mgSeamFade
        - 0.0004 * (1.0 - smoothstep(-0.0006, 0.0007, mgD)) + 0.00035 * mgEyeRim - 0.0011 * (1.0 - smoothstep(-0.05, 0.08, mgSf))) * mgFront;
  mgEmit = mix(uGlowEdge, uGlowCore, 0.3 + 0.7 * mgArc) * mgEye * uBright * (3.8 + 1.2 * mgArc) + uGlowEdge * mgHalo * uBright * 1.35
         + (mix(uGlowEdge, uGlowCore, mgDiaCore) * mgDia * 4.4 + uGlowEdge * mgDiaHalo * 1.15) * uDiaBright
         + mix(uGlowEdge, uGlowCore, 0.5) * mgRing * (0.12 + uDiaBright * 0.12);`;
  }
  if (feature === 'chest') {
    return base + /* glsl */ `
  // A diamond of light on the chest, set in a raised gold frame.
  float mgDd = mgRhombus(mgP - vec2(0.0, ${f(FACE.chestY)}), vec2(${f(FACE.chest[0])}, ${f(FACE.chest[1])}));
  float mgDw = max(fwidth(mgDd), 1e-5);
  float mgOnFront = step(0.0, vMPos.z) * mgFront;
  float mgDia = (1.0 - smoothstep(-mgDw, mgDw, mgDd)) * mgOnFront;
  float mgFrame = (smoothstep(-mgDw, mgDw, mgDd) - smoothstep(0.0021 - mgDw, 0.0021 + mgDw, mgDd)) * mgOnFront;
  float mgDiaCore = smoothstep(0.0, -0.0042, mgDd);
  float mgDiaHalo = exp(-max(mgDd - 0.0021, 0.0) / mgHaloW) * (1.0 - mgDia - mgFrame) * mgOnFront;
  mgGlowMask = mgDia;
  mgGoldMask = mgFrame;
  mgH = (0.0006 * mgFrame - 0.001 * mgDia) * mgOnFront;
  mgEmit = (mix(uGlowEdge, uGlowCore, mgDiaCore) * mgDia * 3.8 + uGlowEdge * mgDiaHalo * 0.6) * uDiaBright;`;
  }
  if (feature === 'wing') {
    return base + /* glsl */ `
  float mgBy = mgBend(vMPos.y);
  vec3 mgN = normalize(vMNor);
  // A polished scoop near the root on the inner side (it faces the body), with a fine gold lip.
  vec2 mgSq = vec2((vMPos.y + 0.022) / 0.034, vMPos.z / 0.0105);
  float mgSc = length(mgSq) - 1.0;
  float mgInner = smoothstep(0.12, 0.42, mgN.x);
  float mgScW = max(fwidth(mgSc), 1e-5);
  float mgScoop = (1.0 - smoothstep(-mgScW, mgScW, mgSc)) * mgInner;
  float mgLip = (1.0 - smoothstep(0.0, mgScW * 2.5 + 0.03, abs(mgSc))) * mgInner * (1.0 - mgScoop);
  // A seam along the wing on its front face, curving with it.
  float mgSeamX = mgBy - 0.0025 + 0.0045 * sin(vMPos.y * 21.0 + 0.6);
  float mgSx = abs(vMPos.x - mgSeamX);
  float mgSxw = max(fwidth(vMPos.x), 1e-5);
  float mgSeam = (1.0 - smoothstep(0.00035 - mgSxw, 0.00035 + mgSxw, mgSx)) * smoothstep(0.1, 0.4, mgN.z) * smoothstep(-0.03, -0.05, vMPos.y) * smoothstep(-0.2, -0.17, vMPos.y);
  // A lit window low on the outer face.
  vec2 mgWq = vec2((vMPos.x - (mgBy - 0.0072)) / 0.0058, (vMPos.y - ${f(WING.windowY)}) / 0.021);
  float mgWl = length(mgWq) - 1.0;
  float mgWw = max(fwidth(mgWl), 1e-5);
  float mgOuterFront = smoothstep(0.05, 0.35, mgN.z);
  float mgWin = (1.0 - smoothstep(-mgWw, mgWw, mgWl)) * mgOuterFront;
  float mgWinRim = (1.0 - smoothstep(0.0, mgWw * 2.0 + 0.12, abs(mgWl))) * mgOuterFront * (1.0 - mgWin);
  float mgWinCore = smoothstep(0.0, -0.6, mgWl);
  mgChromeMask = mgScoop;
  mgGoldMask = max(max(mgLip, mgSeam), mgWinRim * 0.8);
  mgGlowMask = mgWin;
  mgH = -0.0022 * (1.0 - smoothstep(-0.25, 0.05, mgSc)) * mgInner - 0.0004 * mgSeam - 0.0012 * (1.0 - smoothstep(-0.2, 0.15, mgWl)) * mgOuterFront;
  mgEmit = (mix(uGlowEdge, uGlowCore, mgWinCore) * mgWin * 3.0 + uGlowEdge * exp(-max(mgWl, 0.0) * 4.0) * (1.0 - mgWin) * mgOuterFront * 0.45) * uDiaBright;`;
  }
  return base;
}

export function applyMarble(m: THREE.MeshPhysicalMaterial, u: MarbleUniforms, feature: MarbleFeature, face?: MarbleFaceUniforms): void {
  const carve = feature !== 'shell';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, face ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMPos;\nvarying vec3 vMNor;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvMNor = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMPos = transformed;');
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}${feature === 'face' ? FACE_COMMON : ''}${feature === 'wing' ? WING_COMMON : ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${featureBlock(feature)}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
  vec2 mgV = mgVeins(vMPos) * uVein * (1.0 - mgGlowMask) * (1.0 - mgChromeMask);
  diffuseColor.rgb *= 0.965 + 0.035 * mgFbm(vMPos * 7.0 + 3.0); // soft clouding in the stone
  diffuseColor.rgb *= 1.0 - mgShadePlate * 0.22 * (1.0 - mgGlowMask);
  diffuseColor.rgb *= 1.0 - mgCut * 0.62; // incised lines read dark
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.425, 0.385), mgV.x * 0.72);
  diffuseColor.rgb = mix(diffuseColor.rgb, uGold, mgV.y * 0.65);
  diffuseColor.rgb = mix(diffuseColor.rgb, uChrome, mgChromeMask);
  diffuseColor.rgb = mix(diffuseColor.rgb, uGold, mgGoldMask);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.34, max(mgGoldMask, mgV.y * 0.6));
  roughnessFactor = mix(roughnessFactor, 0.1, mgChromeMask);`)
      .replace('#include <metalnessmap_fragment>', /* glsl */ `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 1.0, max(max(mgGoldMask, mgV.y * 0.6), mgChromeMask));`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
  totalEmissiveRadiance += mgEmit + uGold * mgGoldMask * 0.05 + uChrome * mgChromeMask * 0.08;`)
      .replace('#include <opaque_fragment>', /* glsl */ `
  {
    float mgMask = 1.0 - mgGlowMask;
    vec3 mgUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float mgFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    // Studio occlusion: undersides fall into soft shadow, so white stone reads as form even on a white page.
    float mgOcc = mix(1.0 - uOcclusion, 1.0, smoothstep(-0.8, 0.55, dot(normal, mgUp)));
    mgOcc *= mix(1.0 - uOcclusion * 0.6, 1.0, smoothstep(-0.2, 0.9, mgFacing));
    outgoingLight *= mix(1.0, mgOcc * uExposure, mgMask);
    // Light passing through the stone: a warm glow just inside the silhouette.
    outgoingLight += uWarm * pow(1.0 - mgFacing, 2.2) * 0.16 * mgMask;
    vec3 mgRimCol = mix(uRim, vec3(1.0, 0.87, 0.74), smoothstep(-0.55, 0.55, normal.x));
    outgoingLight += mgRimCol * pow(1.0 - mgFacing, 3.0) * uRimAmt * mgMask;
  }
  #include <opaque_fragment>`);
    if (carve) {
      frag = frag
        .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
  normal = mgPerturb(-vViewPosition, normal, mgH * mgNear, faceDirection);`)
        .replace('#include <clearcoat_normal_fragment_begin>', /* glsl */ `#include <clearcoat_normal_fragment_begin>
  #ifdef USE_CLEARCOAT
  clearcoatNormal = mgPerturb(-vViewPosition, clearcoatNormal, mgH * mgNear, faceDirection);
  #endif`);
    }
    shader.fragmentShader = frag;
  };
  m.customProgramCacheKey = () => `mg-marble-${feature}`;
}
