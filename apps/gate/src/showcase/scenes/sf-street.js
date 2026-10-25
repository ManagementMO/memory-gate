// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/sf-street.js); run in the app by src/showcase/build.js.
// A San Francisco residential street (flat for now — no hill yet), built around real models: pastel-painted row houses from tenement rows assembled from the Poly Haven modular facade kit
// (re-textured as NYC brick or painted brick) with Poly Haven fire escapes and roll-down gates, plus everything that is
// plain geometry on a real street — roadway, sidewalk flags, curbs, paint, tree pits, storefront glass and signs, a subway
// stair, a steam stack. Cars, hydrants, lamps, people, trees and the skyline are models placed from nyc-street.json.
// Coordinates: the street runs along z (looking uptown = -z), x across (east side +x), y up, metres.
export default async ({ THREE, scene, renderer, spec, loadModel, texSet }) => {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const S = { rw: 6, sw: 4.6, curb: 0.15, z0: 39, z1: -150, av: 30, z3: -339, seed: 11, ...(spec.street ?? {}) };
  const FX = S.rw + S.sw; // facade line |x|
  const Y0 = S.curb; // sidewalk top
  const DEG = Math.PI / 180;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const log = (...a) => console.log('[lab]', ...a);
  const dbg = new Set((new URLSearchParams(location.search).get('dbg') ?? '').split(','));

  // ---------- helpers ----------
  function mulberry(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry(S.seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const add = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    return t;
  }
  /** Box geometry whose UVs are in metres / tile on every face (textures keep real-world scale). */
  function boxGeo(w, h, d, tile = 1) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * faces[f][0]) / tile, (uv.getY(i) * faces[f][1]) / tile);
    }
    return g;
  }
  function planeGeo(w, h, uvw = 1, uvh = 1, uv0 = [0, 0], uv1 = [1, 1]) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv0[0] + uv.getX(i) * (uv1[0] - uv0[0]) * uvw, uv0[1] + uv.getY(i) * (uv1[1] - uv0[1]) * uvh);
    return g;
  }
  function texMat(id, extra = {}) {
    const t = texSet(id, [1, 1]);
    return std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, color: '#ffffff', ...extra });
  }
  const M4 = () => new THREE.Matrix4();
  const T = (x, y, z) => M4().makeTranslation(x, y, z);
  const RY = (a) => M4().makeRotationY(a);
  const RX = (a) => M4().makeRotationX(a);
  const SC = (x, y, z) => M4().makeScale(x, y, z);
  const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), M4());

  // ---------- batching ----------
  // instanced: one InstancedMesh per (geometry, material) — kit parts, fire escapes, gates
  const pools = new Map();
  function inst(geo, mat, matrix, color, { cast = true, receive = true } = {}) {
    const key = geo.uuid + '|' + mat.uuid;
    let p = pools.get(key);
    if (!p) pools.set(key, (p = { geo, mat, ms: [], cs: [], cast, receive }));
    p.ms.push(matrix.clone());
    p.cs.push(color ? new THREE.Color(color) : null);
  }
  // static: geometry baked to world space and merged per material — boxes and planes
  const statics = new Map();
  function stat(geo, mat, matrix, { cast = true, receive = true } = {}) {
    const key = mat.uuid + (cast ? 'c' : 'n');
    let s = statics.get(key);
    if (!s) statics.set(key, (s = { mat, geos: [], cast, receive }));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    s.geos.push(g);
  }
  function flush() {
    let calls = 0, tris = 0;
    for (const p of pools.values()) {
      const m = new THREE.InstancedMesh(p.geo, p.mat, p.ms.length);
      p.ms.forEach((M, i) => m.setMatrixAt(i, M));
      if (p.cs.some(Boolean)) p.cs.forEach((c, i) => m.setColorAt(i, c ?? new THREE.Color(1, 1, 1)));
      m.computeBoundingSphere();
      add(m, p.cast, p.receive);
      calls++;
      tris += ((p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3) * p.ms.length;
    }
    for (const s of statics.values()) {
      const g = mergeGeometries(s.geos, false);
      if (!g) { log('merge failed', s.mat.name); continue; }
      add(new THREE.Mesh(g, s.mat), s.cast, s.receive);
      calls++;
      tris += g.attributes.position.count / 3;
    }
    log(`batched: ${calls} draw objects, ${Math.round(tris / 1000)}k tris`);
    pools.clear();
    statics.clear();
  }

  // ---------- materials ----------
  const BRICK_TILE = S.brickTile ?? 1.5; // metres per brick texture repeat (3 m panels hold whole repeats)
  const brick = { red: texMat('brick_wall_006', { roughness: 1 }), dark: texMat('brick_wall_001', { roughness: 1 }) };
  const curbMat = texMat('concrete_floor_worn_001', { color: '#c9c6c0', roughness: 0.95 });
  const sidewalkMat = texMat('concrete_pavement', { color: '#d6d3cd', roughness: 0.92 });
  const darkPaint = std({ color: '#1d2120', roughness: 0.55, metalness: 0.2 });
  const roofMat = std({ color: '#3a3a3a', roughness: 0.95 });
  const stoneMat = texMat('concrete_floor_worn_001', { color: '#d9d0c0', roughness: 0.9 });
  const voidMat = std({ color: '#0d0d0d', roughness: 1 });
  const paintCache = new Map();
  /** The kit's salmon plaster, desaturated so instance colours can repaint it (cream, grey, sage...). */
  function paintMat(src) {
    if (paintCache.has(src.uuid)) return paintCache.get(src.uuid);
    const m = src.clone();
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = vec3(lum * 1.55);`);
    };
    m.customProgramCacheKey = () => 'desat';
    paintCache.set(src.uuid, m);
    return m;
  }

  // ---------- the facade kit ----------
  async function kitOf(id, rename = (n) => n) {
    const root = await loadModel(id);
    root.updateMatrixWorld(true);
    const out = {};
    for (const top of root.children) {
      const meshes = [];
      top.traverse((o) => { if (o.isMesh) meshes.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); });
      const box = new THREE.Box3().setFromObject(top, true);
      out[rename(top.name)] = { meshes, min: box.min.clone(), max: box.max.clone() };
    }
    return out;
  }
  const kit = await kitOf('city_apartments_facade_kit');
  // brick re-texture: planar UVs in kit space (x, y) / tile, measured from the part's own corner
  const brickGeoCache = new Map();
  function brickGeo(partName, mesh) {
    const key = partName + mesh.geo.uuid;
    if (brickGeoCache.has(key)) return brickGeoCache.get(key);
    const g = mesh.geo.clone();
    const pos = g.attributes.position;
    const min = kit[partName].min;
    const uv = new Float32Array(pos.count * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.m);
      uv[i * 2] = (v.x - min.x) / BRICK_TILE;
      uv[i * 2 + 1] = (v.y - min.y) / BRICK_TILE;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    brickGeoCache.set(key, g);
    return g;
  }
  // window glass: glossy dark dielectric; what's behind it (dark rooms, blinds, curtains) comes from instance colours
  const glassMat = std({ color: '#ffffff', roughness: 0.05, metalness: 0.0, envMapIntensity: 1.5 });
  const glassTints = ['#08090a', '#0c0d0f', '#111316', '#16181a', '#0a0b0c', '#1c1e20', '#8a8475', '#a19a8a', '#5a4a3b', '#26384a', '#3b2a27'];
  const glassTint = () => (rand() < 0.74 ? glassTints[Math.floor(rand() * 6)] : glassTints[6 + Math.floor(rand() * 5)]);
  const tintedMats = new Map();
  function tinted(src, tint) {
    const key = src.uuid + tint;
    if (!tintedMats.has(key)) { const m = src.clone(); m.color = new THREE.Color(tint); tintedMats.set(key, m); }
    return tintedMats.get(key);
  }
  /** Place a kit part; (u, v) = where the part's min corner (or its anchor wall's corner) goes, in facade metres. */
  function kitPart(name, frame, u, v, { wall = null, tint = null, w = 0, frameTint = null, anchor = null } = {}) {
    const part = kit[name];
    if (!part) { log('missing kit part', name); return; }
    const a = anchor ? kit[anchor].min : part.min;
    const M = mul(frame, T(u - a.x, v - a.y, w));
    for (const mesh of part.meshes) {
      const mn = mesh.mat.name ?? '';
      if (mn.includes('plaster')) {
        if (wall) inst(brickGeo(name, mesh), wall, mul(M, mesh.m), tint);
        else inst(mesh.geo, paintMat(mesh.mat), mul(M, mesh.m), tint);
      } else if (mn.includes('glass')) inst(mesh.geo, glassMat, mul(M, mesh.m), glassTint(), { cast: false });
      else inst(mesh.geo, frameTint ? tinted(mesh.mat, frameTint) : mesh.mat, mul(M, mesh.m), null);
    }
  }

  // ---------- fire escapes (Poly Haven modular kit) ----------
  const fe = await kitOf('city_fire_escape', (n) => n.replace('modular_fire_escape_', ''));
  const feMats = new Map();
  function fePart(name, frame, x, y, z, { flip = false, sy = 1 } = {}) {
    const p = fe[name];
    if (!p) { log('missing fire escape part', name); return; }
    const cx = (p.min.x + p.max.x) / 2; // anchor: x centre, y bottom, z = wall side
    const M = mul(frame, T(x, y, z), SC(flip ? -1 : 1, sy, 1), T(-cx, -p.min.y, -p.min.z));
    for (const mesh of p.meshes) {
      let mat = feMats.get(mesh.mat.uuid);
      if (!mat) { mat = mesh.mat.clone(); mat.side = THREE.DoubleSide; feMats.set(mesh.mat.uuid, mat); }
      inst(mesh.geo, mat, mul(M, mesh.m), null);
    }
  }
  function fireEscape(frame, uC, floorsY, flip) {
    const pm = fe.platform_middle;
    const platTop = pm.max.y - pm.min.y;
    floorsY.forEach((y, i) => {
      const py = y - platTop + 0.06;
      fePart(i === 0 ? 'platform_bottom' : 'platform_middle', frame, uC, py, 0.02, { flip });
      fePart(i === 0 ? 'railing_bottom' : 'railing_middle', frame, uC, py + platTop - 0.03, 0.02, { flip });
      if (i < floorsY.length - 1) fePart('stairs', frame, uC - 0.1, py + platTop - 0.03, 0.02, { flip: (i % 2 === 1) !== flip });
    });
    const y0 = floorsY[0] - platTop + 0.06;
    fePart('ladder_bottom', frame, uC + (flip ? -1 : 1) * 2.05, Math.max(2.4, y0 - 1.2), 0.62, { flip, sy: 0.55 });
  }

  // ---------- storefront signs: one atlas, one material ----------
  const SHOPS = [
    ['DELI & GROCERY', '#1f5d2e', '#ffffff'], ['PIZZA', '#b3261e', '#fff4d6'], ['LAUNDROMAT', '#1d4f91', '#ffffff'], ['NAIL SALON', '#e7d5d9', '#7a2f4a'],
    ['HARDWARE', '#d4a017', '#1a1a1a'], ['CAFÉ', '#2b2b2b', '#e8d8b0'], ['WINE & LIQUORS', '#5a1f2b', '#f1e3c6'], ['DRY CLEANERS', '#f2f2f2', '#1d3f7a'],
    ['BAGELS', '#c9822b', '#fffaf0'], ['PHARMACY', '#ffffff', '#c8102e'], ['THAI KITCHEN', '#0e3b2e', '#f4d35e'], ['BARBER', '#13294b', '#ffffff'],
    ['FLOWERS', '#2f4f2f', '#f7e7ce'], ['SHOE REPAIR', '#3b2a20', '#f0d9a8'], ['BOOKS', '#7b1e1e', '#f5efe0'], ['DONUTS & COFFEE', '#f15a24', '#ffffff'],
  ];
  const ROWH = 128;
  const atlas = canvasTex(1024, ROWH * SHOPS.length, (c, W) => {
    SHOPS.forEach(([text, bg, fg], r) => {
      const y = r * ROWH, H = ROWH;
      c.fillStyle = bg; c.fillRect(0, y, W, H);
      const g = c.createLinearGradient(0, y, 0, y + H); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
      c.fillStyle = g; c.fillRect(0, y, W, H);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 8; c.strokeRect(4, y + 4, W - 8, H - 8);
      let fs = H * 0.6;
      const font = (s) => `700 ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      c.font = font(fs);
      while (c.measureText(text).width > W * 0.8 && fs > 10) c.font = font((fs *= 0.93));
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, W / 2, y + H * 0.55);
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(30,25,20,${rand() * 0.06})`; c.fillRect(rand() * W, y + rand() * H, 2 + rand() * 40, 1 + rand() * 5); }
    });
  });
  const signMat = std({ map: atlas, roughness: 0.45, emissive: '#ffffff', emissiveMap: atlas, emissiveIntensity: 0.06 });
  const signUV = (r) => [[0, 1 - (r + 1) / SHOPS.length], [1, 1 - r / SHOPS.length]];
  // shop window: one glossy plane whose base colour is the dim interior behind the glass (shelves, a counter,
  // ceiling lights) — the dielectric Fresnel then lays the street's reflection over it, like real plate glass
  const interiorTex = canvasTex(1024, 256, (c, W, H) => {
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2b2621'); bg.addColorStop(0.55, '#1c1916'); bg.addColorStop(1, '#0e0d0c');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    for (let x = 10; x < W; x += 120 + rand() * 60) { // shelving units with goods
      const w = 70 + rand() * 50;
      c.fillStyle = '#15130f'; c.fillRect(x, 70, w, 150);
      for (let s = 0; s < 4; s++) for (let i = 0; i < 9; i++) {
        c.fillStyle = `hsl(${Math.floor(rand() * 360)}, ${20 + rand() * 35}%, ${18 + rand() * 22}%)`;
        c.fillRect(x + 3 + (i * (w - 6)) / 9, 78 + s * 36, (w - 6) / 9 - 2, 26 + rand() * 6);
      }
    }
    for (let x = 30; x < W; x += 140) { const g = c.createRadialGradient(x, 18, 2, x, 18, 60); g.addColorStop(0, 'rgba(255,236,200,0.55)'); g.addColorStop(1, 'rgba(255,236,200,0)'); c.fillStyle = g; c.fillRect(x - 60, 0, 120, 80); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, H - 40, W, 40);
  }, { repeat: true });
  const shopWin = new THREE.MeshPhysicalMaterial({ map: interiorTex, color: '#b8b0a4', roughness: 0.04, metalness: 0, envMapIntensity: 1.7, emissive: '#fff0d8', emissiveMap: interiorTex, emissiveIntensity: 0.18, clearcoat: 1, clearcoatRoughness: 0.03 });
  const alu = std({ color: '#7e8183', roughness: 0.35, metalness: 0.85 });
  const bulkMats = ['#2a2d2b', '#3d3a36', '#5a1f1f', '#1f2f3f', '#2f3a2c'].map((c) => std({ color: c, roughness: 0.55, metalness: 0.3 }));
  const awningMats = ['#1e4d2b', '#7a1f1f', '#1b2f57', '#2c2c2c', '#8a5a1a', '#5b2a4f'].map((c) => std({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
  const gateKit = await kitOf('city_rollershutter_door').catch(() => ({}));
  const gates = Object.values(gateKit);

  // ---------- one building ----------
  const out = [];
  const roofs = [];
  function building(b) {
    // b: { side: +1 east / -1 west, zLo, bays, floors, wall: 'red'|'dark'|'paint', tint|paint, ground: 'shop'|'res', fe }
    const W = b.bays * 3;
    const frame = b.side > 0 ? mul(T(FX, Y0, b.zLo), RY(-90 * DEG)) : mul(T(-FX, Y0, b.zLo + W), RY(90 * DEG));
    const at = (u, v, w) => mul(frame, T(u, v, w)); // facade coords → world matrix (w = outward)
    const wallMat = b.wall === 'paint' ? null : brick[b.wall];
    const tint = wallMat ? b.tint : b.paint;
    const G = b.ground === 'shop' ? 4.2 : 3.75;
    const floorY = [];
    for (let f = 0; f < b.floors - 1; f++) {
      const v = G + f * 3;
      floorY.push(v);
      const variant = f === b.floors - 2 && b.attic ? '03' : f === 0 ? '01' : '02';
      for (let k = 0; k < b.bays; k++) {
        const wt = b.win === 'mixed' ? (k % 2 ? 'small' : 'double') : b.win;
        const wname = `wall_window_centered_${wt}_${variant}`;
        kitPart(wname, frame, k * 3, v, { wall: wallMat, tint });
        kitPart(`window_centered_${wt}_${variant}`, frame, k * 3, v, { anchor: wname, frameTint: b.frameTint });
      }
    }
    const H = G + (b.floors - 1) * 3;
    for (let k = 0; k < b.bays; k++) {
      kitPart('crown_standard_standard_01', frame, k * 3, H - 0.05, { frameTint: b.crownTint });
      kitPart('cornice_standard_standard_01', frame, k * 3, G - 0.1, { frameTint: b.crownTint });
    }
    // mass behind the facade: starts 1.2 m back (shop interiors / window voids live in between); tar roof on top
    const depth = b.depth ?? 16;
    const massMat = wallMat ? (b.tint && b.tint !== '#ffffff' ? tinted(wallMat, b.tint) : wallMat) : tinted(stoneMat, b.paint ?? '#cfc7b8');
    stat(boxGeo(depth, H + 0.1, W - 0.01, BRICK_TILE), massMat, mul(T(b.side * (FX + 1.2 + depth / 2), Y0 + (H + 0.1) / 2, b.zLo + W / 2)));
    stat(new THREE.BoxGeometry(depth + 1.2, 0.12, W), roofMat, T(b.side * (FX + 0.6 + depth / 2), Y0 + H + 0.16, b.zLo + W / 2), { cast: false });
    roofs.push({ side: b.side, zLo: b.zLo, W, H, depth });
    // parapet cap (front)
    stat(boxGeo(0.35, 0.5, W, 1), stoneMat, T(b.side * (FX + 0.5), Y0 + H + 0.45, b.zLo + W / 2));
    // window voids: a dark plane 0.35 m behind the facade over the upper floors
    stat(new THREE.PlaneGeometry(W, H - G), voidMat, at(W / 2, G + (H - G) / 2, -0.35), { cast: false, receive: false });
    // side cheeks closing the 1.2 m gap at both ends
    for (const u of [0.005, W - 0.005]) stat(new THREE.PlaneGeometry(1.25, H), voidMat, mul(at(u, H / 2, -0.62), RY(90 * DEG)), { cast: false });
    if (b.ground === 'shop') storefront(b, at, W, G);
    else residentialBase(b, frame, at, W, wallMat, tint);
    if (b.fe && b.floors >= 4) fireEscape(frame, b.feAt ?? Math.min(W - 2.6, b.bays > 3 ? 4.5 : 3.0), floorY, !!b.feFlip);
    out.push({ ...b, W, H });
  }

  function residentialBase(b, frame, at, W, wallMat, tint) {
    const doorBay = b.doorBay ?? Math.floor(b.bays / 2);
    for (let k = 0; k < b.bays; k++) {
      kitPart('base_standard_01', frame, k * 3, 0, { frameTint: '#6b655c' });
      const door = k === doorBay;
      const wname = door ? 'wall_door_centered_large_01' : 'wall_window_centered_small_01';
      kitPart(wname, frame, k * 3, 0.75, { wall: wallMat, tint });
      kitPart(door ? 'door_centered_large_01' : 'window_centered_small_01', frame, k * 3, 0.75, { anchor: wname, frameTint: b.frameTint });
      if (door) for (let s = 0; s < 4; s++) stat(boxGeo(2.4, 0.1875 * (s + 1), 0.3, 1), stoneMat, at(k * 3 + 1.5, (0.1875 * (s + 1)) / 2, 0.3 * (3 - s) + 0.15));
    }
    // ground-floor window voids
    stat(new THREE.PlaneGeometry(W, 3), voidMat, at(W / 2, 0.75 + 1.5, -0.35), { cast: false, receive: false });
  }

  function storefront(b, at, W, G) {
    const r = b.shop ?? Math.floor(rand() * SHOPS.length);
    const pierW = 0.45, signW = W - pierW * 2;
    const pierMat = b.wall === 'paint' ? tinted(stoneMat, b.paint ?? '#cfc7b8') : b.tint && b.tint !== '#ffffff' ? tinted(brick[b.wall], b.tint) : brick[b.wall];
    for (const u of [pierW / 2, W - pierW / 2]) stat(boxGeo(pierW, G, 0.34, BRICK_TILE), pierMat, at(u, G / 2, 0.05));
    // sign band: dark box + atlas face
    stat(new THREE.BoxGeometry(signW, 0.86, 0.2), darkPaint, at(W / 2, G - 0.55, 0.1));
    const [uv0, uv1] = signUV(r);
    stat(planeGeo(signW - 0.08, 0.78, 1, 1, uv0, uv1), signMat, at(W / 2, G - 0.55, 0.205), { cast: false });
    // bulkhead
    stat(boxGeo(signW, 0.55, 0.12, 1), pick(bulkMats), at(W / 2, 0.275, 0));
    const winH = G - 0.98 - 0.55;
    const closed = b.closed ?? rand() < 0.22;
    if (closed && gates.length) {
      const n = Math.max(1, Math.round(signW / 3));
      const gw = signW / n;
      for (let i = 0; i < n; i++) {
        const g = gates[Math.floor(rand() * gates.length)];
        const sx = gw / (g.max.x - g.min.x), sy = (winH + 0.55) / (g.max.y - g.min.y);
        const M = mul(at(pierW + i * gw, 0, 0.1), SC(sx, sy, 1), T(-g.min.x, -g.min.y, -g.max.z));
        for (const mesh of g.meshes) inst(mesh.geo, mesh.mat, mul(M, mesh.m), null);
      }
    } else {
      const off = rand();
      stat(planeGeo(signW, winH, signW / 8, 1, [off, 0], [1 + off, 1]), shopWin, at(W / 2, 0.55 + winH / 2, -0.08), { cast: false });
      const nm = Math.max(1, Math.round(signW / 1.6));
      for (let i = 0; i <= nm; i++) stat(new THREE.BoxGeometry(0.06, winH, 0.1), alu, at(pierW + (signW * i) / nm, 0.55 + winH / 2, -0.03));
      stat(new THREE.BoxGeometry(signW, 0.07, 0.12), alu, at(W / 2, 0.55 + winH, -0.03));
    }
    if (b.awning ?? rand() < 0.55) {
      const am = pick(awningMats);
      stat(new THREE.BoxGeometry(signW * 0.96, 0.035, 1.4), am, mul(at(W / 2, G - 1.32, 0.68), RX(18 * DEG)));
      stat(planeGeo(signW * 0.96, 0.3, 1, 1, uv0, uv1), signMat, at(W / 2, G - 1.67, 1.355), { cast: false });
      stat(new THREE.BoxGeometry(signW * 0.96, 0.32, 0.015), am, at(W / 2, G - 1.67, 1.345));
    }
  }

  // ---------- generate the rows ----------
  // Painted Ladies palette: pastel bodies, white or cream trim
  const styles = ['#e9d9a6', '#bfd9c6', '#cdbbe0', '#f1c9b8', '#aecbe3', '#ece6d6', '#e3a796', '#a9bfa2', '#f2d6dc', '#d6e2b8'].map((paint) => ({ wall: 'paint', paint }));
  const crownTints = ['#f4f1ea', '#efe9dc', '#ffffff', '#e9e2d0'];
  const frameTints = ['#f6f3ec', '#ffffff', '#efe8da'];
  function row(side, zStart, zEnd, opts = {}) {
    let z = zStart, i = 0;
    while (z - zEnd >= 6) {
      const left = Math.floor((z - zEnd) / 3);
      let bays = Math.min(left, 2 + Math.floor(rand() * 4));
      if (left - bays === 1) bays += 1;
      const corner = left === bays && opts.cornerTall;
      const st = pick(styles);
      building({
        side, zLo: z - bays * 3, bays,
        floors: corner ? 5 : 3 + Math.floor(rand() * 2),
        ...st, crownTint: pick(crownTints), frameTint: pick(frameTints),
        ground: rand() < (opts.shops ?? 0.18) ? 'shop' : 'res', fe: false, attic: rand() < 0.3,
        win: rand() < 0.5 ? 'double' : rand() < 0.5 ? 'small' : 'mixed',
        ...(opts.override?.[i] ?? {}),
      });
      z -= bays * 3;
      i++;
    }
  }
  const t0 = performance.now();
  if (!dbg.has('nobuildings')) {
    row(+1, S.z0, S.z1, { cornerTall: true, override: S.east });
    row(-1, S.z0, S.z1, { cornerTall: true, override: S.west });
    row(+1, S.z1 - S.av, S.z3, { shops: 0.2 });
    row(-1, S.z1 - S.av, S.z3, { shops: 0.2 });
  }
  log(`buildings: ${out.length} in ${Math.round(performance.now() - t0)} ms`);

  // ---------- rooftops: wooden water tanks on steel stands, stair bulkheads ----------
  const woodTex = canvasTex(512, 256, (c, W, H) => {
    for (let x = 0; x < W; x += 8) {
      c.fillStyle = `hsl(${24 + rand() * 10}, ${10 + rand() * 14}%, ${24 + rand() * 16}%)`; c.fillRect(x, 0, 8, H);
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x, 0, 1, H);
      for (let i = 0; i < 12; i++) { c.fillStyle = `rgba(0,0,0,${rand() * 0.15})`; c.fillRect(x + rand() * 8, rand() * H, 1, 8 + rand() * 50); }
    }
    for (let i = 0; i < 14; i++) { // water streaks and weathering
      const x = rand() * W, g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(20,18,15,0)'); g.addColorStop(1, `rgba(20,18,15,${0.2 + rand() * 0.3})`);
      c.fillStyle = g; c.fillRect(x, H * rand() * 0.5, 6 + rand() * 30, H);
    }
  }, { repeat: true });
  const woodMat = std({ map: woodTex, roughness: 0.95 });
  const woodRoofMat = std({ map: woodTex, color: '#7d746a', roughness: 0.95 });
  const steelMat = std({ color: '#2b2a28', roughness: 0.7, metalness: 0.5 });
  const scaleUV = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
  function waterTank(x, y, z, r, h) {
    const sh = 2.6 + rand() * 2.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      stat(new THREE.CylinderGeometry(0.08, 0.1, sh, 6), steelMat, T(x + Math.cos(a) * r * 0.82, y + sh / 2, z + Math.sin(a) * r * 0.82));
    }
    for (const yy of [sh * 0.45, sh]) stat(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.14, 12, 1, true), steelMat, T(x, y + yy, z));
    stat(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.18, 20), steelMat, T(x, y + sh + 0.09, z));
    stat(scaleUV(new THREE.CylinderGeometry(r, r * 1.03, h, 28, 1, true), 3, 1), woodMat, T(x, y + sh + 0.18 + h / 2, z));
    for (let i = 0; i < 6; i++) stat(new THREE.TorusGeometry(r * 1.02 + 0.01 * i, 0.022, 4, 28), steelMat, mul(T(x, y + sh + 0.35 + (i * (h - 0.5)) / 5, z), RX(90 * DEG)), { cast: false });
    stat(scaleUV(new THREE.ConeGeometry(r * 1.1, r * 0.75, 28, 1, true), 3, 1), woodRoofMat, T(x, y + sh + 0.18 + h + r * 0.375, z));
    stat(new THREE.CylinderGeometry(0.05, 0.12, 0.5, 6), steelMat, T(x, y + sh + 0.18 + h + r * 0.75 + 0.2, z));
  }
  const bulkMat = tinted(brick.red, '#b9a596');
  for (const rf of roofs) {
    const yTop = Y0 + rf.H + 0.22;
    if (false) {
      const r = 1.5 + rand() * 0.8;
      waterTank(rf.side * (FX + 1.2 + rf.depth * (0.45 + rand() * 0.3)), yTop, rf.zLo + rf.W * (0.3 + rand() * 0.4), r, 3.4 + rand() * 1.4);
    }
    if (rand() < 0.5) stat(boxGeo(3.2, 2.8, 2.6, BRICK_TILE), bulkMat, T(rf.side * (FX + 1.2 + rf.depth * 0.75), yTop + 1.4, rf.zLo + rf.W * 0.5));
  }

  // ---------- background massing: the blocks behind the street rows, seen from above and through the avenue ----------
  const facadeTex = (base, win, frame) => canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(0,0,0,${rand() * 0.08})`; c.fillRect(rand() * W, rand() * H, 6 + rand() * 10, 2); }
    c.fillStyle = frame; c.fillRect(W * 0.3 - 4, H * 0.2 - 4, W * 0.4 + 8, H * 0.55 + 8);
    c.fillStyle = win; c.fillRect(W * 0.3, H * 0.2, W * 0.4, H * 0.55);
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(W * 0.3, H * 0.2, W * 0.4, 6);
  }, { repeat: true });
  const bgMats = [['#8a4a36', '#141618', '#d8d0c0'], ['#6e5a4a', '#16181a', '#2a2a2a'], ['#a89d8c', '#1a1c1e', '#e6e0d4'], ['#7a3f30', '#121416', '#bdb3a2'], ['#5c5e60', '#101214', '#c8c8c8']]
    .map(([b, w, f]) => std({ map: facadeTex(b, w, f), roughness: 0.95 }));
  for (const side of [1, -1]) for (let z = S.z0 + 40; z > S.z3 - 120; z -= 12 + rand() * 14) {
    if (z < S.z1 + 26 && z > S.z1 - S.av - 22) continue; // keep the avenue and its frontage clear
    for (const [x0, x1] of [[FX + 22, FX + 40], [FX + 46, FX + 70]]) {
      const w = 12 + rand() * 14, d = x1 - x0, h = 14 + rand() * (x0 > FX + 30 ? 40 : 18);
      const g = boxGeo(d, h, w, 3);
      stat(g, pick(bgMats), T(side * (x0 + d / 2), h / 2, z - w / 2));
      stat(new THREE.BoxGeometry(d, 0.1, w), roofMat, T(side * (x0 + d / 2), h + 0.05, z - w / 2), { cast: false });
    }
  }
  // the avenue's building walls, left and right of the crossing
  for (const zEdge of [S.z1 + 0.0, S.z1 - S.av]) {
    const dir = zEdge === S.z1 ? 1 : -1; // buildings stand outside the avenue strip
    for (const side of [1, -1]) {
      let x = FX + 17.5;
      while (x < FX + 130) {
        const w = 12 + rand() * 10, h = 24 + rand() * 46, d = 20;
        stat(boxGeo(w, h, d, 3), pick(bgMats), T(side * (x + w / 2), h / 2, zEdge + dir * (d / 2 + 0.2)));
        stat(new THREE.BoxGeometry(w, 0.1, d), roofMat, T(side * (x + w / 2), h + 0.05, zEdge + dir * (d / 2 + 0.2)), { cast: false });
        x += w;
      }
    }
  }

  // ---------- sidewalks, curbs ----------
  for (const [za, zb] of [[S.z0 + 60, S.z1], [S.z1 - S.av, S.z3 - 80]]) {
    const L = za - zb, zc = (za + zb) / 2;
    for (const side of [1, -1]) {
      const swW = S.sw + 1.0 - 0.3;
      stat(boxGeo(swW, Y0, L, S.flagTile ?? 6), sidewalkMat, T(side * (S.rw + 0.3 + swW / 2), Y0 / 2, zc), { cast: false });
      stat(boxGeo(0.3, Y0 + 0.012, L, 1.2), curbMat, T(side * (S.rw + 0.15), (Y0 + 0.012) / 2, zc), { cast: false });
    }
  }
  for (const zEdge of [S.z1, S.z1 - S.av]) {
    const inward = zEdge === S.z1 ? -1 : 1, w = 4.6;
    for (const side of [1, -1]) {
      stat(boxGeo(90, Y0, w, S.flagTile ?? 6), sidewalkMat, T(side * (S.rw + 45), Y0 / 2, zEdge + (inward * w) / 2), { cast: false });
      stat(boxGeo(90, Y0 + 0.012, 0.3, 1.2), curbMat, T(side * (S.rw + 45), (Y0 + 0.012) / 2, zEdge + inward * (w + 0.15)), { cast: false });
    }
  }

  // ---------- road paint (worn) ----------
  const wearTex = canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.7})`; const s = 1 + rand() * 7; c.fillRect(rand() * W, rand() * H, s, s * (0.4 + rand())); }
  }, { srgb: false, repeat: true });
  const paint = (color, op = 0.88) => std({ color, roughness: 0.75, transparent: true, opacity: op, alphaMap: wearTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const yellow = paint('#d4a017'), white = paint('#e4e2da');
  // UVs in metres (0.5 m per wear tile) so the wear pattern keeps its scale on long and short stripes
  const stripe = (mat, x, z, w, len) => stat(planeGeo(w, len, w / 0.5, len / 0.5), mat, mul(T(x, 0.006, z), RX(-90 * DEG)), { cast: false });
  for (const [za, zb] of [[S.z0 + 60, S.z1 - 0.5], [S.z1 - S.av + 0.5, S.z3 - 80]]) {
    const near = za === S.z0 + 60;
    const L = za - zb - 9, zc = (za + zb) / 2 + (near ? -4.5 : 4.5);
    // cable car tracks: two rails per track and the cable slot between them, on a concrete band
    for (const tx of [-1.6, 1.6]) {
      stat(boxGeo(1.9, 0.012, L + 9, 1.2), curbMat, T(tx, 0.004, zc), { cast: false });
      for (const rx of [-0.534, 0.534]) stat(new THREE.BoxGeometry(0.07, 0.03, L + 9), std({ color: '#8d8a86', roughness: 0.35, metalness: 0.9 }), T(tx + rx, 0.012, zc), { cast: false });
      stat(new THREE.BoxGeometry(0.035, 0.03, L + 9), std({ color: '#0b0b0b', roughness: 1 }), T(tx, 0.012, zc), { cast: false });
    }
    for (const s of [1, -1]) for (let z = za - 6; z > zb + 9; z -= 7.6) stripe(white, s * (S.rw - 2.45), z, 0.1, 3.0);
  }
  for (const [zc, dir] of [[S.z1 - 3.2, 1], [S.z1 - S.av + 3.2, -1]]) {
    for (let x = -S.rw + 0.6; x <= S.rw - 0.4; x += 1.2) stripe(white, x, zc, 0.6, 3.6);
    stripe(white, dir * (S.rw / 2), zc + dir * 3.0, S.rw, 0.5);
  }
  for (let x = -90; x < 90; x += 6) {
    if (Math.abs(x) < S.rw + 1) continue;
    stripe(white, x, S.z1 - S.av / 2 - 3.4, 3.0, 0.12);
    stripe(white, x, S.z1 - S.av / 2 + 3.4, 3.0, 0.12);
  }
  for (let x = -S.rw; x < S.rw; x += 6) {
    stripe(white, x + 1.5, S.z1 - S.av / 2 - 3.4, 3.0, 0.12);
    stripe(white, x + 1.5, S.z1 - S.av / 2 + 3.4, 3.0, 0.12);
  }
  

  flush();
  window.__street = { buildings: out.map((b) => ({ side: b.side, zLo: b.zLo, W: b.W, H: b.H, ground: b.ground })) };
  log('street done');
};
