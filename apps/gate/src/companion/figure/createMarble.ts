// The Figure: a small marble muse. A softly rounded diamond of a head rests on a slender spindle above a teardrop
// body; two long blades float at its sides like folded wings, and a little point with a hanging jewel floats below.
// Its face is drawn in light: two arched eyes, a star on the brow, a recessed oval plate edged with light. Polished white stone with
// grey and gold veins, warm where light passes through. All motion is eased and unhurried.
//   portal     calm: soft half-lidded eyes that glow and blink, head a little bowed, slow breath
//   idle       arched eyes of light that breathe, occasional blinks, tiny head tilts
//   listening  the eyes fill and brighten with your voice; the head tilts, the wings come in
//   thinking   eyes glance up and aside, the brow diamond pulses
//   speaking   eye light follows the voice; a gentle nod; the blades open slightly
// Expressions: happy (fuller, brighter eyes), curious (one eye larger), gentle (slimmer arcs), sleepy (fine arcs).
import * as THREE from 'three';
import { glowBlending } from '../../scene/util';
import type { FigureRig } from './createFigure';
import { applyMarble, FACE, marbleFaceUniforms, marbleUniforms, WING } from './marbleShaders';

// Proportions (metres). Total ≈ 0.5 m; the root's origin is the figure's visual centre, at the top of the body.
const HEAD = { a: 0.142, up: 0.118, down: 0.094, c: 0.08, q: 2.5 };
const NECK_H = 0.023;
const ARM_X = 0.066;   // the wings' roots, at the shoulders
const ARM_SPREAD = 0.27; // radians: the wings open outward from the shoulders

/** The head's front outline as radius-by-angle: a rhombus with softly rounded corners and gently full sides. */
function outline(n: number): Float32Array {
  const b = 0.8, round = 0.17, full = 0.25;
  const sd = (x: number, y: number) => {
    const px = Math.abs(x), py = Math.abs(y);
    const h = THREE.MathUtils.clamp((b * (b - 2 * px) - b * (b - 2 * py)) / (2 * b * b), -1, 1);
    const dR = Math.hypot(px - 0.5 * b * (1 - h), py - 0.5 * b * (1 + h)) * Math.sign(px * b + py * b - b * b);
    return dR * (1 - full) + (Math.hypot(px, py) - b) * full - round;
  };
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2, cx = Math.cos(th), cy = Math.sin(th);
    let lo = 0, hi = 2;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (sd(mid * cx, mid * cy) < 0) lo = mid; else hi = mid; }
    r[i] = (lo + hi) / 2;
  }
  const corner = r[0]!;
  for (let i = 0; i < n; i++) r[i] = r[i]! / corner; // corners at exactly 1
  return r;
}

/**
 * The head: every cross-section a scaled copy of the outline, its edges rounding back like a cushion
 * ((r/ρ(θ))^q + |z/c|^q = 1). Normals come from that surface's gradient, so the glaze is perfectly smooth.
 */
function headGeometry(): THREE.BufferGeometry {
  const n = 1440, rho = outline(n), step = (Math.PI * 2) / n;
  const look = (th: number) => {
    let u = (th / (Math.PI * 2)) * n;
    u = ((u % n) + n) % n;
    const i = Math.floor(u), fr = u - i;
    const a0 = rho[i]!, a1 = rho[(i + 1) % n]!;
    return { r: a0 + (a1 - a0) * fr, dr: (a1 - a0) / step };
  };
  const g = new THREE.SphereGeometry(1, 144, 108);
  const p = g.attributes.position as THREE.BufferAttribute;
  const nr = g.attributes.normal as THREE.BufferAttribute;
  const { a, up, down, c, q } = HEAD;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    const bY = dy >= 0 ? up : down;
    const X = dx / a, Y = dy / bY, Z = dz / c;
    const th = Math.atan2(Y, X);
    const { r: ro, dr } = look(th);
    const u = Math.hypot(X, Y) / ro, w = Math.abs(Z);
    const t = Math.pow(Math.pow(u, q) + Math.pow(w, q), -1 / q);
    p.setXYZ(i, dx * t, dy * t, dz * t);
    const gr = q * Math.pow(u * t, q - 1);
    const ct = Math.cos(th), st = Math.sin(th), k = dr / (ro * ro);
    const gx = gr * (ct / ro + k * st), gy = gr * (st / ro - k * ct), gz = q * Math.pow(w * t, q - 1) * Math.sign(Z);
    const nx = gx / a, ny = gy / bY, nz = gz / c, l = Math.hypot(nx, ny, nz) || 1;
    nr.setXYZ(i, nx / l, ny / l, nz / l);
  }
  g.computeBoundingSphere();
  return g;
}

/** Where the head's front surface is, at a point of the face (for placing glow just in front of it). */
function headFrontZ(x: number, y: number): number {
  const { a, up, down, c, q } = HEAD;
  const X = x / a, Y = y / (y >= 0 ? up : down);
  const u = Math.min(0.999, Math.hypot(X, Y) / 0.92); // the outline is close to a circle of ~0.92 near the middle
  return c * Math.pow(1 - Math.pow(u, q), 1 / q);
}

function lathe(points: [number, number][], segments: number, samples: number) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(0.0004, v.x), v.y));
  // Profiles here run top to bottom; LatheGeometry faces outward only when its points run bottom to top.
  if (pts.length > 1 && pts[0]!.y > pts[pts.length - 1]!.y) pts.reverse();
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return { geo, pts };
}
/** Radius of a lathe profile at height y (profiles run top to bottom). */
function radiusAt(pts: THREE.Vector2[], y: number): number {
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!, p1 = pts[i]!;
    if ((p0.y - y) * (p1.y - y) <= 0) { const t = (y - p0.y) / (p1.y - p0.y || 1); return p0.x + (p1.x - p0.x) * t; }
  }
  return 0;
}

/** The body: a teardrop, full at the shoulders, tapering to the gold ring below. Its top is y = 0. */
const BODY_PROFILE: [number, number][] = [
  [0.0004, 0.004], [0.012, 0.0035], [0.022, 0.0005], [0.032, -0.006], [0.041, -0.016], [0.048, -0.029], [0.0525, -0.045],
  [0.0535, -0.06], [0.052, -0.076], [0.048, -0.093], [0.0415, -0.109], [0.033, -0.123], [0.0235, -0.134], [0.0155, -0.141],
  [0.008, -0.1445], [0.0004, -0.1455],
];

/** A wing: slender at the root, fullest a third of the way down, tapering to a fine point (WING.len long). */
const ARM_PROFILE: [number, number][] = ([
  [0.0004, 0.012], [0.0058, 0.0105], [0.0118, 0.005], [0.0178, -0.006], [0.0228, -0.022], [0.0262, -0.041], [0.0276, -0.06],
  [0.027, -0.079], [0.0246, -0.099], [0.0208, -0.119], [0.0162, -0.138], [0.0113, -0.155], [0.0066, -0.168], [0.003, -0.177], [0.0004, -0.183],
] as [number, number][]).map(([r, y]) => [r * 1.04, y * (WING.len / 0.183)]);
const ARM_FLAT = 0.5;
const armBend = (y: number) => WING.bend * Math.pow(Math.max(0, -y) / WING.len, 2); // the tip sweeps outward, like a wing

/** A wing blade: a flattened leaf whose tip sweeps outward. Local +x faces the body. Pivot at the root. */
function armGeometry() {
  const { geo, pts } = lathe(ARM_PROFILE, 64, 120);
  geo.scale(1, 1, ARM_FLAT);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + armBend(p.getY(i)));
  geo.computeVertexNormals();
  return { geo, pts };
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (let i = 0; i <= 16; i++) { const t = i / 16, v = Math.round(255 * Math.exp(-t * t * 4.5) * (1 - t)); grad.addColorStop(t, `rgb(${v},${v},${v})`); }
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);

export function createMarbleFigure(): FigureRig {
  const root = new THREE.Group();
  root.name = 'figure-companion';
  const rootScale = 1.15; // a little larger than the first Figure, so it holds its own in front of the rotunda
  const U = marbleUniforms();
  const face = marbleFaceUniforms();

  // Polished white marble: a smooth base under one crisp clearcoat.
  const stone: THREE.MeshPhysicalMaterialParameters = {
    color: '#f3f0ea', roughness: 0.24, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    envMapIntensity: 0.62, transparent: true, opacity: 1, fog: false, // the companion is always near and crisp
  };
  const headMat = new THREE.MeshPhysicalMaterial(stone);
  applyMarble(headMat, U, 'face', face);
  const bodyMat = new THREE.MeshPhysicalMaterial(stone);
  applyMarble(bodyMat, U, 'chest');
  const shellMat = new THREE.MeshPhysicalMaterial(stone);
  applyMarble(shellMat, U, 'shell');
  const wingMat = new THREE.MeshPhysicalMaterial(stone);
  applyMarble(wingMat, U, 'wing');
  // Champagne chrome for the neck, rings and bezels (the carved seams and frames are gold): it also glows a little,
  // so it reads in a dark scene.
  const goldMat = new THREE.MeshPhysicalMaterial({ color: '#e9e1d0', metalness: 1, roughness: 0.16, clearcoat: 0.5, emissive: new THREE.Color('#3d3324'), emissiveIntensity: 0.5, transparent: true, fog: false });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#1b1d24', roughness: 0.14, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, fog: false });
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2dc'), toneMapped: false, transparent: true, fog: false });
  const disposables: { dispose(): void }[] = [headMat, bodyMat, shellMat, wingMat, goldMat, glassMat, lightMat];
  const geo = <G extends THREE.BufferGeometry>(g: G) => { disposables.push(g); return g; };

  // ---------- body (its top is the root's origin), spindle and head ----------
  const BODY = lathe(BODY_PROFILE, 96, 140);
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  bodyGroup.add(new THREE.Mesh(geo(BODY.geo), bodyMat));
  // The neck: a short gold spindle (collar, one ring, a stem that rises into the head).
  const spindle = lathe(([
    [0.017, 0.0], [0.0175, 0.0025], [0.0135, 0.0055], [0.006, 0.0075], [0.0048, 0.012], [0.0105, 0.0145], [0.011, 0.0165],
    [0.0048, 0.019], [0.0042, 0.028], [0.0065, 0.034], [0.003, 0.039], [0.0004, 0.04],
  ] as [number, number][]).map(([r, y]) => [r, y * 0.68]), 48, 60);
  bodyGroup.add(new THREE.Mesh(geo(spindle.geo), goldMat));

  // Two round ports on the body's flanks, where the blades would join: a gold bezel around dark glass.
  // Two round discs on the body's flanks (where the wings would join): a chrome bezel, dark glass, a ring of light.
  const portRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), toneMapped: false, transparent: true, fog: false });
  disposables.push(portRingMat);
  for (const side of [-1, 1]) {
    const phi = side * 1.22, y = -0.062, r = radiusAt(BODY.pts, y);
    const port = new THREE.Group();
    port.position.set(Math.sin(phi) * (r + 0.0008), y, Math.cos(phi) * (r + 0.0008));
    port.rotation.y = phi;
    port.add(new THREE.Mesh(geo(new THREE.TorusGeometry(0.0172, 0.0028, 16, 64)), goldMat));
    const disc = new THREE.Mesh(geo(new THREE.CircleGeometry(0.0168, 48)), glassMat);
    disc.position.z = -0.0012;
    port.add(disc);
    const glowRing = new THREE.Mesh(geo(new THREE.TorusGeometry(0.0112, 0.0007, 8, 64)), portRingMat);
    glowRing.position.z = -0.0006;
    port.add(glowRing);
    port.add(new THREE.Mesh(geo(new THREE.TorusGeometry(0.0062, 0.0011, 10, 40)), goldMat));
    bodyGroup.add(port);
  }

  const headPivot = new THREE.Group(); // the neck joint: the head turns, tilts and nods about it
  headPivot.position.y = NECK_H;
  bodyGroup.add(headPivot);
  const head = new THREE.Mesh(geo(headGeometry()), headMat);
  head.position.y = HEAD.down;
  headPivot.add(head);

  // ---------- the floating point below, with its jewel ----------
  const lower = new THREE.Group();
  root.add(lower);
  const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.0158, 0.0022, 12, 64)), goldMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.1475;
  lower.add(ring);
  const cone = lathe([
    [0.0004, 0.0035], [0.01, 0.003], [0.0175, 0.0], [0.021, -0.006], [0.0205, -0.014], [0.0175, -0.024], [0.0125, -0.035],
    [0.007, -0.045], [0.003, -0.051], [0.0004, -0.054],
  ], 48, 60);
  const coneMesh = new THREE.Mesh(geo(cone.geo), shellMat);
  coneMesh.position.y = -0.151;
  lower.add(coneMesh);
  const pendant = new THREE.Group(); // swings gently from the cone's tip
  pendant.position.y = -0.205;
  lower.add(pendant);
  const thread = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.0005, 0.0005, 0.022, 6)), goldMat);
  thread.position.y = -0.011;
  pendant.add(thread);
  const jewel = new THREE.Mesh(geo(new THREE.OctahedronGeometry(1, 0)), lightMat);
  jewel.scale.set(0.0052, 0.0092, 0.0052);
  jewel.position.y = -0.031;
  pendant.add(jewel);

  // ---------- the blades ----------
  const arm = armGeometry();
  disposables.push(arm.geo);
  const edgePts: THREE.Vector3[] = [];
  for (let y = 0.002; y >= -0.165; y -= 0.006) edgePts.push(new THREE.Vector3(radiusAt(arm.pts, y) + armBend(y) - 0.0004, y, 0));
  const edgeGeo = geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts), 60, 0.00085, 6, false));
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * ARM_X, -0.012, 0.002);
    pivot.rotation.z = side * ARM_SPREAD;
    const blade = new THREE.Group();
    blade.scale.x = -side; // local +x faces the body on both sides
    blade.add(new THREE.Mesh(arm.geo, wingMat));
    blade.add(new THREE.Mesh(edgeGeo, goldMat));
    pivot.add(blade);
    root.add(pivot);
    return { pivot, side };
  });

  // ---------- soft glow, so the light blooms even in the headset (additive, in front of each light) ----------
  const glowTex = radialTexture();
  disposables.push(glowTex);
  const glowMat = (w: number, h: number) => {
    const m = glowBlending(new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color('#ffd9a3'), transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    disposables.push(m);
    const mesh = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), m);
    mesh.renderOrder = 40;
    return { mesh, mat: m };
  };
  const eyeGlows = [-1, 1].map((side) => {
    // A soft glow shaped to the arch (wide and low), centred on it so the eye reads as one light.
    const g = glowMat(0.078, 0.036);
    g.mesh.position.set(side * FACE.eyeX, FACE.eyeY + 0.009, headFrontZ(side * FACE.eyeX, FACE.eyeY + 0.009) + 0.004);
    head.add(g.mesh);
    return g;
  });
  const browGlow = glowMat(0.05, 0.062);
  browGlow.mesh.position.set(0, FACE.starY, headFrontZ(0, FACE.starY) + 0.004);
  head.add(browGlow.mesh);
  const chestGlow = glowMat(0.048, 0.06);
  chestGlow.mesh.position.set(0, FACE.chestY, radiusAt(BODY.pts, FACE.chestY) + 0.004);
  bodyGroup.add(chestGlow.mesh);
  const jewelGlow = glowMat(0.04, 0.05);
  jewelGlow.mesh.position.set(0, -0.031, 0.006);
  pendant.add(jewelGlow.mesh);


  // ---------- animated state ----------
  let fade = 0, wake = 0, eyesOpen = 0, blinkPhase = -1, nextBlink = 2.5;
  let yaw = 0, pitch = 0.16, roll = 0, levelS = 0;
  const cur = { cut: 0.004, lineL: 1, lineR: 1, sLx: 1, sLy: 1, sRx: 1, sRy: 1, ox: 0, oy: 0, oLy: 0, bright: 0.3, tilt: 0.1, dia: 0.3 };
  const _cam = new THREE.Vector3();
  let wasPortal = true;
  let lastStage: string = 'portal', greetAt = -10;
  const stoneMats = [headMat, bodyMat, shellMat, wingMat, goldMat, glassMat];

  return {
    root,
    update(dt, time, s, o) {
      fade = damp(fade, o.fade, o.fade > fade ? 2.6 : 3.2, dt);
      root.visible = fade > 0.01;
      const dormant = s.stage === 'portal';
      if (wasPortal && !dormant) { blinkPhase = -1; nextBlink = 1.35; } // waking: a first blink once the eyes are open
      wasPortal = dormant;
      wake = damp(wake, dormant ? 0 : 1, dormant ? 1.6 : 1.25, dt);
      eyesOpen = damp(eyesOpen, 1, 1.7, dt);
      levelS = damp(levelS, Math.min(1, s.level), s.level > levelS ? 9 : 4, dt);
      const L = levelS;
      const awake = smooth(Math.min(1, wake));

      // Blinks every 2.5–5 s (now and then twice): the eyes thin to a line and open again over ~0.24 s.
      nextBlink -= dt;
      if (blinkPhase < 0 && nextBlink <= 0) { blinkPhase = 0; nextBlink = Math.random() < 0.18 ? 0.34 : 2.5 + Math.random() * 2.5; }
      let blink = 0;
      if (blinkPhase >= 0) { blinkPhase += dt / 0.24; blink = Math.sin(Math.min(1, blinkPhase) * Math.PI); if (blinkPhase >= 1) blinkPhase = -1; }

      // ---------- eye targets from expression + mood ----------
      let cut = 0.004, line = 0, sL = 1, sR = 1, oLy = 0, tilt = 0.08, ox = 0, oy = 0, bright = 0.92, dia = 0.85;
      switch (s.expression) {
        case 'happy': cut = 0.007; bright = 1.05; tilt = 0.05; break;
        case 'curious': sL = 1.12; sR = 0.92; oLy = 0.002; tilt = 0.05; break;
        case 'gentle': cut = 0.009; tilt = 0.11; break;
        case 'sleepy': line = 0.85; tilt = 0.08; bright = 0.6; break;
        default: break;
      }
      const breathe = 0.94 + 0.06 * Math.sin(time * Math.PI * 2 * 0.22);
      switch (s.mood) {
        case 'listening': { const k = 1.03 + L * 0.05; sL *= k; sR *= k; cut = Math.min(cut, 0.0) - L * 0.002; } bright = 1 + L * 0.3 + 0.04 * Math.sin(time * Math.PI * 2 * 0.4); dia = 0.75 + L * 0.3; break;
        case 'thinking': ox = 0.0055; oy = 0.004; sL *= 0.94; sR *= 0.94; bright = 0.86 + 0.06 * Math.sin(time * 2.2); dia = 0.9 + 0.35 * Math.sin(time * 3.1); break;
        case 'speaking': bright = 0.86 + L * 0.48; sL *= 1 + L * 0.04; sR *= 1 + L * 0.04; dia = 0.72 + L * 0.45; break;
        default: bright *= breathe; dia *= breathe;
      }
      if (dormant) cut = Math.max(cut, 0.006); // at the gate: calm, still glowing fully
      const closed = 1 - smooth(Math.min(1, eyesOpen));
      const lineT = Math.max(line, closed, blink);
      bright = THREE.MathUtils.lerp(0.32, bright, smooth(Math.min(1, eyesOpen)));
      dia = THREE.MathUtils.lerp(0.3 + 0.08 * Math.sin(time * 1.2), dia, awake);
      const kShape = 7, kLight = 3.2; // shapes settle in ~0.15 s, light in ~0.33 s (calm contract)
      cur.cut = damp(cur.cut, cut, kShape, dt);
      cur.lineL = blinkPhase >= 0 ? lineT : damp(cur.lineL, lineT, kShape, dt);
      cur.lineR = blinkPhase >= 0 ? lineT : damp(cur.lineR, lineT, kShape, dt);
      cur.sLx = damp(cur.sLx, sL, kShape, dt); cur.sLy = damp(cur.sLy, sL, kShape, dt);
      cur.sRx = damp(cur.sRx, sR, kShape, dt); cur.sRy = damp(cur.sRy, sR, kShape, dt);
      cur.ox = damp(cur.ox, ox, 4, dt); cur.oy = damp(cur.oy, oy, 4, dt); cur.oLy = damp(cur.oLy, oLy, kShape, dt);
      cur.bright = damp(cur.bright, bright, kLight, dt);
      cur.tilt = damp(cur.tilt, tilt, kShape, dt);
      cur.dia = damp(cur.dia, dia, kLight, dt);
      face.uEyeL.value.set(-FACE.eyeX + cur.ox, FACE.eyeY + cur.oy + cur.oLy, cur.sLx, cur.sLy);
      face.uEyeR.value.set(FACE.eyeX + cur.ox, FACE.eyeY + cur.oy, cur.sRx, cur.sRy);
      face.uCut.value = cur.cut;
      face.uLineL.value = cur.lineL;
      face.uLineR.value = cur.lineR;
      face.uBright.value = cur.bright * fade;
      face.uTilt.value = cur.tilt;
      U.uDiaBright.value = cur.dia * fade;
      // Night: a violet aurora rim; on the white page a quieter rim and a little more form shading.
      U.uRimAmt.value = THREE.MathUtils.lerp(0.3, 0.1, o.onLight);
      U.uOcclusion.value = THREE.MathUtils.lerp(0.26, 0.24, o.onLight);
      U.uExposure.value = THREE.MathUtils.lerp(0.78, 1.0, o.onLight); // a little shade on the stone so its lights read
      // (glowBlending is additive: brightness rides on the colour, not opacity)
      const gk = fade * THREE.MathUtils.lerp(0.5, 0.07, o.onLight); // on the white page additive glow only tints the stone
      for (const g of eyeGlows) g.mat.color.set('#ffd39c').multiplyScalar(cur.bright * gk * (1 - Math.max(cur.lineL, cur.lineR) * 0.8));
      browGlow.mat.color.set('#ffd39c').multiplyScalar(cur.dia * gk * 0.9);
      chestGlow.mat.color.set('#ffd39c').multiplyScalar(cur.dia * gk * 0.8);
      jewelGlow.mat.color.set('#ffd39c').multiplyScalar(cur.dia * gk * 0.7);
      lightMat.color.set('#fff2dc').multiplyScalar(0.6 + cur.dia * 0.9);

      // ---------- the head looks at you (softly limited), with mood in its posture ----------
      o.camera.getWorldPosition(_cam);
      bodyGroup.worldToLocal(_cam);
      const dx = _cam.x, dy = _cam.y - (NECK_H + HEAD.down), dz = Math.max(0.2, _cam.z);
      let tYaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.45, 0.45);
      let tPitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.2, 0.2);
      let tRoll = Math.sin(time * 0.31) * 0.022;
      if (s.mood === 'listening') tRoll += 0.075;
      if (s.mood === 'thinking') { tYaw += 0.15; tPitch -= 0.1; tRoll -= 0.035; }
      if (s.mood === 'speaking') tPitch += (L - 0.35) * 0.06;
      if (s.expression === 'curious') tRoll += 0.05;
      tPitch = THREE.MathUtils.lerp(0.16, tPitch, awake); // dormant: bowed
      tYaw *= awake;
      yaw = damp(yaw, tYaw, 2.6, dt);
      pitch = damp(pitch, tPitch, 2.6, dt);
      roll = damp(roll, tRoll, 2.2, dt);
      headPivot.rotation.set(pitch, yaw, roll, 'YXZ');

      // The body breathes and sways; the head rides on it. The blades and the point below float on their own.
      root.scale.setScalar(rootScale);
      root.position.y = Math.sin(time * 0.9) * 0.004 - (1 - awake) * 0.004;
      bodyGroup.rotation.z = Math.sin(time * 0.43) * 0.012;
      bodyGroup.rotation.x = Math.sin(time * 0.37 + 1.2) * 0.009;
      lower.position.y = Math.sin(time * 0.9 - 0.9) * 0.003;
      lower.rotation.y += dt * 0.22;
      pendant.rotation.z = Math.sin(time * 1.25) * 0.09;
      pendant.rotation.x = Math.sin(time * 0.95 + 0.6) * 0.06;
      // Hello: the first moments of the greeting, one wing waves.
      if (s.stage === 'greeting' && lastStage !== 'greeting') greetAt = time;
      lastStage = s.stage;
      const waving = s.stage === 'greeting' && time - greetAt < 3.4;
      for (const a of arms) {
        // Wings breathe open and closed, slowly and visibly; they gesture as it speaks, fold in to listen, and one
        // lifts toward the face while it thinks.
        let z = a.side * (ARM_SPREAD + Math.sin(time * 0.9 + (a.side > 0 ? 0 : 0.5)) * 0.075);
        let x = Math.sin(time * 0.6 + a.side) * 0.05;
        let rate = 3;
        if (s.mood === 'speaking') { z += a.side * (0.05 + L * 0.24); x -= L * 0.1 + Math.sin(time * 2.1 + a.side) * 0.04; }
        if (s.mood === 'listening') { x -= 0.15; z -= a.side * 0.12; }
        if (s.mood === 'thinking') { if (a.side > 0) { x -= 0.5; z += 0.22; } else z -= 0.05; }
        if (waving && a.side > 0) { z = ARM_SPREAD + 0.45 + Math.sin((time - greetAt) * 7) * 0.2; x = -0.25; rate = 9; }
        z = THREE.MathUtils.lerp(a.side * (ARM_SPREAD - 0.1) + a.side * Math.sin(time * 0.9) * 0.04, z, awake);
        a.pivot.rotation.z = damp(a.pivot.rotation.z, z, rate, dt);
        a.pivot.rotation.x = damp(a.pivot.rotation.x, x, rate, dt);
        a.pivot.position.y = -0.012 + Math.sin(time * 0.8 + a.side * 1.3) * 0.003;
      }


      for (const m of stoneMats) m.opacity = fade;
      lightMat.opacity = fade;
      portRingMat.opacity = fade;
      portRingMat.color.set('#ffd9a0').multiplyScalar(0.55 + cur.dia * 0.7);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
