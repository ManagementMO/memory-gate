// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/classroom.js); run in the app by src/showcase/build.js.
// Classroom (scene lab): the "classroom 我们的回忆 285" model (a real Chinese senior-high classroom) as the base, lit by
// morning sun through the window wall and dressed with what a class in its final year piles up: walls of textbooks on
// every desk, exercise books open at the seats, a class bookcase at the back and a globe on the teacher's podium.
// The model's faint light-shaft planes and its posters are see-through, so they must not block the sun in the shadow
// map (without this fix no sunlight reaches the room) and must not darken the ambient occlusion.
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

if (!GTAOPass.prototype.__noAO) {
  const orig = GTAOPass.prototype._overrideVisibility;
  GTAOPass.prototype._overrideVisibility = function () {
    orig.call(this);
    this.scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; this._visibilityCache.push(o); } });
  };
  GTAOPass.prototype.__noAO = true;
}

export default async ({ THREE, scene, loadModel, normalized }) => {
  const DEG = Math.PI / 180;
  const rand = (() => { let s = 2023; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
  // The model is authored at ~3.3x metre scale. 0.3 gives 0.72 m desks, 0.46 m seats, a 2.3 m door and a 4 m ceiling.
  const S = 0.3, FLOOR = 5.39 * S;
  const room = normalized(await loadModel('int_classroom_cn285'), { raw: true, s: S });
  room.position.set(0, FLOOR, 0);
  scene.add(room);
  room.updateMatrixWorld(true);
  room.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [o.material].flat();
    if (mats.some((m) => m.transparent)) { o.castShadow = false; o.userData.noAO = true; }
    for (const m of mats) if (m.name === 'Material') { m.opacity = 0.014; m.depthWrite = false; } // light-shaft planes: faint
  });

  async function put(id, { p = [0, 0, 0], ry = 0, ...it } = {}) {
    const node = normalized(await loadModel(id), it);
    node.rotation.y = ry * DEG;
    node.position.set(...p);
    scene.add(node);
    return node;
  }

  // ---------- desks and chair backs: read the instanced parts from the model ----------
  function instances(name) {
    const out = [];
    room.traverse((o) => {
      if (!o.isInstancedMesh || o.name !== name) return;
      o.geometry.computeBoundingBox();
      const M = new THREE.Matrix4(), seen = new Set();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M);
        const b = o.geometry.boundingBox.clone().applyMatrix4(M).applyMatrix4(o.matrixWorld);
        const key = `${b.min.x.toFixed(1)},${b.min.z.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(b);
      }
    });
    return out;
  }
  const desks = instances('Object_45');
  const chairBacks = instances('Object_50');

  // ---------- textbooks: one atlas (8 covers, 8 spines, page edges), all books merged into one mesh ----------
  const SUBJ = [['语文', '#c8352e'], ['数学', '#2a62a8'], ['英语', '#3c8d5a'], ['物理', '#6b4aa0'], ['化学', '#d08a2a'], ['生物', '#2f9a8c'], ['历史', '#8a5a3a'], ['地理', '#3a7bc8']];
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = 1024;
  {
    const g = atlas.getContext('2d');
    g.fillStyle = '#efe9da'; g.fillRect(0, 0, 1024, 1024);
    SUBJ.forEach(([name, col], t) => {
      // cover: 256 x 256 cells in the top half (4 x 2)
      const cx = (t % 4) * 256, cy = Math.floor(t / 4) * 256;
      g.fillStyle = '#f4f1e8'; g.fillRect(cx, cy, 256, 256);
      g.fillStyle = col; g.fillRect(cx, cy, 256, 92); g.fillRect(cx, cy + 210, 256, 46);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 54px "PingFang SC","Hiragino Sans GB",sans-serif'; g.textAlign = 'center';
      g.fillText(name, cx + 128, cy + 66);
      g.fillStyle = col; g.globalAlpha = 0.35;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + 60 + k * 34, cy + 150 + Math.sin(k + t) * 18, 22 + (k % 2) * 8, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      g.fillStyle = '#333'; g.font = '18px "PingFang SC",sans-serif'; g.fillText('普通高中教科书', cx + 128, cy + 118);
      // spine: 64 x 448 strips in the bottom half
      const sx = t * 64, sy = 512;
      g.fillStyle = col; g.fillRect(sx, sy, 64, 448);
      g.fillStyle = '#f4f1e8'; g.fillRect(sx + 6, sy + 40, 52, 200);
      g.fillStyle = col; g.font = 'bold 40px "PingFang SC",sans-serif';
      [...name].forEach((ch, k) => g.fillText(ch, sx + 32, sy + 100 + k * 64));
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '20px sans-serif'; g.fillText('必修', sx + 32, sy + 300);
    });
    // page edges (bottom-right quarter)
    g.fillStyle = '#ece6d6'; g.fillRect(512, 512, 512, 512);
    for (let y = 512; y < 1024; y += 3) { g.fillStyle = `rgba(150,140,120,${0.12 + Math.random() * 0.12})`; g.fillRect(512, y, 512, 1); }
    // white exercise-book covers (bottom-right, small cell) and a written page
    g.fillStyle = '#f7f4ea'; g.fillRect(768, 0, 256, 256);
    g.strokeStyle = 'rgba(80,110,170,0.4)'; g.lineWidth = 2;
    for (let y = 30; y < 250; y += 18) { g.beginPath(); g.moveTo(774, y); g.lineTo(1018, y); g.stroke(); }
    g.fillStyle = 'rgba(25,30,80,0.8)'; g.font = '13px "PingFang SC",sans-serif'; g.textAlign = 'left';
    for (let y = 44, k = 0; y < 250; y += 18, k++) g.fillText(['∵ a² + b² = c²', '解：设 x = 3', 'f(x) = 2x + 1', '∴ 原式 = 12', 'sin²α + cos²α = 1', '答：略'][k % 6], 780, y);
  }
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 8;
  const bookMat = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.85 });
  const R = (x0, y0, x1, y1) => [x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024]; // pixel rect -> uv rect
  const PAPER = R(520, 520, 1016, 1016), PAGE = R(768, 0, 1024, 256);
  const COVER = (t) => R((t % 4) * 256, Math.floor(t / 4) * 256, (t % 4) * 256 + 256, Math.floor(t / 4) * 256 + 256);
  const SPINE = (t) => R(t * 64, 512, t * 64 + 64, 960);
  /** a book: box (x = depth, y = height, z = thickness) with its spine on +x and covers on +-z */
  function book(dx, h, th, t, { spine = SPINE(t), cover = COVER(t), rotSpine = false, faces } = {}) {
    const g = new THREE.BoxGeometry(dx, h, th);
    const uv = g.attributes.uv;
    const rects = faces ?? [spine, PAPER, PAPER, PAPER, cover, cover];
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = rects[f];
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        let u = uv.getX(i), v = uv.getY(i);
        if (f === 0 && rotSpine) [u, v] = [v, 1 - u];
        uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
      }
    }
    return g;
  }
  const geos = [];
  const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    geos.push(g);
  };
  for (const b of desks) {
    if (rand() < 0.12) continue; // a few desks cleared
    const top = b.max.y, x0 = b.min.x, x1 = b.max.x, z0 = b.min.z, z1 = b.max.z;
    // the wall of books at the far edge (toward the blackboard, -x), spines facing the student
    let z = z0 + 0.02 + rand() * 0.03;
    const end = z1 - 0.03 - rand() * 0.25;
    while (z < end) {
      const t = Math.floor(rand() * 8), th = 0.008 + rand() * 0.022, h = 0.22 + rand() * 0.05, dx = 0.16 + rand() * 0.03;
      const lean = (rand() - 0.5) * 0.06;
      place(book(dx, h, th, t), x0 + 0.02 + dx / 2, top + h / 2, z + th / 2, 0, lean, 0);
      z += th + 0.001;
    }
    // a flat pile in the corner
    if (rand() < 0.6) {
      let y = top;
      const n = 2 + Math.floor(rand() * 6), cz = z1 - 0.12;
      for (let k = 0; k < n; k++) {
        const t = Math.floor(rand() * 8), th = 0.008 + rand() * 0.018;
        place(book(0.19, 0.26, th, t), x0 + 0.13 + (rand() - 0.5) * 0.03, y + th / 2, cz + (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.25 + Math.PI / 2, Math.PI / 2, 0);
        y += th;
      }
    }
    // an exercise book open at the seat
    if (rand() < 0.55) place(book(0.19, 0.004, 0.26, 0, { faces: [PAPER, PAPER, PAGE, PAPER, PAPER, PAPER] }), x1 - 0.13, top + 0.002, (z0 + z1) / 2 + (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.4);
  }
  const books = new THREE.Mesh(mergeGeometries(geos), bookMat);
  books.castShadow = books.receiveShadow = true;
  scene.add(books);

  // ---------- school bags hung on the backs of some chairs ----------
  for (const back of chairBacks) {
    if (rand() > 0.3) continue;
    const id = rand() < 0.5 ? 'furn_backpack_blue' : 'furn_backpack_black';
    const bag = await put(id, { h: 0.42, ry: -90 + (rand() - 0.5) * 16, p: [0, 0, 0] });
    bag.position.set(back.max.x + 0.09, back.max.y - 0.47, (back.min.z + back.max.z) / 2 + (rand() - 0.5) * 0.06);
    bag.rotation.z = -0.08;
  }

  // ---------- the class bookcase at the back wall, a globe on the teacher's podium ----------
  await put('furn_bookshelf_books', { h: 2.0, ry: -90, p: [5.62, 0, -2.4] });
  await put('furn_globe', { h: 0.4, ry: 30, p: [-3.88, 1.24, 1.18] });

  // ---------- light: the fluorescent tubes are on, as they always were ----------
  for (const [x, z] of [[-1.9, -1.3], [-1.9, 2.5], [2.35, -1.3], [2.35, 2.5]]) {
    const l = new THREE.PointLight('#eef3ff', 2.4, 8, 2);
    l.position.set(x, 3.0, z);
    scene.add(l);
  }
};
