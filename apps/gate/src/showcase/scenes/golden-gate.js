// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/golden-gate.js); run in the app by src/showcase/build.js.
// The Golden Gate Bridge from Crissy Field. The bridge is damongraphics' model (instanced members), rescaled to the real
// proportions (1280 m main span, deck 67 m above the water, towers 227 m) and painted International Orange. Everything
// around it is built here: the strait and the bay, the Marin Headlands, the Presidio bluffs with Fort Point under the
// arch, the beach and meadow of Crissy Field, a fog bank rolling in through the Gate.
// Frame: water at y = 0; the bridge runs along x (north = -x, Marin; south = +x, San Francisco); east = -z, west = +z.
export default async ({ THREE, scene, renderer, spec, rng, loadModel, normalized, placeItem, placeGrass, texSet }) => {
  const G = { cx: 1460, cz: -1650, seed: 7, ...(spec.gg ?? {}) };
  const DEG = Math.PI / 180;
  const log = (...a) => console.log('[lab]', ...a);
  const dbg = new Set((new URLSearchParams(location.search).get('dbg') ?? '').split(','));
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const add = (m, cast = false, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m; };
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rand = mulberry(G.seed);
  // value noise + fbm (deterministic)
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, z, o = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // ---------- geography ----------
  // shorelines: San Francisco (land where x > sfShore), Marin (land where x < mnShore)
  const sfShore = (z) => (z < 0 ? 950 + 0.2 * -z : 950 + 0.55 * z) + (fbm(z * 0.004, 3.1, 3) - 0.5) * 40;
  const mnShore = (z) => (z < 0 ? -690 - 0.42 * -z : -690 + 0.25 * z) + (fbm(z * 0.003, 7.7, 4) - 0.5) * 120;
  const CRISSY = { meadow: 2.4, beach: 45, meadowEnd: 330 };
  // terrain height and surface weights (sand, meadow, scrub, rock) + forest tint (0..1)
  function terrain(x, z) {
    let h = -30, w = [0, 0, 0, 0], forest = 0;
    const ds = x - sfShore(z), dm = mnShore(z) - x;
    if (ds > -120) {
      // --- San Francisco side ---
      const nearBridge = 1 - smooth(350, 700, Math.abs(z));
      const crissy = smooth(-650, -1100, z); // 1 east of the bridge, along Crissy Field
      const n = fbm(x * 0.006, z * 0.006, 5);
      // generic Presidio: bluffs rising to 70-110 m
      let hp = (75 + 45 * n) * (1 - Math.exp(-Math.max(0, ds) / 70)) - 6 * Math.exp(-Math.max(0, ds) / 25);
      // at the bridge: Fort Point's low rocky point under the arch, the bluff behind it
      const fort = Math.exp(-(((z - 0) / 90) ** 2)) * Math.exp(-(((ds - 70) / 75) ** 2));
      hp = hp * (1 - fort) + 4.2 * fort;
      // Crissy Field: beach, flat meadow, then the wooded Presidio hill behind
      let hc;
      if (ds < CRISSY.beach) hc = (ds / CRISSY.beach) * CRISSY.meadow - (ds < 0 ? Math.min(6, -ds * 0.06) : 0);
      else if (ds < CRISSY.meadowEnd) hc = CRISSY.meadow;
      else hc = CRISSY.meadow + (70 + 40 * n) * (1 - Math.exp(-(ds - CRISSY.meadowEnd) / 260));
      h = hp * (1 - crissy) + hc * crissy;
      if (ds < 0) h = Math.min(h, ds * 0.05);
      const steep = Math.min(1, Math.abs(hp - (75 + 45 * n)) < 1 ? 0 : 1);
      // surfaces
      const sand = crissy * (ds < CRISSY.beach ? 1 : 0) + (1 - crissy) * smooth(6, 1, h) * (ds > -5 ? 1 : 0);
      const meadow = crissy * (ds >= CRISSY.beach && ds < CRISSY.meadowEnd + 40 ? 1 : 0);
      forest = Math.min(1, Math.max(0, (h - 8) / 25)) * (0.55 + 0.45 * fbm(x * 0.02, z * 0.02, 3));
      const rock = (1 - crissy) * smooth(0, 1, (1 - Math.exp(-Math.max(0, ds) / 70)) < 0.7 ? 1 : 0) * smooth(4, 20, h) * 0.6 * nearBridge;
      w = [sand, meadow * (1 - sand), Math.max(0, 1 - sand - meadow - rock), rock];
      void steep;
    }
    if (dm > -150) {
      // --- Marin Headlands: steep, ridged, coyote-brush scrub with golden grass on the ridges ---
      const r = fbm(x * 0.0006 - 2, z * 0.0006 + 5, 3);
      const ridged = (px, pz) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * (1 - Math.abs(2 * vnoise(px * f, pz * f) - 1)); f *= 2.1; a *= 0.5; } return s; };
      const rg = ridged(x * 0.0016 + 9, z * 0.0016 - 4);
      const H = 140 + 220 * r;
      const inland = 1 - Math.exp(-Math.max(0, dm) / 230);
      let hm = H * inland + 95 * (rg - 0.45) * inland * smooth(0, 300, dm) - 9 * Math.exp(-Math.max(0, dm) / 25);
      // the saddle where the north approach meets the hills (Waldo grade)
      const saddle = Math.exp(-(((z + 40) / 220) ** 2)) * smooth(-200, 250, dm) * (1 - smooth(900, 1700, dm));
      hm = hm * (1 - 0.7 * saddle) + 62 * 0.7 * saddle;
      if (dm < 0) hm = Math.min(hm, dm * 0.05);
      if (hm > h) {
        h = hm;
        const cliff = smooth(70, 5, dm) * smooth(-2, 6, hm);
        w = [smooth(2.5, 0.3, hm) * 0.7, 0, 1 - cliff, cliff];
        forest = smooth(0.42, 0.62, fbm(x * 0.0035 + 1, z * 0.0035 - 3, 4)) * (1 - smooth(0.55, 0.85, rg)) * 0.9;
      }
    }
    return { h, w, forest };
  }

  // ---------- terrain mesh: a polar grid centred on Crissy Field (fine near the visitor, coarse far away) ----------
  const NR = 240, NA = 720, RMIN = 0.6, RMAX = 26000;
  const verts = (NR + 1) * NA + 1;
  const pos = new Float32Array(verts * 3), wts = new Float32Array(verts * 4), tint = new Float32Array(verts);
  const setV = (i, x, z) => {
    const t = terrain(x, z);
    pos[i * 3] = x; pos[i * 3 + 1] = t.h; pos[i * 3 + 2] = z;
    const s = t.w[0] + t.w[1] + t.w[2] + t.w[3] || 1;
    wts.set(t.w.map((v) => v / s), i * 4);
    tint[i] = t.forest;
  };
  setV(0, G.cx, G.cz);
  for (let ri = 0; ri <= NR; ri++) {
    const r = RMIN * (RMAX / RMIN) ** (ri / NR);
    for (let a = 0; a < NA; a++) { const th = (a / NA) * Math.PI * 2; setV(1 + ri * NA + a, G.cx + Math.cos(th) * r, G.cz + Math.sin(th) * r); }
  }
  const idx = [];
  for (let a = 0; a < NA; a++) idx.push(0, 1 + ((a + 1) % NA), 1 + a);
  for (let ri = 0; ri < NR; ri++) for (let a = 0; a < NA; a++) {
    const a1 = (a + 1) % NA, p = 1 + ri * NA, q = 1 + (ri + 1) * NA;
    idx.push(p + a, p + a1, q + a, p + a1, q + a1, q + a);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('wts', new THREE.BufferAttribute(wts, 4));
  tg.setAttribute('forest', new THREE.BufferAttribute(tint, 1));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const T = (id) => texSet(id, [1, 1]);
  const tSand = T('coast_sand_01'), tMeadow = T('leafy_grass'), tScrub = T('aerial_grass_rock'), tRock = T('rocky_trail');
  const terrainMat = std({ color: '#ffffff', roughness: 0.95, map: tScrub.map });
  terrainMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tSand: { value: tSand.map }, tMeadow: { value: tMeadow.map }, tScrub: { value: tScrub.map }, tRock: { value: tRock.map } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 wts; attribute float forest; varying vec4 vW; varying float vF; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = wts; vF = forest; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tSand, tMeadow, tScrub, tRock; varying vec4 vW; varying float vF; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <map_fragment>', `
        vec2 p = vWP.xz;
        float dist = length(vWP - cameraPosition);
        vec3 sand = texture2D(tSand, p / 3.0).rgb * 0.75 + texture2D(tSand, p / 37.0).rgb * 0.25;
        sand = mix(sand, sand * vec3(0.62, 0.6, 0.58), smoothstep(0.9, -0.3, vWP.y)); // wet sand at the waterline
        vec3 meadow = texture2D(tMeadow, p / 2.6).rgb * mix(1.15, 0.85, texture2D(tScrub, p / 90.0).g);
        vec3 scrubFar = texture2D(tScrub, p / 70.0).rgb;
        vec3 scrubNear = texture2D(tScrub, p / 9.0).rgb;
        vec3 scrub = mix(scrubNear, scrubFar, smoothstep(60.0, 400.0, dist));
        // Marin in late summer: tan grass with dark scrub; Presidio forest: deep cypress green
        float macro = 0.75 + 0.5 * texture2D(tScrub, p / 1100.0).g;
        vec3 golden = scrub * vec3(1.05, 0.88, 0.58) * macro;
        vec3 forestC = scrub * vec3(0.30, 0.40, 0.25) * (0.7 + 0.6 * texture2D(tRock, p / 47.0).g);
        scrub = mix(golden, forestC, clamp(vF, 0.0, 1.0));
        vec3 rock = texture2D(tRock, p / 21.0).rgb * vec3(0.78, 0.66, 0.58);
        float steep = smoothstep(0.82, 0.55, vWN.y) * step(4.0, vWP.y);
        vec4 W = vW; W.w = max(W.w, steep); W.z *= (1.0 - steep);
        vec3 col = (sand * W.x + meadow * W.y + scrub * W.z + rock * W.w) / max(0.001, W.x + W.y + W.z + W.w);
        diffuseColor.rgb *= col;`);
  };
  const terrainMesh = add(new THREE.Mesh(tg, terrainMat), false, true);
  terrainMesh.name = 'terrain';
  log(`terrain: ${verts} verts`);

  // ---------- water ----------
  function waterNormals(size = 512) {
    // tileable height field from integer-frequency waves, then normals
    const hgt = new Float32Array(size * size);
    const waves = [];
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2, f = 2 + Math.floor(rand() ** 2 * 26);
      waves.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), rand() * 6.28, 1 / (f ** 1.15)]);
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0;
      for (const [kx, ky, ph, am] of waves) s += am * Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph);
      hgt[y * size + x] = s;
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'), img = c.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const hL = hgt[y * size + ((x - 1 + size) % size)], hR = hgt[y * size + ((x + 1) % size)];
      const hD = hgt[((y - 1 + size) % size) * size + x], hU = hgt[((y + 1) % size) * size + x];
      const nx = (hL - hR) * 2.2, ny = (hD - hU) * 2.2, nz = 1, l = Math.hypot(nx, ny, nz);
      const o = (y * size + x) * 4;
      img.data[o] = ((nx / l) * 0.5 + 0.5) * 255; img.data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255; img.data[o + 2] = ((nz / l) * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    return t;
  }
  const wn = waterNormals();
  const waterMat = new THREE.MeshPhysicalMaterial({ color: '#163845', roughness: 0.07, metalness: 0, normalMap: wn, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.0, clearcoat: 0, ior: 1.33 });
  waterMat.onBeforeCompile = (sh) => {
    // two scales of waves, faded with distance so the far water doesn't alias into noise
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPw = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPw;')
      .replace('#include <normal_fragment_maps>', `
        float dW = length(vWPw - cameraPosition);
        vec2 q = vWPw.xz;
        vec3 n1 = texture2D(normalMap, q / 23.0).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vec2(q.y, -q.x) / 7.3 + 0.37).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, q / 160.0 + 0.11).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy * 0.6) * mix(1.0, 0.25, smoothstep(80.0, 1500.0, dW)) + n3.xy * 0.8, 1.0));
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  add(water, false, true);

  // ---------- the bridge ----------
  const src = await loadModel('land_golden_gate_bridge');
  const bridge = src.clone(true);
  const orange = new THREE.MeshStandardMaterial({ color: '#b8402c', roughness: 0.55, metalness: 0.25 });
  const deckGrey = new THREE.MeshStandardMaterial({ color: '#4a4744', roughness: 0.8, metalness: 0.1 });
  bridge.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.includes('Landscape') || o.name.includes('Cube_2__4')) { o.visible = false; return; }
    o.material = orange;
    o.castShadow = false;
    o.receiveShadow = true;
  });
  // model units → metres: span 5.87 m/unit along the bridge, 4.23 vertically, 2.9 across (real width/height)
  const SX = 5.87, SY = 4.23, SZ = 2.9, BY = 60.8;
  bridge.scale.set(SX, SY, SZ);
  bridge.position.set(0, BY, 0);
  scene.add(bridge);
  const mx = (x) => x * SX, my = (y) => y * SY + BY;
  const towerN = mx(-111.5), towerS = mx(106), deckTop = my(1.93), towerBase = my(-11.95);
  log(`bridge: towers ${towerN.toFixed(0)} / ${towerS.toFixed(0)}, deck ${deckTop.toFixed(1)} m, tower base ${towerBase.toFixed(1)} m`);

  // concrete: piers under the towers, the south tower's fender ring, both anchorages, Fort Point (brick)
  const conc = texSet('concrete_floor_worn_001', [1, 1]);
  const concreteMat = std({ map: conc.map, normalMap: conc.normalMap, color: '#b9b4aa', roughness: 0.9 });
  const boxUV = (w, h, d, tile) => { const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const f = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let i = 0; i < 6; i++) for (let v = 0; v < 4; v++) { const k = i * 4 + v; uv.setXY(k, (uv.getX(k) * f[i][0]) / tile, (uv.getY(k) * f[i][1]) / tile); } return g; };
  const block = (w, h, d, x, y, z, mat = concreteMat, tile = 6) => { const m = new THREE.Mesh(boxUV(w, h, d, tile), mat); m.position.set(x, y + h / 2, z); return add(m, true, true); };
  for (const tx of [towerN, towerS]) {
    block(42, towerBase + 3, 58, tx, -3, 0);
    // the tower legs below the deck (the model's towers start at the roadway)
    for (const lz of [-15.6, 15.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(14, my(-0.56) - towerBase + 1, 9.5), orange); leg.position.set(tx, (towerBase + my(-0.56) + 1) / 2, lz); add(leg, false, true); }
    const strut = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 31), orange); strut.position.set(tx, towerBase + 22, 0); add(strut, false, true);
  }
  // south tower fender: an oval concrete ring
  {
    const pts = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector2(Math.cos(a) * 78, Math.sin(a) * 52)); }
    const shape = new THREE.Shape(pts);
    const hole = new THREE.Path(); for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; hole.lineTo(Math.cos(a) * 72, Math.sin(a) * 46); }
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false, curveSegments: 48 });
    g.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(g, concreteMat);
    ring.position.set(towerS, -3, 0);
    add(ring, true, true);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 48), std({ color: '#2a4450', roughness: 0.2 }));
    inner.scale.set(72, 46, 1); inner.rotation.x = -Math.PI / 2; inner.position.set(towerS, 0.6, 0);
    add(inner);
  }
  // anchorage pylons where the side spans meet the land
  const anchS = mx(106 + 58.4), anchN = mx(-111.5 - 58.4);
  block(36, deckTop - 6, 70, anchS + 10, -2, 0);
  { const gN = terrain(anchN - 12, 0).h; block(40, Math.max(6, deckTop - 3 - (gN - 6)), 70, anchN - 12, gN - 6, 0); }
  // Fort Point: a three-tier brick fort under the arch
  {
    const bt = texSet('brick_wall_006', [1, 1]);
    const brickMat = std({ map: bt.map, normalMap: bt.normalMap, color: '#c9a48c', roughness: 0.95 });
    const fx = anchS + 95, h0 = terrain(fx, 0).h;
    block(70, 15, 60, fx, h0, 0, brickMat, 3);
    block(64, 1.2, 54, fx, h0 + 15, 0, concreteMat, 4);
    block(8, 4, 8, fx - 30, h0 + 15, -24, brickMat, 3);
    log(`fort at ${fx.toFixed(0)}, ground ${h0.toFixed(1)}`);
  }

  // ---------- fog rolling in through the Gate ----------
  if (!dbg.has('nofog')) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'), img = c.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const dx = (x - 128) / 128, dy = (y - 128) / 128, r = Math.hypot(dx, dy * 1.25);
      const n = fbm(x / 34 + 11, y / 34 + 3, 5);
      const a = Math.max(0, 1 - r) ** 1.6 * smooth(0.25, 0.75, n * 1.1 - r * 0.25 + 0.2);
      const o = (y * 256 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255);
    }
    c.putImageData(img, 0, 0);
    const ft = new THREE.CanvasTexture(cv); ft.colorSpace = THREE.SRGBColorSpace;
    const fogMats = [0.5, 0.65, 0.8].map((op) => new THREE.SpriteMaterial({ map: ft, color: '#f4f2ee', transparent: true, opacity: op, depthWrite: false, fog: true }));
    const puff = (x, y, z, s, k = 1) => { const sp = new THREE.Sprite(fogMats[k]); sp.position.set(x, y, z); sp.scale.set(s, s * 0.42, 1); sp.renderOrder = 2; scene.add(sp); };
    // the bank sitting outside the Gate, west of the bridge, and spilling over the headlands
    for (let i = 0; i < 70; i++) { const z = 1600 + rand() * 6000, x = -2200 + rand() * 3800; puff(x, 25 + rand() * 90, z, 700 + rand() * 900, Math.floor(rand() * 3)); }
    for (let i = 0; i < 26; i++) { const x = -1500 - rand() * 2800, z = 300 + rand() * 3000; puff(x, terrain(x, z).h + 40 + rand() * 60, z, 600 + rand() * 700, Math.floor(rand() * 2)); }
  }

  // ---------- Crissy Field: promenade, grass, people ----------
  // a frame aligned with the shore: u along the beach (east), v inland
  const shoreAt = (z) => sfShore(z);
  const crissyFrame = (v, z) => new THREE.Vector3(shoreAt(z) + v, 0, z);
  // gravel promenade
  {
    const gt = texSet('rocky_trail', [1, 1]);
    const pathMat = std({ map: gt.map, normalMap: gt.normalMap, color: '#d9cdb4', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const segs = 260, z0 = -900, z1 = -3200, v0 = CRISSY.beach + 6, wPath = 4.2;
    const p = [], uv = [], ix = [];
    for (let i = 0; i <= segs; i++) {
      const z = z0 + ((z1 - z0) * i) / segs;
      for (const v of [v0, v0 + wPath]) { const q = crissyFrame(v, z); p.push(q.x, CRISSY.meadow + 0.03, q.z); uv.push(q.x / 3, q.z / 3); }
      if (i < segs) { const a = i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    add(new THREE.Mesh(g, pathMat), false, true);
  }
  // meadow grass (the viewer's blade field, laid along the shore)
  if (!dbg.has('nograss')) {
    const zc = G.cz, len = 900, rot = Math.atan(0.2); // shore direction: x = 950 + 0.2*(-z)
    const before = scene.children.length;
    placeGrass({ area: [-len / 2, 0, len / 2, 250], density: 70, max: 900000, height: [0.18, 0.55], width: 0.035,
      colors: ['#556b2f', '#7a8b3a', '#a39b5b', '#c2b280'], dry: 0.25, wind: 0.2, lean: 0.12, seed: 5, clump: 0.25,
      });
    const gm = scene.children[before];
    if (gm) {
      gm.rotation.y = Math.atan2(1, 0.2);
      const o = crissyFrame(CRISSY.beach + 11, zc);
      gm.position.set(o.x, CRISSY.meadow, zc);
    }
  }

  // ---------- people on the beach, cameras snapped to the ground at eye height ----------
  const people = [
    ['city_person_man_standing', 1201, -1128, 250, 1.82], ['city_person_woman_walking', 1206, -1176, 160, 1.68],
    ['city_person_mother_child', 1222, -1205, 140, 1.66], ['city_person_man_walking', 1214, -1100, 330, 1.75],
    ['city_person_woman_standing', 1236, -1150, 230, 1.70],
  ];
  for (const [m, x, z, ry, hh] of people) {
    const gx = sfShore(z) + (x - 1180);
    await placeItem({ m, p: [gx, Math.max(0, terrain(gx, z).h), z], ry, h: hh }).catch(() => {});
  }
  for (const cam of spec.cameras ?? []) if (cam.eye !== undefined) {
    const ground = cam.shore !== undefined ? sfShore(cam.pos[2]) + cam.shore : null;
    if (ground !== null) cam.pos[0] = ground;
    cam.pos[1] = Math.max(0, terrain(cam.pos[0], cam.pos[2]).h) + cam.eye;
  }
  // ---------- the headlands where visitors stand (Battery Spencer, Vista Point): coastal grass on the real slope,
  // scrub and rocks round the overlook (never in front of the view) ----------
  {
    const R = rng(91);
    const blade = new THREE.BufferGeometry();
    const bp = [-0.016, 0, 0, 0.016, 0, 0, -0.011, 0.35, 0, 0.011, 0.35, 0, -0.005, 0.7, 0, 0.005, 0.7, 0, 0, 1, 0];
    blade.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(bp.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
    const grassMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
    const palette = ['#5f6f34', '#7f8a46', '#a9a062', '#c8b77c'].map((c) => new THREE.Color(c));
    const scale = spec.grassScale ?? 1;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), C = new THREE.Color();
    const views = [[-1010, -260, 500, 200], [-1160, -170, 150, 40]];
    for (const [cx, cz, tx, tz] of views) {
      const look = Math.atan2(tz - cz, tx - cx);
      const inView = (x, z, near) => { const d = Math.hypot(x - cx, z - cz); let a = Math.abs(Math.atan2(z - cz, x - cx) - look); a = Math.min(a, Math.PI * 2 - a); return a < 0.75 && d < near; };
      const r = 30, n = Math.round(Math.PI * r * r * 90 * scale);
      const im = new THREE.InstancedMesh(blade, grassMat, n);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * r;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const h = (0.22 + R() * 0.5) * (rr < 3 ? 0.5 : 1);
        E.set((R() - 0.5) * 0.4, R() * Math.PI * 2, (R() - 0.5) * 0.4);
        M.compose(P.set(x, terrain(x, z).h, z), Q.setFromEuler(E), Sc.set(0.8 + R() * 0.7, h, 1));
        im.setMatrixAt(i, M);
        C.copy(palette[Math.floor(R() * palette.length)]).lerp(palette[0], R() * 0.3);
        im.setColorAt(i, C);
      }
      im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
      const plants = ['nat_shrub_round', 'nat_laurel_bush', 'nat_boxwood_bush', 'nat_shrub_round'];
      for (let i = 0; i < 16; i++) {
        const a = R() * Math.PI * 2, rr = 5 + R() * 22, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (inView(x, z, 40)) continue;
        await placeItem({ m: plants[i % plants.length], p: [x, terrain(x, z).h - 0.1, z], ry: R() * 360, h: 0.7 + R() * 1.1 }).catch(() => {});
      }
      for (let i = 0; i < 6; i++) {
        const a = R() * Math.PI * 2, rr = 4 + R() * 16, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (inView(x, z, 30)) continue;
        await placeItem({ m: 'nat_rocks_mossy', p: [x, terrain(x, z).h - 0.3, z], ry: R() * 360, w: 1.5 + R() * 2.5 }).catch(() => {});
      }
    }
  }
  window.__gg = { terrain, sfShore, mnShore, towerN, towerS, deckTop, G, CRISSY };
  log('golden gate done');
};
