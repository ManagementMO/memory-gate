// A lawn you could lie down in: thousands of single blades on an outdoor memory's grass, each its own height and green,
// patchy the way real turf is, thinning toward the edge so the field melts into the ground's fade. The blades rise as
// the place forms and sway together in a slow wind. One instanced draw; about half as many blades in the headset.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);

function bladeGeometry(seg = 4, width = 0.028): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const w = (width / 2) * (1 - t) ** 0.8;
    pos.push(-w, t, 0, w, t, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < seg - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (seg - 1) * 2;
  idx.push(a, a + 1, seg * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // lit like the ground
  g.setIndex(idx);
  return g;
}

function noise(x: number, z: number): number {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(xi, zi), h(xi + 1, zi), u), THREE.MathUtils.lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}

/** `grow` is the place's forming fade (0 → 1): the blades rise with it. `tone` is the memory's ground colour. A lawn
 *  is short and dense; a meadow (`tall`) is long, looser grass. */
export function GrassField({ center, radius, tone, grow, tall = false }: { center: [number, number]; radius: number; tone: THREE.Color; grow: { value: number }; tall?: boolean }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGrow: { value: 0 } }), []);
  const mesh = useMemo(() => {
    const density = (QUEST ? 90 : 190) * (tall ? 1 : 1.35); // blades per square metre at the centre
    const count = Math.round(Math.PI * radius * radius * density);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, color: '#ffffff' });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uGrow = uniforms.uGrow;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGrow;\nvarying float vH;')
        .replace('#include <project_vertex>', `
          vH = position.y;
          vec3 p = transformed;
          p.y *= uGrow;
          vec4 mvPosition = instanceMatrix * vec4(p, 1.0);
          vec3 io = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float hs = length(instanceMatrix[1].xyz) * uGrow;
          float w = sin(uTime * 1.1 + io.x * 0.6 + io.z * 0.4) * 0.6 + sin(uTime * 2.3 + io.x * 1.7 + io.z * 1.3) * 0.25;
          mvPosition.xz += vec2(0.8, 0.45) * (0.16 + w * 0.2) * position.y * position.y * hs;
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(0.42, 1.1, smoothstep(0.0, 1.0, vH));');
    };
    const im = new THREE.InstancedMesh(bladeGeometry(), mat, count);
    // Greens from the memory's own ground tone: shaded roots, living mid-greens, sunlit tips, and a few dry blades.
    const deep = tone.clone().multiplyScalar(0.5).lerp(new THREE.Color('#2c4a18'), 0.7);
    const mid = tone.clone().lerp(new THREE.Color('#5a8f2c'), 0.75);
    const light = tone.clone().lerp(new THREE.Color('#9fbe4f'), 0.7);
    const dry = new THREE.Color('#c2b47a');
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < count && tries < count * 3; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
      const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r;
      const edge = r / radius;
      if (edge > 0.55 && rnd() > (1 - (edge - 0.55) / 0.45) ** 1.6) continue; // thinner toward the rim
      if (rnd() > 0.4 + 0.6 * noise(x * 0.9, z * 0.9)) continue; // patchy, like real turf
      const h = (tall ? 0.14 + rnd() * 0.24 : 0.05 + rnd() * 0.09) * (0.7 + 0.6 * noise(x * 0.3 + 9, z * 0.3 + 4));
      e.set((rnd() - 0.5) * 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.35);
      M.compose(pos.set(x, 0, z), q.setFromEuler(e), scl.set(0.8 + rnd() * 0.6, h, 1));
      im.setMatrixAt(n, M);
      c.copy(deep).lerp(mid, noise(x * 0.5 + 30, z * 0.5 - 12)).lerp(light, rnd() * 0.4);
      if (rnd() < (tall ? 0.07 : 0.02)) c.copy(dry);
      im.setColorAt(n, c);
      n++;
    }
    im.count = n;
    im.receiveShadow = true;
    im.castShadow = false;
    im.frustumCulled = false;
    im.renderOrder = -1;
    return im;
  }, [center[0], center[1], radius, tone.getHex(), tall, uniforms]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }, [mesh]);
  useFrame((_, dt) => {
    uniforms.uTime.value += Math.min(dt, 0.1);
    uniforms.uGrow.value = grow.value;
  });
  return <primitive object={mesh} />;
}
