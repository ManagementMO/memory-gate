// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/football-field.js); run in the app by src/showcase/build.js.
// High-school football stadium at dusk ("Friday night lights"). Everything that is plain geometry in a real stadium
// (painted turf, the track, aluminium bleachers, press box, scoreboard, goalposts, fence) is built here; props and
// light towers are models placed from the scene JSON or below.
// Coordinates: x along the field (end zone to end zone), z across (home stands at -z), y up, metres.
export default async ({ THREE, scene, renderer, loadModel, normalized, placeItem, placeGrass, texSet }) => {
  const DEG = Math.PI / 180;
  const YD = 0.9144;
  const HL = 60 * YD; // half field length incl. end zones (54.864)
  const HW = (80 / 3) * YD; // half width (24.384)
  const GL = 50 * YD; // goal line x (45.72)
  const TS = 84.39 / 2; // half of the track straight
  const R0 = 36.5; // track inner radius
  const LANE = 1.22;
  const R1 = R0 + 8 * LANE; // track outer radius (46.26)
  const RA = R1 + 1.3; // concrete apron outer edge / fence line
  const rand = mulberry(11);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const dbg = new Set((new URLSearchParams(location.search).get('dbg') ?? '').split(',')); // ?dbg=noblades,noshadow,notrees

  // ---------- helpers ----------
  function mulberry(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const add = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m; };
  function canvasTex(cv, { srgb = true, repeat = false, aniso = true } = {}) {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (aniso) t.anisotropy = maxAniso;
    return t;
  }
  // Instanced unit boxes: list of {p:[x,y,z], s:[w,h,d], ry}
  function boxes(list, mat, { cast = true, receive = true } = {}) {
    if (!list.length) return null;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.InstancedMesh(g, mat, list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((b, i) => {
      e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0);
      M.compose(new THREE.Vector3(...b.p), q.setFromEuler(e), new THREE.Vector3(...b.s));
      m.setMatrixAt(i, M);
    });
    m.computeBoundingSphere();
    return add(m, cast, receive);
  }
  // Instanced cylinders between two points: list of {a:[x,y,z], b:[x,y,z], r}
  function pipes(list, mat, radial = 10, { cast = true } = {}) {
    if (!list.length) return null;
    const g = new THREE.CylinderGeometry(1, 1, 1, radial, 1, false);
    const m = new THREE.InstancedMesh(g, mat, list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((c, i) => {
      const a = new THREE.Vector3(...c.a), b = new THREE.Vector3(...c.b);
      const d = b.clone().sub(a);
      const len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      M.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(c.r, len, c.r));
      m.setMatrixAt(i, M);
    });
    m.computeBoundingSphere();
    return add(m, cast, true);
  }
  // The stadium loop (two straights + two half circles) at radius r, sampled the same way for every r.
  function loop(r, nArc = 72, nStraight = 24) {
    const pts = [];
    for (let i = 0; i < nStraight; i++) pts.push([-TS + (2 * TS * i) / nStraight, -r, 0, -1]); // home straight (normal -z)
    for (let i = 0; i < nArc; i++) { const a = -Math.PI / 2 + (Math.PI * i) / nArc; pts.push([TS + r * Math.cos(a), r * Math.sin(a), 0, 0, a]); }
    for (let i = 0; i < nStraight; i++) pts.push([TS - (2 * TS * i) / nStraight, r, 0, 1]);
    for (let i = 0; i < nArc; i++) { const a = Math.PI / 2 + (Math.PI * i) / nArc; pts.push([-TS + r * Math.cos(a), r * Math.sin(a), 0, 0, a]); }
    return pts;
  }
  // A flat ring along the loop between radii r0..r1 (UV in metres: u along, v across).
  function loopStrip(r0, r1, y, mat, { nArc = 96, tile = 1 } = {}) {
    const a = loop(r0, nArc), b = loop(r1, nArc);
    const pos = [], uv = [], idx = [];
    const n = a.length;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const p = a[i % n], q = b[i % n];
      if (i > 0) { const pp = a[(i - 1) % n], qq = b[(i - 1) % n]; s += Math.hypot((p[0] + q[0]) / 2 - (pp[0] + qq[0]) / 2, (p[1] + q[1]) / 2 - (pp[1] + qq[1]) / 2); }
      pos.push(p[0], y, p[1], q[0], y, q[1]);
      uv.push(s / tile, 0, s / tile, (r1 - r0) / tile);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    return add(m, false, true);
  }
  // A vertical ribbon along the loop at radius r from y0 to y1 (fences, curbs). gaps: [[x0,x1,side]] cut out.
  function loopWall(r, y0, y1, mat, { nArc = 96, tile = 1, skip } = {}) {
    const a = loop(r, nArc);
    const pos = [], uv = [], idx = [];
    const n = a.length;
    let s = 0, k = 0;
    for (let i = 0; i <= n; i++) {
      const p = a[i % n];
      if (i > 0) { const pp = a[(i - 1) % n]; s += Math.hypot(p[0] - pp[0], p[1] - pp[1]); }
      pos.push(p[0], y0, p[1], p[0], y1, p[1]);
      uv.push(s / tile, 0, s / tile, (y1 - y0) / tile);
      if (i < n) {
        const q = a[(i + 1) % n];
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        if (!skip?.(mx, mz)) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      k += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return add(new THREE.Mesh(g, mat), true, true);
  }
  // a soft pool of light on the ground (cheap stand-in for a point light): additive radial decal
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x2 = c.getContext('2d');
    const gr = x2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x2.fillStyle = gr; x2.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function pool(x, z, r, color, k) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(color).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.renderOrder = 2;
    scene.add(m);
  }
  // seeded value noise for canvas work
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // =====================================================================================
  // 1. The infield: one big canvas (painted turf) on a stadium-shaped surface inside the track.
  // =====================================================================================
  const CX = TS + R0, CZ = R0; // canvas covers x in [-CX, CX], z in [-CZ, CZ]
  // A headset paints the turf at half the pixels (the full canvas alone was ~120 MB of the Quest's memory).
  const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
  const W = QUEST ? 4096 : 8192, H = Math.round((W * CZ) / CX); // ~1.9 cm per pixel (3.8 on a headset)
  const PX = W / (2 * CX); // pixels per metre
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d');
  const X = (x) => (x + CX) * PX, Z = (z) => (z + CZ) * PX;

  // turf with mowing stripes: 5-yard bands across the field, lengthwise bands outside it
  g2.fillStyle = '#4f7f31';
  g2.fillRect(0, 0, W, H);
  for (let i = -12; i < 12; i++) {
    const x0 = i * 5 * YD;
    g2.fillStyle = i % 2 === 0 ? '#5f9a3c' : '#406e27';
    g2.fillRect(X(x0), Z(-HW - 1.83), 5 * YD * PX + 1, (2 * HW + 3.66) * PX);
  }
  for (let k = 0; k < 8; k++) { // outside the sidelines: 3 m stripes running along the field
    const z0 = HW + 1.83 + k * 3;
    g2.fillStyle = k % 2 ? '#4a7a2e' : '#538736';
    g2.fillRect(0, Z(z0), W, 3 * PX + 1);
    g2.fillRect(0, Z(-z0 - 3), W, 3 * PX + 1);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 9; k++) { // D-zones behind the end lines
    const x0 = s > 0 ? HL + 1.83 + k * 3 : -HL - 1.83 - (k + 1) * 3;
    g2.fillStyle = k % 2 ? '#4a7a2e' : '#548837';
    g2.fillRect(X(x0), Z(-HW - 1.83), 3 * PX + 1, (2 * HW + 3.66) * PX);
  }
  // wear: the middle of the field (between the hashes) is trampled
  const wear = (cx, cz, rx, rz, a) => {
    const gr = g2.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(122,112,62,${a})`);
    gr.addColorStop(1, 'rgba(122,112,62,0)');
    g2.save(); g2.translate(X(cx), Z(cz)); g2.scale(rx * PX, rz * PX); g2.fillStyle = gr; g2.beginPath(); g2.arc(0, 0, 1, 0, Math.PI * 2); g2.fill(); g2.restore();
  };
  wear(0, 0, 30, 9, 0.28);
  wear(0, 0, 12, 6, 0.22);
  wear(-36, 0, 9, 5, 0.18);
  wear(36, 0, 9, 5, 0.18);
  wear(-GL + 3, 0, 4, 3, 0.25);
  wear(GL - 3, 0, 4, 3, 0.25);
  wear(-10, -HW - 6, 22, 4, 0.22); // in front of the home bench
  wear(8, HW + 6, 18, 4, 0.2);

  // paint
  const PAINT = 'rgba(246,246,240,0.93)';
  const line = (x0, z0, x1, z1) => { g2.fillRect(X(Math.min(x0, x1)), Z(Math.min(z0, z1)), Math.max(1.5, Math.abs(x1 - x0) * PX), Math.max(1.5, Math.abs(z1 - z0) * PX)); };
  g2.fillStyle = PAINT;
  const LW = 0.1016; // 4 inches
  line(-HL, -HW - LW, HL, -HW); line(-HL, HW, HL, HW + LW); // sidelines
  line(-HL - LW, -HW - LW, -HL, HW + LW); line(HL, -HW - LW, HL + LW, HW + LW); // end lines
  line(-GL - 0.2, -HW, -GL, HW); line(GL, -HW, GL + 0.2, HW); // goal lines (8")
  for (let yd = 5; yd <= 95; yd += 5) { const x = -GL + yd * YD; line(x - LW / 2, -HW + 0.1, x + LW / 2, HW - 0.1); }
  const hz = HW - 16.256; // hash marks 53'4" in from each sideline
  for (let yd = 1; yd < 100; yd++) {
    if (yd % 5 === 0) continue;
    const x = -GL + yd * YD;
    for (const s of [-1, 1]) {
      line(x - LW / 2, s * hz - 0.305, x + LW / 2, s * hz + 0.305);
      line(x - LW / 2, s * (HW - 0.1) - (s > 0 ? 0.61 : 0), x + LW / 2, s * (HW - 0.1) + (s < 0 ? 0.61 : 0)); // sideline ticks
    }
  }
  for (const s of [-1, 1]) line(s * (GL - 3 * YD) - LW / 2, -0.305, s * (GL - 3 * YD) + LW / 2, 0.305); // try line
  // limit line 6 ft outside the field, and the two team boxes between the 25s
  const LL = 1.83;
  line(-HL - LL, -HW - LL - LW, HL + LL, -HW - LL); line(-HL - LL, HW + LL, HL + LL, HW + LL + LW);
  line(-HL - LL - LW, -HW - LL, -HL - LL, HW + LL); line(HL + LL, -HW - LL, HL + LL + LW, HW + LL);
  const t25 = GL - 25 * YD;
  for (const s of [-1, 1]) {
    const z0 = s * (HW + LL), z1 = s * (HW + LL + 9.5);
    line(-t25 - LW, Math.min(z0, z1), -t25, Math.max(z0, z1));
    line(t25, Math.min(z0, z1), t25 + LW, Math.max(z0, z1));
    line(-t25, z1 - LW / 2, t25, z1 + LW / 2);
  }
  // yard numbers (6 ft tall, tops 9 yd from the sideline) and direction arrows
  const NUMH = 1.83;
  const drawGlyph = (txt, x, z, rot, hM, font, fill, stroke, sw, scaleX = 1) => {
    g2.save();
    g2.translate(X(x), Z(z));
    g2.rotate(rot);
    g2.font = `${font} ${Math.round(hM * PX * 1.36)}px ${'Impact, "Arial Black", sans-serif'}`;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.scale(scaleX, 1);
    if (stroke) { g2.lineJoin = 'round'; g2.lineWidth = sw * PX; g2.strokeStyle = stroke; g2.strokeText(txt, 0, 0); }
    g2.fillStyle = fill;
    g2.fillText(txt, 0, 0);
    g2.restore();
  };
  for (const yd of [10, 20, 30, 40, 50, 40, 30, 20, 10].map((v, i) => [v, (i + 1) * 10])) {
    const [num, pos] = yd;
    const x = -GL + pos * YD;
    for (const s of [-1, 1]) {
      const zc = s * (HW - 8.23 + NUMH / 2);
      const rot = s < 0 ? Math.PI : 0; // tops point to the middle of the field (upright for the sideline that owns them)
      const digits = String(num).split('');
      const dirs = s < 0 ? [1, -1] : [-1, 1]; // first digit on the reader's left
      digits.forEach((d, k) => drawGlyph(d, x + dirs[k] * 0.95, zc, rot, NUMH, 'normal', PAINT, null, 0, 0.92));
      if (num !== 50) { // arrow toward the nearer goal line, beside the outer digit
        const dir = pos < 50 ? -1 : 1;
        const ax = x + dir * 2.25, az = s * (HW - 8.23 + 0.35);
        g2.beginPath();
        g2.moveTo(X(ax + dir * 0.46), Z(az));
        g2.lineTo(X(ax - dir * 0.1), Z(az - 0.23));
        g2.lineTo(X(ax - dir * 0.1), Z(az + 0.23));
        g2.closePath();
        g2.fill();
      }
    }
  }
  // end zones: school name and mascot in maroon with gold outline; midfield logo
  const MAROON = '#6d1626', GOLD = '#e9b42c';
  g2.save();
  g2.beginPath(); g2.rect(X(GL + 0.2), Z(-HW), (HL - GL - 0.2) * PX, 2 * HW * PX); g2.clip();
  g2.fillStyle = 'rgba(109,22,38,0.88)'; g2.fillRect(X(GL + 0.2), Z(-HW), (HL - GL - 0.2) * PX, 2 * HW * PX);
  for (let k = -12; k < 12; k++) { // diagonal pinstripes
    g2.strokeStyle = 'rgba(246,246,240,0.85)'; g2.lineWidth = 0.1 * PX;
    g2.beginPath(); g2.moveTo(X(GL + 0.2), Z(k * 4)); g2.lineTo(X(HL), Z(k * 4 + (HL - GL))); g2.stroke();
  }
  g2.restore();
  g2.save();
  g2.beginPath(); g2.rect(X(-HL), Z(-HW), (HL - GL - 0.2) * PX, 2 * HW * PX); g2.clip();
  g2.fillStyle = 'rgba(109,22,38,0.88)'; g2.fillRect(X(-HL), Z(-HW), (HL - GL - 0.2) * PX, 2 * HW * PX);
  for (let k = -12; k < 12; k++) {
    g2.strokeStyle = 'rgba(246,246,240,0.85)'; g2.lineWidth = 0.1 * PX;
    g2.beginPath(); g2.moveTo(X(-GL - 0.2), Z(k * 4)); g2.lineTo(X(-HL), Z(k * 4 + (HL - GL))); g2.stroke();
  }
  g2.restore();
  const ezWord = (txt, xc, rot) => {
    const hM = 5.0;
    g2.save(); g2.translate(X(xc), Z(0)); g2.rotate(rot);
    g2.font = `${Math.round(hM * PX * 1.3)}px Impact, "Arial Black", sans-serif`;
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    const w = g2.measureText(txt).width; const sx = Math.min(1, (2 * HW - 6) * PX / w);
    g2.scale(sx * 1.0, 1);
    g2.lineJoin = 'round'; g2.lineWidth = 0.55 * PX; g2.strokeStyle = 'rgba(246,246,240,0.95)'; g2.strokeText(txt, 0, 0);
    g2.lineWidth = 0.28 * PX; g2.strokeStyle = GOLD; g2.strokeText(txt, 0, 0);
    g2.fillStyle = MAROON; g2.fillText(txt, 0, 0);
    g2.restore();
  };
  const ezC = (GL + 0.2 + HL) / 2;
  ezWord('PANTHERS', ezC, -Math.PI / 2); // letter tops toward the goal line
  ezWord('LINCOLN', -ezC, Math.PI / 2);
  // midfield: a gold-ringed maroon disc with a white block L, readable from the home stands
  g2.save(); g2.translate(X(0), Z(0));
  g2.beginPath(); g2.arc(0, 0, 4.3 * PX, 0, Math.PI * 2); g2.fillStyle = 'rgba(246,246,240,0.92)'; g2.fill();
  g2.beginPath(); g2.arc(0, 0, 4.0 * PX, 0, Math.PI * 2); g2.fillStyle = GOLD; g2.fill();
  g2.beginPath(); g2.arc(0, 0, 3.55 * PX, 0, Math.PI * 2); g2.fillStyle = MAROON; g2.fill();
  g2.rotate(Math.PI);
  g2.font = `${Math.round(5.2 * PX)}px Impact, "Arial Black", sans-serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.lineWidth = 0.3 * PX; g2.strokeStyle = GOLD; g2.lineJoin = 'round'; g2.strokeText('L', 0, 0.2 * PX);
  g2.fillStyle = 'rgba(246,246,240,0.97)'; g2.fillText('L', 0, 0.2 * PX);
  g2.restore();

  // grain: mottling (a small noise canvas scaled up) + a tiled speckle, blended soft-light, so the turf and the
  // paint on it never look flat
  {
    const mw = 1024, mh = Math.round((1024 * H) / W);
    const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
    const m2 = mc.getContext('2d');
    const mi = m2.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const xm = (x / mw) * 2 * CX, zm = (y / mh) * 2 * CZ;
      const v = (vnoise(xm * 0.3, zm * 0.3) - 0.5) * 0.9 + (vnoise(xm * 1.3, zm * 1.3) - 0.5) * 0.6;
      const c = Math.max(0, Math.min(255, 128 + v * 110));
      const i = (y * mw + x) * 4;
      mi.data[i] = mi.data[i + 1] = mi.data[i + 2] = c; mi.data[i + 3] = 255;
    }
    m2.putImageData(mi, 0, 0);
    g2.save();
    g2.globalCompositeOperation = 'soft-light';
    g2.imageSmoothingEnabled = true;
    g2.drawImage(mc, 0, 0, W, H);
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const s2 = sc.getContext('2d');
    const si = s2.createImageData(256, 256);
    const r = mulberry(5);
    for (let i = 0; i < 256 * 256; i++) { const c = 128 + (r() - 0.5) * 150 + (r() < 0.04 ? 60 : 0); si.data[i * 4] = si.data[i * 4 + 1] = si.data[i * 4 + 2] = c; si.data[i * 4 + 3] = 255; }
    s2.putImageData(si, 0, 0);
    g2.fillStyle = g2.createPattern(sc, 'repeat');
    g2.fillRect(0, 0, W, H);
    g2.restore();
  }
  const turfPixels = g2.getImageData(0, 0, W, H).data;
  const turfTex = canvasTex(cv);
  turfTex.generateMipmaps = true;
  turfTex.minFilter = THREE.LinearMipmapLinearFilter;
  {
    // stadium-shaped infield surface with UVs into the canvas
    const shape = new THREE.Shape();
    const L = loop(R0, 96);
    shape.moveTo(L[0][0], -L[0][1]);
    for (const p of L.slice(1)) shape.lineTo(p[0], -p[1]);
    const geo = new THREE.ShapeGeometry(shape, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + CX) / (2 * CX); uv[i * 2 + 1] = 1 - (pos.getZ(i) + CZ) / (2 * CZ); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const grassDetail = texSet('leafy_grass', [1, 1]);
    const mat = std({ map: turfTex, roughness: 0.92, metalness: 0 });
    // fine grass detail from the Poly Haven normal map, tiled every 1.5 m on top of the painted canvas
    mat.normalMap = grassDetail.normalMap.clone();
    mat.normalMap.repeat.set(1, 1);
    mat.normalScale.set(0.6, 0.6);
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace('#include <normal_fragment_maps>', `
          vec3 mapN = texture2D( normalMap, vWorldXZ / 1.5 ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );`);
    };
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // 3D blades near the home sideline, coloured from the painted canvas so lines and stripes carry through
  const blades = (spec) => {
    placeGrass(spec);
    const mesh = scene.children[scene.children.length - 1];
    { // cheaper shading for ~half a million blades under eight lights: Lambert with the same wind/height shader
      const old = mesh.material;
      const lam = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, color: '#ffffff' });
      lam.onBeforeCompile = (sh) => { old.onBeforeCompile(sh); sh.fragmentShader = sh.fragmentShader.replace('mix(0.32, 1.12,', 'mix(0.5, 1.0,'); };
      mesh.material = lam; old.dispose();
    }
    const M = new THREE.Matrix4(), c = new THREE.Color(), r = mulberry(spec.seed ?? 3);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, M);
      const x = M.elements[12], z = M.elements[14];
      const px = Math.min(W - 1, Math.max(0, Math.round((x + CX) * PX))), py = Math.min(H - 1, Math.max(0, Math.round((z + CZ) * PX)));
      const k = (py * W + px) * 4;
      const f = (spec.bright ?? 1.25) * (0.8 + r() * 0.4);
      c.setRGB(Math.min(1, (turfPixels[k] / 255) * f), Math.min(1, (turfPixels[k + 1] / 255) * f), Math.min(1, (turfPixels[k + 2] / 255) * f), THREE.SRGBColorSpace);
      mesh.setColorAt(i, c);
    }
    mesh.instanceColor.needsUpdate = true;
    return mesh;
  };
  if (!dbg.has('noblades')) blades({ area: { c: [-8, -29], r: 12.5 }, falloff: 0.5, exclude: [[-60, -60, 60, -36.4]], density: 2400, max: 430000, height: [0.035, 0.07], width: 0.007, segments: 3, uniform: true, lean: 0.35, wind: 0.05, y: 0.0, seed: 21, bright: 0.72 });

  // =====================================================================================
  // 2. Track: red rubber, white lane lines, a raised inner curb, concrete apron
  // =====================================================================================
  {
    const ts = texSet('rubberized_track', [1, 1]);
    const mk = (k) => { const t = ts[k].clone(); t.repeat.set(1 / 2.5, 1 / 2.5); t.needsUpdate = true; return t; };
    const trackMat = std({ color: '#c96a55', roughness: 0.95, map: mk('map'), normalMap: mk('normalMap'), roughnessMap: mk('roughnessMap') });
    loopStrip(R0, R1, 0.0, trackMat, { tile: 1 });
    const laneMat = std({ color: '#f2f0ea', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    for (let i = 1; i <= 8; i++) loopStrip(R0 + i * LANE - 0.05, R0 + i * LANE, 0.003, laneMat);
    // finish line + lane numbers area on the home straight near the east end
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 8 * LANE), laneMat);
    fin.rotation.x = -Math.PI / 2; fin.position.set(TS - 0.5, 0.004, -(R0 + 4 * LANE)); add(fin, false);
    const curbMat = std({ color: '#d9dcdf', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
    loopWall(R0 - 0.05, 0, 0.05, curbMat); loopWall(R0, 0, 0.05, curbMat);
    loopStrip(R0 - 0.05, R0, 0.05, curbMat);
    const concrete = texSet('rubberized_track', [1, 1]); // reuse normal map for a little grit
    const apronMat = std({ color: '#a8a49c', roughness: 0.95, normalMap: concrete.normalMap });
    loopStrip(R1, RA, 0.0, apronMat, { tile: 3 });
  }

  // =====================================================================================
  // 3. Chain-link fence on the apron (with gates opposite the 50 on both sides)
  // =====================================================================================
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x2 = c.getContext('2d');
    x2.clearRect(0, 0, 128, 128);
    x2.strokeStyle = '#ffffff'; x2.lineWidth = 7; x2.lineCap = 'round';
    x2.beginPath(); x2.moveTo(0, 64); x2.lineTo(64, 0); x2.lineTo(128, 64); x2.lineTo(64, 128); x2.closePath(); x2.stroke();
    const t = canvasTex(c, { repeat: true });
    const fenceMat = std({ color: '#9aa0a6', map: t, alphaTest: 0.35, metalness: 0.75, roughness: 0.4, side: THREE.DoubleSide });
    fenceMat.alphaToCoverage = true;
    const gate = (x, z) => Math.abs(x) < 3 && Math.abs(z) > R1;
    const tile = 0.06; // a 6 cm mesh
    const wall = loopWall(RA - 0.1, 0.05, 1.22, fenceMat, { tile, skip: gate });
    wall.castShadow = false;
    // posts every ~3 m and a top rail
    const posts = [], rails = [];
    const L = loop(RA - 0.1, 96, 24);
    let acc = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i], q = L[(i + 1) % L.length];
      const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      if (!gate(mx, mz)) rails.push({ a: [p[0], 1.24, p[1]], b: [q[0], 1.24, q[1]], r: 0.021 });
      acc += seg;
      if (acc > 3 && !gate(p[0], p[1])) { posts.push({ a: [p[0], 0, p[1]], b: [p[0], 1.28, p[1]], r: 0.032 }); acc = 0; }
    }
    for (const sx of [-3, 3]) for (const sz of [-1, 1]) posts.push({ a: [sx, 0, sz * (RA - 0.1)], b: [sx, 1.3, sz * (RA - 0.1)], r: 0.045 });
    const galv = std({ color: '#b9bec2', metalness: 0.85, roughness: 0.35 });
    pipes(posts, galv, 10);
    pipes(rails, galv, 8, { cast: false });
  }

  // vinyl banners zip-tied to the fence: school spirit on the home side, local sponsors on the visitor side
  {
    const banner = (txt, sub, bg, fg, x, side, w = 4.2) => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 220;
      const b = c.getContext('2d');
      b.fillStyle = bg; b.fillRect(0, 0, 1024, 220);
      b.strokeStyle = fg; b.lineWidth = 10; b.strokeRect(14, 14, 996, 192);
      b.fillStyle = fg; b.textAlign = 'center'; b.textBaseline = 'middle';
      b.font = `bold ${sub ? 96 : 120}px Impact, "Arial Black", sans-serif`; b.fillText(txt, 512, sub ? 88 : 112);
      if (sub) { b.font = 'bold 50px Arial, sans-serif'; b.fillText(sub, 512, 168); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 220 / 1024), std({ map: canvasTex(c), roughness: 0.75 }));
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 220 / 1024), std({ color: '#e9e6df', roughness: 0.8 }));
      const z = side < 0 ? -(RA - 0.03) : RA - 0.17;
      m.position.set(x, 0.66, z);
      // home spirit banners face the home stands, sponsor banners face the field; the back is plain white vinyl
      m.rotation.y = Math.PI;
      back.position.copy(m.position); back.rotation.y = m.rotation.y + Math.PI;
      add(m, false, true); add(back, false, true);
    };
    const hb = [
      ['GO PANTHERS!', null, MAROON, '#f2c14e'], ['LINCOLN FOOTBALL', 'EST. 1952', '#f2efe6', MAROON], ['STATE CHAMPIONS', '1987 · 1994 · 2011', MAROON, '#ffffff'],
      ['SENIOR NIGHT', 'CLASS OF 2026', '#f2c14e', MAROON], ['#PANTHERPRIDE', null, '#1b1b1d', '#f2c14e'], ['BEAT THE BULLDOGS', null, MAROON, '#ffffff'],
    ];
    hb.forEach((b, i) => banner(b[0], b[1], b[2], b[3], -23 + i * 9.2, -1));
    const vb = [
      ['HOMETOWN HARDWARE', '412 Main Street', '#1d4e2b', '#ffffff'], ['SUNRISE DINER', 'Breakfast all day', '#f6efe1', '#b3261e'], ['PATEL FAMILY DENTAL', 'Smile, Panthers!', '#1f4f8a', '#ffffff'],
      ['VALLEY AG CO-OP', 'Feed · Seed · Fuel', '#f2c14e', '#2a2a2a'], ['DALE\'S PIZZA BARN', null, '#b3261e', '#ffffff'],
    ];
    vb.forEach((b, i) => banner(b[0], b[1], b[2], b[3], -19 + i * 9.5, 1));
  }

  // =====================================================================================
  // 4. Goalposts (yellow gooseneck, high-school width 23'4", crossbar 10 ft), pylons
  // =====================================================================================
  {
    const yellow = std({ color: '#f1c40f', roughness: 0.38, metalness: 0.15 });
    const padMat = std({ color: MAROON, roughness: 0.7 });
    const ribbon = std({ color: '#ff5a1f', roughness: 0.8, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const xe = s * HL; // on the end line
      const xb = xe + s * 1.85; // base post behind it
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xb, 0, 0), new THREE.Vector3(xb, 1.6, 0), new THREE.Vector3(xb, 2.35, 0),
        new THREE.Vector3(xb - s * 0.35, 2.9, 0), new THREE.Vector3(xe + s * 0.6, 3.048, 0), new THREE.Vector3(xe, 3.048, 0),
      ], false, 'catmullrom', 0.2);
      add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.085, 16, false), yellow));
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.9, 24), padMat)).position.set(xb, 0.95, 0);
      const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 7.112 + 0.13, 16), yellow));
      bar.rotation.x = Math.PI / 2; bar.position.set(xe, 3.048, 0);
      for (const zs of [-1, 1]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 6.1, 14), yellow)).position.set(xe, 3.048 + 3.05, zs * 3.556);
        const rb = add(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.05), ribbon), false);
        rb.position.set(xe + s * 0.05, 3.048 + 6.1 - 0.5, zs * 3.556 + 0.06);
        rb.rotation.set(0.12, 0.6 * s, 0.25);
      }
    }
    const pylon = std({ color: '#ff6a13', roughness: 0.6 });
    const pl = [];
    for (const sx of [-1, 1]) for (const xx of [GL, HL]) for (const sz of [-1, 1]) pl.push({ p: [sx * (xx + 0.06), 0.23, sz * (HW + 0.06)], s: [0.1, 0.46, 0.1] });
    boxes(pl, pylon);
  }

  // =====================================================================================
  // 5. Aluminium bleachers (closed deck), press box on the home side
  // =====================================================================================
  const alu = std({ color: '#c4c9ce', metalness: 0.85, roughness: 0.38 });
  const aluDark = std({ color: '#8f969c', metalness: 0.8, roughness: 0.5 });
  const steel = std({ color: '#5d6166', metalness: 0.7, roughness: 0.55 });
  {
    // plank ribs: a tiny normal map of grooves along the planks
    const c = document.createElement('canvas'); c.width = 8; c.height = 64;
    const x2 = c.getContext('2d');
    for (let y = 0; y < 64; y++) { const a = Math.sin((y / 64) * Math.PI * 2 * 8); x2.fillStyle = `rgb(128,${Math.round(128 + a * 90)},255)`; x2.fillRect(0, y, 8, 1); }
    const nt = canvasTex(c, { srgb: false, repeat: true });
    alu.normalMap = nt; alu.normalScale.set(0.6, 0.6);
  }
  function bleachers({ x0, x1, zFront, dir, rows, depth = 0.61, rise = 0.33, frontY = 1.1, aisles = [] }) {
    const seats = [], decks = [], risers = [], legs = [], brackets = [], rails = [], treads = [];
    const len = x1 - x0;
    const sections = [];
    let cur = x0;
    for (const a of [...aisles].sort((p, q) => p - q)) { sections.push([cur, a - 0.6]); cur = a + 0.6; }
    sections.push([cur, x1]);
    for (let r = 0; r < rows; r++) {
      const y = frontY + r * rise;
      const zc = zFront + dir * (r * depth + depth / 2);
      decks.push({ p: [(x0 + x1) / 2, y - 0.02, zc], s: [len, 0.04, depth] });
      risers.push({ p: [(x0 + x1) / 2, y + rise / 2 - 0.02, zFront + dir * ((r + 1) * depth)], s: [len, rise, 0.02] });
      for (const [a, b] of sections) {
        seats.push({ p: [(a + b) / 2, y + 0.42, zc + dir * 0.12], s: [b - a, 0.045, 0.26] });
        for (let x = a + 0.4; x < b; x += 1.8) brackets.push({ p: [x, y + 0.2, zc + dir * 0.12], s: [0.05, 0.4, 0.06] });
      }
      for (const a of aisles) treads.push({ p: [a, y + rise / 2 - 0.02, zc - dir * depth * 0.25], s: [1.15, 0.04, depth / 2] });
    }
    const top = frontY + rows * rise;
    const zBack = zFront + dir * rows * depth;
    // under-structure: columns at the back and a front fascia
    for (let x = x0; x <= x1 + 0.01; x += 3.2) {
      legs.push({ p: [x, top / 2, zBack - dir * 0.15], s: [0.12, top, 0.12] });
      legs.push({ p: [x, frontY / 2, zFront + dir * 0.1], s: [0.1, frontY, 0.1] });
    }
    const fascia = [{ p: [(x0 + x1) / 2, frontY / 2 - 0.02, zFront], s: [len, frontY - 0.04, 0.03] }];
    // side panels (closed ends) and back wall
    const sides = [];
    for (const xe of [x0 - 0.03, x1 + 0.03]) for (let r = 0; r < rows; r++) {
      const h = frontY + (r + 1) * rise;
      sides.push({ p: [xe, h / 2, zFront + dir * (r * depth + depth / 2)], s: [0.04, h, depth] });
    }
    sides.push({ p: [(x0 + x1) / 2, top / 2, zBack + dir * 0.02], s: [len + 0.1, top, 0.04] });
    // guard rails: front, back (taller) and up each aisle
    const gr = (a, b, r = 0.024) => rails.push({ a, b, r });
    gr([x0, frontY + 1.07, zFront + dir * 0.05], [x1, frontY + 1.07, zFront + dir * 0.05]);
    gr([x0, frontY + 0.55, zFront + dir * 0.05], [x1, frontY + 0.55, zFront + dir * 0.05], 0.018);
    for (let x = x0; x <= x1 + 0.01; x += 2.4) gr([x, frontY, zFront + dir * 0.05], [x, frontY + 1.07, zFront + dir * 0.05], 0.022);
    gr([x0, top + 1.07, zBack - dir * 0.05], [x1, top + 1.07, zBack - dir * 0.05]);
    for (let x = x0; x <= x1 + 0.01; x += 2.4) gr([x, top, zBack - dir * 0.05], [x, top + 1.07, zBack - dir * 0.05], 0.022);
    for (const xe of [x0, x1]) gr([xe, frontY + 1.07, zFront], [xe, top + 1.07, zBack]);
    for (const a of aisles) {
      gr([a, frontY + 0.9, zFront + dir * 0.4], [a, top + 0.9, zBack - dir * 0.3], 0.022);
      for (let r = 0; r <= rows; r += 3) gr([a, frontY + r * rise, zFront + dir * (r * depth + 0.3)], [a, frontY + r * rise + 0.9 + 0.0, zFront + dir * (r * depth + 0.3)], 0.022);
    }
    boxes(seats, alu); boxes(decks, aluDark); boxes(risers, aluDark); boxes(treads, alu);
    boxes(brackets, steel, { cast: false }); boxes(legs, steel); boxes(fascia, aluDark); boxes(sides, aluDark);
    pipes(rails, alu, 8);
    return { top, zBack };
  }
  const zHome = -(RA + 3.2);
  const home = bleachers({ x0: -27, x1: 27, zFront: zHome, dir: -1, rows: 22, frontY: 1.25, aisles: [-13.5, 0, 13.5] });
  const away = bleachers({ x0: -22, x1: 22, zFront: RA + 3.2, dir: 1, rows: 15, frontY: 1.0, rise: 0.31, aisles: [-7.3, 7.3] });
  // painted skirt on the front of the home stand
  {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 96;
    const x2 = c.getContext('2d');
    x2.fillStyle = MAROON; x2.fillRect(0, 0, 4096, 96);
    x2.fillStyle = GOLD; x2.fillRect(0, 6, 4096, 5); x2.fillRect(0, 85, 4096, 5);
    x2.fillStyle = '#f4efe2'; x2.font = 'bold 60px Impact, "Arial Black", sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    for (const [t, x] of [['PANTHERS', 600], ['HOME OF THE LINCOLN PANTHERS', 2048], ['PANTHERS', 3496]]) x2.fillText(t, x, 50);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(54, 1.15), std({ map: canvasTex(c), roughness: 0.7 }));
    m.position.set(0, 0.62, zHome + 0.035);
    add(m, false, true);
  }
  // concrete walk in front of each stand
  {
    const cmat = std({ color: '#9e9a92', roughness: 0.95 });
    boxes([{ p: [0, -0.02, (zHome + -RA) / 2], s: [70, 0.08, Math.abs(zHome + RA)] }, { p: [0, -0.02, (RA + 3.2 + RA) / 2], s: [50, 0.08, 3.2] }], cmat, { cast: false });
  }
  // press box on top of the home stand
  {
    const y0 = home.top + 0.35, zb = home.zBack;
    const PB = { x0: -11, x1: 11, d: 4.2, h: 3.1 };
    const wall = std({ color: '#d8d2c4', roughness: 0.85 });
    const trim = std({ color: MAROON, roughness: 0.6 });
    const zc = zb + 0.3 - PB.d / 2; // behind the top row, on steel columns
    const cols = [];
    for (const x of [PB.x0, PB.x0 / 2, 0, PB.x1 / 2, PB.x1]) cols.push({ p: [x, y0 / 2, zc - PB.d / 2 + 0.2], s: [0.25, y0, 0.25] }, { p: [x, y0 / 2, zc + 0.4], s: [0.22, y0, 0.22] });
    boxes(cols, steel);
    boxes([
      { p: [0, y0 + 0.05, zc], s: [PB.x1 - PB.x0 + 0.6, 0.1, PB.d + 0.8] }, // floor slab
      { p: [0, y0 + PB.h / 2, zc - PB.d / 2 + 0.1], s: [PB.x1 - PB.x0, PB.h, 0.2] }, // back wall
      { p: [PB.x0, y0 + PB.h / 2, zc], s: [0.2, PB.h, PB.d] }, { p: [PB.x1, y0 + PB.h / 2, zc], s: [0.2, PB.h, PB.d] },
      { p: [0, y0 + 0.55, zc + PB.d / 2 - 0.1], s: [PB.x1 - PB.x0, 1.1, 0.2] }, // sill wall under the windows
    ], wall);
    boxes([
      { p: [0, y0 + PB.h + 0.12, zc + 0.15], s: [PB.x1 - PB.x0 + 1.2, 0.24, PB.d + 1.1] }, // roof with overhang
      { p: [0, y0 + PB.h - 0.25, zc + PB.d / 2 - 0.08], s: [PB.x1 - PB.x0, 0.5, 0.24] }, // header band
    ], trim);
    // window band: warm interior behind glass, mullions every 1.4 m
    const win = new THREE.Mesh(new THREE.PlaneGeometry(PB.x1 - PB.x0 - 0.2, PB.h - 1.6), std({ color: '#2a2018', emissive: '#ffc98a', emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.0 }));
    win.position.set(0, y0 + 1.1 + (PB.h - 1.6) / 2, zc + PB.d / 2 - 0.12); add(win, false);
    const mull = [];
    for (let x = PB.x0 + 0.1; x <= PB.x1; x += 1.4) mull.push({ p: [x, y0 + 1.1 + (PB.h - 1.6) / 2, zc + PB.d / 2 - 0.08], s: [0.08, PB.h - 1.6, 0.1] });
    boxes(mull, steel, { cast: false });
    // sign on the header band
    const sc = document.createElement('canvas'); sc.width = 2048; sc.height = 96;
    const s2 = sc.getContext('2d');
    s2.fillStyle = MAROON; s2.fillRect(0, 0, 2048, 96);
    s2.fillStyle = '#f4efe2'; s2.font = 'bold 66px Impact, "Arial Black", sans-serif'; s2.textAlign = 'center'; s2.textBaseline = 'middle';
    s2.fillText('LINCOLN HIGH SCHOOL  ·  HOME OF THE PANTHERS', 1024, 50);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(PB.x1 - PB.x0 - 0.4, 0.42), std({ map: canvasTex(sc), roughness: 0.6, emissive: '#ffffff', emissiveMap: canvasTex(sc), emissiveIntensity: 0.12 }));
    sign.position.set(0, y0 + PB.h - 0.25, zc + PB.d / 2 + 0.045); add(sign, false);
    // camera deck railing on the roof
    const rr = [];
    const ry = y0 + PB.h + 0.24;
    rr.push({ a: [PB.x0, ry + 1.0, zc + PB.d / 2 + 0.6], b: [PB.x1, ry + 1.0, zc + PB.d / 2 + 0.6], r: 0.025 });
    for (let x = PB.x0; x <= PB.x1 + 0.01; x += 2.2) rr.push({ a: [x, ry, zc + PB.d / 2 + 0.6], b: [x, ry + 1.0, zc + PB.d / 2 + 0.6], r: 0.022 });
    pipes(rr, alu, 8);
    // stairs/columns behind (seen from the stands camera only as silhouettes)
  }

  // =====================================================================================
  // 6. Scoreboard behind the east end zone, with sponsor panel
  // =====================================================================================
  {
    const SX = HL + 15; // in the east D-zone, behind the goalpost
    const BW = 10.4, BH = 4.6, BY = 4.2;
    const face = document.createElement('canvas'); face.width = 2080; face.height = 920;
    const glow = document.createElement('canvas'); glow.width = 2080; glow.height = 920;
    const f = face.getContext('2d'), gl = glow.getContext('2d');
    f.fillStyle = '#111214'; f.fillRect(0, 0, 2080, 920);
    gl.fillStyle = '#000'; gl.fillRect(0, 0, 2080, 920);
    f.fillStyle = MAROON; f.fillRect(0, 0, 2080, 170);
    f.fillStyle = GOLD; f.fillRect(0, 170, 2080, 10);
    f.fillStyle = '#f6f1e4'; f.font = 'bold 118px Impact, "Arial Black", sans-serif'; f.textAlign = 'center'; f.textBaseline = 'middle';
    f.fillText('LINCOLN  PANTHERS', 1040, 92);
    const label = (t, x, y, size = 64) => { f.fillStyle = '#f2f2ee'; f.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`; f.textAlign = 'center'; f.fillText(t, x, y); };
    const led = (t, x, y, size, color, cells) => {
      // dark unlit segments first, then the lit digits on both the face and the emissive map
      f.font = `${size}px "Courier New", monospace`; f.textAlign = 'center'; f.textBaseline = 'middle';
      f.fillStyle = 'rgba(70,20,20,0.6)'; f.fillText('8'.repeat(cells), x, y);
      for (const c of [f, gl]) { c.font = `bold ${size}px "Courier New", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(t, x, y); }
    };
    label('HOME', 330, 250); label('GUESTS', 1750, 250); label('TIME', 1040, 250);
    led('21', 330, 420, 250, '#ff3b22', 2); led('14', 1750, 420, 250, '#ff3b22', 2); led('4:52', 1040, 410, 210, '#ffb020', 4);
    label('BALL ON', 330, 640, 54); label('DOWN', 780, 640, 54); label('TO GO', 1300, 640, 54); label('QTR', 1750, 640, 54);
    led('35', 330, 770, 150, '#ffb020', 2); led('3', 780, 770, 150, '#ffb020', 1); led('6', 1300, 770, 150, '#ffb020', 1); led('4', 1750, 770, 150, '#ffb020', 1);
    for (const x of [600, 1480]) { f.fillStyle = '#2a2b2e'; f.fillRect(x - 3, 210, 6, 330); }
    const mat = std({ map: canvasTex(face), emissive: '#ffffff', emissiveMap: canvasTex(glow), emissiveIntensity: 3.2, roughness: 0.55 });
    const back = std({ color: '#2b2d31', roughness: 0.7, metalness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, BH, BW), [back, mat, back, back, back, back]); // -x face looks at the field
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z ; we want the face toward -x: rotate so +z face points to -x
    box.position.set(SX, BY + BH / 2, 0);
    add(box);
    // sponsor panel below
    const sp = document.createElement('canvas'); sp.width = 2048; sp.height = 300;
    const p2 = sp.getContext('2d');
    p2.fillStyle = '#f3efe6'; p2.fillRect(0, 0, 2048, 300);
    p2.fillStyle = '#1d3f73'; p2.fillRect(0, 0, 1010, 300);
    p2.fillStyle = '#b8231c'; p2.fillRect(1038, 0, 1010, 300);
    p2.fillStyle = '#ffffff'; p2.font = 'bold 92px Georgia, serif'; p2.textAlign = 'center'; p2.textBaseline = 'middle';
    p2.fillText('First Farmers Bank', 505, 120); p2.font = '52px Georgia, serif'; p2.fillText('Proud Panther Sponsor', 505, 220);
    p2.font = 'bold 100px Impact, "Arial Black", sans-serif'; p2.fillText("DALE'S PIZZA BARN", 1543, 120); p2.font = '52px Arial, sans-serif'; p2.fillText('Main St. · Open late', 1543, 220);
    const spm = std({ map: canvasTex(sp), roughness: 0.6, emissive: '#ffffff', emissiveMap: canvasTex(sp), emissiveIntensity: 0.18 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.5, BW - 0.4), [back, spm, back, back, back, back]);
    panel.position.set(SX, BY - 0.95, 0); add(panel);
    boxes([{ p: [SX + 0.3, (BY + BH) / 2, -3.6], s: [0.35, BY + BH, 0.35] }, { p: [SX + 0.3, (BY + BH) / 2, 3.6], s: [0.35, BY + BH, 0.35] }], steel);
    // a few lamps over the sponsor panel
  }

  // =====================================================================================
  // 7. Light towers (model), aimed at the field, with lamp glow and the actual floodlighting
  // =====================================================================================
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x2 = c.getContext('2d');
    const gr = x2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,250,235,0.85)'); gr.addColorStop(0.35, 'rgba(255,235,200,0.22)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
    x2.fillStyle = gr; x2.fillRect(0, 0, 128, 128);
    return canvasTex(c, { aniso: false });
  })();
  const TH = 27; // tower height
  const towers = [[-30, -(RA + 1.8)], [30, -(RA + 1.8)], [-30, RA + 1.8], [30, RA + 1.8]];
  const towerSrc = await loadModel('sport_light_tower');
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x2 = c.getContext('2d');
    const gr = x2.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,244,220,0.55)'); gr.addColorStop(0.25, 'rgba(255,236,205,0.18)'); gr.addColorStop(0.6, 'rgba(255,228,190,0.05)'); gr.addColorStop(1, 'rgba(255,228,190,0)');
    x2.fillStyle = gr; x2.fillRect(0, 0, 256, 256);
    return canvasTex(c, { aniso: false });
  })();
  for (const [tx, tz] of towers) {
    const node = normalized(towerSrc, { h: TH });
    // the model's lamp bank faces +x; turn it toward a point beyond the middle of the field
    const aim = new THREE.Vector3(-tx * 0.35, 0, -tz * 0.25);
    const theta = Math.atan2(-(aim.z - tz), aim.x - tx);
    node.rotation.y = theta;
    node.position.set(tx, 0, tz);
    scene.add(node);
    const fwd = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
    const side = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    // the lamps are lit
    node.traverse((o) => {
      if (o.isMesh && o.material?.name === 'Material.004') { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#fff1da'); o.material.emissiveIntensity = 2.2; }
    });
    // lamp glow (5 x 3) and one big halo per bank. Points, not sprites: the AO pass skips points.
    const lamp = [];
    for (const fy of [0.959, 0.878, 0.8]) for (const fs of [-0.1348, -0.0674, 0, 0.0674, 0.1348]) {
      const v = new THREE.Vector3(tx, fy * TH, tz).addScaledVector(side, fs * TH).addScaledVector(fwd, 0.9);
      lamp.push(v.x, v.y, v.z);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(lamp, 3));
    scene.add(new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, color: '#fff4e2', size: 5.0, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
    const hg = new THREE.BufferGeometry();
    const hp = new THREE.Vector3(tx, 0.88 * TH, tz).addScaledVector(fwd, 1.5);
    hg.setAttribute('position', new THREE.Float32BufferAttribute([hp.x, hp.y, hp.z], 3));
    scene.add(new THREE.Points(hg, new THREE.PointsMaterial({ map: haloTex, color: '#ffffff', size: 48, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
    // floodlight: a spot from the lamp bank to the field
    const head = new THREE.Vector3(tx, 0.88 * TH, tz).addScaledVector(fwd, 1.0);
    const sp = new THREE.SpotLight('#fff4e4', 8200, 0, 50 * DEG, 0.9, 2);
    sp.position.copy(head);
    sp.target.position.copy(aim);
    sp.castShadow = !dbg.has('noshadow');
    sp.shadow.mapSize.set(2048, 2048);
    sp.shadow.bias = -0.0003;
    sp.shadow.normalBias = 0.04;
    sp.shadow.camera.near = 8;
    sp.shadow.camera.far = 160;
    scene.add(sp, sp.target);
  }

  // Instances that may be mirrored (negative x scale): mirrored ones go in their own InstancedMesh whose object
  // transform is a mirror, so three.js flips the triangle winding and the lighting stays right.
  const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
  function addInstances(geometry, material, matrices, { cast = true, receive = true } = {}) {
    const groups = [matrices.filter((M) => M.determinant() >= 0), matrices.filter((M) => M.determinant() < 0)];
    groups.forEach((list, k) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((M, i) => inst.setMatrixAt(i, k ? MIRROR.clone().multiply(M) : M));
      if (k) inst.scale.x = -1;
      inst.castShadow = cast; inst.receiveShadow = receive;
      inst.computeBoundingSphere();
      scene.add(inst);
    });
  }

  // =====================================================================================
  // 7b. People: scanned spectators in the stands (instanced), coaches on the sideline
  // =====================================================================================
  async function instanced(id, mats, { h, s, cast = true } = {}) {
    const src = await loadModel(id);
    const base = normalized(src, { h, s });
    base.updateMatrixWorld(true);
    const meshes = [];
    base.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) addInstances(m.geometry, m.material, mats.map((M) => M.clone().multiply(m.matrixWorld)), { cast });
  }
  if (!dbg.has('nopeople')) {
    // the scans come at an arbitrary scale (1.9 m tall seated): normalise each to a real seated height
    const fanH = { sport_fan_woman_jeans: 1.27, sport_fan_man_polo: 1.31, sport_fan_elder_purple: 1.22, sport_fan_woman_white: 1.26, sport_fan_elder_floral: 1.2, sport_fan_man_stripes: 1.33, sport_fan_woman_cardigan: 1.25 };
    const fans = Object.keys(fanH);
    const slots = fans.map(() => []);
    const rp = mulberry(77);
    const seatStand = (st, x0, x1, aisles, rows, zFront, dir, frontY, rise, depth, density) => {
      for (let r = 0; r < rows; r++) {
        let prev = false;
        for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.56) {
          if (aisles.some((a) => Math.abs(x - a) < 0.95)) { prev = false; continue; }
          const centre = 1 - Math.min(1, Math.abs(x) / (x1 - x0) * 1.3);
          const rowPref = 1 - Math.abs(r - rows * 0.4) / rows;
          const p = density * (0.35 + 0.65 * centre) * (0.55 + 0.45 * rowPref) * (prev ? 1.9 : 0.75);
          prev = rp() < p;
          if (!prev) continue;
          const y = frontY + r * rise;
          const zc = zFront + dir * (r * depth + depth / 2);
          const zBack = zc + dir * 0.24; // back edge of the seat plank
          const k = Math.floor(rp() * fans.length);
          slots[k].push({ x: x + (rp() - 0.5) * 0.12, y, zBack, dir, yaw: (rp() - 0.5) * 0.45, mirror: rp() < 0.5, s: 0.94 + rp() * 0.12 });
        }
      }
    };
    seatStand('home', -27, 27, [-13.5, 0, 13.5], 22, zHome, -1, 1.25, 0.33, 0.61, 0.5);
    seatStand('away', -22, 22, [-7.3, 7.3], 15, RA + 3.2, 1, 1.0, 0.31, 0.61, 0.32);
    for (let k = 0; k < fans.length; k++) {
      if (!slots[k].length) continue;
      try {
        const lo = `${fans[k]}_lo`; // 3.6k-triangle crowd version of the scan
        const src = await loadModel(lo);
        const probe = normalized(src, { h: fanH[fans[k]] });
        const bb = new THREE.Box3().setFromObject(probe);
        const depthM = bb.max.z - bb.min.z; // seated figure: back to toes along z (model faces +z)
        const mats = slots[k].map((sl) => {
          const face = sl.dir < 0 ? 0 : Math.PI; // home faces +z (the field), visitors face -z
          // put the figure's back at the back of the seat plank, facing the field
          const cz = sl.zBack - sl.dir * (depthM / 2 - 0.05);
          return new THREE.Matrix4().compose(new THREE.Vector3(sl.x, sl.y + 0.04, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, face + sl.yaw, 0)), new THREE.Vector3(sl.mirror ? -sl.s : sl.s, sl.s, sl.s));
        });
        await instanced(lo, mats, { h: fanH[fans[k]], cast: false });
      } catch (e) { console.warn('fan', fans[k], e); }
    }
    // players: one untextured padded-player sculpt, painted per body region in each team's colours by a shader
    // (cleats, socks, pants, belt, jersey, bare forearms, helmet shell with a centre stripe, face mask)
    const PLAYER_H = 1.9;
    async function team(spots, kit) {
      if (!spots.length) return;
      const src = await loadModel('sport_player_pads');
      const base = normalized(src, { h: PLAYER_H });
      base.updateMatrixWorld(true);
      let mesh = null;
      base.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      const g = mesh.geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox, size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.0 });
      // jersey numbers: an atlas of 8 numbers, picked per player
      const nc = document.createElement('canvas'); nc.width = 1024; nc.height = 128;
      const n2 = nc.getContext('2d');
      n2.clearRect(0, 0, 1024, 128);
      n2.font = 'bold 112px "Arial Black", Impact, sans-serif'; n2.textAlign = 'center'; n2.textBaseline = 'middle';
      ['7', '12', '24', '33', '45', '52', '68', '81'].forEach((t, i) => {
        n2.save(); n2.translate(i * 128 + 64, 68); n2.scale(t.length > 1 ? 0.62 : 0.85, 1);
        n2.lineJoin = 'round'; n2.lineWidth = 12; n2.strokeStyle = kit.numOutline; n2.strokeText(t, 0, 0);
        n2.fillStyle = kit.num; n2.fillText(t, 0, 0); n2.restore();
      });
      const numTex = canvasTex(nc);
      const U = {
        uNums: { value: numTex },
        uMin: { value: bb.min.clone() }, uSize: { value: size.clone() }, uC: { value: c.clone() },
        uJersey: { value: new THREE.Color(kit.jersey) }, uPants: { value: new THREE.Color(kit.pants) }, uSocks: { value: new THREE.Color(kit.socks) },
        uHelmet: { value: new THREE.Color(kit.helmet) }, uStripe: { value: new THREE.Color(kit.stripe) }, uMask: { value: new THREE.Color(kit.mask) },
      };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vQ;\nvarying float vSeed;\nuniform vec3 uMin; uniform vec3 uSize; uniform vec3 uC;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vQ = vec3((position.x - uC.x) / uSize.y, (position.y - uMin.y) / uSize.y, (position.z - uC.z) / uSize.y);
            #ifdef USE_INSTANCING
              vSeed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
            #else
              vSeed = 0.5;
            #endif`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
            varying vec3 vQ; varying float vSeed;
            uniform vec3 uJersey; uniform vec3 uPants; uniform vec3 uSocks; uniform vec3 uHelmet; uniform vec3 uStripe; uniform vec3 uMask;
            uniform sampler2D uNums;
            vec4 jerseyNum(float u, float v, float seed) {
              if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) return vec4(0.0);
              float k = floor(fract(seed * 7.31) * 8.0);
              return texture2D(uNums, vec2((k + u) / 8.0, v));
            }
            float gRough = 0.6; float gMetal = 0.0;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float y = vQ.y, ax = abs(vQ.x), z = vQ.z;
            vec3 skins[4]; skins[0] = vec3(0.80, 0.58, 0.46); skins[1] = vec3(0.55, 0.36, 0.25); skins[2] = vec3(0.33, 0.21, 0.15); skins[3] = vec3(0.72, 0.50, 0.38);
            vec3 skin = skins[int(vSeed * 3.99)];
            vec3 col = uJersey;
            if (y < 0.06) { col = vec3(0.05); gRough = 0.4; }                         // cleats
            else if (y < 0.27) col = uSocks;                                         // socks
            else if (y < 0.548) col = uPants;                                        // pants
            else if (y < 0.566) col = vec3(0.06);                                    // belt
            if (y > 0.44 && y < 0.705 && ax > 0.155) col = skin;                     // forearms and hands
            if (y > 0.6 && y < 0.8 && ax < 0.1) {                                    // numbers, back and front
              vec4 nb = z < -0.03 ? jerseyNum((0.085 - vQ.x) / 0.17, (y - 0.615) / 0.17, vSeed) : z > 0.03 ? jerseyNum((vQ.x + 0.065) / 0.13, (y - 0.645) / 0.12, vSeed) : vec4(0.0);
              col = mix(col, nb.rgb, nb.a);
            }
            if (y >= 0.835) {                                                        // helmet
              col = uHelmet; gRough = 0.22;
              if (ax < 0.011 && z < 0.05) col = uStripe;
              if (z > 0.045 && y < 0.935) { col = uMask; gRough = 0.35; gMetal = 0.6; }
              else if (z > 0.02 && y < 0.905 && ax < 0.05) col = skin * 0.6;         // face behind the mask
            }
            diffuseColor.rgb = col * (0.92 + 0.16 * vSeed);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;');
      };
      const rr = mulberry(spots.length * 7 + 3);
      const mats = spots.map(([x, z, yaw]) => {
        const sc = 0.95 + rr() * 0.09;
        return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(rr() < 0.5 ? -sc : sc, sc, sc)).multiply(mesh.matrixWorld);
      });
      addInstances(g, mat, mats);
    }
    const rpl = mulberry(404);
    const homeKit = { jersey: '#6a1424', pants: '#c9a227', socks: '#5a1220', helmet: '#5e1220', stripe: '#d8b13a', mask: '#d9d9d9', num: '#f4f1ea', numOutline: '#d8b13a' };
    const awayKit = { jersey: '#eeeeea', pants: '#b9bcc2', socks: '#1d2b4f', helmet: '#1d2b4f', stripe: '#eeeeea', mask: '#d9d9d9', num: '#1d2b4f', numOutline: '#9aa6bf' };
    // a huddle (home offence) around the ball on the visitors' 35, the defence waiting at the line
    const ballX = GL - 35 * YD; // visitors defend the east goal
    const hud = [];
    for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; const r = 1.25 + rpl() * 0.15; hud.push([ballX - 7 + Math.cos(a) * r, 3 + Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)) + (rpl() - 0.5) * 0.3]); }
    const def = [];
    for (let i = 0; i < 11; i++) {
      const row = i < 4 ? 0 : i < 7 ? 1 : 2;
      const zz = (row === 0 ? (i - 1.5) * 2.2 : row === 1 ? (i - 5) * 5.5 : (i - 8.5) * 9) + (rpl() - 0.5);
      def.push([ballX + 1.2 + row * 3.6 + rpl() * 1.5, zz, -Math.PI / 2 + (rpl() - 0.5) * 0.6]);
    }
    // sideline teams: a loose line at the front of each team box, facing the field
    const sideline = (zLine, n, facing) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push([-19 + (38 * i) / n + (rpl() - 0.5) * 1.2, zLine + (rpl() - 0.5) * 1.6 * Math.sign(zLine), facing + (rpl() - 0.5) * 0.8]);
      return out.filter(([x, z]) => !(z < 0 && x > -12 && x < -3.5)); // room for the sideline camera
    };
    // on a headset, half as many waiting along each sideline (the eleven on the field are the game)
    await team([...hud, ...sideline(-27.0, QUEST ? 11 : 22, 0)], homeKit);
    await team([...def, ...sideline(27.2, QUEST ? 8 : 16, Math.PI)], awayKit);
    // the ball, spotted between the huddle and the defence
    try {
      const fb = normalized(await loadModel('sport_football'), { len: 0.28 });
      fb.position.set(ballX, 0, 0); fb.rotation.y = Math.PI / 2; scene.add(fb);
    } catch (e) { console.warn('ball', e); }
    // coaches and staff standing at the home sideline (and two at the far one)
    const staff = [
      ['sport_coach_hoodie', 4.5, -27.9, 0.15], ['sport_coach_sweater', 9.8, -28.4, 0.5],
      ['sport_coach_plaid', -9.5, -33.0, 0.64], ['sport_coach_hoodie', 3.0, 28.4, Math.PI - 0.2], ['sport_coach_sweater', -5.0, 28.6, Math.PI + 0.4],
    ];
    for (const [id, x, z, yaw] of staff) {
      try {
        const src = await loadModel(id);
        const n = normalized(src, { h: { sport_coach_hoodie: 1.78, sport_coach_plaid: 1.8, sport_coach_sweater: 1.76 }[id] });
        n.rotation.y = yaw; n.position.set(x, 0, z);
        n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(n);
      } catch (e) { console.warn('staff', id, e); }
    }
  }

  // =====================================================================================
  // 8. Team benches, flagpole, sideline markers
  // =====================================================================================
  {
    // aluminium team benches: a seat plank and a foot plank on tube A-frames
    const seat = [], tubes = [];
    const bench = (x, z, len = 4.6) => {
      seat.push({ p: [x, 0.45, z], s: [len, 0.045, 0.27] });
      seat.push({ p: [x, 0.17, z - Math.sign(z) * 0.18], s: [len, 0.035, 0.16] }); // foot plank, field side
      for (let k = -1; k <= 1; k++) {
        const lx = x + k * (len / 2 - 0.35);
        tubes.push({ a: [lx, 0, z - 0.24], b: [lx, 0.43, z - 0.04], r: 0.021 }, { a: [lx, 0, z + 0.24], b: [lx, 0.43, z + 0.04], r: 0.021 });
        tubes.push({ a: [lx, 0.17, z - 0.27], b: [lx, 0.17, z + 0.27], r: 0.018 }, { a: [lx, 0.43, z - 0.12], b: [lx, 0.43, z + 0.12], r: 0.02 });
      }
      tubes.push({ a: [x - len / 2 + 0.35, 0.09, z], b: [x + len / 2 - 0.35, 0.09, z], r: 0.018 });
    };
    for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) bench(i * 5.0, s * (HW + 9.6));
    boxes(seat, alu); pipes(tubes, alu, 8);
    // orange yard markers along the far sideline limit line (every 10 yd)
    const mk = [];
    for (let yd = 10; yd <= 90; yd += 10) mk.push({ p: [-GL + yd * YD, 0.3, HW + 2.6], s: [0.35, 0.6, 0.35] });
    boxes(mk, std({ color: '#ff6a13', roughness: 0.65 }));
  }
  {
    // flagpole with the stars and stripes, beside the scoreboard
    const fx = HL + 15.5, fz = -12;
    pipes([{ a: [fx, 0, fz], b: [fx, 15, fz], r: 0.07 }], std({ color: '#d7dadd', metalness: 0.9, roughness: 0.3 }), 16);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), std({ color: '#d9b45a', metalness: 1, roughness: 0.3 }))).position.set(fx, 15.08, fz);
    const c = document.createElement('canvas'); c.width = 760; c.height = 400;
    const f = c.getContext('2d');
    for (let i = 0; i < 13; i++) { f.fillStyle = i % 2 ? '#f5f3ee' : '#b2223b'; f.fillRect(0, (i * 400) / 13, 760, 400 / 13 + 1); }
    f.fillStyle = '#3c3b6e'; f.fillRect(0, 0, 304, (7 * 400) / 13);
    f.fillStyle = '#f5f3ee';
    for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) { f.beginPath(); f.arc(25 + k * 50 + (r % 2 ? 25 : 0), 13 + r * 24, 6, 0, Math.PI * 2); f.fill(); }
    const geo = new THREE.PlaneGeometry(2.9, 1.53, 40, 10);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 1.45) / 2.9; p.setZ(i, Math.sin(u * 7.0 + 0.4) * 0.16 * u + Math.sin(u * 13) * 0.04 * u); p.setY(i, p.getY(i) - u * u * 0.12); }
    geo.computeVertexNormals();
    const flag = add(new THREE.Mesh(geo, std({ map: canvasTex(c), side: THREE.DoubleSide, roughness: 0.85 })));
    flag.position.set(fx, 14.1, fz - 1.48);
    flag.rotation.y = Math.PI / 2 - 0.35;
  }

  // =====================================================================================
  // 9. Beyond the stands: a brick school, a field house, parking with buses, trees, a water tower
  // =====================================================================================
  {
    // brick buildings: Poly Haven brick on the walls, a separate window layer (dark glass, some lit) in front
    const brickSet = (w, h) => { const t = texSet('brick_wall_001', [1, 1]); const o = {}; for (const k of ['map', 'normalMap', 'roughnessMap']) { o[k] = t[k].clone(); o[k].repeat.set(w / 3, h / 3); o[k].needsUpdate = true; } return o; };
    const roofMat = std({ color: '#3b3a39', roughness: 0.95 });
    const capMat = std({ color: '#b9b2a4', roughness: 0.9 });
    const r2 = mulberry(9);
    const windows = (w, floors, perFloor, litP, h0 = 1.2, fh = 3.6, ww = 1.6, wh = 1.9) => {
      const c = document.createElement('canvas'); c.width = 2048; c.height = 256;
      const e = document.createElement('canvas'); e.width = 2048; e.height = 256;
      const a = c.getContext('2d'), b = e.getContext('2d');
      a.clearRect(0, 0, 2048, 256); b.fillStyle = '#000'; b.fillRect(0, 0, 2048, 256);
      const H = floors * fh + h0;
      const sx = 2048 / w, sy = 256 / H;
      for (let f = 0; f < floors; f++) for (let i = 0; i < perFloor; i++) {
        const cx = ((i + 0.5) / perFloor) * w, y = H - (h0 + f * fh + wh);
        const lit = r2() < litP;
        a.fillStyle = '#c9c2b3'; a.fillRect((cx - ww / 2 - 0.08) * sx, (y - 0.08) * sy, (ww + 0.16) * sx, (wh + 0.22) * sy); // frame + sill
        a.fillStyle = lit ? '#f3d9a6' : '#1e252c'; a.fillRect((cx - ww / 2) * sx, y * sy, ww * sx, wh * sy);
        if (lit) { b.fillStyle = r2() < 0.3 ? '#cfe3ff' : '#ffd8a0'; b.fillRect((cx - ww / 2) * sx, y * sy, ww * sx, wh * sy); }
        a.fillStyle = '#c9c2b3'; a.fillRect((cx - 0.03) * sx, y * sy, 0.06 * sx, wh * sy); // mullion
      }
      const m = std({ map: canvasTex(c), emissive: '#ffffff', emissiveMap: canvasTex(e), emissiveIntensity: 1.4, alphaTest: 0.5, roughness: 0.3, metalness: 0.1 });
      return { m, H };
    };
    const building = (x, z, w, d, floors, ry = 0, litP = 0.3, per = null) => {
      const win = windows(w, floors, per ?? Math.floor(w / 3.4), litP);
      const h = win.H + 0.6;
      const g = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std({ ...brickSet(w, h), color: '#b59a8e', roughness: 0.95 }));
      walls.position.y = h / 2; g.add(walls);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.45, d + 0.5), capMat); cap.position.y = h + 0.2; g.add(cap);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.1, d - 0.4), roofMat); roof.position.y = h + 0.3; g.add(roof);
      for (const sgn of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, win.H), win.m); p.position.set(0, win.H / 2, sgn * (d / 2 + 0.03)); p.rotation.y = sgn > 0 ? 0 : Math.PI; g.add(p); }
      // a few rooftop units
      for (let k = 0; k < Math.floor(w / 25); k++) { const u = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.8), std({ color: '#8d9093', roughness: 0.6, metalness: 0.4 })); u.position.set(-w / 2 + 8 + k * 25 + r2() * 6, h + 0.95, (r2() - 0.5) * (d - 4)); g.add(u); }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
      return g;
    };
    building(15, 152, 120, 18, 2, 0, 0.22);
    building(-78, 142, 44, 34, 3, 0, 0.12, 8); // gym: taller, few windows
    building(100, 134, 46, 16, 2, -0.25, 0.25);
    // concession stand behind the west end: one storey, lit service windows under a maroon awning
    {
      const cx = -TS - R1 - 13, cz = -30;
      const g = new THREE.Group();
      const w = 14, d = 7, h = 3.4;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), std({ ...brickSet(w, h), color: '#b59a8e', roughness: 0.95 }));
      walls.position.y = h / 2; g.add(walls);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(d + 0.8, 0.3, w + 0.8), capMat); roof.position.y = h + 0.15; g.add(roof);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 4, 1.2), std({ color: '#3a2a1a', emissive: '#ffd49a', emissiveIntensity: 1.6 }));
      glow.position.set(d / 2 + 0.02, 1.75, 0); glow.rotation.y = Math.PI / 2; g.add(glow);
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, w - 3.6), std({ color: '#8e9296', metalness: 0.6, roughness: 0.5 })); shutter.position.set(d / 2 + 0.1, 2.55, 0); g.add(shutter);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, w - 3.8), std({ color: '#cfcac0', roughness: 0.6 })); counter.position.set(d / 2 + 0.25, 1.12, 0); g.add(counter);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, w - 2), std({ color: MAROON, roughness: 0.8 })); awn.position.set(d / 2 + 0.75, 2.95, 0); awn.rotation.z = -0.25; g.add(awn);
      const ps = document.createElement('canvas'); ps.width = 1024; ps.height = 160;
      const p2 = ps.getContext('2d'); p2.fillStyle = '#f2ead9'; p2.fillRect(0, 0, 1024, 160); p2.fillStyle = MAROON; p2.font = 'bold 110px Impact, "Arial Black", sans-serif'; p2.textAlign = 'center'; p2.textBaseline = 'middle'; p2.fillText('PANTHER  SNACK  SHACK', 512, 84);
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.25), std({ map: canvasTex(ps), emissive: '#ffffff', emissiveMap: canvasTex(ps), emissiveIntensity: 0.35 }));
      sgn.position.set(d / 2 + 0.05, h - 0.1 + 0.6, 0); sgn.rotation.y = Math.PI / 2; g.add(sgn);
      sgn.position.y = h + 0.95; // on the roof edge
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(cx, 0, cz); scene.add(g);
      pool(cx + d / 2 + 2.5, cz, 7, '#ffcf8a', 0.55);
    }
    // parking lot north-east of the visitor stands, sodium lights on poles
    {
      const t = texSet('asphalt_02', [1, 1]);
      const am = {}; for (const k of ['map', 'normalMap', 'roughnessMap']) { am[k] = t[k].clone(); am[k].repeat.set(70 / 4, 40 / 4); am[k].needsUpdate = true; }
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), std({ ...am, color: '#8a8a8a', roughness: 0.95 }));
      lot.rotation.x = -Math.PI / 2; lot.position.set(62, -0.02, 84); lot.receiveShadow = true; scene.add(lot);
      const stripes = [];
      for (let i = 0; i < 22; i++) stripes.push({ p: [30 + i * 3, 0.0, 92], s: [0.1, 0.01, 5.2] });
      boxes(stripes, std({ color: '#d8d5c8', roughness: 0.8 }), { cast: false });
      const poles = [], heads = [], glowPts = [];
      for (const [px, pz] of [[40, 70], [84, 70], [40, 98], [84, 98], [-60, -66], [60, -66]]) {
        poles.push({ a: [px, 0, pz], b: [px, 9, pz], r: 0.09 });
        heads.push({ p: [px, 9.05, pz], s: [1.1, 0.22, 0.5] });
        glowPts.push(px, 8.85, pz);
        pool(px, pz, 13, '#ffa64d', 0.5);
      }
      pipes(poles, steel, 10);
      boxes(heads, std({ color: '#3d3f42', emissive: '#ffb35c', emissiveIntensity: 0.4, roughness: 0.6 }));
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
      scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, color: '#ffb066', size: 3.5, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
    }
    // water tower far off to the north-east
    const wt = std({ color: '#c9ced3', metalness: 0.5, roughness: 0.45 });
    const wx = 170, wz = 260;
    const tank = add(new THREE.Mesh(new THREE.SphereGeometry(7.5, 32, 20), wt)); tank.scale.set(1, 0.72, 1); tank.position.set(wx, 34, wz);
    add(new THREE.Mesh(new THREE.ConeGeometry(4, 3, 24), wt)).position.set(wx, 40.5, wz);
    const tl = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; tl.push({ a: [wx + Math.cos(a) * 8, 0, wz + Math.sin(a) * 8], b: [wx + Math.cos(a) * 5.5, 30, wz + Math.sin(a) * 5.5], r: 0.4 }); }
    tl.push({ a: [wx, 0, wz], b: [wx, 30, wz], r: 0.9 });
    pipes(tl, wt, 10);
    const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 256;
    const t2 = tc.getContext('2d'); t2.fillStyle = '#c9ced3'; t2.fillRect(0, 0, 1024, 256); t2.fillStyle = '#6d1626'; t2.font = 'bold 150px Impact, "Arial Black", sans-serif'; t2.textAlign = 'center'; t2.textBaseline = 'middle'; t2.fillText('LINCOLN', 512, 130);
    const band = add(new THREE.Mesh(new THREE.CylinderGeometry(7.53, 7.53, 3.2, 48, 1, true, -Math.PI / 2 - 0.9, 1.8), std({ map: canvasTex(tc), metalness: 0.4, roughness: 0.5, transparent: false })), false);
    band.position.set(wx, 34, wz); band.rotation.y = Math.atan2(-wx, -wz) + Math.PI / 2;
  }
  // tree lines (instanced models) around the site
  if (!dbg.has('notrees')) {
    const ring = [];
    const r3 = mulberry(31);
    const tryAdd = (x, z) => { if (Math.abs(x) < 95 && Math.abs(z) < 75) return; ring.push([x, z]); };
    for (let i = 0; i < 170; i++) {
      const a = r3() * Math.PI * 2;
      const rr = 115 + r3() * 70;
      tryAdd(Math.cos(a) * rr * 1.35, Math.sin(a) * rr);
    }
    const pts = ring.filter(([x, z]) => !(z > 120 && z < 165 && x > -100 && x < 120));
    const kinds = ['nat_maple_tree', 'nat_oak_tree'];
    for (let k = 0; k < kinds.length; k++) {
      // 115-185 m away: their far copies (scripts/slim-scenes.mjs, a sixth of the triangles), and half as many on a
      // headset (the ring of full trees was 2 M triangles a frame there)
      const mine = pts.filter((_, i) => i % kinds.length === k && (!QUEST || i % 4 < 2));
      try {
        const src = await loadModel(`${kinds[k]}_far`).catch(() => loadModel(kinds[k]));
        const base = normalized(src, { h: k === 1 ? 10 : 13 });
        base.updateMatrixWorld(true);
        const meshes = [];
        base.traverse((o) => { if (o.isMesh) meshes.push(o); });
        const mats = mine.map(([x, z]) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r3() * 6.28, 0)), new THREE.Vector3().setScalar(0.75 + r3() * 0.6)));
        for (const m of meshes) {
          const inst = new THREE.InstancedMesh(m.geometry, m.material, mats.length);
          mats.forEach((M, i) => inst.setMatrixAt(i, M.clone().multiply(m.matrixWorld)));
          inst.castShadow = false; inst.receiveShadow = true; inst.computeBoundingSphere();
          scene.add(inst);
        }
      } catch (e) { console.warn('tree', kinds[k], e); }
    }
  }
};
