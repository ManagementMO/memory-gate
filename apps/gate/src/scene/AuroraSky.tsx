// The gate: a night sky with aurora curtains overhead and, ahead, flowing hairlines of light (violet, silver, green)
// that wind into a luminous opening. One sky-sphere shader, always behind everything (z = w), centred on the viewer.
// Stage drives four uniforms: wake (after Begin), open (walking through), white (the far side is white), fade.
// It doubles as the album's backdrop: liquid glass needs something beautiful to bend.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { HASH, SIMPLEX3 } from './shaders/noise.glsl';
import { damp } from './util';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww; // always on the far plane: everything else draws in front
}`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime, uFade, uWake, uOpen, uWhite, uQuality, uGateStrength;
uniform vec3 uGateDir, uGreen, uTeal, uViolet, uPurple, uSilver;
uniform sampler2D uAurora;
vec2 equirect(vec3 d) { return vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5); }
${HASH}
${SIMPLEX3}

float stars(vec3 d) {
  vec3 p = d * 260.0;
  vec3 id = floor(p);
  vec3 fp = fract(p) - 0.5;
  float h = hash13(id);
  if (h < 0.9955) return 0.0;
  float twinkle = 0.65 + 0.35 * sin(uTime * (0.35 + fract(h * 91.7) * 0.9) + h * 60.0);
  float size = mix(0.07, 0.2, fract(h * 13.7));
  return smoothstep(size, 0.0, length(fp)) * twinkle * (0.45 + fract(h * 37.1));
}

// The gate: built only from light. A soft luminous opening, a breathing halo, faint rays turning slowly as if
// through mist, and a nebula haze around it — no lines, nothing drawn; the aurora and the motes do the rest.
vec3 gate(vec3 d, float strength, float lines) {
  vec3 f = normalize(uGateDir);
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = normalize(cross(r, f));
  float rad = acos(clamp(dot(d, f), -1.0, 1.0));
  vec2 p = vec2(dot(d, r), dot(d, u));
  float th = atan(p.y, p.x);
  float t = uTime;
  // Rays: a few broad, soft beams that turn very slowly and breathe (smooth noise, no hard edges).
  float n1 = snoise(vec3(cos(th) * 1.6, sin(th) * 1.6, t * 0.035));
  float n2 = snoise(vec3(cos(th) * 3.4 + 7.0, sin(th) * 3.4, t * 0.05 + 3.0));
  float rays = smoothstep(0.05, 0.9, n1 * 0.65 + n2 * 0.35 + 0.25);
  float rayFall = exp(-rad * (5.2 - uOpen * 3.5)) * smoothstep(0.02, 0.1, rad);
  vec3 rayCol = mix(uViolet, uGreen, 0.5 + 0.5 * sin(th * 0.5 + t * 0.03)) * 0.9 + uSilver * 0.15;
  // A halo of light (not a line): a wide, soft ring that breathes at 0.12 Hz.
  float breathe = 0.85 + 0.15 * sin(t * 0.75);
  float ringR = 0.12 + uOpen * 0.6;
  float halo = exp(-pow((rad - ringR) / (0.05 + uOpen * 0.2), 2.0)) * breathe;
  vec3 haloCol = mix(uViolet, uTeal, 0.5 + 0.5 * sin(th + t * 0.05));
  // Mist: a slow nebula around the opening.
  float haze = (fbm3(vec3(p * 3.2, t * 0.015)) * 0.5 + 0.5) * exp(-pow((rad - 0.22) / 0.26, 2.0));
  vec3 hazeCol = mix(uPurple, uTeal, 0.5 + 0.5 * sin(th * 2.0 + t * 0.03));
  // The opening itself.
  float coreR = 0.055 + uOpen * 1.5;
  float core = exp(-pow(rad / coreR, 2.0) * 2.0);
  vec3 coreCol = mix(vec3(0.82, 0.78, 1.0), vec3(1.0), smoothstep(0.0, 0.6, uOpen));
  vec3 c = rayCol * rays * rayFall * (0.16 + 0.12 * uWake)
         + haloCol * halo * (0.07 + 0.09 * uWake)
         + hazeCol * haze * 0.085
         + coreCol * core * (0.32 + 0.32 * uWake + uOpen * 3.2);
  return c * strength * (0.6 + 0.4 * lines);
}

// The gate's glow without its hairlines (no derivatives, so it is safe inside the lake branch and cheap).
vec3 gateGlow(vec3 d, float strength) {
  vec3 f = normalize(uGateDir);
  float rad = acos(clamp(dot(d, f), -1.0, 1.0));
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = normalize(cross(r, f));
  float th = atan(dot(d, u), dot(d, r));
  float ring = exp(-pow((rad - 0.2) / 0.14, 2.0)) * (0.5 + 0.5 * sin(th * 5.0 - log(rad + 0.02) * 2.3 * 6.2831853 / 5.0 + uTime * 0.1));
  vec3 col = mix(uViolet, uGreen, 0.5 + 0.5 * sin(th + uTime * 0.035));
  float coreR = 0.05 + uOpen * 1.5;
  float core = exp(-pow(rad / coreR, 2.0) * 2.0);
  return (col * ring * 0.12 + vec3(0.8, 0.76, 1.0) * core * (0.28 + 0.3 * uWake + uOpen * 3.2)) * strength;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(vec3(0.005, 0.006, 0.016), vec3(0.019, 0.021, 0.052), smoothstep(-0.15, 0.9, y));
  col += vec3(0.04, 0.032, 0.08) * exp(-abs(y) * 9.0);
  float sky = smoothstep(-0.03, 0.04, y);
  float front = 0.42 + 0.58 * smoothstep(-0.35, 0.75, -d.z);
  col += vec3(0.86, 0.88, 1.0) * stars(d) * sky * (1.0 - uOpen);
  col += texture2D(uAurora, equirect(d)).rgb * sky * front * (0.5 + 0.5 * uWake) * (1.0 - uOpen * 0.85);
  col += gate(d, uGateStrength, 1.0);
  // A still lake below the horizon: the gate's glow mirrored and softened (no hairlines, so it never competes).
  float below = smoothstep(0.004, -0.03, y);
  if (below > 0.0) {
    vec3 rd = vec3(d.x, -y, d.z);
    rd.x += snoise(vec3(d.xz * 30.0, uTime * 0.16)) * 0.006 * (1.0 + uOpen);
    float fres = 0.08 + 0.35 * pow(1.0 - min(1.0, -y * 3.0), 4.0);
    col += gateGlow(normalize(rd), uGateStrength * 0.55) * fres * below;
  }
  col = mix(col, vec3(0.94, 0.945, 0.965), uWhite);
  gl_FragColor = vec4(col * uFade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const AURORA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime, uQuality;
uniform vec3 uGreen, uTeal, uViolet, uPurple;
${HASH}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float tri(float x) { return clamp(abs(fract(x) - 0.5), 0.01, 0.49); }
vec2 tri2(vec2 p) { return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x))); }
// Triangle-wave noise for aurora curtains (after nimitz's "Auroras", 2017).
float triNoise2d(vec2 p, float spd) {
  float z = 1.8, z2 = 2.5, rz = 0.0;
  p *= rot(p.x * 0.06);
  vec2 bp = p;
  for (int i = 0; i < 5; i++) {
    vec2 dg = tri2(bp * 1.85) * 0.75;
    dg *= rot(uTime * spd);
    p -= dg / z2;
    bp *= 1.3; z2 *= 0.45; z *= 0.42;
    p *= 1.21 + (rz - 1.0) * 0.02;
    rz += tri(p.x + tri(p.y)) * z;
    p *= -mat2(0.95534, 0.29552, -0.29552, 0.95534);
  }
  return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.55);
}

vec3 aurora(vec3 d) {
  vec3 acc = vec3(0.0), avg = vec3(0.0);
  float n = mix(9.0, 30.0, uQuality);
  float stride = 30.0 / n;
  for (int i = 0; i < 30; i++) {
    float fi = float(i) * stride;
    if (float(i) >= n) break;
    float jitter = 0.006 * hash12(gl_FragCoord.xy) * smoothstep(0.0, 15.0, fi);
    float pt = (0.8 + pow(fi, 1.4) * 0.002) / (d.y * 2.0 + 0.4) - jitter;
    vec2 bp = d.zx * pt + vec2(uTime * 0.01, 0.0);
    float rzt = triNoise2d(bp, 0.045);
    float k = fi / 30.0;
    vec3 c = mix(uGreen, uTeal, smoothstep(0.0, 0.22, k));
    c = mix(c, uViolet, smoothstep(0.18, 0.55, k));
    c = mix(c, uPurple, smoothstep(0.5, 1.0, k));
    avg = mix(avg, c * rzt, 0.5);
    acc += avg * exp2(-fi * 0.065 - 2.5) * smoothstep(0.0, 5.0, fi) * stride;
  }
  return acc * clamp(d.y * 15.0 + 0.4, 0.0, 1.0) * 1.8;
}

void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.14159265;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
  gl_FragColor = vec4(d.y > -0.05 ? aurora(d) : vec3(0.0), 1.0);
}`;

const lin = (hex: string) => new THREE.Color(hex); // THREE.Color parses hex as sRGB and stores linear

export function AuroraSky({ quality = 1 }: { quality?: number }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  // The aurora curtains are soft, so they are painted into a small equirectangular texture (refreshed every other
  // frame); only the gate's hairlines and the stars are drawn at full resolution.
  const aurora = useMemo(() => {
    const w = quality >= 0.9 ? 1024 : 768;
    const target = new THREE.WebGLRenderTarget(w, w / 2, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: AURORA_FRAG,
      depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uQuality: { value: Math.max(0.35, quality) }, uGreen: { value: lin('#3ee8b0') }, uTeal: { value: lin('#2fc4d6') }, uViolet: { value: lin('#8a6cff') }, uPurple: { value: lin('#c38cff') } },
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return { target, mat, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), frame: 0 };
  }, [quality]);
  useEffect(() => () => { aurora.target.dispose(); aurora.mat.dispose(); }, [aurora]);
  useFrame((_, dt) => {
    aurora.mat.uniforms.uTime!.value += Math.min(dt, 0.05);
    if (!mesh.current?.visible) return;
    if (aurora.frame++ % 2 && aurora.frame > 2) return;
    const xr = gl.xr.enabled;
    const prev = gl.getRenderTarget();
    gl.xr.enabled = false; // an offscreen pass, not a headset view
    gl.setRenderTarget(aurora.target);
    gl.render(aurora.scene, aurora.cam);
    gl.setRenderTarget(prev);
    gl.xr.enabled = xr;
  }, -1);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 }, uFade: { value: 1 }, uWake: { value: 0 }, uOpen: { value: 0 }, uWhite: { value: 0 },
      uQuality: { value: quality }, uGateStrength: { value: 1 }, uAurora: { value: aurora.target.texture },
      uGateDir: { value: new THREE.Vector3(0, 0.12, -1).normalize() },
      uGreen: { value: lin('#3ee8b0') }, uTeal: { value: lin('#2fc4d6') }, uViolet: { value: lin('#8a6cff') },
      uPurple: { value: lin('#c38cff') }, uSilver: { value: lin('#eef0fb') },
    },
  }), [quality, aurora]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const u = material.uniforms;
    u.uTime!.value += dt;
    const awake = s.stage !== 'portal' ? 1 : 0;
    const p = s.enterProgress;
    const entering = s.stage === 'entering';
    const day = s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving';
    const album = s.stage === 'album';
    u.uWake!.value = damp(u.uWake!.value, album ? 0.55 : awake, 1.6, dt);
    u.uOpen!.value = entering ? p : damp(u.uOpen!.value, 0, 2.5, dt);
    u.uWhite!.value = entering ? THREE.MathUtils.smoothstep(p, 0.62, 0.98) : damp(u.uWhite!.value, day ? 1 : 0, 2, dt);
    // In the palace world the aurora never shows (the palace is the album's backdrop too).
    const elsewhere = s.world === 'palace';
    if (elsewhere) u.uFade!.value = 0;
    u.uFade!.value = damp(u.uFade!.value, day || elsewhere ? 0 : 1, 1.4, dt);
    u.uGateStrength!.value = damp(u.uGateStrength!.value, album ? 0.55 : 1, 1.2, dt);
    if (group.current) group.current.position.copy(camera.position);
    if (mesh.current) mesh.current.visible = u.uFade!.value > 0.004;
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} frustumCulled={false} renderOrder={-1000} material={material}>
        <sphereGeometry args={[60, 64, 40]} />
      </mesh>
    </group>
  );
}
