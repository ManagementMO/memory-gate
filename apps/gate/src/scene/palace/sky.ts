// The palace sky: a late golden hour in pastel. Periwinkle overhead, lavender, then peach and gold at the horizon,
// a low sun to the right, soft clouds banked low and far blue hills in haze. The clouds are painted once into a small
// equirectangular texture (they barely move), so the per-pixel sky is a gradient, a glow and one texture read.
// Below the horizon the visible sky is the mirror image (the lagoon shows it); the environment map gets ground instead.
import * as THREE from 'three';
import { HASH, SIMPLEX3 } from '../shaders/noise.glsl';
import { GLOW_DIR } from './plan';

const lin = (hex: string) => new THREE.Color(hex);

export const SKY_UNIFORMS = () => ({
  uZenith: { value: lin('#8e9dd8') },
  uMid: { value: lin('#c0b6e4') },
  uHorizon: { value: lin('#f3d2bd') },
  uGlow: { value: lin('#ffcf98') },
  uSunCol: { value: lin('#fff3df') },
  uGround: { value: lin('#d8cfc6') },
  uWaterTint: { value: lin('#9aa3cf') },
  uSunDir: { value: GLOW_DIR.clone() },
  uClouds: { value: null as THREE.Texture | null },
  uShift: { value: 0 },
  uWhite: { value: 0 },
  uWhiteCol: { value: new THREE.Color(0.94, 0.945, 0.965) },
  uBelow: { value: 1 },
});

// Across the bay to the north (your right as you face the rotunda): the Presidio's low wooded bluff, the Golden Gate
// Bridge spanning the strait, the Marin Headlands rising beyond it with Mount Tamalpais paler behind. All of it lies
// kilometres away, so it is painted into the sky at infinity: crisp at any resolution, untouched by the far plane,
// and mirrored in the bay for free. Angles in degrees: azimuth from the palace's axis (+ toward the north), elevation
// above the horizon. (The real bridge stands a little further west, behind the colonnade's north arm as seen from
// the shore; it is drawn just past the arm's end, where it can be seen.)
const LANDMARKS = /* glsl */ `
float gLandPx = 0.01;
float landBump(float a, float c, float w) { float t = (a - c) / w; return exp(-t * t); }
// Coverage of a line of half-width hw at distance dist (in degrees), never thinner than a softened pixel.
float landLine(float dist, float hw) { float p = gLandPx; return clamp((hw + 0.5 * p - abs(dist)) / p, 0.0, 1.0) * min(1.0, (2.0 * hw + 0.35 * p) / p); }
vec3 landmarks(vec3 d, vec3 col) {
  float az = atan(d.x, -d.z) * 57.29578;
  float el = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
  if (az < 44.0 || az > 158.0 || el > 7.0) return col;
  float px = gLandPx;
  vec3 haze = col;
  // Mount Tamalpais, far and pale, above the saddle of the nearer hills.
  float tam = 4.3 * landBump(az, 117.0, 7.5) + 2.5 * landBump(az, 104.0, 10.0) + 1.7 * landBump(az, 131.0, 9.0);
  tam += 0.08 * sin(az * 2.1) + 0.05 * sin(az * 5.3);
  col = mix(col, mix(haze, vec3(0.50, 0.47, 0.64), 0.42), smoothstep(tam + px, tam - px, el) * smoothstep(92.0, 100.0, az) * (1.0 - smoothstep(142.0, 150.0, az)));
  // The Marin Headlands: they rise steeply from the strait and roll away north-east, falling to the water at Sausalito.
  float hd = 3.3 * landBump(az, 95.0, 4.8) + 3.6 * landBump(az, 106.0, 5.5) + 2.6 * landBump(az, 114.0, 4.5) + 2.0 * landBump(az, 124.0, 6.0) + 1.2 * landBump(az, 139.0, 8.0);
  hd *= smoothstep(86.0, 92.5, az) * (1.0 - smoothstep(146.0, 156.0, az));
  hd += (0.07 * sin(az * 3.7) + 0.04 * sin(az * 9.1 + 1.3)) * step(0.3, hd);
  float hm = smoothstep(hd + px, hd - px, el) * step(0.05, hd);
  float gully = 0.93 + 0.07 * sin(az * 6.3 + el * 2.2) * sin(az * 1.7);
  vec3 hills = mix(haze, vec3(0.30, 0.31, 0.42) * gully, 0.5);
  hills += vec3(0.16, 0.09, 0.04) * exp(-max(hd - el, 0.0) / 0.12) * hm; // the low sun rims the ridge
  col = mix(col, hills, hm);
  // The Presidio's bluff on this side of the strait, wooded, low; the bridge's southern approach runs into it.
  float bl = (0.95 + 0.25 * landBump(az, 55.0, 5.0) + 0.06 * sin(az * 11.0) + 0.05 * sin(az * 23.0 + 1.0)) * smoothstep(44.0, 46.0, az) * (1.0 - smoothstep(64.5, 67.5, az));
  float bm = smoothstep(bl + px, bl - px, el) * step(0.05, bl);
  col = mix(col, mix(haze, vec3(0.24, 0.29, 0.30), 0.5), bm);
  // The Golden Gate Bridge, in its International Orange gone rose in the evening haze.
  vec3 orange = mix(haze, vec3(0.62, 0.17, 0.11), 0.62);
  vec3 truss = orange * 0.72;
  float A0 = 61.0, T1 = 64.6, T2 = 86.4, A3 = 90.2;
  float deck = mix(1.38, 1.05, clamp((az - A0) / (A3 - A0), 0.0, 1.0));
  float E1 = 5.25, E2 = 4.15;
  float br = 0.0;
  // the deck and its truss, from the bluff's trees to the Marin side
  float onDeck = smoothstep(56.0, 57.0, az) * (1.0 - smoothstep(A3 + 0.6, A3 + 1.4, az));
  float deckMask = landLine(el - (deck - 0.07), 0.085) * onDeck;
  col = mix(col, truss, deckMask);
  // the main cables, sweeping from anchorage to tower to tower to anchorage
  float cab;
  if (az < T1) { float s = clamp((az - A0) / (T1 - A0), 0.0, 1.0); cab = mix(deck + 0.05, E1 - 0.1, pow(s, 1.7)); }
  else if (az < T2) { float s = (az - T1) / (T2 - T1); cab = mix(E1 - 0.1, E2 - 0.08, s) - 2.85 * 4.0 * s * (1.0 - s) * mix(1.0, 0.86, s); }
  else { float s = clamp((az - T2) / (A3 - T2), 0.0, 1.0); cab = mix(E2 - 0.08, deck + 0.05, 1.0 - pow(1.0 - s, 1.7)); }
  float inSpan = step(A0, az) * step(az, A3);
  br = max(br, landLine(el - cab, 0.03) * inSpan);
  // the suspenders: a faint veil between cable and deck
  float veil = step(deck, el) * step(el, cab) * inSpan * 0.14;
  // the towers: two legs each, tied by portal struts, standing in the water
  for (int i = 0; i < 2; i++) {
    float T = i == 0 ? T1 : T2;
    float E = i == 0 ? E1 : E2;
    float k = i == 0 ? 1.0 : 0.8;
    float legs = max(landLine(az - (T - 0.13 * k), 0.05 * k), landLine(az - (T + 0.13 * k), 0.05 * k)) * step(el, E);
    float span = step(abs(az - T), 0.15 * k) * step(deck, el) * step(el, E);
    float struts = 0.0;
    for (int j = 0; j < 4; j++) {
      float h = deck + (E - deck) * (0.3 + 0.22 * float(j));
      struts = max(struts, landLine(el - h, 0.04 * k));
    }
    float cap = step(abs(az - T), 0.18 * k) * step(E - 0.12, el) * step(el, E);
    br = max(br, max(legs, max(struts * span, cap)));
  }
  col = mix(col, orange, veil);
  col = mix(col, orange, br);
  return col;
}
`;

const SKY_FN = /* glsl */ `
uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunCol, uGround, uWaterTint, uSunDir, uWhiteCol;
uniform sampler2D uClouds;
uniform float uShift, uWhite, uBelow;
${LANDMARKS}
vec3 skyAbove(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, y));
  col = mix(col, uZenith, smoothstep(0.16, 0.8, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 5.0) * 0.5 + pow(sd, 40.0) * 0.55) * (1.0 - 0.5 * smoothstep(0.0, 0.5, y));
  col += uSunCol * smoothstep(0.99935, 0.99975, sd) * 2.2;
  vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5 + uShift, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  vec4 cl = texture2D(uClouds, uv);
  return landmarks(d, mix(col, cl.rgb, cl.a));
}
vec3 palaceSky(vec3 d) {
  // How many degrees one pixel spans here (taken before any branching, where derivatives are defined).
  gLandPx = max(fwidth(d.y) * 57.29578, 0.002);
  if (d.y >= 0.0) return skyAbove(d);
  float below = smoothstep(0.0, -0.02, d.y);
  vec3 mirrorSky = mix(skyAbove(vec3(d.x, -d.y, d.z)) * 0.74, uWaterTint, 0.2);
  vec3 under = mix(mirrorSky, uGround, 1.0 - uBelow);
  return mix(skyAbove(vec3(d.x, 0.0, d.z)), under, below);
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #ifdef SKY_FAR
    gl_Position = clip.xyww;
  #else
    gl_Position = clip;
  #endif
}`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_FN}
void main() {
  vec3 col = palaceSky(normalize(vDir));
  gl_FragColor = vec4(mix(col, uWhiteCol, uWhite), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Painted once: clouds (lit warm on the sun side, lavender in their shade) and a far ridge of hills in the haze.
const CLOUD_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uSunDir, uLit, uShade, uHill, uHillFar;
${HASH}
${SIMPLEX3}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.14159265;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
  vec4 outc = vec4(0.0);
  if (d.y > -0.02) {
    // A cloud layer seen from below: flatten toward the horizon, so banks gather low and thin out overhead.
    vec2 p = d.xz / (d.y + 0.11) * 0.55;
    float n = fbm(vec3(p * 1.15, 0.0)) * 0.5 + 0.5;
    float detail = fbm(vec3(p * 3.6, 4.0)) * 0.5 + 0.5;
    float band = smoothstep(0.0, 0.05, d.y) * (1.0 - smoothstep(0.18, 0.5, d.y));
    float cover = smoothstep(0.5, 0.78, n * 0.8 + detail * 0.28) * band;
    float sd = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
    float lit = clamp(0.35 + 0.5 * pow(sd, 2.0) + (detail - 0.5) * 0.6, 0.0, 1.0);
    vec3 c = mix(uShade, uLit, lit);
    c += uLit * pow(sd, 12.0) * (1.0 - cover) * 0.4; // silver lining toward the sun
    outc = vec4(c, cover * 0.82);
    // Far hills: a soft ridge just above the horizon, almost the colour of the haze.
    float az = atan(d.x, -d.z);
    float ridge = 0.012 + 0.022 * (0.5 + 0.5 * snoise(vec3(az * 2.2, 0.0, 1.0))) + 0.01 * snoise(vec3(az * 7.0, 3.0, 0.0));
    ridge *= 1.0 - 0.6 * pow(sd, 3.0);
    // The Golden Gate itself: open water to the sea between the headlands (the bridge is drawn across it, live).
    ridge -= 0.06 * smoothstep(1.10, 1.16, az) * (1.0 - smoothstep(1.49, 1.55, az));
    float hill = (1.0 - smoothstep(ridge - 0.002, ridge + 0.002, d.y)) * smoothstep(-0.02, 0.0, d.y);
    vec3 hc = mix(uHill, uHillFar, smoothstep(0.0, ridge, d.y));
    outc = mix(outc, vec4(hc, 0.55), hill);
    // Far away in the haze, a few slender spires afloat above the hills: barely there, the dream's own touch. (Only
    // to the south-west now: to the north the bay, the Golden Gate and the Marin hills fill that part of the sky.)
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float a0 = -1.15 + fi * 0.32;
      float base = 0.05 + 0.025 * fract(fi * 0.618), top = base + 0.075 + 0.03 * fract(fi * 0.37);
      float u = (d.y - base) / (top - base);
      float w = 0.0042 * (1.0 - u) * (0.7 + 0.3 * fract(fi * 0.71)) + 0.0006;
      float spire = step(0.0, u) * step(u, 1.0) * (1.0 - smoothstep(w * 0.6, w, abs(az - a0)));
      // a small floating base under each spire, rounded like an island seen from afar
      float isl = (1.0 - smoothstep(0.0, 1.0, length(vec2((az - a0) / 0.011, (d.y - base + 0.004) / 0.005))));
      outc = mix(outc, vec4(mix(uHillFar, uLit, 0.35), 0.32), max(spire, isl * 0.85));
    }
  }
  gl_FragColor = outc;
}`;

export function paintClouds(gl: THREE.WebGLRenderer, width = 1024): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, width / 2, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: CLOUD_FRAG,
    depthTest: false, depthWrite: false,
    uniforms: { uSunDir: { value: GLOW_DIR.clone() }, uLit: { value: lin('#fff1e3') }, uShade: { value: lin('#cbbfdf') }, uHill: { value: lin('#b8b6d6') }, uHillFar: { value: lin('#d8cfe2') } },
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(quad);
  const xr = gl.xr.enabled;
  const prev = gl.getRenderTarget();
  gl.xr.enabled = false;
  gl.setRenderTarget(target);
  gl.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  gl.setRenderTarget(prev);
  gl.xr.enabled = xr;
  mat.dispose();
  quad.geometry.dispose();
  return target;
}

export function skyMaterial(clouds: THREE.Texture, far: boolean): THREE.ShaderMaterial {
  const uniforms = SKY_UNIFORMS();
  uniforms.uClouds.value = clouds;
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms,
    side: THREE.BackSide, depthWrite: false, depthTest: !far ? true : false,
    defines: far ? { SKY_FAR: '' } : {},
  });
}

/** The palace's own image-based light, made once from this sky (with ground below), so marble glows with its colours. */
export function skyEnvironment(gl: THREE.WebGLRenderer, clouds: THREE.Texture): THREE.Texture {
  const mat = skyMaterial(clouds, false);
  mat.uniforms.uBelow!.value = 0;
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), mat);
  scene.add(mesh);
  const pmrem = new THREE.PMREMGenerator(gl);
  const xr = gl.xr.enabled;
  gl.xr.enabled = false;
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 100);
  gl.xr.enabled = xr;
  pmrem.dispose();
  mat.dispose();
  mesh.geometry.dispose();
  return rt.texture;
}
