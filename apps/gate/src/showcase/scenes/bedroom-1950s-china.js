// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/bedroom-1950s-china.js); run in the app by src/showcase/build.js.
// A Chinese bedroom in the 1950s (scene lab). Real models (Poly Haven + Sketchfab) for the furniture; this script adds
// what no library had: the whitewashed room with its green-painted dado, wooden lattice windows, a mosquito net tied
// back with brass hooks, the folded red quilt and embroidered "晚安" pillows, two camphor-wood chests, a washstand with
// an enamel basin and towel, an enamel spittoon, an enamel lamp shade, and paper on the walls (a 1956 calendar poster,
// a calligraphy scroll, an ink landscape, a tear-off day calendar, a small portrait).
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// Ambient occlusion must not treat see-through things (glass, the net, water) as solid: they would cast dark AO halos.
// The viewer builds its GTAOPass after this script runs, so marking meshes with userData.noAO and teaching the pass to
// skip them (as it already skips points and lines) is enough. Only pages that load this scene get the patch.
if (!GTAOPass.prototype.__noAO) {
  const orig = GTAOPass.prototype._overrideVisibility;
  GTAOPass.prototype._overrideVisibility = function () {
    orig.call(this);
    this.scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; this._visibilityCache.push(o); } });
  };
  GTAOPass.prototype.__noAO = true;
}

export default async ({ THREE, scene, loadModel, normalized, texSet }) => {
  const DEG = Math.PI / 180;
  const rand = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();

  // ---------- helpers ----------
  const matCache = new Map();
  function pbr(id, { tile = 1, color = '#ffffff', rough = 1, metal = 0, normal = 1, side, physical, ...extra } = {}) {
    const key = JSON.stringify([id, tile, color, rough, metal, normal, side, physical, extra]);
    if (matCache.has(key)) return matCache.get(key);
    const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new M({ color, roughness: rough, metalness: metal, ...extra });
    if (side) m.side = side;
    if (id) {
      const t = texSet(id, [1 / tile, 1 / tile]);
      m.map = t.map; m.normalMap = t.normalMap; m.roughnessMap = t.roughnessMap;
      m.normalScale.set(normal, normal);
    }
    matCache.set(key, m);
    return m;
  }
  const plain = (color, rough = 0.8, metal = 0, extra = {}) => pbr(null, { color, rough, metal, ...extra });
  const brass = plain('#c39a4c', 0.32, 1);

  /** BoxGeometry whose UVs are in metres on every face (textures tile at their real size). */
  function boxGeo(x, y, z) {
    const g = new THREE.BoxGeometry(x, y, z);
    const uv = g.attributes.uv;
    const faces = [[z, y], [z, y], [x, z], [x, z], [x, y], [x, y]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * faces[f][0], uv.getY(i) * faces[f][1]);
    }
    return g;
  }
  function add(geo, mat, x, y, z, { rx = 0, ry = 0, rz = 0, cast = true, receive = true, parent = scene, order } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz, order ?? 'XYZ');
    m.castShadow = cast;
    m.receiveShadow = receive;
    if ([mat].flat().some((x) => x.transparent)) m.userData.noAO = true;
    parent.add(m);
    return m;
  }
  /** an axis-aligned box given its centre */
  const box = (sx, sy, sz, mat, x, y, z, o) => add(boxGeo(sx, sy, sz), mat, x, y, z, o);
  /** collects boxes into one merged mesh (one draw call) */
  function boxBatch() {
    const geos = [];
    return {
      box(sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) {
        const g = boxGeo(sx, sy, sz);
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
        geos.push(g);
      },
      geo(g, m4) { if (m4) g.applyMatrix4(m4); geos.push(g); },
      done(mat, o = {}) { if (!geos.length) return null; return add(mergeGeometries(geos), mat, 0, 0, 0, o); },
    };
  }
  function canvasTex(w, h, draw, { srgb = true } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  async function put(id, { p = [0, 0, 0], ry = 0, tint, hide, ...it } = {}) {
    const node = normalized(await loadModel(id), it);
    node.rotation.y = ry * DEG;
    node.position.set(...p);
    if (tint) node.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); } });
    if (hide) node.traverse((o) => { if (hide.some((h) => o.name.includes(h))) o.visible = false; });
    scene.add(node);
    node.updateMatrixWorld(true);
    return node;
  }
  const bounds = (o) => new THREE.Box3().setFromObject(o);
  const paperNoise = (g, w, h, base, amt = 14, n = 9000) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = (rand() - 0.5) * amt;
      g.fillStyle = `rgba(${v > 0 ? 255 : 60},${v > 0 ? 250 : 45},${v > 0 ? 235 : 30},${Math.abs(v) / 255})`;
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
  };
  const CN = '"Songti SC", "STSong", "PingFang SC", "Hiragino Sans GB", serif';

  // ---------- the room: 4.6 m x 4.2 m, 3.0 m high ----------
  const W = 4.6, D = 4.2, H = 3.0, T = 0.16;
  const xL = -W / 2, xR = W / 2, zB = -D / 2, zF = D / 2;
  const SILL = 0.95, HEAD = 2.35;
  const WIN = [[-1.55, -0.45], [-0.1, 1.0]]; // window openings in the left wall (z ranges)
  const DOOR = { z0: 0.875, z1: 1.825, h: 2.1 }; // door opening in the right wall

  const plaster = pbr('painted_plaster_wall', { tile: 1.8, color: '#f1ebe0' });
  const ceilingMat = pbr('white_plaster_02', { tile: 2.6, color: '#f6f2ea' });
  const dadoMat = pbr('painted_plaster_wall', { tile: 1.6, color: '#8fae98', rough: 0.75 });
  const stripeMat = plain('#38533f', 0.55);
  const floorMat = pbr('old_wooden_floor_01', { tile: 2.4, color: '#a38878', rough: 1 });
  const lacquer = pbr('dark_wood', { tile: 0.9, color: '#9a5a44', rough: 0.55 }); // date-red paint on wood
  const darkLacquer = pbr('dark_wood', { tile: 0.9, color: '#6e3a2c', rough: 0.5 });

  box(W + 2 * T, 0.06, D + 2 * T, floorMat, 0, -0.03, 0);
  box(W + 2 * T, 0.1, D + 2 * T, ceilingMat, 0, H + 0.05, 0);
  box(W + 2 * T, H, T, plaster, 0, H / 2, zB - T / 2);
  box(W + 2 * T, H, T, plaster, 0, H / 2, zF + T / 2);
  // right wall around the door
  {
    const x = xR + T / 2;
    const a = DOOR.z0 - zB;
    box(T, H, a, plaster, x, H / 2, zB + a / 2);
    box(T, H - DOOR.h, DOOR.z1 - DOOR.z0, plaster, x, (H + DOOR.h) / 2, (DOOR.z0 + DOOR.z1) / 2);
    box(T, H, zF - DOOR.z1, plaster, x, H / 2, (DOOR.z1 + zF) / 2);
  }
  // left wall around the two windows
  {
    const x = xL - T / 2;
    box(T, SILL, D, plaster, x, SILL / 2, 0);
    box(T, H - HEAD, D, plaster, x, (H + HEAD) / 2, 0);
    const edges = [zB, WIN[0][0], WIN[0][1], WIN[1][0], WIN[1][1], zF];
    for (let i = 0; i < edges.length; i += 2) box(T, HEAD - SILL, edges[i + 1] - edges[i], plaster, x, (SILL + HEAD) / 2, (edges[i] + edges[i + 1]) / 2);
  }
  // green dado below 0.95 m with a dark stripe, and a skirting board
  {
    const hd = SILL, t = 0.012;
    box(W, hd, t, dadoMat, 0, hd / 2, zB + t / 2);
    box(W, hd, t, dadoMat, 0, hd / 2, zF - t / 2);
    box(t, hd, D, dadoMat, xL + t / 2, hd / 2, 0);
    box(t, hd, DOOR.z0 - zB, dadoMat, xR - t / 2, hd / 2, (zB + DOOR.z0) / 2);
    box(t, hd, zF - DOOR.z1, dadoMat, xR - t / 2, hd / 2, (DOOR.z1 + zF) / 2);
    const s = boxBatch(), k = boxBatch();
    s.box(W, 0.022, 0.016, 0, hd + 0.011, zB + 0.008);
    s.box(W, 0.022, 0.016, 0, hd + 0.011, zF - 0.008);
    s.box(0.016, 0.022, D, xR - 0.008, hd + 0.011, 0);
    k.box(W, 0.11, 0.022, 0, 0.055, zB + 0.023);
    k.box(W, 0.11, 0.022, 0, 0.055, zF - 0.023);
    k.box(0.022, 0.11, D, xL + 0.023, 0.055, 0);
    k.box(0.022, 0.11, DOOR.z0 - zB, xR - 0.023, 0.055, (zB + DOOR.z0) / 2);
    k.box(0.022, 0.11, zF - DOOR.z1, xR - 0.023, 0.055, (DOOR.z1 + zF) / 2);
    s.done(stripeMat);
    k.done(darkLacquer);
  }
  // exposed timber joists under the whitewashed ceiling
  {
    const j = boxBatch();
    for (const z of [-1.55, -0.55, 0.45, 1.45]) j.box(W, 0.15, 0.11, 0, H - 0.075, z);
    j.box(0.1, 0.08, D, xL + 0.05, H - 0.04, 0);
    j.box(0.1, 0.08, D, xR - 0.05, H - 0.04, 0);
    j.done(pbr('dark_wood', { tile: 0.8, color: '#7a5038', rough: 0.7 }));
  }

  // ---------- door (right wall), painted date-red, with a brass knob ----------
  {
    const zc = (DOOR.z0 + DOOR.z1) / 2, w = DOOR.z1 - DOOR.z0;
    const trim = boxBatch();
    trim.box(0.03, DOOR.h + 0.09, 0.09, xR - 0.015, (DOOR.h + 0.09) / 2, DOOR.z0 - 0.045);
    trim.box(0.03, DOOR.h + 0.09, 0.09, xR - 0.015, (DOOR.h + 0.09) / 2, DOOR.z1 + 0.045);
    trim.box(0.03, 0.09, w + 0.18, xR - 0.015, DOOR.h + 0.045, zc);
    trim.done(darkLacquer);
    box(0.045, DOOR.h - 0.01, w - 0.02, lacquer, xR + 0.02, (DOOR.h - 0.01) / 2, zc);
    const panels = boxBatch();
    for (const [y0, y1] of [[0.18, 0.95], [1.12, 1.95]]) for (const s of [-1, 1]) panels.box(0.018, y1 - y0, w / 2 - 0.16, xR - 0.006, (y0 + y1) / 2, zc + s * (w / 4 - 0.02));
    panels.done(darkLacquer);
    add(new THREE.SphereGeometry(0.028, 16, 12), brass, xR - 0.04, 1.0, DOOR.z0 + 0.1);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), brass, xR - 0.006, 1.0, DOOR.z0 + 0.1, { rz: Math.PI / 2 });
  }

  // ---------- lattice windows (left wall) ----------
  {
    const frame = boxBatch(), bars = boxBatch(), glassGeos = [];
    const xw = xL - 0.06; // window plane, a little inside the 16 cm opening
    const bw = 0.017, bd = 0.026; // lattice bar width / depth
    /** a lantern-frame lattice inside a rectangle (z0..z1, y0..y1): grid cells, each with an inner frame tied by four stubs */
    function lattice(z0, z1, y0, y1, nz, ny) {
      const dz = (z1 - z0) / nz, dy = (y1 - y0) / ny;
      for (let i = 1; i < nz; i++) bars.box(bd, y1 - y0, bw, xw, (y0 + y1) / 2, z0 + i * dz);
      for (let j = 1; j < ny; j++) bars.box(bd, bw, z1 - z0, xw, y0 + j * dy, (z0 + z1) / 2);
      for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
        const cz = z0 + (i + 0.5) * dz, cy = y0 + (j + 0.5) * dy, iz = dz * 0.46, iy = dy * 0.46;
        bars.box(bd, bw, iz, xw, cy - iy / 2, cz); bars.box(bd, bw, iz, xw, cy + iy / 2, cz);
        bars.box(bd, iy, bw, xw, cy, cz - iz / 2); bars.box(bd, iy, bw, xw, cy, cz + iz / 2);
        const sz = (dz - iz) / 2, sy = (dy - iy) / 2;
        bars.box(bd, bw, sz, xw, cy, z0 + i * dz + sz / 2); bars.box(bd, bw, sz, xw, cy, z0 + (i + 1) * dz - sz / 2);
        bars.box(bd, sy, bw, xw, y0 + j * dy + sy / 2, cz); bars.box(bd, sy, bw, xw, y0 + (j + 1) * dy - sy / 2, cz);
      }
    }
    for (const [z0, z1] of WIN) {
      const f = 0.065, mid = (z0 + z1) / 2, tr = HEAD - 0.36;
      frame.box(0.13, HEAD - SILL, f, xw, (SILL + HEAD) / 2, z0 + f / 2);
      frame.box(0.13, HEAD - SILL, f, xw, (SILL + HEAD) / 2, z1 - f / 2);
      frame.box(0.13, f, z1 - z0, xw, HEAD - f / 2, mid);
      frame.box(0.13, f, z1 - z0, xw, SILL + f / 2, mid);
      frame.box(0.11, 0.05, z1 - z0 - 2 * f, xw, tr, mid); // transom bar
      frame.box(0.11, tr - SILL - f, 0.05, xw, (SILL + f + tr) / 2, mid); // meeting stiles
      // two casement sashes, each a frame with a lattice
      for (const [a, b] of [[z0 + f, mid - 0.025], [mid + 0.025, z1 - f]]) {
        const sf = 0.04, ya = SILL + f, yb = tr - 0.025;
        frame.box(0.06, yb - ya, sf, xw, (ya + yb) / 2, a + sf / 2);
        frame.box(0.06, yb - ya, sf, xw, (ya + yb) / 2, b - sf / 2);
        frame.box(0.06, sf, b - a, xw, yb - sf / 2, (a + b) / 2);
        frame.box(0.06, sf, b - a, xw, ya + sf / 2, (a + b) / 2);
        lattice(a + sf, b - sf, ya + sf, yb - sf, 2, 4);
        const gl = new THREE.PlaneGeometry(b - a - 2 * sf, yb - ya - 2 * sf);
        gl.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(xw - 0.02, (ya + yb) / 2, (a + b) / 2));
        glassGeos.push(gl);
      }
      lattice(z0 + f, z1 - f, tr + 0.025, HEAD - f, 4, 1);
      const gl = new THREE.PlaneGeometry(z1 - z0 - 2 * f, HEAD - f - tr - 0.025);
      gl.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(xw - 0.02, (tr + HEAD - f) / 2, mid));
      glassGeos.push(gl);
      // inside window board
      box(0.17, 0.035, z1 - z0 + 0.14, darkLacquer, xL + 0.035, SILL - 0.0175, mid);
    }
    frame.done(lacquer);
    bars.done(lacquer);
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e9f0ea', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.2 });
    const g = add(mergeGeometries(glassGeos), glass, 0, 0, 0, { cast: false, receive: false });
    g.renderOrder = 2;
    // red paper-cuts (窗花) pasted on two panes
    const cut = canvasTex(512, 512, (g2, w, h) => {
      g2.translate(w / 2, h / 2);
      g2.fillStyle = '#c4161c';
      g2.beginPath(); g2.arc(0, 0, 240, 0, Math.PI * 2); g2.fill();
      g2.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 12; k++) {
        g2.save(); g2.rotate((k * Math.PI) / 6);
        g2.beginPath(); g2.ellipse(0, -150, 26, 70, 0, 0, Math.PI * 2); g2.fill();
        g2.beginPath(); g2.ellipse(0, -60, 12, 30, 0, 0, Math.PI * 2); g2.fill();
        g2.beginPath(); g2.arc(0, -222, 12, 0, Math.PI * 2); g2.fill();
        g2.restore();
      }
      g2.beginPath(); g2.arc(0, 0, 28, 0, Math.PI * 2); g2.fill();
      g2.globalCompositeOperation = 'source-over';
    });
    const cutMat = new THREE.MeshStandardMaterial({ map: cut, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
    for (const [z, y] of [[-1.25, 1.62], [0.73, 1.62]]) add(new THREE.PlaneGeometry(0.22, 0.22), cutMat, xL - 0.075, y, z, { ry: Math.PI / 2, cast: false });
  }

  // ---------- furniture (real models) ----------
  const bed = await put('furn_bed_double_carved', { p: [0.55, 0, zB + 1.09 + 0.03], s: 1, hide: ['Object_8'] });
  const bb = bounds(bed);
  let mattressTop = 0.55;
  bed.traverse((o) => { if (o.isMesh && /Object_[23]$/.test(o.name)) mattressTop = Math.max(mattressTop, bounds(o).max.y); });
  bed.traverse((o) => { if (o.isMesh && /Object_[2349]$/.test(o.name)) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color('#f6efe2')); } });

  const desk = await put('furn_chinese_commode', { h: 0.84, ry: 90, p: [0, 0, 0.3] });
  { const b = bounds(desk); desk.position.x = xL + 0.03 - b.min.x; desk.updateMatrixWorld(true); }
  const db = bounds(desk);
  await put('furn_chinese_armchair', { h: 1.12, ry: -90, p: [db.max.x + 0.36, 0, 0.42] });
  const cabinet = await put('furn_chinese_cabinet', { h: 2.15, ry: -90, p: [0, 0, zB + 0.53] });
  { const b = bounds(cabinet); cabinet.position.x = xR - 0.025 - b.max.x; cabinet.updateMatrixWorld(true); }
  const wardrobe = await put('furn_wardrobe_antique', { s: 1, ry: 180, p: [xL + 0.7, 0, zF - 0.44], tint: '#c79a86' });
  const stool = await put('furn_chinese_stool', { s: 0.95, ry: 0, p: [bb.min.x - 0.36, 0, zB + 0.33] });
  const sb = bounds(stool);

  // ---------- mosquito net on a bamboo frame, front tied back with brass hooks ----------
  {
    const x0 = bb.min.x + 0.02, x1 = bb.max.x - 0.02, z0 = zB + 0.06, z1 = bb.max.z - 0.03;
    const top = 2.1, bottom = mattressTop - 0.16, tie = 1.12;
    const pole = plain('#a68052', 0.55);
    const poles = boxBatch();
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) poles.geo(new THREE.CylinderGeometry(0.011, 0.013, top - 0.35, 8), new THREE.Matrix4().makeTranslation(x, (top + 0.35) / 2, z));
    for (const [ax, az, bx2, bz2] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const g = new THREE.CylinderGeometry(0.01, 0.01, len, 8);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax === bx2 ? Math.PI / 2 : 0, 0, ax === bx2 ? 0 : Math.PI / 2));
      m.setPosition((ax + bx2) / 2, top + 0.01, (az + bz2) / 2);
      poles.geo(g, m);
    }
    poles.done(pole);

    const netTex = canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < w; i += 8) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); }
    });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = new THREE.MeshStandardMaterial({ color: '#fbf8f1', map: netTex, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    const CELL = 0.08; // the 256 px tile covers 8 cm (2.5 mm mesh)
    /** a panel from (a) to (b) along one axis, hanging from `top` to `bot`, folds pushed along `nrm` */
    function panel({ along, fixed, a, b, top: t, bot, nrm, folds, amp, sag = 0, flare = 0 }) {
      const len = Math.abs(b - a), hgt = t - bot, ph1 = rand() * 6.28, ph2 = rand() * 6.28;
      const g = new THREE.PlaneGeometry(1, 1, Math.max(8, Math.round(len * 40)), 30);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5, v = 0.5 - pos.getY(i); // u across, v down
        const along2 = a + (b - a) * u;
        const y = t - v * hgt;
        const fold = amp * (0.5 + 0.5 * v) * (0.6 * Math.sin(u * folds * Math.PI * 2 + ph1 + Math.sin(u * 7.3 + ph2) * 1.4) + 0.4 * Math.sin(u * folds * 1.73 * Math.PI * 2 + ph2 + v * 1.3)) + flare * v * v;
        const out = fixed + nrm * (fold + sag * Math.sin(u * Math.PI));
        if (along === 'x') pos.setXYZ(i, along2, y, out); else pos.setXYZ(i, out, y, along2);
        uv.setXY(i, (u * len) / CELL, (v * hgt) / CELL);
      }
      g.computeVertexNormals();
      return g;
    }
    /** a gathered panel at a post: wide at the top rail, pinched by the hook at `tie`, flaring below */
    function gathered({ px, pz, dir, top: t, bot, tie: ty }) {
      const g = new THREE.PlaneGeometry(1, 1, 18, 40);
      const pos = g.attributes.position, uv = g.attributes.uv;
      const vt = (t - ty) / (t - bot);
      const ss = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5, v = 0.5 - pos.getY(i);
        const w = v < vt ? 0.42 + (0.07 - 0.42) * ss(0, vt, v) : 0.07 + (0.2 - 0.07) * ss(vt, 1, v);
        const y = t - v * (t - bot) - (v > vt ? 0.02 * Math.sin(u * Math.PI) : 0);
        const fold = (0.022 + 0.02 * (0.42 - w)) * Math.sin(u * Math.PI * 2 * 4.5 + v * 2.0);
        const bulge = 0.05 * Math.sin(u * Math.PI) * (1 - Math.abs(v - vt) * 1.4);
        pos.setXYZ(i, px + dir * (0.015 + u * w), y, pz + 0.035 + fold + Math.max(0, bulge));
        uv.setXY(i, (u * 1.1) / CELL, (v * (t - bot)) / CELL);
      }
      g.computeVertexNormals();
      return g;
    }
    const netGeos = [
      panel({ along: 'x', fixed: z0 - 0.01, a: x0, b: x1, top, bot: bottom, nrm: -1, folds: 9, amp: 0.018 }),
      panel({ along: 'z', fixed: x0, a: z0, b: z1, top, bot: bottom, nrm: -1, folds: 11, amp: 0.02, sag: 0.03, flare: 0.05 }),
      panel({ along: 'z', fixed: x1, a: z0, b: z1, top, bot: bottom, nrm: 1, folds: 11, amp: 0.02, sag: 0.03, flare: 0.05 }),
      gathered({ px: x0, pz: z1, dir: 1, top, bot: bottom, tie }),
      gathered({ px: x1, pz: z1, dir: -1, top, bot: bottom, tie }),
    ];
    // the roof of the net
    const roof = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 12, 12);
    roof.rotateX(-Math.PI / 2);
    { const p = roof.attributes.position, uv = roof.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const u = (p.getX(i) + (x1 - x0) / 2) / (x1 - x0), v = (p.getZ(i) + (z1 - z0) / 2) / (z1 - z0);
        p.setY(i, -0.035 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
        uv.setXY(i, (u * (x1 - x0)) / CELL, (v * (z1 - z0)) / CELL);
      }
      roof.translate((x0 + x1) / 2, top, (z0 + z1) / 2); roof.computeVertexNormals(); }
    netGeos.push(roof);
    // the valance: a short flounce along the front rail
    netGeos.push(panel({ along: 'x', fixed: z1 + 0.015, a: x0, b: x1, top: top + 0.01, bot: top - 0.16, nrm: 1, folds: 22, amp: 0.012 }));
    const net = add(mergeGeometries(netGeos), netMat, 0, 0, 0, { cast: false, receive: true });
    net.renderOrder = 3;
    // brass hooks holding the gathered net
    for (const [x, d] of [[x0, 1], [x1, -1]]) {
      const hook = new THREE.TorusGeometry(0.03, 0.0035, 6, 18, Math.PI * 1.4);
      add(hook, brass, x + d * 0.045, tie - 0.01, z1 + 0.07, { ry: d > 0 ? 0 : Math.PI, rz: -0.6 });
      add(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 6), brass, x + d * 0.02, tie + 0.02, z1 + 0.045, { rz: d * 1.2 });
    }
  }

  // ---------- bedding: the folded quilt (被子) and two embroidered pillows ----------
  {
    const cx = (bb.min.x + bb.max.x) / 2, zHead = zB + 0.03 + 0.13;
    // red satin quilt cover woven with peony medallions (被面), over the jacquard's weave relief
    const damask = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#b01c25'; c.fillRect(0, 0, w, h);
      const rosette = (x, y, r) => {
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          for (let k = 0; k < 2; k++) for (let p = 0; p < 8; p++) {
            const a = (p / 8) * Math.PI * 2 + k * 0.39, rr = r * (1 - k * 0.4);
            c.fillStyle = k ? 'rgba(240,120,110,0.75)' : 'rgba(110,6,14,0.6)';
            c.beginPath(); c.ellipse(x + ox + Math.cos(a) * rr * 0.5, y + oy + Math.sin(a) * rr * 0.5, rr * 0.5, rr * 0.28, a, 0, Math.PI * 2); c.fill();
          }
          c.strokeStyle = 'rgba(226,182,90,0.55)'; c.lineWidth = 3;
          c.beginPath(); c.arc(x + ox, y + oy, r * 1.05, 0, Math.PI * 2); c.stroke();
          c.fillStyle = 'rgba(236,190,96,0.8)'; c.beginPath(); c.arc(x + ox, y + oy, r * 0.13, 0, Math.PI * 2); c.fill();
        }
      };
      rosette(128, 128, 78); rosette(384, 384, 78);
      c.strokeStyle = 'rgba(226,182,90,0.35)'; c.lineWidth = 2;
      for (const [x, y] of [[384, 128], [128, 384]]) for (let p = 0; p < 4; p++) { const a = (p / 4) * Math.PI * 2 + Math.PI / 4; c.beginPath(); c.ellipse(x + Math.cos(a) * 26, y + Math.sin(a) * 26, 26, 10, a, 0, Math.PI * 2); c.stroke(); }
    });
    damask.wrapS = damask.wrapT = THREE.RepeatWrapping;
    damask.repeat.set(5, 1.8);
    const red = new THREE.MeshPhysicalMaterial({ map: damask, roughness: 0.68, sheen: 0.5, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff9a8a'), normalMap: texSet('quatrefoil_jacquard_fabric', [4, 4]).normalMap });
    const cottonNormal = texSet('cotton_jersey', [5, 5]).normalMap;
    const white = new THREE.MeshStandardMaterial({ color: '#f7f3ea', roughness: 0.95, normalMap: cottonNormal });
    const qw = bb.max.x - bb.min.x - 0.36, qd = 0.5;
    let y = mattressTop - 0.01;
    // a soft, folded quilt layer: rounded edges, a puffed middle, small wrinkles, a little sag toward the ends
    const slab = (w, th, d, r) => {
      const g = new RoundedBoxGeometry(w, th, d, 6, r);
      const p = g.attributes.position;
      const ph = rand() * 10;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / (w / 2), z = p.getZ(i) / (d / 2), yy = p.getY(i);
        const puff = (1 - x * x * x * x) * (1 - z * z);
        const wrinkle = 0.004 * Math.sin(x * 23 + ph + Math.sin(z * 5) * 2) * Math.sin(z * 9 + x * 3);
        p.setY(i, yy * (1 + 0.45 * puff) - 0.012 * x * x + (yy > 0 ? wrinkle : 0));
        p.setZ(i, p.getZ(i) * (1 + 0.035 * Math.sin(x * 3.1 + ph)));
      }
      g.computeVertexNormals();
      return g;
    };
    const layers = [[red, 0.085], [white, 0.07], [red, 0.095]];
    layers.forEach(([m, th], i) => {
      add(slab(qw - i * 0.025, th, qd - i * 0.02, th * 0.49), m, cx + (rand() - 0.5) * 0.02, y + th / 2, zHead + qd / 2 + (rand() - 0.5) * 0.015, { ry: (rand() - 0.5) * 0.015 });
      y += th * 1.1;
    });
    // the sheet: white cotton printed with small blue flowers (replaces the model's grey bedding)
    const print = canvasTex(512, 512, (c, w, h) => {
      paperNoise(c, w, h, '#f4f1e9', 8, 2500);
      for (let k = 0; k < 40; k++) {
        const fx = rand() * w, fy = rand() * h, r = 7 + rand() * 5, col = k % 3 ? '#4a6fa8' : '#c45a6a';
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          c.fillStyle = col;
          for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; c.beginPath(); c.ellipse(fx + ox + Math.cos(a) * r * 0.6, fy + oy + Math.sin(a) * r * 0.6, r * 0.5, r * 0.3, a, 0, Math.PI * 2); c.fill(); }
          c.fillStyle = '#e8c25a'; c.beginPath(); c.arc(fx + ox, fy + oy, r * 0.2, 0, Math.PI * 2); c.fill();
        }
      }
    });
    print.wrapS = print.wrapT = THREE.RepeatWrapping;
    print.repeat.set(4.5, 4.5);
    const sheetMat = new THREE.MeshStandardMaterial({ map: print, roughness: 0.95, normalMap: texSet('cotton_jersey', [6, 6]).normalMap });
    bed.traverse((o) => { if (o.isMesh && /Object_[349]$/.test(o.name)) o.material = sheetMat; });
    // pillows: cream cotton embroidered with peonies and "晚安" (good night)
    const pillowTex = canvasTex(1024, 640, (g, w, h) => {
      paperNoise(g, w, h, '#f5efe2', 10, 6000);
      g.strokeStyle = '#d9cdb8'; g.lineWidth = 6; g.strokeRect(28, 28, w - 56, h - 56);
      // scalloped lace edge
      g.fillStyle = '#efe6d4';
      for (let x = 40; x < w - 30; x += 34) { g.beginPath(); g.arc(x, 28, 12, 0, Math.PI); g.fill(); g.beginPath(); g.arc(x, h - 28, 12, Math.PI, 0); g.fill(); }
      const flower = (fx, fy, r, c1, c2) => {
        for (let k = 0; k < 3; k++) for (let p = 0; p < 7; p++) {
          const a = (p / 7) * Math.PI * 2 + k * 0.45, rr = r * (1 - k * 0.28);
          const gr = g.createRadialGradient(fx, fy, 0, fx, fy, rr);
          gr.addColorStop(0, c2); gr.addColorStop(1, c1);
          g.fillStyle = gr;
          g.beginPath(); g.ellipse(fx + Math.cos(a) * rr * 0.45, fy + Math.sin(a) * rr * 0.45, rr * 0.55, rr * 0.36, a, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(fx, fy, r * 0.12, 0, Math.PI * 2); g.fill();
      };
      const leaf = (lx, ly, a, s) => { g.fillStyle = '#4f7a3a'; g.beginPath(); g.ellipse(lx, ly, 34 * s, 13 * s, a, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2f5126'; g.lineWidth = 2; g.beginPath(); g.moveTo(lx - Math.cos(a) * 30 * s, ly - Math.sin(a) * 30 * s); g.lineTo(lx + Math.cos(a) * 30 * s, ly + Math.sin(a) * 30 * s); g.stroke(); };
      for (const [lx, ly, a, s] of [[300, 400, 0.6, 1.5], [420, 440, -0.4, 1.3], [520, 400, 0.3, 1.3], [520, 270, -0.8, 1.2], [330, 250, -1.0, 1.2], [270, 330, 1.2, 1.1]]) leaf(lx, ly, a, s);
      flower(370, 330, 115, '#c8283a', '#f7a7b4');
      flower(500, 300, 80, '#d9476a', '#fbd0dc');
      flower(470, 420, 58, '#c8283a', '#f7a7b4');
      g.fillStyle = '#b3202d';
      g.font = `bold 118px ${CN}`;
      g.textAlign = 'center';
      g.fillText('晚安', 690, 370);
    });
    const pillowMat = new THREE.MeshStandardMaterial({ map: pillowTex, roughness: 0.92, normalMap: cottonNormal });
    for (const s of [-1, 1]) {
      // a pillow: a sphere pushed into a rounded rectangle in plan, full in the middle and pinched at the seams
      const pw = 0.66, ph = 0.16, pd = 0.42;
      const g = new THREE.SphereGeometry(1, 64, 32);
      const p = g.attributes.position, uv = g.attributes.uv;
      const sp = (v, e) => Math.sign(v) * Math.abs(v) ** e;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const X = sp(x, 0.32) * pw / 2, Z = sp(z, 0.32) * pd / 2;
        const edge = Math.max(Math.abs(X) / (pw / 2), Math.abs(Z) / (pd / 2));
        const Y = y * (ph / 2) * (0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - edge ** 4))) + 0.006 * Math.sin(X * 40 + Z * 17) * (1 - edge);
        p.setXYZ(i, X, Y, Z);
        uv.setXY(i, X / pw + 0.5, 0.5 - Z / pd);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, pillowMat);
      m.position.set(cx + s * 0.36, mattressTop + ph * 0.42, zHead + qd + 0.24);
      m.rotation.set(-0.07, (rand() - 0.5) * 0.12, 0);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---------- camphor-wood chests (樟木箱) on a low stand, right wall ----------
  {
    const zc = -0.38, back = xR - 0.03;
    const camphor = pbr('teak_veneer', { tile: 0.8, color: '#e6b98c', rough: 0.42 });
    const standMat = darkLacquer;
    // stand: top board on four legs
    const st = boxBatch();
    st.box(0.58, 0.04, 1.02, back - 0.29, 0.28, zc);
    for (const dx of [0.05, 0.53]) for (const dz of [-0.46, 0.46]) st.box(0.05, 0.26, 0.05, back - dx, 0.13, zc + dz);
    st.box(0.5, 0.04, 0.03, back - 0.29, 0.08, zc - 0.46); st.box(0.5, 0.04, 0.03, back - 0.29, 0.08, zc + 0.46);
    st.done(standMat);
    let y = 0.3;
    for (const [w, d, hb, hl] of [[0.96, 0.54, 0.38, 0.11], [0.86, 0.48, 0.32, 0.1]]) {
      const cx = back - d / 2 - 0.02;
      box(d, hb, w, camphor, cx, y + hb / 2, zc);
      box(d + 0.016, hl, w + 0.016, camphor, cx, y + hb + 0.004 + hl / 2, zc);
      const fx = cx - d / 2 - 0.009; // front face (facing the room, -x)
      const fit = boxBatch();
      for (const [zz, yy] of [[-1, y + 0.04], [1, y + 0.04], [-1, y + hb - 0.04], [1, y + hb - 0.04], [-1, y + hb + hl - 0.03], [1, y + hb + hl - 0.03]]) {
        fit.box(0.004, 0.012, 0.09, fx - 0.002, yy, zc + zz * (w / 2 - 0.045));
        fit.box(0.004, 0.08, 0.012, fx - 0.002, yy, zc + zz * (w / 2 - 0.006));
      }
      fit.box(0.006, 0.075, 0.03, fx - 0.004, y + hb + 0.01, zc); // hasp
      fit.done(brass);
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.005, 24), brass, fx - 0.002, y + hb - 0.035, zc, { rz: Math.PI / 2 });
      for (const sz of [-1, 1]) add(new THREE.TorusGeometry(0.035, 0.005, 6, 16, Math.PI), brass, cx, y + hb - 0.08, zc + sz * (w / 2 + 0.012), { ry: Math.PI / 2, rx: Math.PI });
      y += hb + hl + 0.004;
    }
    // on top: the 1950s radio and a blue-and-white vase
    await put('furn_radio_tube', { h: 0.3, ry: -90, p: [back - 0.27, y, zc - 0.12] });
    await put('furn_teapot_yixing', { h: 0.12, ry: -60, p: [back - 0.3, y, zc + 0.27] });
  }

  // ---------- washstand (脸盆架) with an enamel basin, towel and mirror; near the door ----------
  {
    const g = new THREE.Group();
    g.position.set(xR - 0.3, 0, 0.42);
    g.rotation.y = -Math.PI / 2; // local +z faces the room (-x)
    scene.add(g);
    const wood = darkLacquer;
    const R = 0.235, ringY = 0.66;
    const legs = boxBatch();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const tall = z < -0.1; // the two back legs rise to carry the towel bar and mirror
      const hgt = tall ? 1.62 : ringY + 0.03;
      legs.geo(new THREE.CylinderGeometry(0.016, 0.018, hgt, 10), new THREE.Matrix4().makeTranslation(x, hgt / 2, z));
      const b = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      const x2 = Math.cos(b) * R, z2 = Math.sin(b) * R, len = Math.hypot(x2 - x, z2 - z);
      const m = new THREE.Matrix4().compose(new THREE.Vector3((x + x2) / 2, 0.16, (z + z2) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(z2 - z, x2 - x), Math.PI / 2)), new THREE.Vector3(1, 1, 1));
      legs.geo(new THREE.CylinderGeometry(0.009, 0.009, len, 8), m);
    }
    const bx = Math.cos(Math.PI / 6 + (4 / 6) * Math.PI * 2) * R, bz = Math.sin(Math.PI / 6 + (4 / 6) * Math.PI * 2) * R; // back legs at +-bx, bz
    legs.geo(new THREE.CylinderGeometry(0.013, 0.013, 2 * Math.abs(bx) + 0.12, 10), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 1.3, bz));
    legs.geo(new THREE.CylinderGeometry(0.01, 0.01, 2 * Math.abs(bx), 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 1.08, bz));
    legs.geo(boxGeo(2 * Math.abs(bx) + 0.16, 0.06, 0.035), new THREE.Matrix4().makeTranslation(0, 1.6, bz));
    legs.geo(new THREE.TorusGeometry(R, 0.016, 8, 36), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, ringY, 0));
    legs.done(wood, { parent: g });
    // mirror between the back posts
    const mw = 2 * Math.abs(bx) - 0.03;
    add(boxGeo(mw, 0.2, 0.02), wood, 0, 1.47, bz + 0.005, { parent: g });
    add(new THREE.PlaneGeometry(mw - 0.04, 0.16), new THREE.MeshStandardMaterial({ color: '#cfd6d4', metalness: 1, roughness: 0.08 }), 0, 1.47, bz + 0.016, { parent: g, cast: false });
    // enamel basin: lathe profile with a dark blue rolled rim and a painted peony inside
    const prof = [[0, 0], [0.105, 0], [0.118, 0.006], [0.15, 0.04], [0.182, 0.08], [0.2, 0.102], [0.21, 0.108]].map(([r, y]) => new THREE.Vector2(r, y));
    const enamel = new THREE.MeshPhysicalMaterial({ color: '#f3f1ea', roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
    const basinY = ringY - 0.075;
    add(new THREE.LatheGeometry(prof, 48), enamel, 0, basinY, 0, { parent: g });
    add(new THREE.TorusGeometry(0.21, 0.0065, 8, 48), new THREE.MeshPhysicalMaterial({ color: '#1f3566', roughness: 0.25, clearcoat: 0.6 }), 0, basinY + 0.108, 0, { rx: Math.PI / 2, parent: g });
    const peony = canvasTex(512, 512, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const fl = (fx, fy, r) => { for (let k = 0; k < 3; k++) for (let p = 0; p < 8; p++) { const a = (p / 8) * Math.PI * 2 + k * 0.4, rr = r * (1 - k * 0.3); const gr = c.createRadialGradient(fx, fy, 0, fx, fy, rr); gr.addColorStop(0, '#ffc2cc'); gr.addColorStop(1, '#c41e3a'); c.fillStyle = gr; c.beginPath(); c.ellipse(fx + Math.cos(a) * rr * 0.45, fy + Math.sin(a) * rr * 0.45, rr * 0.55, rr * 0.35, a, 0, Math.PI * 2); c.fill(); } };
      c.fillStyle = '#3f7a3c';
      for (const [x, y, a] of [[170, 300, 0.5], [330, 320, -0.5], [250, 360, 1.4], [150, 220, -0.9], [360, 210, 0.9]]) { c.beginPath(); c.ellipse(x, y, 60, 22, a, 0, Math.PI * 2); c.fill(); }
      fl(256, 240, 120); fl(150, 330, 60); fl(360, 330, 55);
    });
    add(new THREE.CircleGeometry(0.1, 32), new THREE.MeshStandardMaterial({ map: peony, transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }), 0, basinY + 0.003, 0, { rx: -Math.PI / 2, parent: g, cast: false });
    // a little water
    add(new THREE.CircleGeometry(0.155, 40), new THREE.MeshPhysicalMaterial({ color: '#cfe2e6', roughness: 0.02, transparent: true, opacity: 0.28, depthWrite: false }), 0, basinY + 0.05, 0, { rx: -Math.PI / 2, parent: g, cast: false });
    // towel over the bar: white terry with two red stripes
    const towelTex = canvasTex(256, 512, (c, w, h) => {
      paperNoise(c, w, h, '#f7f4ec', 18, 3000);
      c.fillStyle = '#c52a2a'; c.fillRect(0, 60, w, 14); c.fillRect(0, 84, w, 6); c.fillRect(0, h - 74, w, 14); c.fillRect(0, h - 90, w, 6);
      c.fillStyle = '#2d4f8a'; c.font = `bold 34px ${CN}`; c.textAlign = 'center'; c.fillText('上海', w / 2, h - 120);
    });
    const towelMat = new THREE.MeshStandardMaterial({ map: towelTex, normalMap: texSet('terry_cloth', [2, 3]).normalMap, roughness: 1, side: THREE.DoubleSide });
    const tw = 0.3, front = 0.4, backL = 0.24;
    const tg = new THREE.PlaneGeometry(1, 1, 12, 40);
    { const p = tg.attributes.position, uv = tg.attributes.uv; const Lt = front + backL + 0.08;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) + 0.5, s = (0.5 - p.getY(i)) * Lt; // s along the towel from the front hem
        let y, z;
        if (s < front) { y = 1.3 - (front - s); z = bz + 0.03; }
        else if (s < front + 0.08) { const a = ((s - front) / 0.08) * Math.PI; y = 1.3 + Math.sin(a) * 0.025; z = bz + Math.cos(a) * 0.03; }
        else { y = 1.3 - (s - front - 0.08); z = bz - 0.03; }
        const wave = 0.008 * Math.sin(u * Math.PI * 4 + s * 3);
        p.setXYZ(i, (u - 0.5) * tw, y, z + wave * (z > bz ? 1 : -1));
        uv.setXY(i, u, 1 - s / Lt);
      } tg.computeVertexNormals(); }
    add(tg, towelMat, 0, 0, 0, { parent: g });
    // soap and enamel mug on the floor beside it; two thermos flasks
  }
  await put('furn_thermos_red', { h: 0.43, ry: 200, p: [xR - 0.28, 0, 0.98 - 0.22] });
  await put('furn_thermos_red', { h: 0.43, ry: 140, p: [xR - 0.62, 0, 0.88] });
  await put('furn_wooden_bucket', { h: 0.36, ry: 30, p: [xR - 0.42, 0, 0.02] });

  // ---------- enamel spittoon (痰盂) by the bed ----------
  {
    const prof = [[0, 0], [0.085, 0], [0.095, 0.01], [0.125, 0.07], [0.132, 0.12], [0.11, 0.18], [0.082, 0.205], [0.088, 0.225], [0.122, 0.245], [0.126, 0.252]].map(([r, y]) => new THREE.Vector2(r, y));
    const band = canvasTex(1024, 256, (c, w, h) => {
      c.fillStyle = '#f2efe6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#20376b'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 26, w, 26);
      for (let k = 0; k < 4; k++) { const fx = 128 + k * 256, fy = 120; for (let p = 0; p < 7; p++) { const a = (p / 7) * Math.PI * 2; c.fillStyle = p % 2 ? '#c4223a' : '#e0566b'; c.beginPath(); c.ellipse(fx + Math.cos(a) * 22, fy + Math.sin(a) * 22, 26, 15, a, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#f2c94c'; c.beginPath(); c.arc(fx, fy, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#3f7a3c'; c.beginPath(); c.ellipse(fx + 60, fy + 30, 30, 10, 0.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(fx - 58, fy + 26, 28, 10, -0.5, 0, Math.PI * 2); c.fill(); }
    });
    const m = new THREE.MeshPhysicalMaterial({ map: band, roughness: 0.22, clearcoat: 0.6, side: THREE.DoubleSide });
    const sp = new THREE.LatheGeometry(prof, 40);
    const x = bb.min.x - 0.32, z = sb.max.z + 0.32;
    add(sp, m, x, 0, z, { ry: 0.6 });
    const lid = new THREE.LatheGeometry([[0, 0.045], [0.03, 0.04], [0.095, 0.022], [0.128, 0.004], [0.13, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 36);
    add(lid, new THREE.MeshPhysicalMaterial({ color: '#f2efe6', roughness: 0.2, clearcoat: 0.6, side: THREE.DoubleSide }), x, 0.253, z);
    add(new THREE.SphereGeometry(0.016, 12, 8), plain('#20376b', 0.3), x, 0.3, z);
  }

  // ---------- on the desk: green lamp, books, an enamel mug, ink bottle and an open exercise book ----------
  {
    const top = db.max.y - 0.035, cx = (db.min.x + db.max.x) / 2;
    await put('furn_desk_lamp_green', { h: 0.42, ry: 70, p: [cx - 0.06, top, 0.98] });
    await put('furn_enamel_mug', { h: 0.095, ry: 210, p: [cx + 0.05, top, 0.62] });
    await put('furn_books_encyclopedia', { w: 0.3, ry: 90, p: [cx - 0.12, top, -0.38] });
    await put('furn_alarm_clock', { s: 1, ry: 75, p: [sb.min.x + 0.3, sb.max.y - 0.005, sb.min.z + 0.2] });
    // ink bottle and brush pot
    add(new THREE.CylinderGeometry(0.028, 0.03, 0.06, 20), new THREE.MeshPhysicalMaterial({ color: '#1b2238', roughness: 0.1, transparent: true, opacity: 0.85 }), cx - 0.12, top + 0.03, 0.33);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.018, 12), plain('#111', 0.4), cx - 0.12, top + 0.069, 0.33);
    add(new THREE.CylinderGeometry(0.04, 0.038, 0.12, 20, 1, true), pbr('rosewood_veneer1', { tile: 0.2, color: '#8a5a3c', rough: 0.5, side: THREE.DoubleSide }), cx - 0.13, top + 0.06, 0.15);
    for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 6), plain(k % 2 ? '#7a5a2a' : '#2b2b2b', 0.5), cx - 0.13 + (rand() - 0.5) * 0.03, top + 0.13, 0.15 + (rand() - 0.5) * 0.03, { rx: (rand() - 0.5) * 0.25, rz: (rand() - 0.5) * 0.25 });
    // open exercise book with handwriting
    const page = canvasTex(1024, 720, (c, w, h) => {
      paperNoise(c, w, h, '#efe7d2', 10, 4000);
      c.strokeStyle = 'rgba(70,110,160,0.35)'; c.lineWidth = 2;
      for (let y = 80; y < h - 30; y += 46) { c.beginPath(); c.moveTo(40, y); c.lineTo(w / 2 - 30, y); c.moveTo(w / 2 + 30, y); c.lineTo(w - 40, y); c.stroke(); }
      c.fillStyle = 'rgba(25,30,70,0.85)'; c.font = `34px ${CN}`;
      const lines = ['一九五六年十月二十四日', '今天天气晴，下午阳光很好。', '给妈妈写信，告诉她我们', '一切都好，不用挂念。', '星期日去公园看菊花展。'];
      lines.forEach((t, i) => c.fillText(t, 60, 70 + i * 46));
      ['单位：第三纺织厂', '工资：四十八元', '布票：十二尺', '粮票：三十斤'].forEach((t, i) => c.fillText(t, w / 2 + 60, 70 + i * 46));
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w / 2 - 6, 0, 12, h);
    });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.006, 0.24), [plain('#e8dfc8'), plain('#e8dfc8'), new THREE.MeshStandardMaterial({ map: page, roughness: 0.95 }), plain('#3c5a7a'), plain('#e8dfc8'), plain('#e8dfc8')]);
    book.position.set(cx + 0.06, top + 0.004, 0.22);
    book.rotation.y = Math.PI / 2 + 0.12;
    book.castShadow = book.receiveShadow = true;
    scene.add(book);
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8), plain('#1d1d1d', 0.25, 0.3), cx + 0.1, top + 0.012, 0.36, { rx: Math.PI / 2, rz: 0.4 });
  }
  // a plant on the windowsill, a teapot set on the stool
  await put('furn_potted_plant_04', { h: 0.24, p: [xL + 0.06, SILL, -0.8] });

  // ---------- an enamel lamp shade on a cord in the middle of the ceiling ----------
  {
    const x = 0.2, z = 0.3, y = 2.38;
    add(new THREE.CylinderGeometry(0.004, 0.004, H - y - 0.08, 6), plain('#1a1a1a', 0.6), x, (H + y + 0.08) / 2, z, { cast: false });
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 16), plain('#2b2b2b', 0.5), x, y + 0.045, z);
    const prof = [[0.03, 0.01], [0.06, 0], [0.13, -0.05], [0.2, -0.11], [0.215, -0.125]].map(([r, yy]) => new THREE.Vector2(r, yy));
    add(new THREE.LatheGeometry(prof, 40), new THREE.MeshPhysicalMaterial({ color: '#2f5a43', roughness: 0.25, clearcoat: 0.6, side: THREE.FrontSide }), x, y, z);
    add(new THREE.LatheGeometry(prof, 40), new THREE.MeshPhysicalMaterial({ color: '#f1efe6', roughness: 0.3, side: THREE.BackSide }), x, y - 0.002, z, { cast: false });
    add(new THREE.SphereGeometry(0.032, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf8a', emissiveIntensity: 0.6, roughness: 0.3 }), x, y - 0.06, z, { cast: false });
  }

  // ---------- paper on the walls ----------
  const wallPaper = (tex, w, h, x, y, z, ry, { rough = 0.95 } = {}) => add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: rough }), x, y, z, { ry, cast: false });
  // 1956 calendar poster (月份牌) left of the bed
  {
    const tex = canvasTex(700, 1040, (c, w, h) => {
      paperNoise(c, w, h, '#efe2c4', 16, 8000);
      const sky = c.createLinearGradient(0, 60, 0, 600);
      sky.addColorStop(0, '#f6d7a8'); sky.addColorStop(1, '#f0b78f');
      c.fillStyle = sky; c.fillRect(40, 60, w - 80, 560);
      c.fillStyle = '#d23a2a'; c.beginPath(); c.arc(w / 2, 300, 120, 0, Math.PI * 2); c.fill();
      // a gate tower silhouette
      c.fillStyle = '#7d2418';
      c.fillRect(120, 470, w - 240, 150);
      c.beginPath(); c.moveTo(90, 470); c.lineTo(w - 90, 470); c.lineTo(w - 150, 420); c.lineTo(150, 420); c.closePath(); c.fill();
      c.fillRect(170, 360, w - 340, 60);
      c.beginPath(); c.moveTo(130, 365); c.lineTo(w - 130, 365); c.lineTo(w - 190, 320); c.lineTo(190, 320); c.closePath(); c.fill();
      c.fillStyle = '#f3c25b'; for (let i = 0; i < 5; i++) c.fillRect(170 + i * 80, 520, 40, 100);
      c.fillStyle = '#b3202d'; c.font = `bold 92px ${CN}`; c.textAlign = 'center';
      c.fillText('恭贺新禧', w / 2, 140 + 560);
      c.font = `bold 50px ${CN}`; c.fillStyle = '#2f2a24'; c.fillText('一九五六年', w / 2, 770);
      // twelve little months
      c.font = '13px Helvetica'; c.fillStyle = '#3a3128';
      for (let m = 0; m < 12; m++) {
        const ox = 60 + (m % 6) * 100, oy = 800 + Math.floor(m / 6) * 110;
        c.fillStyle = '#b3202d'; c.font = `bold 18px ${CN}`; c.fillText(`${m + 1}月`, ox + 40, oy + 18);
        c.fillStyle = '#3a3128'; c.font = '11px Helvetica';
        for (let d = 0; d < 30; d++) c.fillText(String(d + 1), ox + 6 + (d % 7) * 12, oy + 34 + Math.floor(d / 7) * 14);
      }
    });
    wallPaper(tex, 0.44, 0.65, bb.min.x - 0.62, 1.72, zB + 0.004, 0);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.47, 8), brass, bb.min.x - 0.62, 2.05, zB + 0.01, { rz: Math.PI / 2 });
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.47, 8), brass, bb.min.x - 0.62, 1.395, zB + 0.01, { rz: Math.PI / 2 });
  }
  // ink landscape above the bed, in a dark frame
  {
    const tex = canvasTex(1200, 520, (c, w, h) => {
      paperNoise(c, w, h, '#ece3cf', 12, 9000);
      for (let L = 0; L < 4; L++) {
        const base = 230 + L * 70, amp = 120 - L * 22, tone = 150 - L * 35;
        c.fillStyle = `rgba(${tone - 40},${tone - 30},${tone - 25},${0.35 + L * 0.15})`;
        c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w; x += 6) {
          const y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + L * 1.7)) * (0.6 + 0.4 * Math.sin(x * 0.017 + L)) - 18 * Math.sin(x * 0.05 + L * 3);
          c.lineTo(x, y);
        }
        c.lineTo(w, h); c.closePath(); c.fill();
      }
      c.strokeStyle = 'rgba(30,30,30,0.6)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(820, 420); c.quadraticCurveTo(880, 380, 900, 330); c.stroke(); // a pine
      c.fillStyle = 'rgba(25,25,25,0.75)'; c.font = `40px ${CN}`; c.fillText('江 山 如 画', 90, 90);
      c.fillStyle = '#b3202d'; c.fillRect(1080, 380, 50, 50);
    });
    const fw = 0.96, fh = 0.44, x = (bb.min.x + bb.max.x) / 2, y = 2.5;
    box(fw + 0.08, fh + 0.08, 0.03, darkLacquer, x, y, zB + 0.015);
    wallPaper(tex, fw, fh, x, y, zB + 0.032, 0);
  }
  // calligraphy scroll above the chests: 勤俭持家
  {
    const tex = canvasTex(420, 1100, (c, w, h) => {
      c.fillStyle = '#5c6b74'; c.fillRect(0, 0, w, h);
      paperNoise(c, w, h, '#5c6b74', 10, 3000);
      c.fillStyle = '#efe5cd'; c.fillRect(46, 150, w - 92, h - 300);
      c.fillStyle = 'rgba(0,0,0,0.04)'; for (let i = 0; i < 3000; i++) c.fillRect(46 + rand() * (w - 92), 150 + rand() * (h - 300), 2, 2);
      c.fillStyle = '#151515'; c.font = `bold 150px ${CN}`; c.textAlign = 'center';
      ['勤', '俭', '持', '家'].forEach((t, i) => c.fillText(t, w / 2, 330 + i * 170));
      c.fillStyle = '#b3202d'; c.fillRect(w / 2 + 60, h - 220, 34, 34);
    });
    wallPaper(tex, 0.42, 1.1, xR - 0.006, 1.95, -0.38, -Math.PI / 2);
    for (const y of [1.4, 2.5]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 10), darkLacquer, xR - 0.016, y, -0.38, { rx: Math.PI / 2 });
  }
  // tear-off day calendar by the door: Wednesday 24 October 1956
  {
    const tex = canvasTex(300, 420, (c, w, h) => {
      paperNoise(c, w, h, '#f6f1e4', 8, 1500);
      c.textAlign = 'center';
      c.fillStyle = '#2b2b2b'; c.font = `bold 30px ${CN}`; c.fillText('1956年 十月', w / 2, 52);
      c.fillStyle = '#c0242c'; c.font = 'bold 190px Georgia, serif'; c.fillText('24', w / 2, 250);
      c.fillStyle = '#2b2b2b'; c.font = `bold 40px ${CN}`; c.fillText('星期三', w / 2, 320);
      c.font = `24px ${CN}`; c.fillText('农历九月廿一', w / 2, 370);
    });
    box(0.02, 0.23, 0.16, darkLacquer, xR - 0.012, 1.5, 0.7);
    wallPaper(tex, 0.14, 0.2, xR - 0.024, 1.49, 0.7, -Math.PI / 2);
  }
  // a small portrait on the pier between the windows
  {
    const tex = canvasTex(300, 400, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 230);
      gr.addColorStop(0, '#d8c7a6'); gr.addColorStop(1, '#6e5a42');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(40,30,22,0.85)';
      c.beginPath(); c.ellipse(w / 2, 150, 52, 64, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(40, h); c.quadraticCurveTo(w / 2, 170, w - 40, h); c.fill();
      c.fillStyle = 'rgba(20,15,10,0.9)'; c.beginPath(); c.ellipse(w / 2, 112, 56, 34, 0, Math.PI, 0); c.fill();
      c.strokeStyle = '#efe6d2'; c.lineWidth = 16; c.strokeRect(0, 0, w, h);
    });
    box(0.025, 0.31, 0.24, darkLacquer, xL + 0.013, 1.75, -0.275);
    wallPaper(tex, 0.2, 0.27, xL + 0.027, 1.75, -0.275, Math.PI / 2);
  }

  // ---------- more of daily life ----------
  {
    const cb = bounds(cabinet);
    // blue-and-white vase and a lidded basket on the cabinet's open shelves, suitcases on the wardrobe
    await put('furn_antique_ceramic_vase_01', { h: 0.3, p: [cb.min.x + 0.2, cb.max.y - 0.69, cb.min.z + 0.3] });
    await put('furn_wicker_basket_02', { h: 0.17, ry: 200, p: [cb.min.x + 0.22, 0.0, 0] }).then((n) => { n.position.set(cb.min.x + 0.2, cb.max.y - 0.69, cb.max.z - 0.28); });
    const wb = bounds(wardrobe);
    await put('furn_vintage_suitcase', { part: 'vintage_suitcase_01', rx: -90, h: 0.2, ry: 8, p: [(wb.min.x + wb.max.x) / 2, wb.max.y, (wb.min.z + wb.max.z) / 2] });
    await put('furn_vintage_suitcase', { part: 'vintage_suitcase_02', rx: -90, h: 0.2, ry: -4, p: [(wb.min.x + wb.max.x) / 2 + 0.05, wb.max.y + 0.2, (wb.min.z + wb.max.z) / 2] });
  }
  // a treadle sewing machine in the corner by the bed: one of the "three big things" a 1950s household saved for
  await put('furn_sewing_machine_treadle', { h: 1.03, ry: 90, p: [xL + 0.55, 0, zB + 0.3] });
  // black cloth shoes (布鞋) with white soles, side by side at the bed, and a pair of slippers
  {
    const black = pbr('cotton_jersey', { tile: 0.1, color: '#262422', rough: 0.95 });
    const sole = plain('#ece6d8', 0.9);
    const opening = plain('#0d0c0b', 1);
    const shoe = (x, z, ry, s = 1, upperMat = black) => {
      const g = new THREE.Group();
      const outline = new THREE.Shape();
      outline.absellipse(0, 0, 0.13 * s, 0.046 * s, 0, Math.PI * 2, false, 0);
      const so = new THREE.ExtrudeGeometry(outline, { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 28 });
      so.rotateX(-Math.PI / 2);
      add(so, sole, 0, 0.004, 0, { parent: g });
      const up = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      up.scale(0.125 * s, 0.06 * s, 0.044 * s);
      add(up, upperMat, 0.0, 0.026, 0, { parent: g });
      add(new THREE.CircleGeometry(1, 24).scale(0.055 * s, 0.03 * s, 1), opening, -0.04 * s, 0.026 + 0.052 * s, 0, { rx: -Math.PI / 2 + 0.25, parent: g, cast: false });
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      scene.add(g);
    };
    shoe(bb.min.x - 0.2, -0.32, Math.PI / 2 + 0.08);
    shoe(bb.min.x - 0.3, -0.29, Math.PI / 2 - 0.05);
  }

  // ---------- light: soft fill standing in for the sunlight bouncing off the floor and walls ----------
  for (const [x, y, z, i, c] of [[-0.4, 1.7, -0.3, 1.1, '#ffd2a0'], [1.5, 2.1, 0.4, 0.7, '#ffe8d0'], [1.6, 1.2, -1.2, 0.45, '#ffd9b0']]) {
    const l = new THREE.PointLight(c, i, 6, 2);
    l.position.set(x, y, z);
    scene.add(l);
  }
  // sunbeams: faint additive prisms from each window along the sun's direction, fading toward the floor
  {
    const sun = new THREE.Vector3(-0.85, 0.5, -0.12).normalize();
    const L = sun.clone().negate();
    for (const [z0, z1] of WIN) {
      const corners = [[SILL, z0], [SILL, z1], [HEAD, z1], [HEAD, z0]].map(([y, z]) => new THREE.Vector3(xL + 0.02, y, z));
      const far = corners.map((q) => q.clone().addScaledVector(L, q.y / -L.y));
      const pos = [], col = [];
      const quad = (a, b, c2, d, ca, cb2) => { for (const [v, k] of [[a, ca], [b, ca], [c2, cb2], [a, ca], [c2, cb2], [d, cb2]]) { pos.push(v.x, v.y, v.z); col.push(k, k * 0.82, k * 0.6); } };
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(corners[i], corners[j], far[j], far[i], 0.055, 0.0); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      beam.renderOrder = 4;
      beam.userData.noAO = true;
      scene.add(beam);
    }
  }
};
