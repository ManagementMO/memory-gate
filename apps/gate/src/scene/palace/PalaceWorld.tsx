// The Palace world: the Palace of Fine Arts at a pastel golden hour, the second world you can begin in. You stand
// across the still lagoon from the rotunda; when you are ready the companion leads you over the water, under the dome,
// where light gathers from the oculus and the memory forms. All round you lies the rest of the site, as on the map: the
// park and its paths, the exhibition hall, Baker Street's houses, the harbour and the bay with the Golden Gate, the
// hills (site.ts, grounds.ts, surroundings.ts). Built once from procedural geometry (see geometry.ts) and a sky painted
// once; per frame only a few uniforms, a dozen stepping stones and the motes move.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGate, type Stage } from '../../state/store';
import { HASH, SIMPLEX3 } from '../shaders/noise.glsl';
import { damp, glowBlending } from '../util';
import { balustrade, colonnade, columnGeometry, columnSpots, figureGeometry, lilyPads, planting, rotunda, terrace } from './geometry';
import { siteMap } from './grounds';
import { PAL, ROSSO, STONE, palaceMaterial, palaceMaterials } from './materials';
import { GLOW_DIR, LAGOON, R, ROT, SHORE, SUN_DIR, WATER_Y, flatWhite, sc, xrWhite } from './plan';
import { treeSpots } from './site';
import { paintClouds, skyEnvironment, skyMaterial } from './sky';
import { CROWN, buildGrounds } from './surroundings';

/** The palace is the world before the memory, and the album's backdrop after it. */
const PRE: readonly Stage[] = ['portal', 'greeting', 'gathering', 'entering', 'album'];
const lin = (hex: string) => new THREE.Color(hex);

const WATER_FRAG = /* glsl */ `
varying vec3 vW;
uniform float uTime, uWhite, uHazeDen;
uniform vec3 uTint, uSunDir, uWhiteCol, uHazeCool, uHazeWarm, uGlint, uSheen;
${HASH}
${SIMPLEX3}
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec2 p = vW.xz;
  float n1 = snoise(vec3(p * 0.32, uTime * 0.1));
  float n2 = snoise(vec3(p * 1.05 + 7.0, uTime * 0.16));
  vec3 N = normalize(vec3((n1 * 0.6 + n2 * 0.35) * 0.035, 1.0, (n2 * 0.6 - n1 * 0.25) * 0.035));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  // Long, slow ripple bands across the water break the mirror into a living surface.
  float band = snoise(vec3(p.x * 0.09, p.y * 1.25, uTime * 0.22));
  float a = mix(0.5, 0.1, fres) * (0.86 + 0.28 * band);
  vec3 col = uTint * a;
  // More sky at grazing angles: a soft sheen of the horizon over the far water.
  col += uSheen * (fres * 0.32 + max(band, 0.0) * 0.035);
  // A few glints toward the low sun's glow, sparkling and gone.
  float sp = snoise(vec3(p * 4.2, uTime * 0.6));
  float toward = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 28.0);
  col += uGlint * smoothstep(0.86, 0.97, sp) * toward * 1.4;
  float d = length(vW - cameraPosition);
  float sunward = pow(max(dot(-V, uSunDir), 0.0), 3.0);
  vec3 haze = mix(uHazeCool, uHazeWarm, 0.35 + 0.65 * sunward);
  float h = (1.0 - exp(-pow(d * uHazeDen, 1.6))) * 0.9 * smoothstep(4.0, 16.0, d);
  a = mix(a, 1.0, h * 0.5);
  col = mix(col, haze * a, h);
  col = mix(col, uWhiteCol * mix(a, 1.0, uWhite), uWhite);
  a = mix(a, 1.0, uWhite);
  gl_FragColor = vec4(col, a);
}`;

const STONE_GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uGlow;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = exp(-pow((r - 0.62) / 0.16, 2.0)) * 0.7 + exp(-r * r * 3.0) * 0.25;
  gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * ring * uGlow, 1.0);
}`;

const SHAFT_FRAG = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vY;
uniform float uAmt, uTime;
void main() {
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float fall = smoothstep(0.0, 0.25, vY) * (0.55 + 0.45 * vY);
  float a = edge * fall * uAmt * (0.85 + 0.15 * sin(uTime * 0.6 + vY * 4.0));
  gl_FragColor = vec4(vec3(1.0, 0.88, 0.7) * a * 0.32, 1.0);
}`;

const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uPx;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime * (0.08 + aSeed.y * 0.1);
  p.y = mod(p.y + t, 14.0) + 0.2;
  p.x += sin(uTime * 0.09 + aSeed.x * 40.0) * 0.6;
  p.z += cos(uTime * 0.07 + aSeed.z * 40.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = smoothstep(0.2, 1.2, p.y) * (1.0 - smoothstep(11.0, 14.0, p.y)) * (0.45 + 0.55 * sin(uTime * (0.3 + aSeed.w * 0.4) + aSeed.x * 60.0));
  gl_PointSize = clamp((0.03 + aSeed.w * 0.05) * uPx / max(0.1, -mv.z), 1.0, 8.0);
}`;
const MOTE_FRAG = /* glsl */ `
uniform float uFade;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * exp(-r * 3.0) * vA * uFade * 0.75, 1.0);
}`;

export function PalaceWorld({ quality }: { quality: number }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const sky = useRef<THREE.Mesh>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const stonesRef = useRef<THREE.InstancedMesh>(null);
  const stoneGlowRef = useRef<THREE.InstancedMesh>(null);
  const shadows = quality >= 0.9;

  const built = useMemo(() => {
    const clouds = paintClouds(gl, quality >= 0.9 ? 1024 : 768);
    const env = skyEnvironment(gl, clouds.texture);
    // The site map the floor is painted from: paths, streets, and the shade pooled under every tree on the lawns.
    const lawnTrees = treeSpots();
    const pools = (list: { x: number; z: number; s: number }[], r: number) => list.map((s) => ({ x: s.x, z: s.z, r: r * s.s }));
    const site = siteMap(quality, [...pools(lawnTrees.willow, CROWN.willow), ...pools(lawnTrees.cypress, CROWN.cypress), ...pools(lawnTrees.eucalyptus, CROWN.eucalyptus), ...pools(lawnTrees.park, CROWN.park)]);
    const mats = palaceMaterials(env, quality, site);
    const skyMat = skyMaterial(clouds.texture, true);
    const rot = rotunda(quality);
    const col = colonnade();
    const ter = terrace();
    const spots = columnSpots();
    const colGeo = quality >= 0.9 ? columnGeometry(20) : columnGeometry(12, false); // volutes only where they can be seen
    const mirrorColGeo = columnGeometry(8, false);
    const colMatrices = spots.map((c) => {
      const w = sc(R.colR) / (0.05 * c.h);
      return new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw), new THREE.Vector3(c.h * w, c.h, c.h * w));
    });
    const colColors = spots.map((c) => (c.red ? ROSSO : STONE));
    // The weeping women at the planter boxes' corners (the rotunda's statues are carved into its stone).
    const figures = col.figures;
    const figGeo = figureGeometry();
    // The near plane: a balustrade on the shore, planting at the sides, lily pads by the edges.
    const bal = balustrade();
    const plant = planting();
    const lily = lilyPads();
    const leaf = { roughness: 0.95, metalness: 0, envMapIntensity: 0.16 };
    const green = {
      cypress: palaceMaterial({ ...leaf, color: '#4e5c47' }, {}, env),
      cypressMirror: palaceMaterial({ ...leaf, color: '#4e5c47' }, { mirror: true }, env),
      pad: palaceMaterial({ color: '#a3b493', roughness: 0.42, metalness: 0, envMapIntensity: 0.75 }, {}, env),
    };
    const water = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      uniforms: {
        uTime: { value: 0 }, uWhite: PAL.uPalWhite, uHazeDen: PAL.uPalHazeDen, uTint: { value: lin('#46508a') }, uSunDir: { value: GLOW_DIR.clone() },
        uWhiteCol: PAL.uPalWhiteCol, uHazeCool: PAL.uPalHazeCool, uHazeWarm: PAL.uPalHazeWarm, uGlint: { value: lin('#fff0d8') }, uSheen: { value: lin('#e6d6e6') },
      },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: WATER_FRAG,
    });
    // Everything round the palace: the park, the hall, the streets and houses, the harbour, the hills and the bay.
    const grounds = buildGrounds({ env, quality, shadows: quality >= 0.9, stone: mats.marble, water });
    // Stepping stones of light that rise ahead of you as the companion leads the way across the water.
    const stoneZ: number[] = [];
    for (let z = LAGOON.cz + LAGOON.hd - 1.1; z > LAGOON.cz - LAGOON.hd + 0.6; z -= 1.55) stoneZ.push(z);
    const stoneGeo = new THREE.CylinderGeometry(0.62, 0.66, 0.16, 40);
    const stoneMat = palaceMaterial({ color: '#f3ede4', roughness: 0.35, metalness: 0, envMapIntensity: 0.9, emissive: lin('#ffd9a0'), emissiveIntensity: 0.0 }, {}, env);
    const glowMat = glowBlending(new THREE.ShaderMaterial({ uniforms: { uGlow: { value: 0 } }, vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`, fragmentShader: STONE_GLOW_FRAG, depthWrite: false }));
    // Oculus: the light at the top of the dome, and the shaft it pours down the middle as you arrive.
    const oculusMat = glowBlending(new THREE.MeshBasicMaterial({ color: lin('#fff1dc'), toneMapped: false }));
    const shaftH = rot.oculus.y - 0.2;
    const shaftGeo = new THREE.CylinderGeometry(sc(R.oculus) * 0.9, sc(R.oculus) * 2.4, shaftH, 40, 1, true).translate(ROT.x, shaftH / 2, ROT.z);
    const shaftMat = glowBlending(new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; vY = clamp(w.y / ${shaftH.toFixed(2)}, 0.0, 1.0); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: SHAFT_FRAG,
    }));
    // Motes of warm light drifting up through the air between you and the rotunda.
    const MOTES = quality >= 0.9 ? 700 : 360;
    const mpos = new Float32Array(MOTES * 3);
    const mseed = new Float32Array(MOTES * 4);
    for (let i = 0; i < MOTES; i++) {
      mpos.set([(Math.random() - 0.5) * 46, Math.random() * 14, -10 + Math.random() * 56], i * 3);
      mseed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(mseed, 4));
    const moteMat = glowBlending(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPx: { value: 900 }, uFade: { value: 1 } }, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG }));
    return { clouds, env, site, grounds, mats, skyMat, rot, col, ter, colGeo, mirrorColGeo, colMatrices, colColors, figures, figGeo, bal, plant, lily, green, water, stoneZ, stoneGeo, stoneMat, glowMat, oculusMat, shaftGeo, shaftMat, moteGeo, moteMat };
  }, [gl, quality]);

  useEffect(() => () => {
    built.clouds.dispose();
    built.env.dispose();
    built.skyMat.dispose();
    built.water.dispose();
    built.site.texture.dispose();
    built.grounds.dispose();
  }, [built]);

  // Instanced columns and figures (and their reflections) get their matrices once.
  const colRef = useRef<THREE.InstancedMesh>(null);
  const colMirrorRef = useRef<THREE.InstancedMesh>(null);
  const figRef = useRef<THREE.InstancedMesh>(null);
  const figMirrorRef = useRef<THREE.InstancedMesh>(null);
  const balRef = useRef<THREE.InstancedMesh>(null);
  const balMirrorRef = useRef<THREE.InstancedMesh>(null);
  const cypRef = useRef<THREE.InstancedMesh>(null);
  const cypMirrorRef = useRef<THREE.InstancedMesh>(null);
  const padRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const sets = [
      [colRef, built.colMatrices], [colMirrorRef, built.colMatrices], [figRef, built.figures], [figMirrorRef, built.figures],
      [balRef, built.bal.balusters], [balMirrorRef, built.bal.balusters], [cypRef, built.plant.cypresses], [cypMirrorRef, built.plant.cypresses],
      [padRef, built.lily.pads],
    ] as const;
    for (const [ref, list] of sets) {
      const m = ref.current;
      if (!m) continue;
      list.forEach((mat, i) => m.setMatrixAt(i, mat));
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    // The columns take their stone from their instance: sand for the colonnades, red for the rotunda.
    for (const m of [colRef.current, colMirrorRef.current]) {
      if (!m) continue;
      built.colColors.forEach((c, i) => m.setColorAt(i, c));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [built]);

  // On first load the palace simply appears; coming back to it later (from the album) it clears out of white.
  const live = useRef<{ white: number; oculus: number; wasShown: boolean; everShown: boolean; warmFor: unknown; warmFrames: number; culled: Set<THREE.Object3D> }>({
    white: 0, oculus: 0, wasShown: false, everShown: false, warmFor: null, warmFrames: 0, culled: new Set(),
  });
  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const _s = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const shown = s.world === 'palace' && PRE.includes(s.stage);
    const L = live.current;
    const g = group.current;
    if (!shown) {
      if (g) g.visible = false;
      if (sun.current) sun.current.intensity = 0;
      if (hemi.current) hemi.current.intensity = 0;
      L.wasShown = false;
      return;
    }
    if (!L.wasShown) { L.white = L.everShown && s.stage !== 'entering' ? 1 : 0; L.wasShown = true; L.everShown = true; }
    if (g) g.visible = true;
    // The first frames the palace is shown, draw all of it, behind you too, so every shader it and its grounds use is
    // compiled at once while the page is still arriving, not one by one the first time you turn toward each (a
    // stutter in the headset). Drawn for real, so each compiles exactly as it will be used.
    if (g && L.warmFor !== built) {
      L.warmFor = built;
      L.warmFrames = 2;
      L.culled.clear();
      g.traverse((o) => { if (o.frustumCulled) { L.culled.add(o); o.frustumCulled = false; } });
    } else if (L.warmFrames > 0 && --L.warmFrames === 0) {
      for (const o of L.culled) o.frustumCulled = true;
      L.culled.clear();
    }
    const t = state.clock.elapsedTime;
    const entering = s.stage === 'entering';
    const p = entering ? s.enterProgress : 0;
    const xr = gl.xr.isPresenting;
    // Arriving from the toggle (or from the album) the palace clears out of white; the walk dissolves it again.
    L.white = damp(L.white, 0, 2.2, dt);
    const walk = entering ? (xr ? xrWhite(p) : flatWhite(p)) : 0;
    PAL.uPalWhite.value = Math.max(L.white, walk);
    PAL.uPalTime.value = t;
    PAL.uPalShadeFake.value = shadows && !xr ? 0.35 : 1;
    L.oculus = damp(L.oculus, entering ? THREE.MathUtils.smoothstep(p, xr ? 0.42 : 0.55, 0.9) : 0, 3, dt);
    PAL.uPalOculus.value = L.oculus;
    const u = built.skyMat.uniforms;
    u.uWhite!.value = PAL.uPalWhite.value;
    u.uShift!.value = t * 0.00015;
    // The sky is centred on your eyes. (In the headset the camera hangs under the XR origin at the shore, so its own
    // position is only the head's offset from there: take its world position.)
    if (sky.current) camera.getWorldPosition(sky.current.position);
    built.water.uniforms.uTime!.value = t;
    built.shaftMat.uniforms.uAmt!.value = L.oculus * (1 - PAL.uPalWhite.value * 0.6);
    built.shaftMat.uniforms.uTime!.value = t;
    built.moteMat.uniforms.uTime!.value = t;
    built.moteMat.uniforms.uPx!.value = state.size.height * state.viewport.dpr * 0.9;
    built.moteMat.uniforms.uFade!.value = 1 - PAL.uPalWhite.value;
    built.oculusMat.color.setRGB(1, 0.94, 0.86).multiplyScalar(0.55 + L.oculus * 2.4);
    const lightK = 1 - PAL.uPalWhite.value * 0.6;
    if (sun.current) sun.current.intensity = 4.6 * lightK;
    if (hemi.current) hemi.current.intensity = 0.27 * lightK;

    // Stepping stones: each rises a little ahead of the walk and glows as it surfaces.
    const stones = stonesRef.current, glows = stoneGlowRef.current;
    if (stones && glows) {
      const front = entering ? THREE.MathUtils.lerp(SHORE.z + 2, ROT.z, Math.min(1, p / 0.62)) - 9 : 999;
      let anyUp = false;
      built.stoneZ.forEach((z, i) => {
        const up = entering ? THREE.MathUtils.smoothstep(z, front + 9, front) : 0;
        if (up > 0.001) anyUp = true;
        _v.set(0, THREE.MathUtils.lerp(WATER_Y - 0.5, -0.06, up) + Math.sin(t * 0.8 + i) * 0.01 * up, z);
        _q.setFromAxisAngle(_s.set(0, 1, 0), i * 0.7);
        const k = 0.6 + 0.4 * up;
        _m.compose(_v, _q, _s.set(k, 1, k));
        stones.setMatrixAt(i, _m);
        _v.y = WATER_Y + 0.01;
        _q.setFromAxisAngle(_s.set(1, 0, 0), -Math.PI / 2);
        _m.compose(_v, _q, _s.setScalar(2.6 * (0.4 + 0.6 * up)));
        glows.setMatrixAt(i, _m);
      });
      stones.instanceMatrix.needsUpdate = true;
      glows.instanceMatrix.needsUpdate = true;
      stones.visible = anyUp;
      glows.visible = anyUp;
      (glows.material as THREE.ShaderMaterial).uniforms.uGlow!.value = (1 - PAL.uPalWhite.value) * 0.55;
      built.stoneMat.emissiveIntensity = 0.12;
    }
  });

  const m = built.mats;
  const mm = built.mats.mirror;
  const sunTarget = useMemo(() => { const o = new THREE.Object3D(); o.position.set(0, 0, 12); return o; }, []);
  return (
    <group ref={group} visible={false}>
      <mesh ref={sky} material={built.skyMat} frustumCulled={false} renderOrder={-1000}>
        <sphereGeometry args={[60, 64, 40]} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#b9c0ef', '#e8cfb2', 0]} />
      <primitive object={sunTarget} />
      <directionalLight ref={sun} color="#ffdfba" intensity={0} position={[SUN_DIR.x * 90, SUN_DIR.y * 90, 12 + SUN_DIR.z * 90]} target={sunTarget}
        castShadow={shadows} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0006} shadow-normalBias={0.04}
        shadow-camera-left={-48} shadow-camera-right={48} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-near={20} shadow-camera-far={180} />

      {/* The palace */}
      <instancedMesh ref={colRef} args={[built.colGeo, m.column, built.colMatrices.length]} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={built.rot.marble} material={m.marble} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={built.rot.detail} material={m.marble} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={built.rot.relief} material={m.relief} receiveShadow={shadows} />
      <mesh geometry={built.rot.dome} material={m.dome} castShadow={shadows} />
      <mesh geometry={built.rot.ceiling} material={m.ceiling} />
      <mesh position={built.rot.oculus} rotation-x={Math.PI / 2} material={built.oculusMat} renderOrder={5}>
        <circleGeometry args={[sc(R.oculus), 40]} />
      </mesh>
      <mesh geometry={built.shaftGeo} material={built.shaftMat} renderOrder={12} frustumCulled={false} />
      <mesh geometry={built.col.marble} material={m.marble} castShadow={shadows} receiveShadow={shadows} />
      <mesh geometry={built.col.relief} material={m.relief} />
      <instancedMesh ref={figRef} args={[built.figGeo, m.marble, built.figures.length]} castShadow={shadows} />
      <mesh geometry={built.ter.floor} material={m.terrace} receiveShadow={shadows} />
      <mesh geometry={built.ter.rim} material={m.marble} receiveShadow={shadows} />
      <mesh geometry={built.bal.rails} material={m.marble} castShadow={shadows} receiveShadow={shadows} />
      <instancedMesh ref={balRef} args={[built.bal.baluster, m.marble, built.bal.balusters.length]} castShadow={shadows} />
      <instancedMesh ref={cypRef} args={[built.plant.cypress, built.green.cypress, built.plant.cypresses.length]} castShadow={shadows} />
      <instancedMesh ref={padRef} args={[built.lily.pad, built.green.pad, built.lily.pads.length]} />
      {/* The grounds round it: the park, the hall behind the colonnades, the streets, the harbour, the hills, the bay. */}
      <primitive object={built.grounds.main} />

      {/* Its reflection: the same shapes mirrored under the water's surface, lit as they are above it. */}
      <group position={[0, 2 * WATER_Y, 0]} scale={[1, -1, 1]}>
        <instancedMesh ref={colMirrorRef} args={[built.mirrorColGeo, mm.column, built.colMatrices.length]} />
        <mesh geometry={built.rot.marble} material={mm.marble} />
        <mesh geometry={built.rot.relief} material={mm.relief} />
        <mesh geometry={built.rot.dome} material={mm.dome} />
        <mesh geometry={built.col.marble} material={mm.marble} />
        <instancedMesh ref={figMirrorRef} args={[built.figGeo, mm.marble, built.figures.length]} />
        <mesh geometry={built.bal.rails} material={mm.marble} />
        <instancedMesh ref={balMirrorRef} args={[built.bal.baluster, mm.marble, built.bal.balusters.length]} />
        <instancedMesh ref={cypMirrorRef} args={[built.plant.cypress, built.green.cypressMirror, built.plant.cypresses.length]} />
        <primitive object={built.grounds.mirror} />
      </group>
      <mesh geometry={built.ter.water} material={built.water} renderOrder={2} />

      <instancedMesh ref={stonesRef} args={[built.stoneGeo, built.stoneMat, built.stoneZ.length]} frustumCulled={false} />
      <instancedMesh ref={stoneGlowRef} args={[new THREE.PlaneGeometry(1, 1), built.glowMat, built.stoneZ.length]} frustumCulled={false} renderOrder={3} />
      <points geometry={built.moteGeo} material={built.moteMat} frustumCulled={false} renderOrder={20} />
    </group>
  );
}
