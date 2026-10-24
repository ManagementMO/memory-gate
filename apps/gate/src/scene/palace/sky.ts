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

const SKY_FN = /* glsl */ `
uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunCol, uGround, uWaterTint, uSunDir, uWhiteCol;
uniform sampler2D uClouds;
uniform float uShift, uWhite, uBelow;
vec3 skyAbove(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, y));
  col = mix(col, uZenith, smoothstep(0.16, 0.8, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 5.0) * 0.5 + pow(sd, 40.0) * 0.55) * (1.0 - 0.5 * smoothstep(0.0, 0.5, y));
  col += uSunCol * smoothstep(0.99935, 0.99975, sd) * 2.2;
  vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5 + uShift, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  vec4 cl = texture2D(uClouds, uv);
  return mix(col, cl.rgb, cl.a);
}
vec3 palaceSky(vec3 d) {
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
    float hill = (1.0 - smoothstep(ridge - 0.002, ridge + 0.002, d.y)) * smoothstep(-0.02, 0.0, d.y);
    vec3 hc = mix(uHill, uHillFar, smoothstep(0.0, ridge, d.y));
    outc = mix(outc, vec4(hc, 0.55), hill);
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
