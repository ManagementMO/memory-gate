// Shader injections for the Figure: one MeshPhysicalMaterial draws the whole head, white porcelain shell, black glass
// visor and the LED eyes, so the visor edge is anti-aliased in the shader (no decal mesh, no aliased cut-out).
// Eyes are signed-distance shapes in the visor's angular coordinates with fine horizontal scanlines.
import * as THREE from 'three';

export type FaceUniforms = {
  uHeadR: { value: THREE.Vector3 };
  /** Per eye: centre (x, y) in visor radians, scale (x, y). */
  uEyeL: { value: THREE.Vector4 };
  uEyeR: { value: THREE.Vector4 };
  uArc: { value: number };     // 0 ovals → 1 happy arcs
  uLid: { value: number };     // 0 open → 1 upper half covered (gentle)
  uLineL: { value: number };   // 0 open → 1 a thin closed line (blink, sleep)
  uLineR: { value: number };
  uBright: { value: number };
  uScan: { value: number };    // scanline drift phase
  uTilt: { value: number };    // outer corners down (kind), radians
  uEyeCore: { value: THREE.Color };
  uEyeEdge: { value: THREE.Color };
  uVisor: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uRimAmt: { value: number };
  uOcclusion: { value: number };
  uExposure: { value: number };
};

export function faceUniforms(): FaceUniforms {
  return {
    uHeadR: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
    uEyeL: { value: new THREE.Vector4(-0.36, 0.0, 1, 1) },
    uEyeR: { value: new THREE.Vector4(0.36, 0.0, 1, 1) },
    uArc: { value: 0 },
    uLid: { value: 0 },
    uLineL: { value: 1 },
    uLineR: { value: 1 },
    uBright: { value: 0.3 },
    uScan: { value: 0 },
    uTilt: { value: 0.12 },
    // Pale aqua light from the aurora's palette (its own colour, not a borrowed robot blue).
    uEyeCore: { value: new THREE.Color('#d6fdff') },
    uEyeEdge: { value: new THREE.Color('#39c9d9') },
    uVisor: { value: new THREE.Color('#040507') },
    uRim: { value: new THREE.Color('#b7a8ff') },
    uRimAmt: { value: 0.22 },
    uOcclusion: { value: 0.12 },
    uExposure: { value: 1 },
  };
}

const SHELL_COMMON = /* glsl */ `
uniform vec3 uRim; uniform float uRimAmt; uniform float uOcclusion; uniform float uExposure;
`;

/** Shared shell look: a faint aurora rim and a soft studio occlusion so white reads as form on a white page. */
function shellOutgoing(skipVisor: boolean): string {
  const mask = skipVisor ? '(1.0 - figVisor)' : '1.0';
  return /* glsl */ `
  {
    vec3 figUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float figFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float figRim = pow(1.0 - figFacing, 3.0);
    // Studio occlusion: undersides fall into soft shadow, so white porcelain reads as form (even on a white page).
    float figOcc = mix(1.0 - uOcclusion, 1.0, smoothstep(-0.8, 0.55, dot(normal, figUp)));
    figOcc *= mix(1.0 - uOcclusion * 0.6, 1.0, smoothstep(-0.2, 0.9, figFacing));
    outgoingLight *= mix(1.0, figOcc * uExposure, ${mask});
    // Aurora light on porcelain: lavender from one side, mint from the other (the gate's two colours).
    vec3 figRimCol = mix(uRim, vec3(0.5, 0.95, 0.8), smoothstep(-0.55, 0.55, normal.x));
    outgoingLight += figRimCol * figRim * uRimAmt * ${mask};
  }
  #include <opaque_fragment>`;
}

export function applyFace(m: THREE.MeshPhysicalMaterial, u: FaceUniforms): void {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFig;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFig = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
varying vec3 vFig;
uniform vec3 uHeadR; uniform vec4 uEyeL; uniform vec4 uEyeR;
uniform float uArc, uLid, uLineL, uLineR, uBright, uScan, uTilt;
uniform vec3 uEyeCore, uEyeEdge, uVisor;
${SHELL_COMMON}
// Inigo Quilez's arc: an upward arc with rounded ends (the happy "◠" eye).
float figArc(vec2 p, vec2 sc, float ra, float rb) {
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
float figEye(vec2 p, vec4 e, float side, float line) {
  vec2 q = p - e.xy;
  // A kind tilt: the outer corner of each eye sits a little lower.
  float c = cos(uTilt * side), s = sin(uTilt * side);
  q = mat2(c, -s, s, c) * q;
  vec2 r = vec2(0.118, 0.118) * e.zw; // round, soft eyes
  r.y *= mix(1.0, 0.11, line);
  float dE = (length(q / r) - 1.0) * min(r.x, r.y);
  float dA = figArc(q - vec2(0.0, -0.07 * e.w), vec2(sin(1.15), cos(1.15)), 0.11 * e.z, 0.026 * e.w);
  float d = mix(dE, dA, uArc * (1.0 - line));
  float lidY = mix(r.y + 0.03, -0.006, uLid);
  return max(d, q.y - lidY);
}`)
      .replace('#include <clipping_planes_fragment>', /* glsl */ `#include <clipping_planes_fragment>
  vec3 figN = normalize(vFig / uHeadR);
  vec2 figP = vec2(atan(figN.x, figN.z), asin(clamp(figN.y, -1.0, 1.0)));
  // The face: a round window of dark glass on the front of the pearl.
  vec2 figVq = (figP - vec2(0.0, -0.02)) / vec2(0.64, 0.52);
  float figVd = length(figVq) - 1.0;
  float figVw = max(fwidth(figVd), 1e-4);
  float figVisor = 1.0 - smoothstep(-figVw, figVw, figVd);
  float figBevel = (1.0 - smoothstep(0.0, figVw * 2.5, abs(figVd + 0.03))) * figVisor;
  float figDl = figEye(figP, uEyeL, -1.0, uLineL);
  float figDr = figEye(figP, uEyeR, 1.0, uLineR);
  float figD = min(figDl, figDr);
  float figW = max(fwidth(figD), 1e-4);
  float figEyeMask = (1.0 - smoothstep(-figW, figW, figD)) * figVisor;
  // Fine LED scanlines, faded out when they'd be finer than a pixel (no moire at a distance).
  float figSf = fwidth(figP.y * 54.0);
  float figScanP = 0.62 + 0.38 * smoothstep(0.12, 0.6, abs(fract(figP.y * 54.0 + uScan) - 0.5) * 2.0);
  float figScan = 1.0; // clean, even light: no LED scanlines (figScanP / figSf kept for a future toggle)
  float figCore = smoothstep(0.004, -0.045, figD);
  vec3 figEyeCol = mix(uEyeEdge, uEyeCore, figCore) * figEyeMask * figScan * uBright;
  float figHalo = exp(-max(figD, 0.0) * 95.0) * (1.0 - figEyeMask) * figVisor * uBright;`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, uVisor, figVisor);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.22, figVisor);`)
      .replace('#include <metalnessmap_fragment>', /* glsl */ `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 0.1, figVisor);`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
  totalEmissiveRadiance += figEyeCol * 1.9 + uEyeEdge * figHalo * 0.22 + vec3(0.42, 0.46, 0.58) * figBevel * 0.05;`)
      .replace('#include <lights_physical_fragment>', /* glsl */ `#include <lights_physical_fragment>
  #ifdef USE_IRIDESCENCE
  material.iridescence *= (1.0 - figVisor);
  #endif
  #ifdef USE_CLEARCOAT
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.32, figVisor); // a soft glint, never a hard panel reflection
  #endif`)
      .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
  reflectedLight.indirectSpecular *= mix(1.0, 0.22, figVisor);
  reflectedLight.directSpecular *= mix(1.0, 0.5, figVisor);
  #ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= mix(1.0, 0.35, figVisor);
  #endif`)
      .replace('#include <opaque_fragment>', shellOutgoing(true));
  };
  m.customProgramCacheKey = () => 'mg-figure-face';
}

export function applyShell(m: THREE.MeshPhysicalMaterial, u: Pick<FaceUniforms, 'uRim' | 'uRimAmt' | 'uOcclusion' | 'uExposure'>): void {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHELL_COMMON}`)
      .replace('#include <opaque_fragment>', shellOutgoing(false));
  };
  m.customProgramCacheKey = () => 'mg-figure-shell';
}
