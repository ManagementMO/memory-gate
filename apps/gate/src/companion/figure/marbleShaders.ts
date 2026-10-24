// Shader injections for the marble Figure: polished white marble with soft grey and gold veins, a warm glow just
// inside the silhouette where light passes through stone, and on the head the face itself, drawn in the shader so
// every edge stays crisp at any distance: a fine gold-lined circle, two crescent eyes of warm light, a diamond on the
// brow and a gold seam rising from it. The body carries a smaller diamond on its chest.
// Feature positions are in each mesh's own space (metres): the head's origin is its centre, the body's its top.
import * as THREE from 'three';

export type MarbleUniforms = {
  uRim: { value: THREE.Color };
  uRimAmt: { value: number };
  uOcclusion: { value: number };
  uExposure: { value: number };
  uWarm: { value: THREE.Color };    // light through stone, just inside the silhouette
  uGold: { value: THREE.Color };
  uVein: { value: number };          // 0 plain → 1 full veining
  uGlowCore: { value: THREE.Color };
  uGlowEdge: { value: THREE.Color };
  uDiaBright: { value: number };     // the brow and chest diamonds
};

export type MarbleFaceUniforms = {
  /** Per eye: centre (x, y) in metres on the face, scale (x, y). */
  uEyeL: { value: THREE.Vector4 };
  uEyeR: { value: THREE.Vector4 };
  uLid: { value: number };           // 0 open → 1 the upper lid lowered (gentle)
  uCheek: { value: number };         // 0 → 1 the cheek lifts, curved (a smile)
  uLineL: { value: number };         // 0 open → 1 a thin closed line (blink, sleep)
  uLineR: { value: number };
  uBright: { value: number };
  uTilt: { value: number };          // outer tips down (kind), radians
};

export function marbleUniforms(): MarbleUniforms {
  return {
    uRim: { value: new THREE.Color('#c9b8ff') },
    uRimAmt: { value: 0.2 },
    uOcclusion: { value: 0.2 },
    uExposure: { value: 1 },
    uWarm: { value: new THREE.Color('#ffd8b0') },
    uGold: { value: new THREE.Color('#dcbb7f') },
    uVein: { value: 1 },
    uGlowCore: { value: new THREE.Color('#fff4d6') },
    uGlowEdge: { value: new THREE.Color('#ffa63a') },
    uDiaBright: { value: 0.6 },
  };
}

export function marbleFaceUniforms(): MarbleFaceUniforms {
  return {
    uEyeL: { value: new THREE.Vector4(-FACE.eyeX, FACE.eyeY, 1, 1) },
    uEyeR: { value: new THREE.Vector4(FACE.eyeX, FACE.eyeY, 1, 1) },
    uLid: { value: 0 },
    uCheek: { value: 0 },
    uLineL: { value: 1 },
    uLineR: { value: 1 },
    uBright: { value: 0.3 },
    uTilt: { value: 0.08 },
  };
}

/** Where the face sits on the head (metres, head space): an oval following the head's shape, the brow diamond set into
 *  its top, the eyes inside it. Shared with the glow sprites in createMarble.ts. */
export const FACE = { ovalY: 0.004, ovalA: 0.084, ovalB: 0.052, diamondY: 0.056, diamond: [0.0078, 0.0132] as const, eyeX: 0.04, eyeY: -0.004, chestY: -0.052, chest: [0.0068, 0.0115] as const };

const COMMON = /* glsl */ `
varying vec3 vMPos;
varying vec3 vMNor;
uniform vec3 uRim; uniform float uRimAmt; uniform float uOcclusion; uniform float uExposure;
uniform vec3 uWarm; uniform vec3 uGold; uniform float uVein;
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
// Marble veins: thin wandering lines (a warped sine), grey and, more rarely, gold. They fade out where they would be
// finer than a pixel, so the stone never shimmers at a distance.
vec2 mgVeins(vec3 p) {
  float t = dot(p, vec3(17.0, 25.0, 9.0)) + mgFbm(p * 15.0) * 3.6;
  float fw = fwidth(t);
  float grey = (1.0 - smoothstep(0.0, 0.12 + fw * 2.5, abs(sin(t * 3.14159)))) * (1.0 - smoothstep(0.3, 0.7, fw)) * smoothstep(0.32, 0.7, mgNoise(p * 7.0 + 2.0));
  float t2 = dot(p, vec3(-11.0, 19.0, 13.0)) + mgFbm(p * 12.0 + 4.0) * 2.8;
  float fw2 = fwidth(t2);
  float gold = (1.0 - smoothstep(0.0, 0.065 + fw2 * 2.5, abs(sin(t2 * 3.14159)))) * (1.0 - smoothstep(0.25, 0.6, fw2)) * smoothstep(0.58, 0.82, mgNoise(p * 5.0 + 9.0));
  return vec2(grey, gold);
}
`;

const FACE_COMMON = /* glsl */ `
uniform vec4 uEyeL; uniform vec4 uEyeR;
uniform float uLid, uCheek, uLineL, uLineR, uBright, uTilt;
// An eye of light: a soft oval that glows all over. Its edge distance is estimated to first order, so the outline stays
// one crisp width all round. The upper lid lowers for a gentle look, the cheek lifts (curved) for a smile, and a blink
// thins it to a line.
float mgEyeSd(vec2 p, vec4 e, float side, float line) {
  vec2 q = p - e.xy;
  float c = cos(uTilt * side), s = sin(uTilt * side);
  q = mat2(c, -s, s, c) * q;
  vec2 r = vec2(0.0205, 0.0138) * e.zw;
  r.y *= mix(1.0, 0.14, line);
  float ql = max(length(q / r), 1e-5);
  float d = (ql - 1.0) * ql / max(length(q / (r * r)), 1e-5);
  d = max(d, q.y - mix(r.y + 0.004, 0.0, uLid));
  float cheek = -r.y + uCheek * r.y * (1.25 - 0.55 * (q.x / r.x) * (q.x / r.x));
  return max(d, cheek - q.y);
}
`;

const f = (n: number) => n.toFixed(5);

function featureBlock(feature: 'shell' | 'face' | 'chest'): string {
  const base = /* glsl */ `
  float mgFront = smoothstep(0.18, 0.55, normalize(vMNor).z);
  float mgGoldMask = 0.0, mgGroove = 0.0, mgGlowMask = 0.0, mgShade = 0.0;
  vec3 mgEmit = vec3(0.0);
  vec2 mgP = vMPos.xy;`;
  if (feature === 'face') {
    return base + /* glsl */ `
  // The brow diamond, set into the top of the face oval.
  float mgDd = mgRhombus(mgP - vec2(0.0, ${f(FACE.diamondY)}), vec2(${f(FACE.diamond[0])}, ${f(FACE.diamond[1])}));
  float mgDw = max(fwidth(mgDd), 1e-5);
  float mgDia = (1.0 - smoothstep(-mgDw, mgDw, mgDd)) * mgFront;
  float mgDiaCore = smoothstep(0.0, -0.004, mgDd);
  float mgDiaHalo = exp(-max(mgDd, 0.0) * 300.0) * (1.0 - mgDia) * mgFront;
  // The face oval: a fine engraved groove with a gold line in it, parted where the diamond sits. Its distance is
  // estimated to first order, so the line keeps one width all the way round.
  vec2 mgOq = mgP - vec2(0.0, ${f(FACE.ovalY)});
  float mgOl = max(length(mgOq / vec2(${f(FACE.ovalA)}, ${f(FACE.ovalB)})), 1e-5);
  float mgC = (mgOl - 1.0) * mgOl / max(length(mgOq / vec2(${f(FACE.ovalA * FACE.ovalA)}, ${f(FACE.ovalB * FACE.ovalB)})), 1e-5);
  float mgRc = abs(mgC);
  float mgRw = max(fwidth(mgRc), 1e-5);
  float mgPart = smoothstep(0.0035, 0.0065, mgDd);
  mgGroove = (1.0 - smoothstep(0.0013 - mgRw, 0.0013 + mgRw, mgRc)) * mgFront * mgPart;
  float mgRing = (1.0 - smoothstep(0.00042 - mgRw, 0.00042 + mgRw, mgRc)) * mgFront * mgPart;
  // The seam: a gold hairline from the diamond up over the crown.
  float mgSw = max(fwidth(mgP.x), 1e-5);
  float mgSeam = (1.0 - smoothstep(0.00042 - mgSw, 0.00042 + mgSw, abs(mgP.x))) * step(0.0, vMPos.z) * smoothstep(${f(FACE.diamondY + FACE.diamond[1] + 0.002)}, ${f(FACE.diamondY + FACE.diamond[1] + 0.006)}, mgP.y);
  mgGoldMask = max(mgRing, mgSeam);
  // The eyes: light all over, brightest at the heart, with a soft glow all round.
  float mgD = min(mgEyeSd(mgP, uEyeL, -1.0, uLineL), mgEyeSd(mgP, uEyeR, 1.0, uLineR));
  float mgW = max(fwidth(mgD), 1e-5);
  float mgEye = (1.0 - smoothstep(-mgW, mgW, mgD)) * mgFront;
  float mgCore = smoothstep(-0.0012, -0.0065, mgD);
  float mgHalo = exp(-max(mgD, 0.0) * 430.0) * (1.0 - mgEye) * mgFront;
  mgGlowMask = max(mgEye, mgDia);
  // The face plate is a touch recessed (shade under its top rim) and the diamond sits in a fine carved line, so warm
  // light reads crisply against white stone.
  float mgPlate = (1.0 - smoothstep(-mgRw, mgRw, mgC)) * mgFront;
  float mgRecess = mgPlate * smoothstep(-0.014, 0.0, mgC) * smoothstep(-0.02, 0.03, mgP.y - ${f(FACE.ovalY)});
  // A fine carved line round each eye and the diamond keeps their edges crisp at any distance.
  float mgSocket = max((1.0 - smoothstep(0.0, 0.0013, mgD)) * (1.0 - mgEye), (1.0 - smoothstep(0.0, 0.0014, mgDd)) * (1.0 - mgDia)) * mgFront;
  mgShade = mgPlate * 0.07 + mgRecess * 0.1 + mgSocket * 0.45;
  mgEmit = mix(uGlowEdge, uGlowCore, mgCore) * mgEye * uBright * 3.0 + uGlowEdge * mgHalo * uBright * 0.5
         + (mix(uGlowEdge, uGlowCore, mgDiaCore) * mgDia * 2.1 + uGlowEdge * mgDiaHalo * 0.4) * uDiaBright;`;
  }
  if (feature === 'chest') {
    return base + /* glsl */ `
  float mgDd = mgRhombus(mgP - vec2(0.0, ${f(FACE.chestY)}), vec2(${f(FACE.chest[0])}, ${f(FACE.chest[1])}));
  float mgDw = max(fwidth(mgDd), 1e-5);
  float mgDia = (1.0 - smoothstep(-mgDw, mgDw, mgDd)) * step(0.0, vMPos.z) * mgFront;
  float mgDiaCore = smoothstep(0.0, -0.0035, mgDd);
  float mgDiaHalo = exp(-max(mgDd, 0.0) * 300.0) * (1.0 - mgDia) * step(0.0, vMPos.z) * mgFront;
  mgGlowMask = mgDia;
  mgEmit = (mix(uGlowEdge, uGlowCore, mgDiaCore) * mgDia * 2.0 + uGlowEdge * mgDiaHalo * 0.35) * uDiaBright;`;
  }
  return base;
}

export function applyMarble(m: THREE.MeshPhysicalMaterial, u: MarbleUniforms, feature: 'shell' | 'face' | 'chest', face?: MarbleFaceUniforms): void {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, face ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMPos;\nvarying vec3 vMNor;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvMNor = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}${feature === 'face' ? FACE_COMMON : ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${featureBlock(feature)}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
  vec2 mgV = mgVeins(vMPos) * uVein * (1.0 - mgGlowMask);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.585, 0.57), mgV.x * 0.42);
  diffuseColor.rgb = mix(diffuseColor.rgb, uGold, mgV.y * 0.6);
  diffuseColor.rgb *= (1.0 - mgGroove * 0.42) * (1.0 - mgShade);
  diffuseColor.rgb = mix(diffuseColor.rgb, uGold, mgGoldMask);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.26, max(mgGoldMask, mgV.y * 0.6));`)
      .replace('#include <metalnessmap_fragment>', /* glsl */ `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 1.0, max(mgGoldMask, mgV.y * 0.6));`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
  totalEmissiveRadiance += mgEmit + uGold * mgGoldMask * 0.12;`)
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
    outgoingLight += uWarm * pow(1.0 - mgFacing, 2.2) * 0.14 * mgMask;
    vec3 mgRimCol = mix(uRim, vec3(1.0, 0.87, 0.74), smoothstep(-0.55, 0.55, normal.x));
    outgoingLight += mgRimCol * pow(1.0 - mgFacing, 3.0) * uRimAmt * mgMask;
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `mg-marble-${feature}`;
}
