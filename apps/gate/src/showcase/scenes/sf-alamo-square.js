// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/sf-alamo-square.js); run in the app by src/showcase/build.js.
// Alamo Square, San Francisco: the Painted Ladies seen across Steiner Street from the park's sloping lawn, with the
// downtown skyline behind them. Everything that is ground is built here: the hill (a height field), the lawn with the
// viewer's procedural grass laid onto the slope, Steiner and Hayes streets with sidewalks and curbs, the blocks of
// Hayes Valley falling away toward downtown, and the downtown towers at their real bearings and distances (the
// Transamerica Pyramid is a model; the rest are simple massing boxes with painted facades, softened by the haze).
// Models are placed from here too, because their height comes from the slope.
// Frame: x = east, z = south, y = up, metres. Origin: the row's front on Steiner St, street level there.
export default async ({ THREE, scene, spec, rng, placeItem, placeGrass, texSet }) => {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const A = { seed: 5, ...(spec.alamo ?? {}) };
  const rand = rng(A.seed * 7919 + 13);
  const DEG = Math.PI / 180;
  const add = (m, cast = false, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m; };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // ---------- the hill ----------
  // Steiner St (road x -17..-5) falls 6 % toward Hayes St (south). The park starts at the west sidewalk (x = -21) and
  // climbs west to the hilltop ~28 m above the street; its south edge (Hayes, z = 56) banks down to the sidewalk.
  // East of Steiner the city falls ~48 m to downtown.
  const PARK_X = -21, HAYES_N = 56, HAYES_S = 76;
  const S = { roadW: -17, roadE: -5, walkE: 1 };
  const base = (x, z) => -0.06 * Math.max(-500, Math.min(500, z)) - 48 * smooth(40, 1800, x) - 6 * smooth(-60, -700, x);
  function park(x, z) {
    const d = PARK_X - x;
    const rise = 44 * (1 - Math.exp(-Math.max(0, d) / 190));
    const edge = smooth(0, 12, HAYES_N - z) * smooth(0, 3, d);
    const und = (vnoise(x * 0.025 + 3, z * 0.025 - 7) - 0.5) * 2.2 * smooth(4, 30, d);
    return base(x, z) + 0.55 + (rise + und) * edge;
  }
  const inPark = (x, z) => x < PARK_X && z < HAYES_N && x > -340 && z > -330;
  function H(x, z) {
    if (inPark(x, z)) return park(x, z);
    const walk = (x > S.roadE && x < 60) || (x < S.roadW && x > -340) || (z > HAYES_S - 4 && z < HAYES_S) || (z > HAYES_N && z < HAYES_N + 4);
    return base(x, z) + (walk ? 0.15 : 0);
  }

  // a grid mesh following f(x, z)
  function grid(x0, z0, x1, z1, step, f, mat, { colors } = {}) {
    const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position;
    const col = colors ? new Float32Array(p.count * 3) : null;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, f(x, z));
      if (col) { const c = colors(x, z); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    }
    // world-space UVs so textures tile in metres
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return add(new THREE.Mesh(g, mat));
  }
  // a vertical strip (curb face / low wall) along a polyline, from f0 to f1 heights
  function wall(pts, f0, f1, mat) {
    const pos = [], uv = [], idx = [];
    let run = 0;
    pts.forEach(([x, z], i) => {
      if (i) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      pos.push(x, f0(x, z), z, x, f1(x, z), z);
      uv.push(run, 0, run, f1(x, z) - f0(x, z));
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return add(new THREE.Mesh(g, mat), true);
  }
  const line = (x0, z0, x1, z1, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  const texMat = (id, tile, o = {}) => {
    const set = texSet(id, [1 / tile, 1 / tile]);
    return new THREE.MeshStandardMaterial({ ...set, roughness: 1, ...o });
  };

  // ---------- surfaces ----------
  const lawnMat = texMat('leafy_grass', 2.5, { color: '#86a650' });
  grid(-340, -330, PARK_X, HAYES_N, 1.5, park, lawnMat);
  const walkMat = texMat('concrete_pavement', 1.6, { color: '#d9d4cb' });
  const roadMat = texMat('asphalt_02', 4, { color: '#8d8a86' });
  // Steiner St: west sidewalk, road, east sidewalk (the east one runs under the houses' stoops)
  grid(PARK_X, -330, S.roadW, 330, 1, (x, z) => base(x, z) + 0.15, walkMat); // west sidewalk
  grid(S.roadW, -330, S.roadE, 330, 2, (x, z) => base(x, z), roadMat);
  grid(S.roadE, -330, 12, 330, 1, (x, z) => base(x, z) + 0.15, walkMat);
  // Hayes St (east-west), crossing Steiner
  grid(-340, HAYES_N, PARK_X, HAYES_N + 4, 1, (x, z) => base(x, z) + 0.15, walkMat);
  grid(-340, HAYES_N + 4, 400, HAYES_S - 4, 2, (x, z) => base(x, z) + 0.01, roadMat);
  grid(-340, HAYES_S - 4, 400, HAYES_S, 1, (x, z) => base(x, z) + 0.15, walkMat);
  // curbs and the low wall that holds the lawn above Steiner and Hayes
  const curbMat = texMat('concrete_floor_worn_001', 1.2, { color: '#cfc9bf' });
  wall(line(S.roadE, -330, S.roadE, 330, 120), (x, z) => base(x, z), (x, z) => base(x, z) + 0.15, curbMat);
  wall(line(S.roadW, 330, S.roadW, -330, 120), (x, z) => base(x, z), (x, z) => base(x, z) + 0.15, curbMat);
  wall(line(PARK_X, -330, PARK_X, HAYES_N, 90), (x, z) => base(x, z) + 0.15, (x, z) => park(x - 0.01, z), curbMat);
  wall(line(PARK_X, HAYES_N, -340, HAYES_N, 90), (x, z) => base(x, z) + 0.15, (x, z) => park(x, z - 0.01), curbMat);
  // the city around: ground of the neighbouring blocks (mostly covered by houses), falling toward downtown
  const cityMat = new THREE.MeshStandardMaterial({ color: '#8f8b83', roughness: 1 });
  grid(12, -1800, 2400, 1800, 12, (x, z) => base(x, z) - 0.05, cityMat);
  grid(-900, -1800, 12, -330, 12, (x, z) => base(x, z) - 0.05, cityMat);
  grid(-900, HAYES_S, 12, 1800, 12, (x, z) => base(x, z) - 0.05, cityMat);
  grid(-900, -330, -340, HAYES_S, 12, (x, z) => base(x, z) - 0.05, cityMat);

  // ---------- grass on the slope: the viewer's blades, lifted onto the hill ----------
  function grassOn(gr) {
    const before = scene.children.length;
    const n = placeGrass(gr);
    const mesh = scene.children.slice(before).find((o) => o.isInstancedMesh);
    const M = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, M);
      M.decompose(p, q, s);
      p.y = park(p.x, p.z) - 0.02;
      M.compose(p, q, s);
      mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return n;
  }
  const grassCols = ['#3a5a1a', '#5f8a2a', '#88a83e', '#b6b06a'];
  let blades = 0;
  blades += grassOn({ area: [-175, -110, PARK_X - 0.4, HAYES_N - 0.6], density: 30, max: 520000, height: [0.04, 0.1], width: 0.028, colors: grassCols, dry: 0.05, wind: 0.1, lean: 0.1, seed: 4, exclude: [{ c: [-100, 38], r: 26 }, [-31, -400, -26, 400]] });
  blades += grassOn({ area: { c: [-100, 38], r: 30 }, density: 260, max: 600000, falloff: 0.6, height: [0.05, 0.13], width: 0.024, colors: grassCols, dry: 0.05, wind: 0.12, lean: 0.1, seed: 9, exclude: [[-200, HAYES_N - 0.6, 0, 200]] });
  blades += grassOn({ area: { c: [-28, 42], r: 14 }, density: 220, max: 140000, falloff: 0.5, height: [0.05, 0.13], width: 0.024, colors: grassCols, dry: 0.05, wind: 0.12, lean: 0.1, seed: 12, exclude: [[-21.2, 0, 0, 60], [-200, HAYES_N - 0.6, 0, 200], [-31, -400, -26, 400]] });
  spec.alamo.blades = blades;

  // ---------- painted facades (canvas) for the massing ----------
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }
  // a house bay: 2.6 m wide, one 3.2 m storey; white trim, dark glass, a cornice line
  const houseTex = canvasTex(64, 80, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.2, h * 0.16, w * 0.6, h * 0.64);
    g.fillStyle = '#3a434b'; g.fillRect(w * 0.27, h * 0.22, w * 0.46, h * 0.52);
    g.fillStyle = '#e9e9e9'; g.fillRect(w * 0.48, h * 0.22, w * 0.04, h * 0.52);
    g.fillStyle = '#d6d3cd'; g.fillRect(0, h * 0.92, w, h * 0.08);
  });
  // an office tower module: 3 m wide, one 3.9 m floor; spandrel band and glass
  const towerTex = canvasTex(32, 48, (g, w, h) => {
    g.fillStyle = '#e8e6e1'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5d6b78'; g.fillRect(w * 0.06, h * 0.18, w * 0.88, h * 0.6);
    g.fillStyle = '#c9c7c2'; g.fillRect(w * 0.47, h * 0.18, w * 0.06, h * 0.6);
  });
  // boxes merged into one mesh; UVs in modules so windows keep their size; roofs sample the plain wall colour
  function massing(list, tex, mw, mh, { rough = 0.9, metal = 0 } = {}) {
    const geos = [];
    const col = new THREE.Color();
    for (const b of list) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      const uv = g.attributes.uv, n = g.attributes.normal;
      const c = new Float32Array(uv.count * 3);
      for (let i = 0; i < uv.count; i++) {
        const ny = n.getY(i);
        const face = Math.abs(n.getX(i)) > 0.5 ? b.d : b.w;
        if (Math.abs(ny) > 0.5) { uv.setXY(i, 0.02, 0.98); col.set(b.roof ?? '#8b8780'); }
        else { uv.setXY(i, uv.getX(i) * (face / mw), uv.getY(i) * (b.h / mh)); col.set(b.color); }
        c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.rotateY((b.ry ?? 0) * DEG);
      g.translate(b.x, b.y + b.h / 2, b.z);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    if (!geos.length) return null;
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: rough, metalness: metal });
    return add(new THREE.Mesh(mergeGeometries(geos), mat), true, true);
  }

  // ---------- the neighbourhood: Victorian blocks east of Steiner falling toward Hayes Valley ----------
  const pastel = ['#e6e0d4', '#d8ceba', '#cdc3ae', '#c2c9cd', '#bcc7b8', '#d6c4b8', '#c9c0cf', '#dccf9f', '#b5c0ca', '#d4cdc2', '#c6b39d', '#aeb9af', '#a8a299', '#c4ad92', '#9fa9b3', '#e3dccb'];
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const houses = [];
  const trees = [];
  // street centrelines. North-south: Steiner x = -11, Pierce, Fillmore... every 126 m (412.5 ft).
  // East-west: Hayes z = 66, then 84 m blocks south of it; north of it Grove at -60 and 126 m blocks beyond.
  const xs = Array.from({ length: 20 }, (_, k) => -11 + (k - 6) * 126);
  const zs = [...Array.from({ length: 14 }, (_, k) => 66 - 126 * (14 - k)), ...Array.from({ length: 21 }, (_, k) => 66 + 84 * k)];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i] + 10, x1 = xs[i + 1] - 10, z0 = zs[j] + 10, z1 = zs[j + 1] - 10;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cx < -11 && cx > -400 && cz < 56 && cz > -340) continue; // the park
      if (Math.hypot(cx, cz) > 3600) continue;
      const rowBlock = Math.abs(xs[i] + 11) < 1 && zs[j] === -60; // Steiner frontage Grove-Hayes: the real houses
      // lots on the north and south faces of the block, 7.6 m wide (25 ft), 18-25 m deep
      for (const side of [-1, 1]) {
        for (let x = x0 + (rowBlock ? 26 : 0); x < x1 - 7; x += 7.62) {
          const w = 7.3, d = 18 + rand() * 7, h = 7.8 + rand() * 3.6 + (rand() < 0.1 ? 2.5 : 0);
          const z = side < 0 ? z0 + d / 2 : z1 - d / 2;
          const xm = x + w / 2;
          houses.push({ x: xm, z, w, d, h, y: base(xm, z) - 0.3, color: pick(pastel), roof: rand() < 0.5 ? '#5f5c57' : '#77726b' });
          if (rand() < 0.22) trees.push([xm + (rand() - 0.5) * 4, side < 0 ? z0 - 4.5 : z1 + 4.5]);
        }
      }
      // lots on the east and west faces, facing the north-south streets
      for (const side of [-1, 1]) {
        if (rowBlock && side < 0) continue;
        for (let z = z0 + 25; z < z1 - 25 - 7; z += 7.62) {
          const w = 7.3, d = 18 + rand() * 6, h = 7.8 + rand() * 3.6;
          const x = side < 0 ? x0 + d / 2 : x1 - d / 2;
          houses.push({ x, z: z + w / 2, w: d, d: w, h, y: base(x, z) - 0.3, color: pick(pastel), roof: '#7d7972' });
        }
      }
      // backyard trees
      const nt = Math.floor(rand() * 5);
      for (let k = 0; k < nt; k++) trees.push([x0 + 30 + rand() * (x1 - x0 - 60), z0 + 24 + rand() * Math.max(1, z1 - z0 - 48)]);
    }
  }
  massing(houses, houseTex, 2.6, 3.2);

  // ---------- downtown: real towers at their bearings and distances from 710 Steiner St ----------
  // (lat, lon) → local metres
  const LAT0 = 37.7762, LON0 = -122.4328;
  const loc = (lat, lon) => [(lon - LON0) * 88013, -(lat - LAT0) * 110574];
  const DT = -40; // downtown street level relative to Steiner at the row
  const towers = [
    // [lat, lon, height, w, d, colour, rotation]
    [37.7897, -122.3972, 0, 0, 0, 'salesforce'],
    [37.7898, -122.3956, 245, 38, 38, '#c9d0d6', 0],     // 181 Fremont
    [37.7920, -122.4037, 237, 56, 46, '#7a5a52', 0],      // 555 California (dark granite)
    [37.7905, -122.3962, 197, 34, 34, '#d6dade', 45],     // Millennium Tower
    [37.7888, -122.3958, 184, 40, 34, '#cdd6dc', 45],     // Park Tower
    [37.7863, -122.3925, 188, 30, 30, '#c2ccd4', 45],     // One Rincon Hill
    [37.7930, -122.4010, 212, 44, 44, '#d7d3cb', 0],      // 345 California
    [37.7945, -122.3985, 174, 52, 26, '#e4e1da', 0],      // One Embarcadero Center
    [37.7949, -122.3966, 172, 52, 26, '#e4e1da', 0],      // Embarcadero Center
    [37.7927, -122.3986, 183, 40, 40, '#d4d0c8', 0],      // 101 California
    [37.7907, -122.4017, 172, 44, 40, '#dad5ca', 0],      // Wells Fargo Center
    [37.7907, -122.3975, 183, 40, 40, '#bfc6cc', 45],     // 50 Fremont
    [37.7903, -122.3990, 162, 40, 36, '#cfcac0', 45],     // 525 Market
    [37.7883, -122.3934, 188, 34, 34, '#c8ced3', 45],     // The Avery
    [37.7907, -122.4037, 151, 40, 36, '#d9d4cc', 0],      // 333 Bush
    [37.7854, -122.4103, 150, 44, 30, '#e1ddd3', 0],      // Hilton Union Square
    [37.7850, -122.4044, 133, 46, 30, '#cfd4d8', 45],     // Marriott Marquis
    [37.7863, -122.4013, 146, 36, 30, '#d8cfc2', 45],     // St. Regis
    [37.7853, -122.4013, 128, 40, 30, '#e3e0d9', 45],     // Paramount
    [37.7861, -122.4042, 120, 30, 30, '#d2d5d7', 45],     // Four Seasons
    [37.7889, -122.3984, 136, 36, 32, '#d6d9dc', 45],     // 100 First
    [37.7916, -122.3995, 160, 36, 36, '#cbc6bd', 0],      // 50 Fremont area
    [37.7936, -122.3990, 150, 44, 30, '#e6e3dd', 0],      // 1 California area
    [37.7958, -122.4005, 127, 40, 30, '#dfdad1', 0],      // Embarcadero Center West
    [37.7894, -122.4004, 121, 34, 30, '#d7d2c8', 45],     // 101 Second
    [37.7774, -122.4182, 107, 40, 30, '#d9d4c9', 45],     // Fox Plaza
    [37.7766, -122.4170, 82, 36, 30, '#cfd3d5', 45],      // NEMA
    [37.7795, -122.4128, 72, 34, 34, '#cdd1d2', 45],      // Federal Building
    [37.7873, -122.3975, 90, 40, 30, '#d5d0c6', 45],
    [37.7842, -122.3990, 105, 38, 32, '#dcd8cf', 45],
    [37.7826, -122.4050, 80, 50, 40, '#e0dcd4', 45],
    [37.7808, -122.4110, 66, 60, 40, '#d7d3cb', 45],
    [37.7835, -122.4120, 70, 40, 34, '#e2ded6', 0],
    [37.7870, -122.4085, 88, 40, 34, '#dcd6cb', 0],
    [37.7890, -122.4060, 96, 36, 34, '#d5d0c6', 0],
    [37.7915, -122.4070, 78, 40, 34, '#e3dfd6', 0],
    [37.7940, -122.4045, 112, 36, 36, '#d0cbc1', 0],
  ];
  const tw = [];
  for (const [lat, lon, h, w, d, color, ry] of towers) {
    const [x, z] = loc(lat, lon);
    if (color === 'salesforce') continue;
    tw.push({ x, z, w, d, h, y: DT, color, ry, roof: '#9a958d' });
  }
  // mid-rise downtown fabric: SoMa / Tenderloin / Union Square between Civic Center and the towers
  for (let i = 0; i < 420; i++) {
    const lat = 37.776 + rand() * 0.022, lon = -122.420 + rand() * 0.028;
    const [x, z] = loc(lat, lon);
    if (Math.hypot(x, z) < 1500) continue;
    const near = smooth(0.012, 0, Math.hypot(lat - 37.791, (lon + 122.4)));
    const h = 18 + rand() * 30 + near * rand() * 50;
    tw.push({ x, z, w: 24 + rand() * 30, d: 20 + rand() * 26, h, y: DT + smooth(3200, 1500, Math.hypot(x, z)) * 8, color: pick(['#e3dfd6', '#d6d1c7', '#cfcfcc', '#e8e2d6', '#c9c4ba', '#dcd9d2']), ry: lon > -122.408 && lat < 37.7885 ? 45 : 0, roof: '#8f8a82' });
  }
  massing(tw, towerTex, 3, 3.9, { rough: 0.6 });

  // Salesforce Tower: a rounded square that tapers, with its open lattice crown (no free model of it exists)
  {
    const [x, z] = loc(37.7897, -122.3972);
    const shape = new THREE.Shape();
    const R = 26, r = 9;
    shape.moveTo(-R + r, -R);
    shape.lineTo(R - r, -R); shape.quadraticCurveTo(R, -R, R, -R + r);
    shape.lineTo(R, R - r); shape.quadraticCurveTo(R, R, R - r, R);
    shape.lineTo(-R + r, R); shape.quadraticCurveTo(-R, R, -R, R - r);
    shape.lineTo(-R, -R + r); shape.quadraticCurveTo(-R, -R, -R + r, -R);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 300, bevelEnabled: false, steps: 30, curveSegments: 6 });
    body.rotateX(-Math.PI / 2);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / 300;
      const k = 1 - 0.13 * t * t; // gentle taper toward the top
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    body.computeVertexNormals();
    // UVs: around (by angle) and up, in tower modules
    const uv = body.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.atan2(p.getZ(i), p.getX(i)) / (2 * Math.PI)) * 60, p.getY(i) / 3.9);
    const glass = new THREE.MeshStandardMaterial({ map: towerTex, color: '#c4ccd2', roughness: 0.35, metalness: 0.3 });
    const m = add(new THREE.Mesh(body, glass), true);
    m.position.set(x, DT, z);
    m.rotation.y = 45 * DEG;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(22.5, 22.8, 26, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#e9eef2', roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.78, side: THREE.DoubleSide }));
    crown.position.set(x, DT + 300 + 13, z);
    add(crown, true);
  }

  // street and backyard trees in the neighbourhood: simple dark canopies, far enough away to read as trees
  {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pp = geo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const v = new THREE.Vector3(pp.getX(i), pp.getY(i), pp.getZ(i));
      const k = 0.85 + 0.3 * hash(Math.round(v.x * 10), Math.round(v.z * 10 + v.y * 7));
      pp.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
    for (let i = trees.length - 1; i >= 0; i--) if (Math.hypot(trees[i][0], trees[i][1]) < 380) trees.splice(i, 1);
    const inst = new THREE.InstancedMesh(geo, mat, trees.length);
    const M = new THREE.Matrix4(), c = new THREE.Color();
    trees.forEach(([x, z], i) => {
      const s = 3 + rand() * 2.8;
      M.compose(new THREE.Vector3(x, base(x, z) + s * 1.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6.28, 0)), new THREE.Vector3(s, s * 1.05, s));
      inst.setMatrixAt(i, M);
      inst.setColorAt(i, c.set(pick(['#3e5a2c', '#344f27', '#486335', '#2f4724'])));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    add(inst, true);
  }

  // ---------- models (heights from the slope) ----------
  const put = (it, dy = 0) => {
    const [x, , z] = it.p;
    const y = it.y ?? H(x, z) + dy;
    return placeItem({ ...it, p: [x, y, z] });
  };
  const jobs = [];
  // the Painted Ladies: two copies of the three-house scan, stepping down toward Hayes; the second repainted
  jobs.push(put({ m: 'land_painted_ladies_row', p: [5.6, 0, -11.6], w: 23, ry: -90, y: base(5, -11.6 + 6) + 0.1 }));
  jobs.push(put({ m: 'land_painted_ladies_row', p: [5.6, 0, 11.6], w: 23, ry: -90, y: base(5, 11.6 + 6) + 0.1, tint: '#f6eef4' }));
  // north of the row along Steiner, and the big corner Victorian at Hayes
  jobs.push(put({ m: 'land_painted_ladies_row', p: [5.6, 0, -35.2], w: 23, ry: -90, y: base(5, -35.2 + 6) + 0.1, tint: '#e9f0f4' }));
  jobs.push(put({ m: 'city_sf_victorian_green', p: [8, 0, 30.5], h: 15, ry: -90, y: base(8, 30.5) + 0.1 }));
  jobs.push(put({ m: 'city_sf_victorian', p: [11, 0, 46.5], h: 12, ry: -90, y: base(11, 46.5) + 0.1 }));

  // Transamerica Pyramid at its real place
  {
    const [x, z] = loc(37.7952, -122.4028);
    jobs.push(put({ m: 'land_transamerica_pyramid', p: [x, 0, z], h: 260, ry: 0, y: DT }));
  }

  // cypresses and pines on the hill, framing the lawn; street trees on Steiner
  const T = (part, x, z, h, ry = 0) => jobs.push(put({ m: 'nat_conifer_pack', part, p: [x, 0, z], h, ry, y: H(x, z) - 0.2 }));
  const PINE = ['Object_7', 'Object_8'], CONE = ['Object_4', 'Object_5'], BUSH = ['Object_13', 'Object_14'];
  T(PINE, -150, 46, 21, 40);
  T(CONE, -132, 52, 15, 120);
  T(BUSH, -62, 49, 9, 10);
  T(PINE, -168, -60, 23, 200);
  T(CONE, -150, -96, 17, 70);
  T(PINE, -205, -20, 22, 300);
  T(BUSH, -205, -12, 11, 160);
  T(PINE, -230, 40, 24, 90);
  T(CONE, -240, -70, 18, 10);
  T(BUSH, -110, -122, 10, 220);
  T(PINE, -80, -160, 20, 30);
  T(CONE, -60, -190, 15, 260);
  for (const z of [-120, -95, -75, 28, 50]) T(BUSH, -2.5, z, 6.5 + (z % 3), z * 7);
  for (const [x, z, k] of [[60, -70, 0], [95, 20, 1], [70, -150, 2], [140, -40, 0], [40, 100, 1], [150, 120, 2], [-60, -380, 0], [120, -230, 1], [210, 60, 2], [-120, 110, 0], [-190, 100, 1], [260, -120, 0]]) T([PINE, CONE, BUSH][k], x, z, [16, 12, 9][k] + (x % 4), x * 3);

  // a path along the lawn's foot, benches, people
  {
    const pathMat = texMat('precast_stone_paving', 1.4, { color: '#d4cfc6' });
    grid(-30, -300, -27, HAYES_N - 2, 1, (x, z) => park(x, z) + 0.03, pathMat);
  }
  jobs.push(put({ m: 'bench_painted', p: [-31.6, 0, 18], h: 0.89, ry: 90 }));
  jobs.push(put({ m: 'bench_painted', p: [-31.6, 0, -14], h: 0.89, ry: 90 }));
  jobs.push(put({ m: 'city_person_woman_walking', p: [-28.5, 0, 6], h: 1.68, ry: 180 }, 0.03));
  jobs.push(put({ m: 'city_person_mother_child', p: [-58, 0, 20], h: 1.66, ry: 70 }));
  jobs.push(put({ m: 'city_person_man_standing', p: [-86, 0, 14], h: 1.78, ry: 75 }));
  jobs.push(put({ m: 'city_person_man_walking', p: [-19, 0, 30], h: 1.76, ry: 0 }, 0.15));
  // parked cars along Steiner
  jobs.push(put({ m: 'city_station_wagon', p: [-6.4, 0, 30], len: 5.0, ry: 0 }));
  jobs.push(put({ m: 'city_crown_vic_sedan', p: [-6.4, 0, -4], len: 5.4, ry: 0 }));
  jobs.push(put({ m: 'city_dodge_diplomat', p: [-15.6, 0, -24], len: 5.2, ry: 180 }));
  // street lamps
  for (const z of [-40, -5, 30]) jobs.push(put({ m: 'city_street_lamp_01', p: [-19.3, 0, z], h: 4.3, ry: 90 }, 0.15));
  await Promise.all(jobs);

  // cameras stand on the ground
  for (const c of spec.cameras ?? []) if (c.eye !== undefined) c.pos[1] = H(c.pos[0], c.pos[2]) + c.eye;
  console.log('[alamo] houses', houses.length, 'towers', tw.length, 'trees', trees.length, 'blades', blades);
};
