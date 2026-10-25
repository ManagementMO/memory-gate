// A showcase place, built from its scene (the scene lab's format: src/showcase/scenes/<name>.json and its script):
// its sky (a Poly Haven HDRI), sun, fog, ground, a field of grass, the models placed and scattered, and whatever the
// scene's own script adds. Everything goes into one group; the sky and fog are handed back for the scene to wear.
// Assets are served from /showcase/ (scripts/prepare-showcase.mjs; not in git). Ported from the lab's viewer.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const DEG = Math.PI / 180;
const BASE = '/showcase';
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/**
 * @param {{ spec: any, script?: (api: any) => Promise<void>, renderer: THREE.WebGLRenderer, camera: THREE.Camera, grass?: number }} o
 *   grass: how much of the scene's grass to grow (1 on a desktop, much less in a headset)
 */
export async function buildShowcase({ spec, script, renderer, camera, grass: grassScale = 1 }) {
  const scene = new THREE.Group();
  scene.name = `showcase-${spec.title ?? ''}`;
  const env = spec.env ?? {};
  const out = { group: scene, hdr: null, envMap: null, background: null, fog: null, exposure: env.exposure ?? 1, envIntensity: env.envIntensity ?? 1, backgroundIntensity: env.backgroundIntensity ?? 1, backgroundBlur: env.backgroundBlur ?? 0, rotation: (env.hdriRotation ?? 0) * DEG, uniforms: [], held: [], place: null };
  const waits = [];

  // ---------- sky ----------
  if (env.hdri) {
    waits.push(new HDRLoader().loadAsync(`${BASE}/hdri/${env.hdri}.hdr`).then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      out.envMap = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      out.hdr = tex;
      if ((env.background ?? 'hdri') === 'hdri') out.background = tex;
    }).catch((e) => console.warn('[showcase] sky', e)));
  }
  if (env.background && env.background !== 'hdri') out.background = new THREE.Color(env.background);
  if (env.fog) out.fog = env.fog.density ? new THREE.FogExp2(env.fog.color, env.fog.density) : new THREE.Fog(env.fog.color, env.fog.near ?? 30, env.fog.far ?? 300);

  if (env.sun !== null) {
    const s = env.sun ?? {};
    const sun = new THREE.DirectionalLight(s.color ?? '#fff4e0', s.intensity ?? 3);
    const dir = new THREE.Vector3(...(s.dir ?? [0.5, 0.8, 0.3])).normalize();
    const c = new THREE.Vector3(...(s.center ?? [0, 0, 0]));
    sun.position.copy(c).addScaledVector(dir, 150);
    sun.target.position.copy(c);
    sun.castShadow = s.shadows !== false;
    const a = s.shadowArea ?? 40;
    Object.assign(sun.shadow.camera, { left: -a, right: a, top: a, bottom: -a, near: 1, far: 400 });
    sun.shadow.mapSize.set(grassScale < 0.5 ? 1024 : 2048, grassScale < 0.5 ? 1024 : 2048);
    sun.shadow.bias = s.bias ?? -0.0004;
    sun.shadow.normalBias = s.normalBias ?? 0.03;
    scene.add(sun, sun.target);
  }
  if (env.hemi) scene.add(new THREE.HemisphereLight(env.hemi.sky ?? '#cfe3ff', env.hemi.ground ?? '#5a4a3a', env.hemi.intensity ?? 0.6));
  for (const l of spec.lights ?? []) {
    let light;
    if (l.type === 'spot') {
      light = new THREE.SpotLight(l.color ?? '#ffe2b8', l.intensity ?? 20, l.distance ?? 0, (l.angle ?? 40) * DEG, l.penumbra ?? 0.5, l.decay ?? 2);
      light.target.position.set(...(l.target ?? [l.p[0], 0, l.p[2]]));
      scene.add(light.target);
    } else light = new THREE.PointLight(l.color ?? '#ffe2b8', l.intensity ?? 10, l.distance ?? 0, l.decay ?? 2);
    light.position.set(...l.p);
    if (l.shadow && grassScale >= 0.5) { light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.001; }
    scene.add(light);
  }

  // ---------- textures (Poly Haven sets: textures/<id>/{diff,nor,rough}.jpg) ----------
  const texCache = new Map();
  function texSet(id, repeat) {
    const key = `${id}@${repeat}`;
    if (texCache.has(key)) return texCache.get(key);
    const load = (f, srgb) => {
      const t = texLoader.load(`${BASE}/textures/${id}/${f}`, undefined, undefined, () => {});
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const set = { map: load('diff.jpg', true), normalMap: load('nor.jpg'), roughnessMap: load('rough.jpg') };
    texCache.set(key, set);
    return set;
  }
  function surfaceMaterial(o, w, h) {
    const m = new THREE.MeshStandardMaterial({ color: o.color ?? '#ffffff', roughness: o.roughness ?? 1, metalness: 0, side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
    if (o.texture) {
      const tile = o.tile ?? 2;
      Object.assign(m, texSet(o.texture, [w / tile, h / tile]));
      if (o.normalScale) m.normalScale.set(o.normalScale, o.normalScale);
    }
    if (o.image) {
      m.map = texLoader.load(o.image.startsWith('/') ? `${BASE}${o.image}` : `${BASE}/${o.image}`);
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.map.anisotropy = 8;
      m.transparent = !!o.transparent;
      m.alphaTest = o.transparent ? 0.02 : 0;
      m.depthWrite = !o.transparent;
    }
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
    return m;
  }

  // ---------- ground ----------
  if (env.ground !== null) {
    const g = env.ground ?? {};
    const size = Math.min(g.size ?? 400, 600);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), surfaceMaterial({ texture: g.texture, tile: g.tile ?? 4, color: g.color ?? '#7a8a5a', roughness: 1 }, size, size));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = g.y ?? 0;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---------- models ----------
  const modelCache = new Map();
  function loadModel(id) {
    if (!modelCache.has(id)) modelCache.set(id, gltfLoader.loadAsync(`${BASE}/models/${id}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          for (const m of [o.material].flat()) if (m?.map) m.map.anisotropy = 8;
        }
      });
      return g.scene;
    }));
    return modelCache.get(id);
  }
  function normalized(src, it) {
    let obj = src.clone(true);
    if (it.part) {
      const want = [it.part].flat();
      const keep = [];
      obj.updateMatrixWorld(true);
      obj.traverse((o) => { if (o.isMesh && want.some((w) => o.name.includes(w) || o.parent?.name.includes(w))) keep.push(o); });
      const g = new THREE.Group();
      for (const k of keep) { const c = k.clone(); k.matrixWorld.decompose(c.position, c.quaternion, c.scale); g.add(c); }
      obj = g;
    }
    const wrap = new THREE.Group();
    wrap.add(obj);
    obj.rotation.set((it.rx ?? 0) * DEG, 0, (it.rz ?? 0) * DEG);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    if (!it.raw) obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    let s = it.s ?? 1;
    if (it.h) s = it.h / size.y;
    else if (it.w) s = it.w / Math.max(size.x, size.z);
    else if (it.len) s = it.len / Math.max(size.x, size.y, size.z);
    wrap.scale.setScalar(s);
    return wrap;
  }
  async function placeItem(it) {
    if (it.box || it.plane) return placeSurface(it);
    const src = await loadModel(it.m);
    const node = normalized(src, it);
    node.rotation.y = (it.ry ?? 0) * DEG;
    node.position.set(...(it.p ?? [0, 0, 0]));
    if (it.tint) node.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiply(new THREE.Color(it.tint)); } });
    if (it.noShadow) node.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    if (it.hide) node.traverse((o) => { if (it.hide.some((h) => o.name.includes(h))) o.visible = false; });
    if (it.repeat) {
      for (let i = 0; i < it.repeat.n; i++) {
        const c = i === 0 ? node : node.clone(true);
        c.position.set(it.p[0] + it.repeat.step[0] * i, it.p[1] ?? 0, it.p[2] + it.repeat.step[1] * i);
        scene.add(c);
      }
      return node;
    }
    scene.add(node);
    return node;
  }
  function placeSurface(it) {
    let mesh;
    if (it.box) {
      const [x, y, z] = it.box.size;
      const geo = new THREE.BoxGeometry(x, y, z);
      const uv = geo.attributes.uv;
      const faces = [[z, y], [z, y], [x, z], [x, z], [x, y], [x, y]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * faces[f][0], uv.getY(i) * faces[f][1]); }
      const mat = surfaceMaterial({ ...it.box }, 1, 1);
      for (const k of ['map', 'normalMap', 'roughnessMap']) if (mat[k]) { mat[k] = mat[k].clone(); mat[k].repeat.set(1 / (it.box.tile ?? 2), 1 / (it.box.tile ?? 2)); }
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(it.p[0], (it.p[1] ?? 0) + y / 2, it.p[2]);
    } else {
      const [w, d] = it.plane.size;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), surfaceMaterial(it.plane, w, d));
      mesh.rotation.x = it.plane.vertical ? 0 : -Math.PI / 2;
      mesh.position.set(...it.p);
    }
    mesh.rotation.y = (it.ry ?? 0) * DEG;
    mesh.castShadow = !it.noShadow && !!it.box;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ---------- scatter ----------
  function inArea(x, z, a) {
    if (Array.isArray(a)) return x >= Math.min(a[0], a[2]) && x <= Math.max(a[0], a[2]) && z >= Math.min(a[1], a[3]) && z <= Math.max(a[1], a[3]);
    return (x - a.c[0]) ** 2 + (z - a.c[1]) ** 2 <= a.r ** 2 && (!a.inner || (x - a.c[0]) ** 2 + (z - a.c[1]) ** 2 >= a.inner ** 2);
  }
  function samplePoints(sc, count, rand) {
    const pts = [];
    const a = sc.area;
    const bb = Array.isArray(a) ? [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])] : [a.c[0] - a.r, a.c[1] - a.r, a.c[0] + a.r, a.c[1] + a.r];
    const minDist = sc.minDist ?? 0;
    let tries = 0;
    while (pts.length < count && tries++ < count * 60) {
      const x = bb[0] + rand() * (bb[2] - bb[0]);
      const z = bb[1] + rand() * (bb[3] - bb[1]);
      if (!inArea(x, z, a)) continue;
      if ((sc.exclude ?? []).some((e) => inArea(x, z, e))) continue;
      if (minDist && pts.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < minDist ** 2)) continue;
      pts.push([x, z]);
    }
    return pts;
  }
  async function placeScatter(sc) {
    const src = await loadModel(sc.m);
    const base = normalized(src, sc);
    base.updateMatrixWorld(true);
    const rand = rng(sc.seed ?? 7);
    const pts = sc.points ?? samplePoints(sc, sc.count ?? 50, rand);
    const meshes = [];
    base.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const [s0, s1] = sc.scale ?? [0.8, 1.2];
    const mats = pts.map(([x, z]) => {
      const s = s0 + rand() * (s1 - s0);
      const ry = sc.ry !== undefined ? sc.ry * DEG : rand() * Math.PI * 2;
      return new THREE.Matrix4().compose(new THREE.Vector3(x, sc.y ?? 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
    });
    for (const m of meshes) {
      const inst = new THREE.InstancedMesh(m.geometry, m.material, mats.length);
      const local = m.matrixWorld.clone();
      mats.forEach((M, i) => inst.setMatrixAt(i, M.clone().multiply(local)));
      inst.castShadow = sc.shadow !== false && grassScale >= 0.5;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      scene.add(inst);
    }
  }

  // ---------- grass ----------
  const grassUniforms = { uTime: { value: 0 } };
  out.uniforms.push(grassUniforms.uTime);
  function valueNoise(x, z) {
    const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(xi, zi), h(xi + 1, zi), u), THREE.MathUtils.lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
  }
  function bladeGeometry(seg = 5, width = 0.05) {
    const pos = [], idx = [];
    for (let i = 0; i < seg; i++) { const t = i / seg; const w = (width / 2) * (1 - t) ** 0.8; pos.push(-w, t, 0, w, t, 0); }
    pos.push(0, 1, 0);
    for (let i = 0; i < seg - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = (seg - 1) * 2;
    idx.push(a, a + 1, seg * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    return g;
  }
  function placeGrass(gr) {
    const rand = rng(gr.seed ?? 3);
    const a = gr.area ?? [-20, -20, 20, 20];
    const bb = Array.isArray(a) ? a : [a.c[0] - a.r, a.c[1] - a.r, a.c[0] + a.r, a.c[1] + a.r];
    const areaM2 = Array.isArray(a) ? Math.abs((a[2] - a[0]) * (a[3] - a[1])) : Math.PI * a.r * a.r;
    const count = Math.round(Math.min(gr.max ?? 400000, areaM2 * (gr.density ?? 60)) * grassScale);
    const [h0, h1] = gr.height ?? [0.25, 0.55];
    const colors = (gr.colors ?? ['#2f4a17', '#5f7f2a', '#8a9a3c']).map((c) => new THREE.Color(c));
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, color: '#ffffff' });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = grassUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vH;')
        .replace('#include <project_vertex>', `
          vH = position.y;
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          vec3 io = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float hs = length(instanceMatrix[1].xyz);
          float w = sin(uTime * 1.2 + io.x * 0.21 + io.z * 0.13) * 0.55 + sin(uTime * 2.6 + io.x * 0.7 + io.z * 0.5) * 0.2;
          mvPosition.xz += vec2(0.8, 0.45) * (${(gr.lean ?? 0.18).toFixed(3)} + w * ${(gr.wind ?? 0.22).toFixed(3)}) * position.y * position.y * hs;
          mvPosition.y -= 0.12 * position.y * position.y * hs * abs(w) * ${(gr.wind ?? 0.22).toFixed(3)};
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.32, 1.12, smoothstep(0.0, 1.0, vH));');
    };
    const mesh = new THREE.InstancedMesh(bladeGeometry(gr.segments ?? 4, gr.width ?? 0.03), mat, Math.max(1, count));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < count && tries < count * 3; tries++) {
      const x = bb[0] + rand() * (bb[2] - bb[0]);
      const z = bb[1] + rand() * (bb[3] - bb[1]);
      if (!inArea(x, z, a) || (gr.exclude ?? []).some((ex) => inArea(x, z, ex))) continue;
      if (gr.falloff && !Array.isArray(a)) {
        const d = Math.hypot(x - a.c[0], z - a.c[1]) / a.r;
        if (d > gr.falloff && rand() > (1 - (d - gr.falloff) / (1 - gr.falloff)) ** 1.5) continue;
      }
      const clump = valueNoise(x * (gr.clump ?? 0.35), z * (gr.clump ?? 0.35));
      if (rand() > 0.35 + 0.65 * clump && !gr.uniform) continue;
      const h = (h0 + rand() * (h1 - h0)) * (0.65 + 0.6 * valueNoise(x * 0.08 + 9, z * 0.08 + 4));
      e.set((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.35);
      M.compose(p.set(x, gr.y ?? 0, z), q.setFromEuler(e), s.set(0.8 + rand() * 0.6, h, 1));
      mesh.setMatrixAt(n, M);
      const t = valueNoise(x * 0.15 + 30, z * 0.15 - 12);
      c.copy(colors[0]).lerp(colors[1], t).lerp(colors[2 % colors.length], rand() * 0.35);
      if (colors[3] && rand() < (gr.dry ?? 0.08)) c.copy(colors[3]);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  // ---------- build ----------
  for (const gr of [env.grass ?? spec.grass ?? []].flat()) placeGrass(gr);
  // Things someone can call in by name ("there was a birdbath") wait aside until they're said (src/showcase/held.ts).
  (spec.items ?? []).forEach((it, index) => { if (it.say) out.held.push({ index, it }); });
  // the scene's script makes some things itself ("@pond"): held, they wait for it to hand over how they're made
  const made = new Map();
  const hold = (m, make) => { made.set(m, make); };
  out.place = (it) => {
    if (it.m?.startsWith('@')) { const node = made.get(it.m)?.() ?? null; if (node) scene.add(node); return Promise.resolve(node); }
    return placeItem(it).catch((e) => { console.warn('[showcase] held', it.m, e); return null; });
  };
  waits.push(...(spec.items ?? []).filter((it) => !it.say && !it.m?.startsWith('@')).map((it) => placeItem(it).catch((e) => console.warn('[showcase] item', it.m, e))));
  waits.push(...(spec.scatter ?? []).map((sc) => placeScatter(sc).catch((e) => console.warn('[showcase] scatter', sc.m, e))));
  await Promise.all(waits);
  if (script) {
    try {
      spec.grassScale = grassScale;
      await script({ THREE, scene, camera, renderer, spec, rng, loadModel, normalized, placeItem, placeScatter, placeGrass, texSet, surfaceMaterial, hold });
    } catch (e) { console.warn('[showcase] script', e); }
  }
  return out;
}
