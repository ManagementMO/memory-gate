// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/room-kit.js); run in the app by src/showcase/build.js.
// Room kit proof (scene lab): a 1960s San Francisco Victorian front parlour assembled only from the kit — architectural
// elements (arch_*), Poly Haven texture sets on plain boxes, everyday objects (obj_*) and furniture (furn_*).
// This script builds the shell (boxes with texture sets), the three-sided bay, and places the repeated trim pieces
// (wainscot panels, baseboards, crown moulding, sash windows, lace curtains); loose furniture and objects are in the JSON.
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// ambient occlusion should ignore see-through things (glass, lace): mark them userData.noAO (same patch as other scenes)
if (!GTAOPass.prototype.__noAO) {
  const orig = GTAOPass.prototype._overrideVisibility;
  GTAOPass.prototype._overrideVisibility = function () {
    orig.call(this);
    this.scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; this._visibilityCache.push(o); } });
  };
  GTAOPass.prototype.__noAO = true;
}

export default async ({ THREE, scene, loadModel, normalized, texSet, spec }) => {
  const DEG = Math.PI / 180;
  const R = spec.room;
  const W = R.w, D = R.d, H = R.h, T = 0.16;
  const xL = -W / 2, xR = W / 2, zF = -D / 2, zB = D / 2;

  // ---------- helpers ----------
  const cache = new Map();
  function pbr(id, { tile = 1, color = '#ffffff', rough = 1, normal = 1 } = {}) {
    const key = JSON.stringify([id, tile, color, rough, normal]);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    if (id) {
      const t = texSet(id, [1 / tile, 1 / tile]);
      m.map = t.map; m.normalMap = t.normalMap; m.roughnessMap = t.roughnessMap;
      m.normalScale.set(normal, normal);
    }
    cache.set(key, m);
    return m;
  }
  function boxGeo(x, y, z) {
    const g = new THREE.BoxGeometry(x, y, z);
    const uv = g.attributes.uv;
    const faces = [[z, y], [z, y], [x, z], [x, z], [x, y], [x, y]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * faces[f][0], uv.getY(i) * faces[f][1]); }
    return g;
  }
  function box(sx, sy, sz, mat, x, y, z, { ry = 0, parent = scene, cast = true } = {}) {
    const m = new THREE.Mesh(boxGeo(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** a kit model: centred, bottom at y=0, scaled by h/w/len/s; stretch: [sx, sy, sz] extra non-uniform factors */
  async function put(id, { p = [0, 0, 0], ry = 0, stretch, parent = scene, ...it } = {}) {
    const node = normalized(await loadModel(id), it);
    if (stretch) node.scale.multiply(new THREE.Vector3(...stretch));
    node.rotation.y = ry * DEG;
    node.position.set(...p);
    node.traverse((o) => {
      if (!o.isMesh) return;
      let mats = [o.material].flat();
      // glass and sheer fabric must let the sun through and stay out of the AO pass; transmission renders dark here,
      // so window glass becomes plain clear glass
      if (mats.some((m) => m.transparent || m.opacity < 1 || m.transmission > 0 || /glass/i.test(m.name + o.name))) {
        o.castShadow = false; o.userData.noAO = true;
        o.material = mats.map((m) => { const c = m.clone(); c.transmission = 0; c.transparent = true; c.opacity = Math.min(c.opacity, it.glassOpacity ?? 0.12); c.roughness = 0.05; c.metalness = 0; c.depthWrite = false; return c; });
        if (o.material.length === 1) o.material = o.material[0];
        mats = [o.material].flat();
      }
      // painted trim exported as metal (spec/gloss conversion) reads as dark gold: make it paint
      if (it.paint && !o.userData.noAO) o.material = mats.map((m) => { const c = m.clone(); if (!/knob|hinge|metal/i.test(o.name)) { c.metalness = 0; c.roughness = 0.55; c.color.set(it.paint); if (it.flat) { c.map = null; c.metalnessMap = null; } } return c; }).at(0);
    });
    if (it.hide) node.traverse((o) => { if (it.hide.some((h) => o.name.includes(h))) o.visible = false; });
    parent.add(node);
    node.updateMatrixWorld(true);
    return node;
  }
  const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  /** size of a node in its parent's frame (ignores the parent's rotation) */
  function localSize(node) {
    const parent = node.parent;
    parent?.remove(node);
    node.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
    parent?.add(node);
    node.updateMatrixWorld(true);
    return s;
  }

  // ---------- materials (Poly Haven texture sets) ----------
  const plaster = pbr('plastered_wall_04', { tile: 2.2, color: R.wallColor ?? '#e9dcc4' });
  const ceiling = pbr('plastered_wall_04', { tile: 3, color: R.ceilingColor ?? '#f4eee2', normal: 0.4 });
  const floor = pbr('wood_floor', { tile: 2.0, color: '#d2b79a', rough: 0.85 });
  const trimPaint = pbr(null, { color: '#efe6d6', rough: 0.55 });

  // ---------- floor & ceiling (the bay included) ----------
  const BD = R.bayDepth, BO = R.bayOpen; // bay depth, opening width at the wall line
  box(W + 2 * T, 0.08, D + 2 * T, floor, 0, -0.04, 0);
  box(BO, 0.08, BD + T, floor, 0, -0.04, zF - (BD + T) / 2);
  box(W + 2 * T, 0.4, D + 2 * T, ceiling, 0, H + 0.2, 0);
  box(BO, 0.4, BD + T, ceiling, 0, H + 0.2, zF - (BD + T) / 2);

  // ---------- walls ----------
  const DOOR = R.door; // { x0, x1, h } in the back wall
  box(T, H, D + 2 * T, plaster, xL - T / 2, H / 2, 0); // fireplace wall
  box(T, H, D + 2 * T, plaster, xR + T / 2, H / 2, 0); // sofa wall
  // back wall around the hall door
  // (pieces run through the corners into the side walls: thin boxes that only touch let the sun's shadow map leak)
  box(DOOR.x0 - xL + T, H, T, plaster, (xL - T + DOOR.x0) / 2, H / 2, zB + T / 2);
  box(xR + T - DOOR.x1, H, T, plaster, (DOOR.x1 + xR + T) / 2, H / 2, zB + T / 2);
  box(DOOR.x1 - DOOR.x0, H - DOOR.h, T, plaster, (DOOR.x0 + DOOR.x1) / 2, (H + DOOR.h) / 2, zB + T / 2);
  // front wall either side of the bay, and the header over the bay opening
  box(-BO / 2 - xL + T, H, T, plaster, (xL - T - BO / 2) / 2, H / 2, zF - T / 2);
  box(xR + T - BO / 2, H, T, plaster, (xR + T + BO / 2) / 2, H / 2, zF - T / 2);
  box(BO, H - R.bayHead, T, plaster, 0, (H + R.bayHead) / 2, zF - T / 2);

  // ---------- the bay: three faces, each a wall with a tall sash window ----------
  const half = BO / 2, front = BO - 2 * BD; // 45° sides
  const faces = [
    { a: [-half, zF], b: [-front / 2, zF - BD], win: R.bayWinSide },
    { a: [-front / 2, zF - BD], b: [front / 2, zF - BD], win: R.bayWinFront },
    { a: [front / 2, zF - BD], b: [half, zF], win: R.bayWinSide },
  ];
  const SILL = R.sill, HEAD = R.bayHead;
  const winNodes = [];
  for (const f of faces) {
    const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1];
    const len = Math.hypot(dx, dz);
    const ang = -Math.atan2(dz, dx); // rotation that maps local +x onto the face
    const g = new THREE.Group();
    g.position.set((f.a[0] + f.b[0]) / 2, 0, (f.a[1] + f.b[1]) / 2);
    g.rotation.y = ang;
    scene.add(g);
    const w = f.win, side = (len - w) / 2;
    // wall pieces in the face's local frame (local +z points into the room)
    box(len + 0.02, SILL, T, plaster, 0, SILL / 2, -T / 2, { parent: g });
    box(len + 0.02, H - HEAD, T, plaster, 0, (H + HEAD) / 2, -T / 2, { parent: g });
    box(side + 0.01, HEAD - SILL, T, plaster, -(w + side) / 2, (SILL + HEAD) / 2, -T / 2, { parent: g });
    box(side + 0.01, HEAD - SILL, T, plaster, (w + side) / 2, (SILL + HEAD) / 2, -T / 2, { parent: g });
    // window stool (sill board) and a painted apron under it
    box(w + 0.16, 0.035, 0.2, trimPaint, 0, SILL - 0.0175, 0.04, { parent: g });
    box(w + 0.08, 0.12, 0.025, trimPaint, 0, SILL - 0.1, 0.0125, { parent: g });
    // the sash window from the kit, fitted to the opening (stretched a little taller: Victorian sashes are tall)
    const node = await put(R.windowModel, { w: w + 0.04, parent: g, p: [0, SILL, -T / 2 + 0.02], ry: R.windowRy ?? 0, paint: R.windowPaint, flat: R.windowPaintFlat, glassOpacity: 0.08 });
    const s = localSize(node);
    node.scale.y *= (HEAD - SILL) / s.y;
    winNodes.push(node);
    // painted casing around the opening
    box(0.09, HEAD - SILL + 0.09, 0.03, trimPaint, -(w / 2 + 0.045), (SILL + HEAD + 0.09) / 2, 0.015, { parent: g });
    box(0.09, HEAD - SILL + 0.09, 0.03, trimPaint, w / 2 + 0.045, (SILL + HEAD + 0.09) / 2, 0.015, { parent: g });
    box(w + 0.3, 0.12, 0.035, trimPaint, 0, HEAD + 0.06, 0.017, { parent: g });
    // lace sheer inside each window
    if (R.lace) {
      const lace = await put(R.lace, { h: HEAD - SILL + 0.12, parent: g, p: [0, SILL - 0.02, 0.09] });
      const ls = localSize(lace);
      lace.scale.x *= (w + 0.12) / ls.x;
      lace.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noAO = true; for (const m of [o.material].flat()) { m.transparent = true; m.opacity = R.laceOpacity ?? 0.55; m.depthWrite = false; m.side = THREE.DoubleSide; } } });
    }
  }

  // a group on a wall: local +x runs along the wall from A to B, local +z points into the room, wall face at z=0
  function wallGroup(x0, z0, x1, z1, y = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.Group();
    g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    g.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    scene.add(g);
    return { g, len };
  }

  // ---------- wainscot: kit panels repeated along the walls ----------
  const WH = R.wainscot.h;
  const probe = await put(R.wainscot.m, { h: WH, ry: R.wainscot.ry ?? 0, p: [0, -50, 0] });
  const pSize = size(probe);
  scene.remove(probe);
  async function wainscotRun(x0, z0, x1, z1, skip = []) {
    const { g, len } = wallGroup(x0, z0, x1, z1);
    const n = Math.max(1, Math.round(len / pSize.x));
    const sx = len / (n * pSize.x);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (skip.some(([a, b]) => t * len > a && t * len < b)) continue;
      const node = await put(R.wainscot.m, { h: WH, ry: R.wainscot.ry ?? 0, parent: g, p: [(t - 0.5) * len, 0, pSize.z / 2] });
      node.scale.x *= sx;
    }
  }
  const walls = [
    [xL, zB, xL, zF], [xR, zF, xR, zB], [xR, zB, DOOR.x1, zB], [DOOR.x0, zB, xL, zB],
    [xL, zF, -BO / 2, zF], [BO / 2, zF, xR, zF],
  ];
  const capMat = pbr('dark_wood', { tile: 1, color: R.wainscot.capColor ?? '#7a4a32', rough: 0.5 });
  if (R.wainscot.cap) for (const w of walls) {
    const { g, len } = wallGroup(...w, WH);
    box(len, 0.05, 0.06, capMat, 0, 0.025, 0.03, { parent: g });
  }
  if (R.wainscot.m) {
    await wainscotRun(xL, zB, xL, zF, [R.wainscot.skipLeft]);
    await wainscotRun(xR, zF, xR, zB, R.wainscot.skipRight ? [R.wainscot.skipRight] : []);
    await wainscotRun(xR, zB, DOOR.x1 + 0.12, zB);
    await wainscotRun(DOOR.x0 - 0.12, zB, xL, zB);
    await wainscotRun(xL, zF, -BO / 2, zF);
    await wainscotRun(BO / 2, zF, xR, zF);
  }

  // ---------- crown moulding: one kit profile per wall, stretched along its length ----------
  async function trimRun(part, y, x0, z0, x1, z1, { h, flip = R.crownFlip } = {}) {
    const { g, len } = wallGroup(x0, z0, x1, z1, y);
    const node = await put(R.trimKit, { part, s: 1, parent: g, ry: flip ? 180 : 0, paint: R.trimColor ?? '#efe6d6' });
    const s = localSize(node);
    node.scale.x *= (len + 0.02) / s.x;
    if (h) { node.scale.y *= h / s.y; node.scale.z *= h / s.y; }
    node.position.z = localSize(node).z / 2;
    return node;
  }
  if (R.crown) {
    for (const w of walls) await trimRun(R.crown, H - R.crownH, ...w, { h: R.crownH });
    for (const f of faces) await trimRun(R.crown, H - R.crownH, f.a[0], f.a[1], f.b[0], f.b[1], { h: R.crownH });
  }

  // picture rail: a thin painted moulding where Victorian parlours hung their frames
  if (R.pictureRail) for (const w of walls) {
    const { g, len } = wallGroup(...w, R.pictureRail);
    box(len, 0.045, 0.03, trimPaint, 0, 0, 0.015, { parent: g });
  }

  // ---------- hall door from the trim kit (door, jambs, casing, hardware), set in the back wall ----------
  if (R.doorParts) {
    const g = new THREE.Group();
    g.position.set((DOOR.x0 + DOOR.x1) / 2, 0, zB);
    g.rotation.y = Math.PI;
    scene.add(g);
    await put(R.trimKit, { part: R.doorParts, s: 1, parent: g, p: [0, 0, -T / 2], paint: R.doorColor ?? '#e9e0cf' });
  }
  // picture-frame and cabinet glass in the loose items (placed by the viewer before this script) is exported as rough
  // metal, which reads as a black or blank pane: make every glass material clear
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.glassFixed) return;
    const mats = [o.material].flat();
    if (!mats.some((m) => /glass/i.test(m.name) || /glass/i.test(o.name))) return;
    o.material = mats.map((m) => { const c = m.clone(); c.transmission = 0; c.transparent = true; c.opacity = 0.1; c.roughness = 0.05; c.metalness = 0; c.depthWrite = false; return c; });
    if (o.material.length === 1) o.material = o.material[0];
    o.castShadow = false; o.userData.noAO = true; o.userData.glassFixed = true;
  });
  window.__roomKit = { winNodes: winNodes.length };
};
