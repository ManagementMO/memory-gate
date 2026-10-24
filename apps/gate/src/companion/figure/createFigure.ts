// The Figure: a serene porcelain being. An egg-shaped head floats a breath above a smooth, tapering body; a black
// glass visor wears two soft LED eyes; teardrop arms hang free at its sides; a hairline orbit turns slowly around
// its head when it thinks. Inspired by EVE's calm industrial grace and the quiet "higher-dimensional" figures of
// dreamcore, kept clean and kind. Every surface is one of two materials; all motion is eased and unhurried.
//   portal     dormant: eyes closed to thin dim lines, head bowed, slow breath
//   idle       soft open eyes that breathe with the light, occasional blinks, tiny head tilts
//   listening  eyes widen a little and brighten with your voice; head tilts, arms come in
//   thinking   eyes glance up and aside, scanlines drift, the orbit brightens and turns
//   speaking   eye light follows the voice; a gentle nod; arms open slightly
// Expressions shape the eyes: happy ◠ ◠ arcs, curious one-eye-larger, gentle half-lidded, sleepy thin lines.
import * as THREE from 'three';
import type { Expression, Mood, Stage } from '../../state/store';
import { glowBlending } from '../../scene/util';
import { applyFace, applyShell, faceUniforms } from './shaders';

export type FigureState = { mood: Mood; expression: Expression; level: number; stage: Stage };
export type FigureRig = {
  root: THREE.Group;
  update(dt: number, time: number, s: FigureState, o: { camera: THREE.Camera; fade: number; onLight: number }): void;
  dispose(): void;
};

// Proportions (metres). Total ≈ 0.53 m; the root's origin is the figure's visual centre.
const HEAD_R = new THREE.Vector3(0.108, 0.08, 0.095);
const BODY_H = 0.33;
const GAP = 0.021;
const HEAD_BOTTOM = HEAD_R.y * 0.82;
const TOTAL = BODY_H + GAP + HEAD_BOTTOM + HEAD_R.y;
const BODY_TOP = TOTAL / 2 - (HEAD_R.y + HEAD_BOTTOM + GAP);
const HEAD_Y = BODY_TOP + GAP + HEAD_BOTTOM;

function headGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 72, 54);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    if (y < 0) y *= 0.82; // a slightly flattened underside: the head rests in the air like a stone in water
    p.setXYZ(i, p.getX(i) * HEAD_R.x, y * HEAD_R.y, p.getZ(i) * HEAD_R.z);
  }
  g.computeVertexNormals();
  return g;
}

function lathe(points: [number, number][], segments: number, samples: number): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(0.0004, v.x), v.y));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/** The body: an egg turned upside down, widest at the shoulders, with a shallow dish where the head hovers. */
function bodyGeometry(): THREE.BufferGeometry {
  return lathe([
    [0.0004, -BODY_H], [0.024, -0.326], [0.045, -0.312], [0.063, -0.29], [0.077, -0.26], [0.088, -0.222], [0.0955, -0.18],
    [0.0995, -0.136], [0.1005, -0.095], [0.099, -0.06], [0.095, -0.032], [0.088, -0.013], [0.0805, -0.003], [0.0735, 0.0],
    [0.068, 0.0005], [0.0625, -0.004], [0.042, -0.011], [0.0004, -0.013],
  ], 72, 120);
}

/** A teardrop arm: rounded at the shoulder, tapering to a soft point. Pivot at the shoulder. */
function armGeometry(): THREE.BufferGeometry {
  const g = lathe([
    [0.0004, -0.152], [0.005, -0.147], [0.0095, -0.135], [0.014, -0.111], [0.0185, -0.079], [0.0218, -0.045], [0.0234, -0.02],
    [0.023, -0.004], [0.0195, 0.009], [0.012, 0.0175], [0.0004, 0.0205],
  ], 40, 60);
  g.scale(1, 1, 0.64); // flattened, like a blade of porcelain
  return g;
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 64);
  g.save();
  g.scale(1, 0.5);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgb(255,255,255)');
  grad.addColorStop(0.35, 'rgb(90,90,90)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);

export function createFigure(): FigureRig {
  const root = new THREE.Group();
  root.name = 'figure-companion';
  const face = faceUniforms();
  const shellU = { uRim: face.uRim, uRimAmt: face.uRimAmt, uOcclusion: face.uOcclusion, uExposure: face.uExposure };

  // Porcelain with a faint pearl iridescence (the "higher-dimensional" sheen), glossy clearcoat over a soft base.
  const shellParams: THREE.MeshPhysicalMaterialParameters = {
    color: '#ebebe7', roughness: 0.26, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 0.32, iridescenceIOR: 1.32, iridescenceThicknessRange: [160, 420], sheen: 0.25, sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#e9e4ff'), envMapIntensity: 0.72, transparent: true, opacity: 1,
  };
  const headMat = new THREE.MeshPhysicalMaterial(shellParams);
  applyFace(headMat, face);
  const shellMat = new THREE.MeshPhysicalMaterial(shellParams);
  applyShell(shellMat, shellU);
  const seamMat = new THREE.MeshPhysicalMaterial({ color: '#30333c', roughness: 0.3, metalness: 0.2, clearcoat: 0.6, transparent: true });

  const head = new THREE.Mesh(headGeometry(), headMat);
  const headPivot = new THREE.Group(); // rotates the head (look, tilt, nod)
  headPivot.position.y = HEAD_Y;
  headPivot.add(head);
  root.add(headPivot);

  const bodyGroup = new THREE.Group(); // sways gently
  bodyGroup.position.y = BODY_TOP;
  const body = new THREE.Mesh(bodyGeometry(), shellMat);
  bodyGroup.add(body);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.0026, 12, 96), seamMat);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = -0.0015;
  bodyGroup.add(seam);
  root.add(bodyGroup);

  const armGeo = armGeometry();
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.118, BODY_TOP - 0.034, 0.004);
    const arm = new THREE.Mesh(armGeo, shellMat);
    pivot.add(arm);
    root.add(pivot);
    return { pivot, side };
  });

  // The eye glow: a soft additive light just in front of the visor, so the eyes bloom even in the headset.
  const glowTex = radialTexture();
  const glowMat = glowBlending(new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color('#3f9bff'), transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.12), glowMat);
  glow.position.set(0, -0.004, HEAD_R.z + 0.006);
  glow.renderOrder = 40;
  head.add(glow);

  // A hairline orbit around the head: barely there at rest, it brightens and turns while the Figure thinks.
  const orbitMat = glowBlending(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0.12 }, uFade: { value: 1 }, uLight: { value: 0 } },
    vertexShader: /* glsl */ `varying float vA; attribute float aAngle;
      void main(){ vA = aAngle; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying float vA; uniform float uTime, uAmt, uFade, uLight;
      void main(){
        float comet = 0.25 + 0.75 * pow(0.5 + 0.5 * cos(vA - uTime * 1.3), 8.0);
        vec3 c = mix(vec3(0.62, 0.52, 1.0), vec3(0.45, 0.95, 0.82), 0.5 + 0.5 * sin(vA * 2.0 + uTime * 0.2));
        if (uLight > 0.5) c *= 0.55;
        gl_FragColor = vec4(c * comet * uAmt * uFade, 1.0);
      }`,
  }));
  const orbitGeo = new THREE.TorusGeometry(0.145, 0.0012, 6, 220);
  {
    // Store each vertex's angle around the ring for the travelling highlight.
    const p = orbitGeo.attributes.position as THREE.BufferAttribute;
    const a = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) a[i] = Math.atan2(p.getY(i), p.getX(i));
    orbitGeo.setAttribute('aAngle', new THREE.BufferAttribute(a, 1));
  }
  const orbit = new THREE.Mesh(orbitGeo, orbitMat);
  const orbitPivot = new THREE.Group();
  orbitPivot.position.y = HEAD_Y + 0.004;
  orbitPivot.rotation.set(Math.PI / 2 - 0.32, 0, 0.18);
  orbitPivot.add(orbit);
  orbit.renderOrder = 41;
  root.add(orbitPivot);

  // ---------- animated state ----------
  let fade = 0, wake = 0, eyesOpen = 0, blinkPhase = -1, nextBlink = 2.5, scan = 0, orbitAmt = 0.1;
  let yaw = 0, pitch = 0.2, roll = 0, levelS = 0;
  const cur = { arc: 0, lid: 0, lineL: 1, lineR: 1, sLx: 1, sLy: 1, sRx: 1, sRy: 1, ox: 0, oy: 0, oLy: 0, bright: 0.3, tilt: 0.12 };
  const _cam = new THREE.Vector3();
  let wasPortal = true;

  return {
    root,
    update(dt, time, s, o) {
      fade = damp(fade, o.fade, o.fade > fade ? 2.6 : 3.2, dt);
      root.visible = fade > 0.01;
      const dormant = s.stage === 'portal';
      if (wasPortal && !dormant) { blinkPhase = -1; nextBlink = 1.35; } // waking: a first blink once the eyes are open
      wasPortal = dormant;
      wake = damp(wake, dormant ? 0 : 1, dormant ? 1.6 : 1.25, dt);
      eyesOpen = damp(eyesOpen, dormant ? 0 : 1, dormant ? 2.0 : 1.7, dt);
      levelS = damp(levelS, Math.min(1, s.level), s.level > levelS ? 9 : 4, dt);
      const L = levelS;
      const awake = smooth(Math.min(1, wake));

      // Blinks every 3–6 s while awake: lids close and open over ~0.24 s.
      nextBlink -= dt;
      if (blinkPhase < 0 && nextBlink <= 0 && !dormant) { blinkPhase = 0; nextBlink = 3 + Math.random() * 3; }
      let blink = 0;
      if (blinkPhase >= 0) { blinkPhase += dt / 0.24; blink = Math.sin(Math.min(1, blinkPhase) * Math.PI); if (blinkPhase >= 1) blinkPhase = -1; }

      // ---------- eye targets from expression + mood ----------
      let arc = 0, lid = 0, line = 0, sL = 1, sR = 1, oLy = 0, tilt = 0.12, ox = 0, oy = 0, bright = 0.92;
      switch (s.expression) {
        case 'happy': arc = 1; tilt = 0; break;
        case 'curious': sL = 1.16; sR = 0.9; oLy = 0.022; tilt = 0.05; break;
        case 'gentle': lid = 0.5; tilt = 0.16; break;
        case 'sleepy': line = 0.85; tilt = 0.1; bright = 0.6; break;
        default: break;
      }
      const breathe = 0.94 + 0.06 * Math.sin(time * Math.PI * 2 * 0.22);
      switch (s.mood) {
        case 'listening': { const k = 1.07 + L * 0.07; sL *= k; sR *= k; bright = 1 + L * 0.3 + 0.04 * Math.sin(time * Math.PI * 2 * 0.4); break; }
        case 'thinking': ox = 0.075; oy = 0.06; sL *= 0.92; sR *= 0.92; bright = 0.86 + 0.06 * Math.sin(time * 2.2); break;
        case 'speaking': bright = 0.86 + L * 0.48; sL *= 1 + L * 0.04; sR *= 1 + L * 0.04; break;
        default: bright *= breathe;
      }
      const closed = 1 - smooth(Math.min(1, eyesOpen));
      const lineT = Math.max(line, closed, blink);
      bright = THREE.MathUtils.lerp(0.3, bright, smooth(Math.min(1, eyesOpen)));
      const kShape = 7, kLight = 3.2; // shapes settle in ~0.15 s, light in ~0.33 s (calm contract)
      cur.arc = damp(cur.arc, arc, kShape, dt);
      cur.lid = damp(cur.lid, lid, kShape, dt);
      cur.lineL = blinkPhase >= 0 ? lineT : damp(cur.lineL, lineT, kShape, dt);
      cur.lineR = blinkPhase >= 0 ? lineT : damp(cur.lineR, lineT, kShape, dt);
      cur.sLx = damp(cur.sLx, sL, kShape, dt); cur.sLy = damp(cur.sLy, sL, kShape, dt);
      cur.sRx = damp(cur.sRx, sR, kShape, dt); cur.sRy = damp(cur.sRy, sR, kShape, dt);
      cur.ox = damp(cur.ox, ox, 4, dt); cur.oy = damp(cur.oy, oy, 4, dt); cur.oLy = damp(cur.oLy, oLy, kShape, dt);
      cur.bright = damp(cur.bright, bright, kLight, dt);
      cur.tilt = damp(cur.tilt, tilt, kShape, dt);
      scan += dt * (s.mood === 'thinking' ? 0.9 : 0.12);
      face.uEyeL.value.set(-0.36 + cur.ox, 0.0 + cur.oy + cur.oLy, cur.sLx, cur.sLy);
      face.uEyeR.value.set(0.36 + cur.ox, 0.0 + cur.oy, cur.sRx, cur.sRy);
      face.uArc.value = cur.arc;
      face.uLid.value = cur.lid;
      face.uLineL.value = cur.lineL;
      face.uLineR.value = cur.lineR;
      face.uBright.value = cur.bright * fade;
      face.uScan.value = scan;
      face.uTilt.value = cur.tilt;
      // Night: a violet aurora rim; on the white page a quieter lavender rim and a little more form shading.
      face.uRimAmt.value = THREE.MathUtils.lerp(0.42, 0.12, o.onLight);
      face.uOcclusion.value = THREE.MathUtils.lerp(0.3, 0.26, o.onLight);
      // At night the porcelain sits a little lower so its glow never floods the black visor (bloom on flat screens).
      face.uExposure.value = THREE.MathUtils.lerp(0.84, 1.0, o.onLight);
      // (glowBlending is additive: brightness rides on the colour, not opacity)
      glowMat.color.copy(face.uEyeEdge.value).multiplyScalar(cur.bright * fade * (1 - cur.lineL * 0.85) * THREE.MathUtils.lerp(0.32, 0.2, o.onLight));

      // ---------- the head looks at you (softly limited), with mood in its posture ----------
      o.camera.getWorldPosition(_cam);
      root.worldToLocal(_cam);
      const dx = _cam.x, dy = _cam.y - HEAD_Y, dz = Math.max(0.2, _cam.z);
      let tYaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.45, 0.45);
      let tPitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.32, 0.32);
      let tRoll = Math.sin(time * 0.31) * 0.025;
      if (s.mood === 'listening') tRoll += 0.085;
      if (s.mood === 'thinking') { tYaw += 0.17; tPitch -= 0.13; tRoll -= 0.04; }
      if (s.mood === 'speaking') tPitch += (L - 0.35) * 0.08;
      if (s.expression === 'curious') tRoll += 0.06;
      tPitch = THREE.MathUtils.lerp(0.24, tPitch, awake); // dormant: bowed
      tYaw *= awake;
      yaw = damp(yaw, tYaw, 2.6, dt);
      pitch = damp(pitch, tPitch, 2.6, dt);
      roll = damp(roll, tRoll, 2.2, dt);
      headPivot.rotation.set(pitch, yaw, roll, 'YXZ');
      // The head floats: its own slow bob, out of phase with the body's.
      headPivot.position.y = HEAD_Y - (1 - awake) * 0.01 + Math.sin(time * 1.05) * 0.0035 + Math.sin(time * 0.6 * Math.PI * 2 * 0.2) * 0.002;

      bodyGroup.rotation.z = Math.sin(time * 0.43) * 0.014;
      bodyGroup.rotation.x = Math.sin(time * 0.37 + 1.2) * 0.01;
      for (const a of arms) {
        let z = a.side * (0.13 + Math.sin(time * 0.74 + (a.side > 0 ? 0 : 1.7)) * 0.025);
        let x = Math.sin(time * 0.52 + a.side) * 0.03;
        if (s.mood === 'speaking') z += a.side * L * 0.14;
        if (s.mood === 'listening') { x -= 0.16; z -= a.side * 0.03; }
        if (s.mood === 'thinking' && a.side > 0) { x -= 0.42; z += 0.06; }
        z = THREE.MathUtils.lerp(a.side * 0.05, z, awake);
        a.pivot.rotation.z = damp(a.pivot.rotation.z, z, 2.4, dt);
        a.pivot.rotation.x = damp(a.pivot.rotation.x, x, 2.4, dt);
      }

      orbitAmt = damp(orbitAmt, (s.mood === 'thinking' ? 0.75 : s.mood === 'listening' ? 0.16 + L * 0.28 : s.mood === 'speaking' ? 0.12 + L * 0.22 : 0.06) * awake, 2.5, dt);
      orbit.rotation.z += dt * (s.mood === 'thinking' ? 0.9 : 0.18);
      const ou = orbitMat.uniforms;
      ou.uTime!.value = time; ou.uAmt!.value = orbitAmt; ou.uFade!.value = fade; ou.uLight!.value = o.onLight;
      orbit.visible = orbitAmt * fade > 0.01;

      headMat.opacity = fade; shellMat.opacity = fade; seamMat.opacity = fade;
    },
    dispose() {
      head.geometry.dispose(); body.geometry.dispose(); seam.geometry.dispose(); armGeo.dispose(); glow.geometry.dispose(); orbitGeo.dispose();
      headMat.dispose(); shellMat.dispose(); seamMat.dispose(); glowMat.dispose(); glowTex.dispose(); orbitMat.dispose();
    },
  };
}
